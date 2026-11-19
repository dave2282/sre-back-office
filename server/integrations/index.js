// Base44 `integrations.Core.*` equivalents + HTTP routes for the browser client.
import express from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { db } from '../db.js';
import { HttpError, store } from '../store.js';
import { isStaff } from '../auth.js';
import { saveFile } from '../storage/index.js';
import { sendEmail } from './email.js';
import { invokeLLM } from './llm.js';

/** Core for server-side code. Accepts web File/Blob (as the Base44 functions pass) or Buffers. */
export function coreIntegrations(user) {
  return {
    async UploadFile({ file, folder }) {
      if (!file) throw new Error('UploadFile: file required');
      const buffer = Buffer.isBuffer(file) ? file : Buffer.from(await file.arrayBuffer());
      const { file_url } = await saveFile({ buffer, name: file.name || 'file', mime: file.type, folder, uploadedBy: user?.email || 'system' });
      return { file_url };
    },
    SendEmail: (args) => sendEmail(args),
    InvokeLLM: (args) => invokeLLM(args),
  };
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });

export const integrationsRouter = express.Router();

integrationsRouter.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded');
  // multer decodes the filename as latin1; restore UTF-8 names
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const { file_url } = await saveFile({ buffer: req.file.buffer, name, mime: req.file.mimetype, folder: req.body?.folder, uploadedBy: req.user.email });
  res.json({ file_url });
});

integrationsRouter.post('/send-email', async (req, res) => {
  const { to, subject, body, from_name } = req.body || {};
  if (!isStaff(req.user)) {
    // Agents may only email people who belong to the brokerage (prevents use as an open mail relay).
    const recipients = String(to || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const known = new Set([
      ...db.prepare('SELECT email FROM users').all().map(r => r.email.toLowerCase()),
      ...store.find('Agent', { limit: 20000 }).map(a => String(a.user_email || '').toLowerCase()),
    ]);
    if (!recipients.length || recipients.some(r => !known.has(r))) throw new HttpError(403, 'Agents can only email members of the brokerage');
  }
  res.json(await sendEmail({ to, subject, body, from_name }));
});

integrationsRouter.post('/invoke-llm', async (req, res) => {
  const result = await invokeLLM(req.body || {});
  res.json(result);
});
