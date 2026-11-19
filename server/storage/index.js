// File storage façade. Every file gets a stable portal URL (APP_URL/files/<id>/<name>) no matter
// which provider holds the bytes, so you can switch providers or migrate without breaking links.
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { config } from '../config.js';
import { db, kv, newId, nowIso } from '../db.js';
import { HttpError } from '../store.js';
import { providers } from './providers.js';

const MIME_BY_EXT = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', heic: 'image/heic', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain', json: 'application/json', zip: 'application/zip',
};
export const guessMime = (name, fallback) => fallback && fallback !== 'application/octet-stream'
  ? fallback : MIME_BY_EXT[String(name).split('.').pop().toLowerCase()] || fallback || 'application/octet-stream';

export function activeProviderName() {
  const a = kv.get('storage:active');
  if (a && a !== 'local' && providers[a]?.isConfigured() && kv.get(`storage:${a}`)) return a;
  return 'local';
}

const safeName = (n) => String(n || 'file').replace(/[/\\]/g, '_').replace(/[\u0000-\u001f]/g, '').slice(0, 200) || 'file';
export const fileUrl = (id, name) => `${config.appUrl}/files/${id}/${encodeURIComponent(safeName(name))}`;

const defaultFolder = () => `${config.storageRootFolder}/Uploads/${new Date().toISOString().slice(0, 7)}`;

/** Store bytes with the active provider. Falls back to local disk if the cloud upload fails. */
export async function saveFile({ buffer, name, mime, folder, uploadedBy }) {
  const id = newId();
  name = safeName(name);
  mime = guessMime(name, mime);
  folder = folder || defaultFolder();
  let providerName = activeProviderName();
  let ref;
  try {
    ref = await providers[providerName].upload({ buffer, name, mime, folder, id });
  } catch (e) {
    if (providerName === 'local') throw e;
    console.error(`[storage] ${providerName} upload failed, keeping file on server instead:`, e.message);
    providerName = 'local';
    ref = await providers.local.upload({ buffer, id });
  }
  db.prepare('INSERT INTO files (id,name,mime,size,provider,provider_ref,folder,uploaded_by,created_date) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, name, mime, buffer.length, providerName, ref, folder, uploadedBy || null, nowIso());
  return { id, file_url: fileUrl(id, name), provider: providerName };
}

export const getFileRow = (id) => db.prepare('SELECT * FROM files WHERE id = ?').get(id);

export async function readFile(id) {
  const row = getFileRow(id);
  if (!row) throw new HttpError(404, 'File not found');
  const p = providers[row.provider];
  if (!p) throw new HttpError(500, `Unknown storage provider ${row.provider}`);
  const { buffer, mime } = await p.download(row.provider_ref);
  return { buffer, mime: row.mime || mime || 'application/octet-stream', name: row.name, row };
}

/** If `url` points at a file stored by this portal, return its id. */
export function fileIdFromUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/\/files\/([a-f0-9]{24})(?:\/|$|\?)/);
  if (!m) return null;
  if (/^https?:\/\//.test(url) && !url.startsWith(config.appUrl) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return null;
  return getFileRow(m[1]) ? m[1] : null;
}

/** Move a file into a tidy folder and rename it (best effort — never throws). */
export async function organizeFile(id, folder, name) {
  try {
    const row = getFileRow(id);
    if (!row) return;
    const ext = path.extname(row.name);
    let newName = name ? safeName(name) : row.name;
    if (ext && !newName.toLowerCase().endsWith(ext.toLowerCase())) newName += ext;
    if (row.folder === folder && row.name === newName) return;
    const ref = await providers[row.provider].move(row.provider_ref, folder, newName);
    db.prepare('UPDATE files SET folder = ?, provider_ref = ? WHERE id = ?').run(folder, ref, id);
  } catch (e) {
    console.error('[storage] organize failed:', e.message);
  }
}

// ------------------------------------------------------------- migration between providers
let migration = { running: false, done: 0, failed: 0, total: 0, errors: [] };
export function migrationStatus() { return migration; }

export async function migrateAllToActive() {
  if (migration.running) return migration;
  const target = activeProviderName();
  const rows = db.prepare('SELECT * FROM files WHERE provider != ?').all(target)
    .filter(r => r.provider === 'local' || kv.get(`storage:${r.provider}`));
  migration = { running: true, done: 0, failed: 0, total: rows.length, errors: [], target };
  (async () => {
    for (const row of rows) {
      try {
        const { buffer } = await providers[row.provider].download(row.provider_ref);
        const ref = await providers[target].upload({ buffer, name: row.name, mime: row.mime, folder: row.folder || defaultFolder(), id: row.id });
        db.prepare('UPDATE files SET provider = ?, provider_ref = ? WHERE id = ?').run(target, ref, row.id);
        migration.done++;
      } catch (e) {
        migration.failed++;
        if (migration.errors.length < 20) migration.errors.push(`${row.name}: ${e.message}`);
      }
    }
    migration.running = false;
  })();
  return migration;
}

// ------------------------------------------------------------- admin API: /api/storage/*
export function storageStatus() {
  const counts = Object.fromEntries(db.prepare('SELECT provider, COUNT(*) n, COALESCE(SUM(size),0) bytes FROM files GROUP BY provider').all().map(r => [r.provider, { files: r.n, bytes: r.bytes }]));
  return {
    active: activeProviderName(),
    root_folder: config.storageRootFolder,
    providers: ['google_drive', 'dropbox'].map(name => {
      const conn = kv.get(`storage:${name}`);
      return {
        name, label: providers[name].label,
        configured: providers[name].isConfigured(),
        connected: !!conn,
        account: conn?.account || null,
        connected_at: conn?.connected_at || null,
      };
    }),
    counts,
    migration,
  };
}

export function storageRouter({ requireStaff }) {
  const r = express.Router();

  r.get('/status', requireStaff, (_req, res) => res.json(storageStatus()));

  // Step 1: admin clicks "Connect" → we send them to Google/Dropbox.
  r.get('/oauth/:provider/start', requireStaff, (req, res) => {
    const p = providers[req.params.provider];
    if (!p || p.name === 'local') throw new HttpError(404, 'Unknown provider');
    if (!p.isConfigured()) throw new HttpError(400, `${p.label} app credentials are not set on the server (see README → Cloud storage).`);
    const state = crypto.randomBytes(16).toString('hex');
    kv.set(`oauth_state:${state}`, { provider: p.name, user: req.user.email, at: Date.now() });
    res.redirect(p.authUrl(state));
  });

  // Step 2: provider redirects back here with ?code=…
  r.get('/oauth/:provider/callback', async (req, res) => {
    const back = (msg, ok) => res.redirect(`/BrokerageSettings?storage=${ok ? 'connected' : 'error'}&msg=${encodeURIComponent(msg)}`);
    try {
      const p = providers[req.params.provider];
      const st = kv.get(`oauth_state:${req.query.state}`);
      kv.del(`oauth_state:${req.query.state}`);
      if (!p || !st || st.provider !== p.name || Date.now() - st.at > 15 * 60e3) return back('Connection link expired — please try again.', false);
      if (req.query.error) return back(String(req.query.error_description || req.query.error), false);
      const conn = await p.exchangeCode(String(req.query.code || ''));
      if (!conn.refresh_token) return back(`${p.label} did not grant offline access. Remove the app from your ${p.label} account's connected apps and try again.`, false);
      kv.set(`storage:${p.name}`, { ...conn, connected_at: nowIso(), connected_by: st.user });
      kv.set('storage:active', p.name);
      return back(`${p.label} connected${conn.account ? ` (${conn.account})` : ''}. New uploads will be saved there.`, true);
    } catch (e) {
      console.error('[storage] oauth callback', e);
      return back(e.message, false);
    }
  });

  r.post('/active', requireStaff, (req, res) => {
    const name = req.body?.provider;
    if (name !== 'local' && !kv.get(`storage:${name}`)) throw new HttpError(400, 'That provider is not connected');
    kv.set('storage:active', name);
    res.json(storageStatus());
  });

  r.post('/disconnect', requireStaff, async (req, res) => {
    const name = req.body?.provider;
    const p = providers[name];
    if (!p || name === 'local') throw new HttpError(400, 'Unknown provider');
    const n = db.prepare('SELECT COUNT(*) n FROM files WHERE provider = ?').get(name).n;
    if (n > 0 && !req.body?.force) {
      throw new HttpError(409, `${n} file(s) are stored in ${p.label}. Switch to another storage location and run "Move existing files" first, or they will become unavailable in the portal.`);
    }
    await p.revoke?.(kv.get(`storage:${name}`));
    kv.del(`storage:${name}`);
    if (kv.get('storage:active') === name) kv.set('storage:active', 'local');
    res.json(storageStatus());
  });

  r.post('/migrate', requireStaff, async (_req, res) => res.json(await migrateAllToActive()));

  return r;
}
