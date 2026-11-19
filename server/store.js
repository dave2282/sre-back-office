// Document store that mirrors the Base44 entity API (list / filter / get / create / update / delete).
// Each entity record is a JSON blob in the `records` table; Users live in their own table.
import fs from 'node:fs';
import path from 'node:path';
import { db, newId, nowIso } from './db.js';
import { config } from './config.js';

// ---- Schemas (copied from the Base44 export) — used for defaults + entity whitelist ----
const schemaDir = path.join(config.root, 'server', 'entities');
export const schemas = {};
for (const f of fs.readdirSync(schemaDir)) {
  if (!f.endsWith('.json')) continue;
  const s = JSON.parse(fs.readFileSync(path.join(schemaDir, f), 'utf8'));
  schemas[s.name] = s;
}
export const ENTITY_NAMES = Object.keys(schemas);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const FIELD_RE = /^[a-zA-Z0-9_]+$/;
const SYSTEM_FIELDS = new Set(['id', 'created_date', 'updated_date', 'created_by']);

function applyDefaults(entity, data) {
  const props = schemas[entity]?.properties || {};
  const out = { ...data };
  for (const [k, p] of Object.entries(props)) {
    if (out[k] === undefined && p.default !== undefined) out[k] = structuredClone(p.default);
  }
  return out;
}

function stripSystem(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) if (!SYSTEM_FIELDS.has(k)) out[k] = v;
  return out;
}

function rowToRecord(row) {
  return {
    ...JSON.parse(row.data),
    id: row.id,
    created_date: row.created_date,
    updated_date: row.updated_date,
    created_by: row.created_by || undefined,
  };
}

function parseSort(sort) {
  if (!sort || typeof sort !== 'string') return { expr: 'created_date', dir: 'DESC' };
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!FIELD_RE.test(field)) return { expr: 'created_date', dir: 'DESC' };
  const expr = (field === 'created_date' || field === 'updated_date' || field === 'id')
    ? field : `json_extract(data, '$.${field}')`;
  return { expr, dir: desc ? 'DESC' : 'ASC' };
}

// Build SQL WHERE pieces for a Base44-style equality query. Supports {field: value} and {field: {$in: [...]}}.
function buildWhere(query, params) {
  const clauses = [];
  for (const [field, value] of Object.entries(query || {})) {
    if (!FIELD_RE.test(field)) throw new HttpError(400, `Invalid filter field: ${field}`);
    const col = field === 'id' || field === 'created_by' ? field : `json_extract(data, '$.${field}')`;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (Array.isArray(value.$in)) {
        if (value.$in.length === 0) { clauses.push('0'); continue; }
        clauses.push(`${col} IN (${value.$in.map(() => '?').join(',')})`);
        params.push(...value.$in.map(sqlValue));
        continue;
      }
      if ('$ne' in value) { clauses.push(`(${col} IS NULL OR ${col} != ?)`); params.push(sqlValue(value.$ne)); continue; }
      throw new HttpError(400, `Unsupported filter operator on ${field}`);
    }
    if (value === null || value === undefined) { clauses.push(`${col} IS NULL`); continue; }
    if (Array.isArray(value)) { clauses.push(`json(${col}) = json(?)`); params.push(JSON.stringify(value)); continue; }
    clauses.push(`${col} = ?`);
    params.push(sqlValue(value));
  }
  return clauses;
}
const sqlValue = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v);

// ---------------- Generic records ----------------
const records = {
  find(entity, { query = {}, sort, limit, skip, scope } = {}) {
    const params = [entity];
    const where = ['entity = ?', ...buildWhere(query, params)];
    if (scope) {
      // scope = { field, values: [...] } — restricts rows for non-admin users
      if (!scope.values.length) return [];
      const scol = scope.field === 'created_by' ? 'created_by' : `json_extract(data, '$.${scope.field}')`;
      where.push(`${scol} COLLATE NOCASE IN (${scope.values.map(() => '?').join(',')})`);
      params.push(...scope.values);
    }
    const { expr, dir } = parseSort(sort);
    let sql = `SELECT * FROM records WHERE ${where.join(' AND ')} ORDER BY ${expr} ${dir}, created_date DESC`;
    const lim = Math.min(Number(limit) || 5000, 20000);
    sql += ` LIMIT ${lim}`;
    if (Number(skip) > 0) sql += ` OFFSET ${Number(skip)}`;
    return db.prepare(sql).all(...params).map(rowToRecord);
  },
  get(entity, id) {
    const row = db.prepare('SELECT * FROM records WHERE entity = ? AND id = ?').get(entity, id);
    return row ? rowToRecord(row) : null;
  },
  create(entity, data, createdBy, { keepId = false } = {}) {
    const id = keepId && data.id ? String(data.id) : newId();
    const created = keepId && data.created_date ? data.created_date : nowIso();
    const updated = keepId && data.updated_date ? data.updated_date : created;
    const body = applyDefaults(entity, stripSystem(data));
    db.prepare('INSERT INTO records (id, entity, data, created_date, updated_date, created_by) VALUES (?,?,?,?,?,?)')
      .run(id, entity, JSON.stringify(body), created, updated, (keepId && data.created_by) || createdBy || null);
    return this.get(entity, id);
  },
  update(entity, id, patch) {
    const existing = this.get(entity, id);
    if (!existing) throw new HttpError(404, `${entity} ${id} not found`);
    const merged = { ...stripSystem(existing), ...stripSystem(patch) };
    for (const [k, v] of Object.entries(patch || {})) if (v === undefined) delete merged[k];
    db.prepare('UPDATE records SET data = ?, updated_date = ? WHERE entity = ? AND id = ?')
      .run(JSON.stringify(merged), nowIso(), entity, id);
    return this.get(entity, id);
  },
  delete(entity, id) {
    const existing = this.get(entity, id);
    if (!existing) throw new HttpError(404, `${entity} ${id} not found`);
    db.prepare('DELETE FROM records WHERE entity = ? AND id = ?').run(entity, id);
    return existing;
  },
};

// ---------------- Users (separate table, same API shape) ----------------
const USER_COLS = new Set(['email', 'full_name', 'role', 'status']);
export function userRowToPublic(row) {
  if (!row) return null;
  return {
    ...JSON.parse(row.extra || '{}'),
    id: row.id,
    email: row.email,
    full_name: row.full_name || '',
    role: row.role,
    status: row.status,
    last_login_at: row.last_login_at || null,
    has_password: !!row.password_hash,
    created_date: row.created_date,
    updated_date: row.updated_date,
  };
}

export const users = {
  rowByEmail(email) { return db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(String(email || '').trim()); },
  rowById(id) { return db.prepare('SELECT * FROM users WHERE id = ?').get(id); },
  find({ query = {}, sort, limit, skip } = {}) {
    let all = db.prepare('SELECT * FROM users').all().map(userRowToPublic);
    all = all.filter(u => Object.entries(query).every(([k, v]) =>
      v && typeof v === 'object' && Array.isArray(v.$in) ? v.$in.includes(u[k]) : String(u[k] ?? '').toLowerCase() === String(v ?? '').toLowerCase()));
    const { field, desc } = sort && typeof sort === 'string'
      ? { field: sort.replace(/^-/, ''), desc: sort.startsWith('-') } : { field: 'created_date', desc: true };
    all.sort((a, b) => (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * (desc ? -1 : 1));
    const start = Number(skip) || 0;
    return all.slice(start, start + (Number(limit) || 5000));
  },
  get(id) { return userRowToPublic(this.rowById(id)); },
  create({ email, full_name = '', role = 'user', status = 'active', password_hash = null, ...extra }) {
    email = String(email || '').trim().toLowerCase();
    if (!email) throw new HttpError(400, 'email required');
    if (this.rowByEmail(email)) throw new HttpError(409, 'A user with that email already exists');
    const id = newId(); const now = nowIso();
    db.prepare('INSERT INTO users (id,email,full_name,role,status,password_hash,extra,created_date,updated_date) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, email, full_name, role, status, password_hash, JSON.stringify(stripSystem(extra)), now, now);
    return this.get(id);
  },
  update(id, patch) {
    const row = this.rowById(id);
    if (!row) throw new HttpError(404, 'User not found');
    const extra = JSON.parse(row.extra || '{}');
    const cols = {};
    for (const [k, v] of Object.entries(stripSystem(patch))) {
      if (k === 'has_password' || k === 'last_login_at' || k === 'password_hash') continue;
      if (USER_COLS.has(k)) cols[k] = k === 'email' ? String(v).trim().toLowerCase() : v;
      else extra[k] = v;
    }
    const sets = Object.keys(cols).map(k => `${k} = ?`);
    db.prepare(`UPDATE users SET ${[...sets, 'extra = ?', 'updated_date = ?'].join(', ')} WHERE id = ?`)
      .run(...Object.values(cols), JSON.stringify(extra), nowIso(), id);
    return this.get(id);
  },
  setPassword(id, hash) { db.prepare('UPDATE users SET password_hash = ?, updated_date = ? WHERE id = ?').run(hash, nowIso(), id); },
  touchLogin(id) { db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), id); },
  delete(id) {
    const u = this.get(id);
    if (!u) throw new HttpError(404, 'User not found');
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return u;
  },
};

// ---------------- Unified raw API (no permission checks) ----------------
export const store = {
  find(entity, opts) { return entity === 'User' ? users.find(opts) : records.find(entity, opts); },
  get(entity, id) { return entity === 'User' ? users.get(id) : records.get(entity, id); },
  create(entity, data, createdBy, opts) { return entity === 'User' ? users.create(data) : records.create(entity, data, createdBy, opts); },
  update(entity, id, patch) { return entity === 'User' ? users.update(id, patch) : records.update(entity, id, patch); },
  delete(entity, id) { return entity === 'User' ? users.delete(id) : records.delete(entity, id); },
  isKnown(entity) { return ENTITY_NAMES.includes(entity); },
};
