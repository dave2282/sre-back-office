import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { config } from './config.js';

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  data TEXT NOT NULL,
  created_date TEXT NOT NULL,
  updated_date TEXT NOT NULL,
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_records_entity ON records(entity, created_date);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  password_hash TEXT,
  extra TEXT NOT NULL DEFAULT '{}',
  last_login_at TEXT,
  created_date TEXT NOT NULL,
  updated_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,           -- invite | reset
  expires_at TEXT NOT NULL,
  used_at TEXT
);

-- Every uploaded file. file_url = APP_URL/files/<id>/<name>; the bytes live with the provider.
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  provider TEXT NOT NULL,       -- local | google_drive | dropbox
  provider_ref TEXT NOT NULL,   -- local path / Drive file id / Dropbox path or id
  folder TEXT,
  uploaded_by TEXT,
  created_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

export const newId = () => crypto.randomBytes(12).toString('hex');
export const nowIso = () => new Date().toISOString();

export const kv = {
  get(key) {
    const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
    return r ? JSON.parse(r.value) : null;
  },
  set(key, value) {
    db.prepare('INSERT INTO kv(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  },
  del(key) { db.prepare('DELETE FROM kv WHERE key = ?').run(key); },
};
