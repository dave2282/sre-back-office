// Runs the backend functions ported from Base44. Each function keeps its original shape:
//   export default async (req /* web Request */, base44 /* SDK-like client */) => Response
import express from 'express';
import { entitiesProxy } from '../entities.js';
import { coreIntegrations } from '../integrations/index.js';
import { ensureUser, setupLinkFor } from '../auth.js';
import { store, HttpError } from '../store.js';

import autoAuditDocument from './autoAuditDocument.js';
import backupData from './backupData.js';
import bulkImportAgents from './bulkImportAgents.js';
import bulkImportCDAs from './bulkImportCDAs.js';
import downloadDocZip from './downloadDocZip.js';
import generateCDA from './generateCDA.js';
import getRosterData from './getRosterData.js';
import migrateDocVaultStatus from './migrateDocVaultStatus.js';
import onTransactionCreated from './onTransactionCreated.js';
import removeTCFromAgent from './removeTCFromAgent.js';
import sendAgentReport from './sendAgentReport.js';
import sendApprovalEmail from './sendApprovalEmail.js';
import sendDocVaultStatusEmail from './sendDocVaultStatusEmail.js';
import sendTransactionStatusEmail from './sendTransactionStatusEmail.js';
import sendWelcomeEmail from './sendWelcomeEmail.js';
import smartScanAndSave from './smartScanAndSave.js';
import smartScanPDF from './smartScanPDF.js';

/** Functions callable from the browser via base44.functions.invoke(name, payload). */
export const callable = {
  backupData, bulkImportAgents, bulkImportCDAs, downloadDocZip, generateCDA, getRosterData,
  migrateDocVaultStatus, removeTCFromAgent, sendAgentReport, sendApprovalEmail,
  sendDocVaultStatusEmail, sendWelcomeEmail, smartScanAndSave, smartScanPDF,
};
/** Functions only run by automations (entity triggers). */
export const internal = { autoAuditDocument, onTransactionCreated, sendTransactionStatusEmail };

export function createServerClient(user) {
  const service = {
    entities: entitiesProxy(null, { actor: user?.email || 'system' }),
    integrations: { Core: coreIntegrations(user) },
    /** Insert a record keeping its original id (used by backup restore). Returns false if it exists. */
    restoreRecord(entity, record) {
      if (!store.isKnown(entity) || entity === 'User') return false;
      if (record.id && store.get(entity, record.id)) return false;
      store.create(entity, record, null, { keepId: true });
      return true;
    },
  };
  return {
    auth: { me: async () => user || null },
    entities: user ? entitiesProxy(user) : service.entities,
    integrations: { Core: coreIntegrations(user) },
    asServiceRole: service,
    users: {
      inviteUser: async (email, role = 'user') => ensureUser(email, role),
      ensureUser: (email, role) => ensureUser(email, role),
      setupLink: (u) => setupLinkFor(u),
    },
  };
}

async function toExpress(response, res) {
  const type = response.headers.get('content-type') || 'application/json';
  res.status(response.status).type(type).send(Buffer.from(await response.arrayBuffer()));
}

export async function runFunction(fn, payload, user) {
  const req = new Request('http://internal/function', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload ?? {}),
  });
  return fn(req, createServerClient(user));
}

export const functionsRouter = express.Router();
functionsRouter.post('/:name', async (req, res) => {
  const fn = callable[req.params.name];
  if (!fn) throw new HttpError(404, `Unknown function ${req.params.name}`);
  const response = await runFunction(fn, req.body, req.user);
  await toExpress(response, res);
});
