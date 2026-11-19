import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let transport = null;
if (config.smtp.host) {
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
}

const outbox = path.join(config.dataDir, 'outbox');
const looksHtml = (s) => /<\/?[a-z][\s\S]*>/i.test(s || '');

/** Base44 Core.SendEmail equivalent: { to, subject, body, from_name } */
export async function sendEmail({ to, subject, body, from_name, attachments }) {
  if (!to) throw new Error('SendEmail: "to" is required');
  const fromAddr = config.smtp.from;
  const msg = {
    from: from_name ? `"${String(from_name).replace(/"/g, '')}" <${fromAddr}>` : fromAddr,
    to,
    subject: subject || '(no subject)',
    ...(looksHtml(body) ? { html: body } : { text: body || '' }),
    attachments,
  };
  if (!transport) {
    // No SMTP configured: keep a copy on disk so nothing is silently lost during setup/testing.
    fs.mkdirSync(outbox, { recursive: true });
    const file = path.join(outbox, `${Date.now()}-${String(to).replace(/[^a-z0-9@.]/gi, '_')}.html`);
    fs.writeFileSync(file, `<!-- to: ${to}\n subject: ${msg.subject}\n from: ${msg.from} -->\n${body || ''}`);
    console.log(`[email:outbox] SMTP not configured — saved "${msg.subject}" to ${to} → ${file}`);
    return { success: true, queued: 'outbox' };
  }
  const info = await transport.sendMail(msg);
  return { success: true, id: info.messageId };
}

export function emailShell(brandName, color = '#1e3a5f', inner = '') {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
  <div style="background:${color || '#1e3a5f'};padding:20px 28px;border-radius:8px 8px 0 0"><h2 style="color:#fff;margin:0">${brandName}</h2></div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px 28px;border-radius:0 0 8px 8px">${inner}</div></div>`;
}
