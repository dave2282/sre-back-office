// Storage providers. Each provider implements:
//   upload({ buffer, name, mime, folder }) -> provider_ref (string)
//   download(ref) -> { buffer, mime }
//   move(ref, folder, name) -> new provider_ref
// Cloud providers keep their OAuth tokens in the kv table under `storage:<provider>`.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { kv } from '../db.js';

// ---------------------------------------------------------------- local disk
export const local = {
  name: 'local',
  label: 'This server',
  isConfigured: () => true,
  async upload({ buffer, id }) {
    const p = path.join(config.uploadDir, id);
    await fs.promises.writeFile(p, buffer);
    return id;
  },
  async download(ref) {
    return { buffer: await fs.promises.readFile(path.join(config.uploadDir, path.basename(ref))) };
  },
  async move(ref) { return ref; },
  localPath: (ref) => path.join(config.uploadDir, path.basename(ref)),
};

// ---------------------------------------------------------------- helpers
const redirectUri = (p) => `${config.appUrl}/api/storage/oauth/${p}/callback`;

async function jsonOrThrow(res, what) {
  const text = await res.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = body?.error_description || body?.error?.message || body?.error_summary || body?.error || text;
    throw new Error(`${what} failed (${res.status}): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  return body;
}

function makeTokenManager(key, refreshFn) {
  return {
    get conn() { return kv.get(key); },
    save(conn) { kv.set(key, conn); },
    async accessToken() {
      const conn = kv.get(key);
      if (!conn?.refresh_token && !conn?.access_token) throw new Error(`${key} is not connected`);
      if (conn.access_token && conn.expires_at && conn.expires_at - Date.now() > 60_000) return conn.access_token;
      if (!conn.refresh_token) return conn.access_token;
      const t = await refreshFn(conn.refresh_token);
      const next = { ...conn, access_token: t.access_token, expires_at: Date.now() + (t.expires_in || 3600) * 1000 };
      if (t.refresh_token) next.refresh_token = t.refresh_token;
      kv.set(key, next);
      return next.access_token;
    },
  };
}

// ---------------------------------------------------------------- Google Drive
const G_FOLDER = 'application/vnd.google-apps.folder';
const gTokens = makeTokenManager('storage:google_drive', async (refresh_token) => {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.google.clientId, client_secret: config.google.clientSecret,
      refresh_token, grant_type: 'refresh_token',
    }),
  });
  return jsonOrThrow(res, 'Google token refresh');
});

async function gFetch(url, opts = {}) {
  const token = await gTokens.accessToken();
  return fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
}

const gFolderCache = new Map();
async function gEnsureFolder(folderPath) {
  const parts = String(folderPath || config.storageRootFolder).split('/').map(s => s.trim()).filter(Boolean);
  let parent = 'root';
  let acc = '';
  for (const part of parts) {
    acc += '/' + part;
    if (gFolderCache.has(acc)) { parent = gFolderCache.get(acc); continue; }
    const q = `name = '${part.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and mimeType = '${G_FOLDER}' and '${parent}' in parents and trashed = false`;
    const found = await jsonOrThrow(await gFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`), 'Drive folder lookup');
    let id = found.files?.[0]?.id;
    if (!id) {
      const created = await jsonOrThrow(await gFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: part, mimeType: G_FOLDER, parents: [parent] }),
      }), 'Drive create folder');
      id = created.id;
    }
    gFolderCache.set(acc, id);
    parent = id;
  }
  return parent;
}

export const google_drive = {
  name: 'google_drive',
  label: 'Google Drive',
  isConfigured: () => !!(config.google.clientId && config.google.clientSecret),
  tokens: gTokens,
  authUrl(state) {
    const p = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: redirectUri('google_drive'),
      response_type: 'code',
      // drive.file = the portal can only see files/folders it created itself
      scope: 'https://www.googleapis.com/auth/drive.file openid email',
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  },
  async exchangeCode(code) {
    const t = await jsonOrThrow(await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: config.google.clientId, client_secret: config.google.clientSecret,
        redirect_uri: redirectUri('google_drive'), grant_type: 'authorization_code',
      }),
    }), 'Google token exchange');
    let email = '';
    try {
      const info = await jsonOrThrow(await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${t.access_token}` } }), 'Google userinfo');
      email = info.email || '';
    } catch { /* optional */ }
    gFolderCache.clear();
    return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + (t.expires_in || 3600) * 1000, account: email };
  },
  async upload({ buffer, name, mime, folder }) {
    const parent = await gEnsureFolder(folder);
    // Resumable upload works for any file size.
    const init = await gFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime || 'application/octet-stream', 'X-Upload-Content-Length': String(buffer.length) },
      body: JSON.stringify({ name, parents: [parent] }),
    });
    if (!init.ok) await jsonOrThrow(init, 'Drive upload init');
    const location = init.headers.get('location');
    const put = await fetch(location, { method: 'PUT', headers: { 'Content-Type': mime || 'application/octet-stream', 'Content-Length': String(buffer.length) }, body: buffer });
    const body = await jsonOrThrow(put, 'Drive upload');
    return body.id;
  },
  async download(ref) {
    const res = await gFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ref)}?alt=media`);
    if (!res.ok) await jsonOrThrow(res, 'Drive download');
    return { buffer: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') || undefined };
  },
  async move(ref, folder, name) {
    const parent = await gEnsureFolder(folder);
    const meta = await jsonOrThrow(await gFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ref)}?fields=parents`), 'Drive get parents');
    const remove = (meta.parents || []).filter(p => p !== parent).join(',');
    const qs = new URLSearchParams({ addParents: parent, fields: 'id' });
    if (remove) qs.set('removeParents', remove);
    await jsonOrThrow(await gFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ref)}?${qs}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(name ? { name } : {}),
    }), 'Drive move');
    return ref;
  },
  async revoke(conn) {
    const token = conn?.refresh_token || conn?.access_token;
    if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
    gFolderCache.clear();
  },
};

// ---------------------------------------------------------------- Dropbox
const dbxTokens = makeTokenManager('storage:dropbox', async (refresh_token) => {
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id: config.dropbox.appKey, client_secret: config.dropbox.appSecret }),
  });
  return jsonOrThrow(res, 'Dropbox token refresh');
});
// Dropbox-API-Arg must be ASCII: escape non-ASCII characters as \uXXXX.
const dbxArg = (o) => JSON.stringify(o).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const dbxPath = (folder, name) => {
  const clean = (s) => String(s || '').replace(/[\\:*?"<>|]/g, '_').trim();
  const parts = String(folder || config.storageRootFolder).split('/').map(clean).filter(Boolean);
  return '/' + [...parts, clean(name) || 'file'].join('/');
};
async function dbxFetch(url, opts = {}) {
  const token = await dbxTokens.accessToken();
  return fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` } });
}

export const dropbox = {
  name: 'dropbox',
  label: 'Dropbox',
  isConfigured: () => !!(config.dropbox.appKey && config.dropbox.appSecret),
  tokens: dbxTokens,
  authUrl(state) {
    const p = new URLSearchParams({
      client_id: config.dropbox.appKey, response_type: 'code', token_access_type: 'offline',
      redirect_uri: redirectUri('dropbox'), state,
    });
    return `https://www.dropbox.com/oauth2/authorize?${p}`;
  },
  async exchangeCode(code) {
    const t = await jsonOrThrow(await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: redirectUri('dropbox'), client_id: config.dropbox.appKey, client_secret: config.dropbox.appSecret }),
    }), 'Dropbox token exchange');
    let email = '';
    try {
      const acct = await jsonOrThrow(await fetch('https://api.dropboxapi.com/2/users/get_current_account', { method: 'POST', headers: { Authorization: `Bearer ${t.access_token}` } }), 'Dropbox account');
      email = acct.email || '';
    } catch { /* optional */ }
    return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + (t.expires_in || 14400) * 1000, account: email };
  },
  async upload({ buffer, name, folder }) {
    const res = await dbxFetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': dbxArg({ path: dbxPath(folder, name), mode: 'add', autorename: true, mute: true }) },
      body: buffer,
    });
    const body = await jsonOrThrow(res, 'Dropbox upload');
    return body.id; // "id:xxxx" — stable even if someone renames/moves the file in Dropbox
  },
  async download(ref) {
    const res = await dbxFetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST', headers: { 'Dropbox-API-Arg': dbxArg({ path: ref }) },
    });
    if (!res.ok) await jsonOrThrow(res, 'Dropbox download');
    return { buffer: Buffer.from(await res.arrayBuffer()) };
  },
  async move(ref, folder, name) {
    const res = await dbxFetch('https://api.dropboxapi.com/2/files/move_v2', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_path: ref, to_path: dbxPath(folder, name), autorename: true }),
    });
    const body = await jsonOrThrow(res, 'Dropbox move');
    return body.metadata?.id || ref;
  },
  async revoke() {
    await dbxFetch('https://api.dropboxapi.com/2/auth/token/revoke', { method: 'POST' }).catch(() => {});
  },
};

export const providers = { local, google_drive, dropbox };
