// Offline test of the Google Drive + Dropbox adapters against a fake API (no real accounts needed).
// Run: npm run test:storage
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sre-storage-test-'));
process.env.GOOGLE_CLIENT_ID = 'gid'; process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
process.env.DROPBOX_APP_KEY = 'dkey'; process.env.DROPBOX_APP_SECRET = 'dsecret';

// ---------------------------------------------------------------- fake Google Drive + Dropbox
const drive = new Map(); // id -> {name, parents, mimeType, data}
const dbx = new Map();   // id -> {path, data}
let n = 0;
const calls = [];
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const auth = init.headers?.Authorization || '';
  calls.push(`${init.method || 'GET'} ${url.host}${url.pathname}`);
  const body = init.body;

  // OAuth token refresh
  if (url.href.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'g-new', expires_in: 3600 });
  if (url.href.startsWith('https://api.dropboxapi.com/oauth2/token')) return json({ access_token: 'd-new', expires_in: 14400 });

  if (url.host.endsWith('googleapis.com')) {
    // (the resumable session URL authorizes itself, like the real API)
    if (!url.pathname.startsWith('/upload/session/')) assert.match(auth, /^Bearer g-/, 'Drive call must be authorized');
    if (url.pathname === '/drive/v3/files' && (init.method || 'GET') === 'GET') {
      const q = url.searchParams.get('q');
      const name = q.match(/name = '((?:[^'\\]|\\.)*)'/)[1].replace(/\\'/g, "'");
      const parent = q.match(/'([^']+)' in parents/)[1];
      const hit = [...drive.entries()].find(([, f]) => f.name === name && f.parents.includes(parent) && f.mimeType?.includes('folder'));
      return json({ files: hit ? [{ id: hit[0] }] : [] });
    }
    if (url.pathname === '/drive/v3/files' && init.method === 'POST') {
      const meta = JSON.parse(body); const id = `g${++n}`; drive.set(id, { ...meta }); return json({ id });
    }
    if (url.pathname === '/upload/drive/v3/files') {
      const meta = JSON.parse(body); const id = `g${++n}`; drive.set(id, { ...meta, data: null });
      return new Response(null, { status: 200, headers: { location: `https://www.googleapis.com/upload/session/${id}` } });
    }
    if (url.pathname.startsWith('/upload/session/')) {
      const id = url.pathname.split('/').pop(); drive.get(id).data = Buffer.from(body); return json({ id });
    }
    const m = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (m) {
      const f = drive.get(decodeURIComponent(m[1]));
      if (!f) return json({ error: { message: 'not found' } }, 404);
      if (url.searchParams.get('alt') === 'media') return new Response(f.data, { headers: { 'content-type': f.mimeType || 'application/octet-stream' } });
      if (init.method === 'PATCH') {
        const add = url.searchParams.get('addParents'); const rem = (url.searchParams.get('removeParents') || '').split(',').filter(Boolean);
        f.parents = [...f.parents.filter(p => !rem.includes(p)), add];
        const patch = JSON.parse(body || '{}'); if (patch.name) f.name = patch.name;
        return json({ id: m[1] });
      }
      return json({ parents: f.parents });
    }
  }

  if (url.host.endsWith('dropboxapi.com')) {
    assert.match(auth, /^Bearer d-/, 'Dropbox call must be authorized');
    const arg = init.headers?.['Dropbox-API-Arg'] ? JSON.parse(init.headers['Dropbox-API-Arg']) : null;
    if (init.headers?.['Dropbox-API-Arg']) assert.ok(/^[\x00-\x7f]*$/.test(init.headers['Dropbox-API-Arg']), 'Dropbox-API-Arg must be ASCII');
    if (url.pathname === '/2/files/upload') { const id = `id:d${++n}`; dbx.set(id, { path: arg.path, data: Buffer.from(body) }); return json({ id, path_display: arg.path }); }
    if (url.pathname === '/2/files/download') { const f = dbx.get(arg.path); return f ? new Response(f.data) : json({ error_summary: 'not_found' }, 409); }
    if (url.pathname === '/2/files/move_v2') { const b = JSON.parse(body); dbx.get(b.from_path).path = b.to_path; return json({ metadata: { id: b.from_path } }); }
  }
  throw new Error(`unexpected fetch ${url.href}`);
};

// ---------------------------------------------------------------- tests
const { kv } = await import('../server/db.js');
const storage = await import('../server/storage/index.js');

// local first
const local = await storage.saveFile({ buffer: Buffer.from('local bytes'), name: 'old.pdf', mime: 'application/pdf' });
assert.equal(local.provider, 'local');

// --- Google Drive (expired token → must refresh)
kv.set('storage:google_drive', { access_token: 'g-old', refresh_token: 'r', expires_at: Date.now() - 1000, account: 'office@x.com' });
kv.set('storage:active', 'google_drive');
const g = await storage.saveFile({ buffer: Buffer.from('drive bytes'), name: "O'Brien Purchase Agreement.pdf", mime: 'application/pdf', folder: 'Agent Portal/Uploads/2026-11' });
assert.equal(g.provider, 'google_drive');
assert.equal((await storage.readFile(g.id)).buffer.toString(), 'drive bytes');
await storage.organizeFile(g.id, "Agent Portal/Transactions/Amy Agent/123 Main St", 'Purchase Agreement');
const gRow = storage.getFileRow(g.id);
const gFile = drive.get(gRow.provider_ref);
assert.equal(gFile.name, 'Purchase Agreement.pdf');
const folderNames = (id) => { const out = []; let cur = drive.get(id)?.parents?.[0]; while (cur && cur !== 'root') { out.unshift(drive.get(cur).name); cur = drive.get(cur).parents[0]; } return out.join('/'); };
assert.equal(folderNames(gRow.provider_ref), 'Agent Portal/Transactions/Amy Agent/123 Main St');
assert.equal(kv.get('storage:google_drive').access_token, 'g-new', 'token refreshed + saved');
// folders are reused, not duplicated
await storage.saveFile({ buffer: Buffer.from('x'), name: 'b.pdf', folder: 'Agent Portal/Transactions/Amy Agent/123 Main St' });
assert.equal([...drive.values()].filter(f => f.name === 'Amy Agent').length, 1);

// migrate the local file to Drive — portal URL unchanged
await storage.migrateAllToActive();
while (storage.migrationStatus().running) await new Promise(r => setTimeout(r, 20));
assert.equal(storage.migrationStatus().done, 1);
assert.equal(storage.getFileRow(local.id).provider, 'google_drive');
assert.equal((await storage.readFile(local.id)).buffer.toString(), 'local bytes');

// --- Dropbox (non-ASCII name exercises header escaping)
kv.set('storage:dropbox', { access_token: 'd-ok', refresh_token: 'r', expires_at: Date.now() + 3600e3 });
kv.set('storage:active', 'dropbox');
const d = await storage.saveFile({ buffer: Buffer.from('dropbox bytes'), name: 'Café Addendum.pdf', folder: 'Agent Portal/Uploads/2026-11' });
assert.equal(d.provider, 'dropbox');
assert.equal((await storage.readFile(d.id)).buffer.toString(), 'dropbox bytes');
await storage.organizeFile(d.id, 'Agent Portal/Transactions/José Agent/9 Elm St', 'Addendum');
assert.equal(dbx.get(storage.getFileRow(d.id).provider_ref).path, '/Agent Portal/Transactions/José Agent/9 Elm St/Addendum.pdf');
// Drive files are still readable after switching
assert.equal((await storage.readFile(g.id)).buffer.toString(), 'drive bytes');

// --- cloud failure falls back to local disk
kv.set('storage:dropbox', { access_token: 'BAD', expires_at: Date.now() + 3600e3 });
const f = await storage.saveFile({ buffer: Buffer.from('fallback'), name: 'x.pdf' }).catch(e => e);
assert.equal(f.provider, 'local', 'falls back to local when the cloud upload fails');

console.log(`storage provider tests passed (${calls.length} fake API calls)`);
process.exit(0);
