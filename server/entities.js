// Entity service + REST routes. The same service is used by the HTTP API (user-scoped) and by
// backend functions (`base44.asServiceRole.entities.X` → user = null → no permission checks).
import express from 'express';
import { store, HttpError } from './store.js';
import { ruleFor } from './access.js';
import { isStaff } from './auth.js';
import { broadcast } from './events.js';
import { runHooks } from './hooks.js';

function changedFields(oldRec, patch) {
  return Object.keys(patch || {}).filter(k => JSON.stringify(oldRec?.[k]) !== JSON.stringify(patch[k]));
}

function redact(entity, user, rec) {
  if (!rec || !user || isStaff(user)) return rec;
  if (entity === 'Agent') { const { notes, ...rest } = rec; return rest; }
  return rec;
}

function after(entity, type, record, oldRecord, changed, opts) {
  broadcast({ entity, type, id: record.id });
  if (!opts?.skipHooks) runHooks({ entity, type, data: record, old_data: oldRecord, changed_fields: changed, actor: opts?.actor && typeof opts.actor === 'object' ? opts.actor : null });
}

/** Base44-compatible entity API. `user` null = service role (no checks). */
export function entityApi(entity, user, opts = {}) {
  if (!store.isKnown(entity)) throw new HttpError(404, `Unknown entity ${entity}`);
  const rule = ruleFor(entity);
  const checkRead = (rec) => !user || rule.read(user, rec);
  const createdBy = user?.email || opts.actor || null;

  const find = (query, sort, limit, skip) => {
    // Entities this user may not read at all return an empty list (keeps the UI from erroring).
    if (user && entity !== 'User' && !rule.scope && !rule.read(user, {})) return [];
    if (entity === 'User' && user && !isStaff(user)) {
      return store.find('User', { query: { ...query, id: user.id }, sort, limit, skip });
    }
    const scope = user && rule.scope ? rule.scope(user) : null;
    let rows = store.find(entity, { query, sort, limit, skip, scope });
    if (user) rows = rows.filter(checkRead).map(r => redact(entity, user, r));
    return rows;
  };

  return {
    list: async (sort, limit, skip) => find({}, sort, limit, skip),
    filter: async (query, sort, limit, skip) => find(query || {}, sort, limit, skip),
    get: async (id) => {
      const rec = store.get(entity, id);
      if (!rec || !checkRead(rec)) throw new HttpError(404, `${entity} not found`);
      return redact(entity, user, rec);
    },
    create: async (data) => {
      if (user) rule.write(user, 'create', null, data || {});
      const rec = store.create(entity, data || {}, createdBy);
      after(entity, 'create', rec, null, Object.keys(data || {}), opts);
      return redact(entity, user, rec);
    },
    bulkCreate: async (items) => {
      const out = [];
      for (const d of items || []) {
        if (user) rule.write(user, 'create', null, d || {});
        const rec = store.create(entity, d || {}, createdBy);
        after(entity, 'create', rec, null, Object.keys(d || {}), opts);
        out.push(redact(entity, user, rec));
      }
      return out;
    },
    update: async (id, data) => {
      const old = store.get(entity, id);
      if (!old || !checkRead(old)) throw new HttpError(404, `${entity} not found`);
      if (user) rule.write(user, 'update', old, data || {});
      const changed = changedFields(old, data);
      const rec = store.update(entity, id, data || {});
      if (changed.length) after(entity, 'update', rec, old, changed, { ...opts, actor: user });
      return redact(entity, user, rec);
    },
    delete: async (id) => {
      const old = store.get(entity, id);
      if (!old || !checkRead(old)) throw new HttpError(404, `${entity} not found`);
      if (user) rule.write(user, 'delete', old);
      store.delete(entity, id);
      broadcast({ entity, type: 'delete', id });
      if (!opts.skipHooks) runHooks({ entity, type: 'delete', data: old, old_data: old, changed_fields: [] });
      return { success: true, id };
    },
    subscribe: () => () => {},
  };
}

/** Proxy so code can do `entities.Transaction.list()` like the Base44 SDK. */
export function entitiesProxy(user, opts) {
  return new Proxy({}, { get: (_t, name) => (typeof name === 'string' ? entityApi(name, user, opts) : undefined) });
}

// ------------------------------------------------------------------ REST routes
export const entitiesRouter = express.Router();
const parseQ = (q) => { if (!q) return {}; try { return JSON.parse(q); } catch { throw new HttpError(400, 'Invalid q parameter'); } };

entitiesRouter.get('/:entity', async (req, res) => {
  const api = entityApi(req.params.entity, req.user);
  const { sort, limit, skip, q } = req.query;
  res.json(await api.filter(parseQ(q), sort, limit, skip));
});
entitiesRouter.get('/:entity/:id', async (req, res) => {
  res.json(await entityApi(req.params.entity, req.user).get(req.params.id));
});
entitiesRouter.post('/:entity/bulk', async (req, res) => {
  res.json(await entityApi(req.params.entity, req.user).bulkCreate(req.body));
});
entitiesRouter.post('/:entity', async (req, res) => {
  res.json(await entityApi(req.params.entity, req.user).create(req.body));
});
entitiesRouter.put('/:entity/:id', async (req, res) => {
  res.json(await entityApi(req.params.entity, req.user).update(req.params.id, req.body));
});
entitiesRouter.delete('/:entity/:id', async (req, res) => {
  res.json(await entityApi(req.params.entity, req.user).delete(req.params.id));
});
