// Drop-in replacement for the Base44 SDK client. The rest of the app keeps calling
// `base44.entities.X.list()`, `base44.auth.me()`, `base44.integrations.Core.UploadFile()` …
// but everything now talks to this portal's own server (/api/*).

class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
    this.response = { status, data };
  }
}

async function request(method, url, body, { form } = {}) {
  const opts = { method, credentials: 'include', headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || `Request failed (${res.status})`, data);
  return data;
}

// ---------------------------------------------------------------- live updates (SSE)
const listeners = new Map(); // entity -> Set<fn>
let source = null;
function ensureStream() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/events', { withCredentials: true });
  source.onmessage = (e) => {
    let evt; try { evt = JSON.parse(e.data); } catch { return; }
    for (const fn of listeners.get(evt.entity) || []) { try { fn(evt); } catch (err) { console.error(err); } }
  };
}

function entity(name) {
  const base = `/api/entities/${name}`;
  const qs = (params) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    const s = p.toString();
    return s ? `?${s}` : '';
  };
  return {
    list: (sort, limit, skip) => request('GET', base + qs({ sort, limit, skip })),
    filter: (query, sort, limit, skip) => request('GET', base + qs({ q: query || {}, sort, limit, skip })),
    get: (id) => request('GET', `${base}/${encodeURIComponent(id)}`),
    create: (data) => request('POST', base, data || {}),
    bulkCreate: (items) => request('POST', `${base}/bulk`, items || []),
    update: (id, data) => request('PUT', `${base}/${encodeURIComponent(id)}`, data || {}),
    delete: (id) => request('DELETE', `${base}/${encodeURIComponent(id)}`),
    subscribe(fn) {
      ensureStream();
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => listeners.get(name)?.delete(fn);
    },
  };
}

const loginUrl = (next) => `/login${next ? `?next=${encodeURIComponent(next)}` : ''}`;
const toPath = (url) => { try { const u = new URL(url, window.location.origin); return u.pathname + u.search; } catch { return '/'; } };

export const base44 = {
  entities: new Proxy({}, { get: (_t, name) => (typeof name === 'string' ? entity(name) : undefined) }),

  auth: {
    me: () => request('GET', '/api/auth/me'),
    updateMe: (data) => request('PUT', '/api/auth/me', data),
    isAuthenticated: async () => { try { await request('GET', '/api/auth/me'); return true; } catch { return false; } },
    login: (email, password) => request('POST', '/api/auth/login', { email, password }),
    async logout(redirectUrl) {
      await request('POST', '/api/auth/logout').catch(() => {});
      localStorage.removeItem('adminViewingAgent');
      window.location.href = redirectUrl ? loginUrl(toPath(redirectUrl)) : '/login';
    },
    redirectToLogin(nextUrl) {
      const next = toPath(nextUrl || window.location.href);
      window.location.href = loginUrl(next === '/' ? '' : next);
    },
    forgotPassword: (email) => request('POST', '/api/auth/forgot', { email }),
    tokenInfo: (token) => request('GET', `/api/auth/token-info?token=${encodeURIComponent(token)}`),
    setPassword: (token, password, full_name) => request('POST', '/api/auth/set-password', { token, password, full_name }),
    changePassword: (current_password, new_password) => request('POST', '/api/auth/change-password', { current_password, new_password }),
  },

  integrations: {
    Core: {
      async UploadFile({ file, folder }) {
        const form = new FormData();
        form.append('file', file, file?.name || 'file');
        if (folder) form.append('folder', folder);
        return request('POST', '/api/integrations/upload', undefined, { form });
      },
      SendEmail: (args) => request('POST', '/api/integrations/send-email', args),
      InvokeLLM: (args) => request('POST', '/api/integrations/invoke-llm', args),
    },
  },

  functions: {
    // Base44 returned an axios-style response → keep `{ data }`
    invoke: async (name, payload) => ({ data: await request('POST', `/api/functions/${name}`, payload || {}) }),
  },

  users: {
    inviteUser: (email, role) => request('POST', '/api/users/invite', { email, role }),
  },

  storage: {
    status: () => request('GET', '/api/storage/status'),
    setActive: (provider) => request('POST', '/api/storage/active', { provider }),
    disconnect: (provider, force) => request('POST', '/api/storage/disconnect', { provider, force }),
    migrate: () => request('POST', '/api/storage/migrate'),
    connectUrl: (provider) => `/api/storage/oauth/${provider}/start`,
  },
};

export default base44;
