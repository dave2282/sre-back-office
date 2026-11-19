import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { db, nowIso } from './db.js';
import { users, store, userRowToPublic, HttpError } from './store.js';
import { sendEmail, emailShell } from './integrations/email.js';

const COOKIE = 'sre_session';
export const isStaff = (u) => !!u && (u.role === 'admin' || u.role === 'staff');

function issueSession(res, userId) {
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.appUrl.startsWith('https://'),
    maxAge: config.sessionDays * 86400 * 1000, path: '/',
  });
  return token;
}

// Attaches req.user (public shape) when a valid session cookie / bearer token is present.
export function authenticate(req, _res, next) {
  let token = req.cookies?.[COOKIE];
  const h = req.headers.authorization;
  if (!token && h?.startsWith('Bearer ')) token = h.slice(7);
  if (token) {
    try {
      const { sub } = jwt.verify(token, config.jwtSecret);
      const row = users.rowById(sub);
      if (row && row.status === 'active') req.user = userRowToPublic(row);
    } catch { /* invalid/expired */ }
  }
  next();
}

export function requireUser(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  next();
}
export function requireStaff(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Authentication required'));
  if (!isStaff(req.user)) return next(new HttpError(403, 'Admin access required'));
  next();
}

// ---------- one-time tokens (invite / password reset) ----------
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
export function createAuthToken(userId, type, hours = type === 'invite' ? 24 * 14 : 2) {
  const raw = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO auth_tokens (token_hash, user_id, type, expires_at) VALUES (?,?,?,?)')
    .run(sha(raw), userId, type, new Date(Date.now() + hours * 3600e3).toISOString());
  return raw;
}
function lookupToken(raw) {
  const t = db.prepare('SELECT * FROM auth_tokens WHERE token_hash = ?').get(sha(String(raw || '')));
  if (!t || t.used_at || t.expires_at < nowIso()) return null;
  return t;
}
export function setupLinkFor(user) {
  const type = user.has_password ? 'reset' : 'invite';
  const raw = createAuthToken(user.id, type);
  return `${config.appUrl}/set-password?token=${raw}`;
}

/** Create the login for an email if it doesn't exist yet (Base44 `users.inviteUser` equivalent). */
export function ensureUser(email, role = 'user', full_name) {
  email = String(email || '').trim().toLowerCase();
  if (!email) throw new HttpError(400, 'email required');
  const row = users.rowByEmail(email);
  if (row) return userRowToPublic(row);
  if (!full_name) {
    const agent = store.find('Agent', { query: { user_email: email }, limit: 1 })[0];
    full_name = agent?.full_name || '';
  }
  return users.create({ email, role: ['admin', 'staff', 'agent', 'user'].includes(role) ? role : 'user', full_name });
}

function brokerage() {
  return store.find('BrokerageSettings', { limit: 1 })[0] || {};
}

const passwordOk = (p) => typeof p === 'string' && p.length >= 8;
const limiter = rateLimit({ windowMs: 15 * 60e3, limit: 30, standardHeaders: true, legacyHeaders: false });

export const authRouter = express.Router();

authRouter.post('/login', limiter, async (req, res) => {
  const { email, password } = req.body || {};
  const row = users.rowByEmail(email);
  const ok = row?.password_hash && await bcrypt.compare(String(password || ''), row.password_hash);
  if (!ok) throw new HttpError(401, 'Incorrect email or password');
  if (row.status !== 'active') throw new HttpError(403, 'This account is not active. Contact your office.');
  users.touchLogin(row.id);
  issueSession(res, row.id);
  res.json({ user: userRowToPublic(users.rowById(row.id)) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  if (!req.user) throw new HttpError(401, 'Authentication required');
  res.json(req.user);
});

authRouter.put('/me', requireUser, (req, res) => {
  const { full_name, ...rest } = req.body || {};
  const allowed = {};
  if (typeof full_name === 'string') allowed.full_name = full_name;
  // allow harmless UI prefs to be stored on the user record
  for (const [k, v] of Object.entries(rest)) if (!['role', 'status', 'email', 'id'].includes(k)) allowed[k] = v;
  res.json(users.update(req.user.id, allowed));
});

authRouter.post('/change-password', requireUser, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  const row = users.rowById(req.user.id);
  if (row.password_hash && !(await bcrypt.compare(String(current_password || ''), row.password_hash))) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  if (!passwordOk(new_password)) throw new HttpError(400, 'Password must be at least 8 characters');
  users.setPassword(row.id, await bcrypt.hash(new_password, 12));
  res.json({ ok: true });
});

// Request a reset / first-time setup link. Agents on the roster without a login get one created.
authRouter.post('/forgot', limiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  let row = users.rowByEmail(email);
  if (!row && email) {
    const agent = store.find('Agent', { query: { user_email: email }, limit: 1 })[0];
    if (agent && agent.status !== 'inactive') { ensureUser(email, 'user', agent.full_name); row = users.rowByEmail(email); }
  }
  if (row && row.status === 'active') {
    const user = userRowToPublic(row);
    const link = setupLinkFor(user);
    const s = brokerage();
    const name = s.brokerage_name || 'Agent Portal';
    await sendEmail({
      to: email,
      from_name: name,
      subject: user.has_password ? `Reset your ${name} portal password` : `Set up your ${name} portal login`,
      body: emailShell(name, s.primary_color, `
        <p>Hi ${user.full_name || 'there'},</p>
        <p>${user.has_password ? 'We received a request to reset your password.' : 'Use the button below to create your password and sign in.'}</p>
        <p style="text-align:center;margin:28px 0"><a href="${link}" style="background:${s.primary_color || '#1e3a5f'};color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">${user.has_password ? 'Reset password' : 'Set my password'}</a></p>
        <p style="font-size:12px;color:#6b7280">If you didn't request this you can ignore this email.</p>`),
    }).catch(e => console.error('[forgot] email failed', e.message));
  }
  // Always the same answer so the endpoint can't be used to probe for accounts.
  res.json({ ok: true });
});

authRouter.get('/token-info', (req, res) => {
  const t = lookupToken(req.query.token);
  if (!t) return res.json({ valid: false });
  const u = users.get(t.user_id);
  res.json({ valid: true, type: t.type, email: u?.email, full_name: u?.full_name });
});

authRouter.post('/set-password', limiter, async (req, res) => {
  const { token, password, full_name } = req.body || {};
  const t = lookupToken(token);
  if (!t) throw new HttpError(400, 'This link is invalid or has expired. Request a new one from the sign-in page.');
  if (!passwordOk(password)) throw new HttpError(400, 'Password must be at least 8 characters');
  users.setPassword(t.user_id, await bcrypt.hash(password, 12));
  if (full_name) users.update(t.user_id, { full_name });
  db.prepare('UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(nowIso(), t.user_id);
  users.touchLogin(t.user_id);
  issueSession(res, t.user_id);
  res.json({ user: users.get(t.user_id) });
});

// ---------- admin user management ----------
export const usersRouter = express.Router();
usersRouter.post('/invite', requireStaff, (req, res) => {
  const { email, role } = req.body || {};
  // Only admins may grant admin/staff.
  const safeRole = (role === 'admin' || role === 'staff') && req.user.role !== 'admin' ? 'user' : role;
  res.json(ensureUser(email, safeRole));
});
usersRouter.post('/:id/setup-link', requireStaff, (req, res) => {
  const u = users.get(req.params.id);
  if (!u) throw new HttpError(404, 'User not found');
  res.json({ link: setupLinkFor(u) });
});
