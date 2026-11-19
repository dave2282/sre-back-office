// Import a Base44 backup into this portal.
//
//   1. In the OLD Base44 app: Brokerage Settings → Backup & Restore → "Download Backup" (a .zip)
//   2. On the new server:     npm run import-base44 -- /path/to/brokerage_backup_YYYY-MM-DD.zip
//
// • Keeps the original record IDs, so links between records (transaction ↔ documents ↔ accounting) survive.
// • Downloads every file the records point at (documents, CDA PDFs, logos, headshots…) from Base44's
//   storage into this portal's storage and rewrites the links. Run it while the Base44 app is still live.
// • Creates a login for every agent on the roster (no password yet — send welcome emails from Agent Roster).
// • Safe to re-run: records that already exist are skipped; files already copied are reused.
//
// Options: --skip-files   import records only, leave file links pointing at Base44
//          --dry-run      show what would be imported
import fs from 'node:fs';
import { unzipSync } from 'fflate';
import { store, ENTITY_NAMES } from '../server/store.js';
import { db, kv } from '../server/db.js';
import { ensureUser } from '../server/auth.js';
import { saveFile } from '../server/storage/index.js';
import { folderForDocument } from '../server/hooks.js';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const SKIP_FILES = args.includes('--skip-files');
const DRY = args.includes('--dry-run');
if (!file) { console.error('Usage: npm run import-base44 -- <backup.zip | backup_data.json> [--skip-files] [--dry-run]'); process.exit(1); }

let raw = fs.readFileSync(file);
let data;
if (file.endsWith('.zip')) {
  const z = unzipSync(new Uint8Array(raw));
  const entry = z['backup_data.json'];
  if (!entry) { console.error('backup_data.json not found in zip'); process.exit(1); }
  data = JSON.parse(Buffer.from(entry).toString('utf8'));
} else {
  data = JSON.parse(raw.toString('utf8'));
}

// Users can be included as an extra key by exporting the User table from Base44's dashboard (optional).
const ORDER = ['BrokerageSettings', 'TransactionCategory', 'Vendor', 'Agent', 'Transaction', 'AccountingEntry', 'Expense', 'Document', 'CommunityPost', 'DocumentFeedback', 'SupportTicket'];
const entities = [...ORDER, ...Object.keys(data).filter(k => !ORDER.includes(k) && !k.startsWith('_') && ENTITY_NAMES.includes(k) && k !== 'User')];

// ------------------------------------------------------------------ file copying
const isFileHost = (u) => {
  try { const h = new URL(u).hostname; return /base44|supabase|googleusercontent|amazonaws|cloudfront/.test(h); } catch { return false; }
};
const urlMap = kv.get('import:url_map') || {};
const saveMap = () => kv.set('import:url_map', urlMap);
let copied = 0, reused = 0, failed = 0;

async function copyFile(url, folder) {
  if (urlMap[url]) { reused++; return urlMap[url]; }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    let name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file');
    name = name.replace(/^[a-f0-9]{6,}_/i, ''); // Base44 prefixes uploads with a hash
    const { file_url } = await saveFile({ buffer, name, mime: res.headers.get('content-type') || undefined, folder, uploadedBy: 'import' });
    urlMap[url] = file_url; saveMap(); copied++;
    return file_url;
  } catch (e) {
    failed++;
    console.warn(`  ! could not copy ${url}: ${e.message}`);
    return url;
  }
}

async function rewriteUrls(value, folder) {
  if (typeof value === 'string') return /^https?:\/\//.test(value) && isFileHost(value) && !SKIP_FILES ? copyFile(value, folder) : value;
  if (Array.isArray(value)) { const out = []; for (const v of value) out.push(await rewriteUrls(v, folder)); return out; }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await rewriteUrls(v, folder);
    return out;
  }
  return value;
}

// ------------------------------------------------------------------ import
const summary = {};
console.log(`Importing ${file}${DRY ? ' (dry run)' : ''}`);
if (data._meta) console.log(`Backup date: ${data._meta.backup_date}`);

for (const entity of entities) {
  const rows = data[entity] || [];
  if (!rows.length) continue;
  let added = 0, skipped = 0;
  for (const rec of rows) {
    const existing = rec.id && store.get(entity, rec.id);
    if (existing) {
      // Already imported — retry any file links that still point at Base44.
      if (!DRY && !SKIP_FILES) {
        const fixed = await rewriteUrls(existing, entity === 'Document' ? folderForDocument(existing) : undefined);
        if (JSON.stringify(fixed) !== JSON.stringify(existing)) store.update(entity, existing.id, fixed);
      }
      skipped++; continue;
    }
    if (entity === 'BrokerageSettings' && store.find('BrokerageSettings', { limit: 1 }).length) { skipped++; continue; }
    if (DRY) { added++; continue; }
    const folder = entity === 'Document' ? folderForDocument(rec) : undefined;
    const clean = await rewriteUrls(rec, folder);
    store.create(entity, clean, null, { keepId: true });
    added++;
  }
  summary[entity] = { added, skipped };
  console.log(`  ${entity.padEnd(20)} ${String(added).padStart(5)} added  ${skipped ? `(${skipped} already present)` : ''}`);
}

// Logins for everyone on the roster
let logins = 0;
if (!DRY) {
  for (const a of store.find('Agent', { limit: 20000 })) {
    if (!a.user_email) continue;
    const before = db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(a.user_email);
    if (before) continue;
    ensureUser(a.user_email, a.role === 'admin' ? 'admin' : a.role === 'staff' ? 'staff' : 'user', a.full_name);
    logins++;
  }
}

console.log(`\nFiles: ${copied} copied, ${reused} already copied, ${failed} failed${SKIP_FILES ? ' (skipped by --skip-files)' : ''}`);
console.log(`Logins created for roster agents: ${logins}`);
if (failed) console.log('Re-run the same command to retry failed files (already-imported records are skipped).');
console.log('\nNext: sign in as admin → Agent Roster → "Send welcome emails" so agents can set their passwords.');
process.exit(0);
