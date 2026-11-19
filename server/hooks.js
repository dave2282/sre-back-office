// Automations — replaces the Base44 "workflows" (entity triggers) plus storage housekeeping.
//  • Transaction created/updated  → onTransactionCreated   (accounting entry sync, CDA PDF, admin alert)
//  • Transaction status changed   → sendTransactionStatusEmail
//  • Document created             → autoAuditDocument      (AI checklist matching)
//  • Document / CDA PDF saved     → file filed into a tidy folder in Google Drive / Dropbox
//  • Agent role/status changed    → login role/status kept in sync
import { config } from './config.js';
import { store } from './store.js';
import { users } from './store.js';
import { fileIdFromUrl, organizeFile, activeProviderName } from './storage/index.js';

const clean = (s, fallback) => (String(s || '').replace(/[/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || fallback).slice(0, 120);

function agentNameFor(email, fallback) {
  if (fallback) return fallback;
  const a = email ? store.find('Agent', { query: { user_email: email }, limit: 1 })[0] : null;
  return a?.full_name || email || 'Unassigned';
}

export function folderForTransaction(txn) {
  return `${config.storageRootFolder}/Transactions/${clean(agentNameFor(txn.agent_email, txn.agent_name), 'Unassigned')}/${clean(txn.property_address, `Transaction ${txn.id}`)}`;
}

export function folderForDocument(doc) {
  const root = config.storageRootFolder;
  if (doc.transaction_id) {
    const txn = store.get('Transaction', doc.transaction_id);
    if (txn) return folderForTransaction(txn);
  }
  if (doc.agent_email === '__office__') return `${root}/Office Resources`;
  if (doc.doc_section === 'office') return `${root}/Agent Files/${clean(agentNameFor(doc.agent_email), 'Unassigned')}`;
  return `${root}/Transactions/${clean(agentNameFor(doc.agent_email), 'Unassigned')}/Unlinked Documents`;
}

async function runInternal(name, payload) {
  const { internal, runFunction } = await import('./functions/runtime.js');
  const res = await runFunction(internal[name], payload, null);
  if (res.status >= 400) console.error(`[automation] ${name} → ${res.status}`, await res.text().catch(() => ''));
}

async function handle(evt) {
  const { entity, type, data, old_data, changed_fields = [], actor } = evt;
  const payload = { event: { type, entity_name: entity, entity_id: data.id }, data, old_data, changed_fields };

  if (entity === 'Transaction' && type !== 'delete') {
    if (type === 'create' || !changed_fields.includes('latest_cda_pdf_url')) await runInternal('onTransactionCreated', payload);
    if (type === 'update' && changed_fields.includes('status')) await runInternal('sendTransactionStatusEmail', payload);
    // File the generated CDA PDF next to the transaction's documents
    const pdfId = fileIdFromUrl(data.latest_cda_pdf_url);
    if (pdfId && activeProviderName() !== 'local' && changed_fields.includes('latest_cda_pdf_url')) {
      await organizeFile(pdfId, folderForTransaction(data), `CDA - ${clean(data.property_address, data.id)}.pdf`);
    }
    // Address/agent changed → move this transaction's files to the new folder
    if (type === 'update' && activeProviderName() !== 'local' && changed_fields.some(f => ['property_address', 'agent_email', 'agent_name'].includes(f))) {
      for (const doc of store.find('Document', { query: { transaction_id: data.id }, limit: 1000 })) {
        const id = fileIdFromUrl(doc.file_url);
        if (id) await organizeFile(id, folderForTransaction(data), doc.name);
      }
    }
  }

  if (entity === 'Document' && type !== 'delete') {
    if (type === 'create' && config.anthropic.apiKey) await runInternal('autoAuditDocument', payload);
    const id = fileIdFromUrl(data.file_url);
    const relevant = type === 'create' || changed_fields.some(f => ['file_url', 'name', 'transaction_id', 'agent_email', 'doc_section'].includes(f));
    if (id && relevant && activeProviderName() !== 'local') {
      const fresh = store.get('Document', data.id) || data; // autoAudit may have renamed it
      await organizeFile(id, folderForDocument(fresh), fresh.name);
    }
  }

  if (entity === 'Agent' && type === 'update' && actor && actor.role === 'admin') {
    const login = data.user_email && users.rowByEmail(data.user_email);
    if (login) {
      const patch = {};
      if (changed_fields.includes('role')) {
        const r = ['admin', 'staff'].includes(data.role) ? data.role : (['admin', 'staff'].includes(login.role) ? 'user' : null);
        if (r && r !== login.role && login.id !== actor.id) patch.role = r;
      }
      if (changed_fields.includes('status')) {
        if (data.status === 'inactive' && login.status === 'active' && login.id !== actor.id) patch.status = 'inactive';
        if (data.status === 'active' && login.status === 'inactive') patch.status = 'active';
      }
      if (Object.keys(patch).length) users.update(login.id, patch);
    }
  }
}

// Run automations after the response is sent, one at a time per record to avoid races.
const chains = new Map();
export function runHooks(evt) {
  const key = `${evt.entity}:${evt.data?.id}`;
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.then(() => handle(evt)).catch(e => console.error(`[automation] ${evt.entity}.${evt.type}`, e));
  chains.set(key, next);
  next.finally(() => { if (chains.get(key) === next) chains.delete(key); });
}
