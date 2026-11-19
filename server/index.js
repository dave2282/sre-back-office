import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { db } from './db.js';
import { HttpError, store } from './store.js';
import { authenticate, requireUser, requireStaff, authRouter, usersRouter, isStaff } from './auth.js';
import { entitiesRouter } from './entities.js';
import { ruleFor } from './access.js';
import { integrationsRouter } from './integrations/index.js';
import { installFetchInterceptor } from './integrations/files.js';
import { functionsRouter } from './functions/runtime.js';
import { eventsHandler } from './events.js';
import { storageRouter, getFileRow, readFile } from './storage/index.js';

installFetchInterceptor();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(cookieParser());
app.use(express.json({ limit: '60mb' }));
app.use(authenticate);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
// Public branding for the sign-in page
const brandingSettings = () => store.find('BrokerageSettings', { limit: 1 })[0] || {};
app.get('/api/public/branding', (_req, res) => {
  const s = brandingSettings();
  res.json({ brokerage_name: s.brokerage_name || 'Agent Portal', logo_url: s.logo_url || null, primary_color: s.primary_color || '#1e3a5f' });
});
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/storage', storageRouter({ requireStaff }));
app.use('/api/entities', requireUser, entitiesRouter);
app.use('/api/integrations', requireUser, integrationsRouter);
app.use('/api/functions', requireUser, functionsRouter);
app.get('/api/events', requireUser, eventsHandler);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

// ---------------------------------------------------------------- file downloads
const REFERENCING = ['Document', 'Transaction', 'AccountingEntry', 'Agent', 'BrokerageSettings', 'CommunityPost', 'Expense', 'SupportTicket', 'DocumentFeedback'];
function canReadFile(user, row) {
  if (isStaff(user)) return true;
  if (row.uploaded_by && row.uploaded_by.toLowerCase() === user.email.toLowerCase()) return true;
  if ((row.mime || '').startsWith('image/')) return true; // logos, headshots, screenshots
  const refs = db.prepare(`SELECT id, entity FROM records WHERE entity IN (${REFERENCING.map(() => '?').join(',')}) AND data LIKE ?`)
    .all(...REFERENCING, `%/files/${row.id}%`);
  return refs.some(r => { const rec = store.get(r.entity, r.id); return rec && ruleFor(r.entity).read(user, rec); });
}

app.get(['/files/:id', '/files/:id/:name'], async (req, res) => {
  const row = getFileRow(req.params.id);
  if (!row) throw new HttpError(404, 'File not found');
  const isPublicLogo = String(brandingSettings().logo_url || '').includes(`/files/${row.id}`);
  if (!req.user && !isPublicLogo) {
    if (req.accepts('html')) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    throw new HttpError(401, 'Sign in to view this file');
  }
  if (!isPublicLogo && !canReadFile(req.user, row)) throw new HttpError(403, 'You do not have access to this file');
  const f = await readFile(row.id);
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.send(f.buffer);
});

// ---------------------------------------------------------------- frontend
const dist = path.join(config.root, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send('API running. Build the frontend with "npm run build" (or use "npm run dev" for development).'));
}

// ---------------------------------------------------------------- errors
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `File is larger than ${config.maxUploadMb} MB` });
  res.status(status).json({ error: status >= 500 && config.isProd ? 'Server error' : err.message });
});

app.listen(config.port, () => {
  console.log(`SRE Back Office listening on http://localhost:${config.port}  (public URL: ${config.appUrl})`);
  const admins = db.prepare("SELECT COUNT(*) n FROM users WHERE role = 'admin'").get().n;
  if (!admins) console.log('No admin account yet → run:  npm run create-admin -- you@yourbrokerage.com "Your Name"');
});
