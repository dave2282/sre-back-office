// Server-side permission rules. Base44 relied on the UI hiding things; here the API enforces them.
//   staff  = users with role admin or staff → full access
//   others = agents → only their own records (plus agents they are TC / lead agent for)
import { store, HttpError } from './store.js';
import { isStaff } from './auth.js';

const lc = (s) => String(s || '').trim().toLowerCase();

/** Emails whose records this user may see: self + agents that list them as TC or lead agent. */
export function scopeEmails(user) {
  if (!user) return [];
  if (user._scope) return user._scope;
  const me = lc(user.email);
  const set = new Set([me]);
  for (const a of store.find('Agent', { limit: 20000 })) {
    const tcs = (a.transaction_coordinators || []).map(lc);
    if (tcs.includes(me) || lc(a.lead_agent) === me) set.add(lc(a.user_email));
  }
  Object.defineProperty(user, '_scope', { value: [...set], enumerable: false });
  return user._scope;
}
const inScope = (user, email) => scopeEmails(user).includes(lc(email));

const forbid = (msg = 'You do not have permission to do that') => { throw new HttpError(403, msg); };
const staffOnly = { read: (u) => isStaff(u), write: (u) => isStaff(u) || forbid() };

const LOCKED_TXN_STATUSES = ['approved', 'paid'];
const AGENT_PROTECTED_FIELDS = ['role', 'status', 'commission_plan', 'annual_cap_amount', 'ytd_commission_paid', 'cap_status', 'desk_fee_plan', 'user_email'];

// Each rule: scope(user) -> {field, values} | null (SQL row filter for reads)
//            read(user, rec) -> bool       (single-record check)
//            write(user, op, rec, data)    (throws 403 when not allowed; rec = existing record for update/delete)
export const rules = {
  Transaction: {
    scope: (u) => (isStaff(u) ? null : { field: 'agent_email', values: scopeEmails(u) }),
    read: (u, r) => isStaff(u) || inScope(u, r.agent_email),
    write(u, op, rec, data = {}) {
      if (isStaff(u)) return;
      const target = { ...(rec || {}), ...data };
      if (!inScope(u, target.agent_email) || (rec && !inScope(u, rec.agent_email))) forbid('You can only manage your own transactions');
      if (op === 'delete' && LOCKED_TXN_STATUSES.includes(rec.status)) forbid('Approved or paid CDAs can only be deleted by the office');
      if (op !== 'delete') {
        if (LOCKED_TXN_STATUSES.includes(data.status) && data.status !== rec?.status) forbid('Only the office can approve CDAs');
        for (const f of ['approved_by', 'approved_date', 'office_payment_received']) {
          if (f in data && !!data[f] && JSON.stringify(data[f]) !== JSON.stringify(rec?.[f])) forbid('Only the office can change approval fields');
        }
      }
    },
  },
  Document: {
    scope: (u) => (isStaff(u) ? null : { field: 'agent_email', values: [...scopeEmails(u), '__office__'] }),
    read: (u, r) => isStaff(u) || r.agent_email === '__office__' || inScope(u, r.agent_email),
    write(u, op, rec, data = {}) {
      if (isStaff(u)) return;
      const target = { ...(rec || {}), ...data };
      if (target.agent_email === '__office__' || rec?.agent_email === '__office__') forbid('Office resources are managed by the office');
      if (!inScope(u, target.agent_email) || (rec && !inScope(u, rec.agent_email))) forbid('You can only manage your own documents');
      if (data.file_status === 'approved' && rec?.file_status !== 'approved') forbid('Only the office can approve documents');
    },
  },
  AccountingEntry: {
    scope: (u) => (isStaff(u) ? null : { field: 'agent_email', values: scopeEmails(u) }),
    read: (u, r) => isStaff(u) || inScope(u, r.agent_email),
    write: (u) => isStaff(u) || forbid(),
  },
  Agent: {
    scope: () => null,
    read: () => true,
    write(u, op, rec, data = {}) {
      if (isStaff(u)) return;
      if (op !== 'update' || lc(rec.user_email) !== lc(u.email)) forbid('You can only edit your own profile');
      for (const f of AGENT_PROTECTED_FIELDS) if (f in data && JSON.stringify(data[f]) !== JSON.stringify(rec[f])) forbid(`Only the office can change ${f}`);
    },
  },
  User: {
    scope: null, // handled specially in entities.js
    read: (u, r) => isStaff(u) || r.id === u.id,
    write(u, op, rec, data = {}) {
      if (!isStaff(u)) forbid();
      if (u.role !== 'admin' && (data.role === 'admin' || rec?.role === 'admin')) forbid('Only admins can manage admin accounts');
      if (op === 'delete' && rec?.id === u.id) forbid('You cannot delete your own account');
    },
  },
  BrokerageSettings: { scope: () => null, read: () => true, write: (u) => isStaff(u) || forbid() },
  CommunityPost: {
    scope: () => null,
    read: () => true,
    write(u, op, rec) {
      if (isStaff(u) || op === 'create') return;
      // Reactions/comments are stored on the post, so any signed-in user may update; only author/staff delete.
      if (op === 'delete' && lc(rec.created_by) !== lc(u.email) && lc(rec.author_email) !== lc(u.email)) forbid('You can only delete your own posts');
    },
  },
  TransactionCategory: { scope: () => null, read: () => true, write: (u) => isStaff(u) || forbid() },
  Vendor: { scope: () => null, read: () => true, write: (u) => isStaff(u) || forbid() },
  Expense: staffOnly,
  DocumentFeedback: { scope: () => null, read: () => true, write: (u, op) => isStaff(u) || op === 'create' || forbid() },
  SupportTicket: {
    scope: (u) => (isStaff(u) ? null : { field: 'created_by', values: [lc(u.email)] }),
    read: (u, r) => isStaff(u) || lc(r.created_by) === lc(u.email),
    write: (u, op) => isStaff(u) || op === 'create' || forbid(),
  },
};

// Base44 SaaS / multi-tenant entities — admin only.
for (const name of ['AppInstance', 'CustomerAddon', 'SaasAnnouncement', 'SaasBillingEvent', 'SaasCustomer', 'SaasProduct', 'SaasSubscription']) {
  rules[name] = { scope: () => null, read: (u) => isStaff(u), write: (u) => isStaff(u) || forbid() };
}

export function ruleFor(entity) {
  return rules[entity] || staffOnly;
}
