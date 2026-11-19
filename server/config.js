import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dataDir = path.resolve(root, process.env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });

// JWT secret: use env, otherwise generate one and persist it so sessions survive restarts.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const f = path.join(dataDir, '.jwt_secret');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}

const port = Number(process.env.PORT || 3000);

export const config = {
  root,
  dataDir,
  port,
  appUrl: (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  isProd: process.env.NODE_ENV === 'production',
  jwtSecret: loadSecret(),
  sessionDays: Number(process.env.SESSION_DAYS || 30),
  dbPath: path.join(dataDir, 'app.db'),
  uploadDir: path.join(dataDir, 'uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 100),

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@localhost',
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },
  dropbox: {
    appKey: process.env.DROPBOX_APP_KEY || '',
    appSecret: process.env.DROPBOX_APP_SECRET || '',
  },
  storageRootFolder: process.env.STORAGE_ROOT_FOLDER || 'Agent Portal',
};

fs.mkdirSync(config.uploadDir, { recursive: true });
