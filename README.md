# Signature Real Estate — Agent Portal (standalone)

This is a self-hosted rebuild of the **SRE AI Back Office** app that was originally built in Base44. It has the same screens (agent dashboard, Submit CDA, My Transactions, Document Vault, Resources, Agent Talk, Commissions, Accounting, Agent Roster, Reports and Brokerage Settings), but it runs entirely on your own server with no Base44 account.

| Piece | What it uses now |
|---|---|
| Frontend | The original React app, built with Vite |
| Backend | Node.js + Express (`server/`) |
| Database | SQLite, a single file at `data/app.db` |
| Logins | Email + password, invite links and password-reset links |
| File storage | Your server's disk, **or Google Drive, or Dropbox**, connected from Brokerage Settings |
| Email | Any SMTP account (Google Workspace, Microsoft 365, SendGrid, …) |
| AI (Smart File Upload, document auto-audit, CDA import) | Claude API |

---

## 1. Run it on your computer (for a test drive)

You need **Node.js 22 or newer** (`node -v`).

> **Windows:** run the commands below in **Command Prompt** (search "cmd" in the Start menu), not PowerShell. PowerShell blocks npm by default ("running scripts is disabled") and can drop the `--` in `npm run create-admin -- …`.

```bash
npm install
cp .env.example .env              # the defaults are fine for a local test
npm run create-admin -- you@resignature.com "David Ma" "ChooseAPassword1"
npm run build
npm start                          # → http://localhost:3000
```

While you're developing, `npm run dev` runs the API and a hot-reloading frontend at http://localhost:5173.

If SMTP isn't set up, emails aren't sent. Each one is saved as an HTML file in `data/outbox/` so you can open it and see exactly what would have gone out.

## 2. Put it on your web server

These steps assume an Ubuntu VPS (DigitalOcean, Lightsail, Linode…). 1 GB RAM is enough.

```bash
# as root / sudo
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs nginx sqlite3
adduser --system --group portal
git clone https://github.com/dave2282/sre-back-office.git /opt/agent-portal
cd /opt/agent-portal && npm ci && npm run build
cp .env.example .env && nano .env          # set APP_URL, SMTP, ANTHROPIC_API_KEY, storage keys
chown -R portal:portal /opt/agent-portal

sudo -u portal npm run create-admin -- you@resignature.com "David Ma"   # prints a set-password link

cp deploy/agent-portal.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now agent-portal
cp deploy/nginx.conf /etc/nginx/sites-available/agent-portal && ln -s /etc/nginx/sites-available/agent-portal /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
apt-get install -y certbot python3-certbot-nginx && certbot --nginx -d agents.resignature.com
```

Then point the DNS for `agents.resignature.com` (an A record) at the server's IP.

**To update later:** run `cd /opt/agent-portal && git pull && npm ci && npm run build && systemctl restart agent-portal`.

**Backups:** `deploy/backup.sh` makes a nightly copy of the database and uploaded files. Add it to cron with `0 2 * * * /opt/agent-portal/deploy/backup.sh`. If your files live in Google Drive or Dropbox, the database is the only thing left on the server that needs backing up.

**Docker instead?** Run `cp .env.example .env && docker compose up -d --build`. Data is stored in `./data`.

## 3. Move your data over from Base44

1. In the **old** Base44 portal, go to Brokerage Settings → Backup & Restore → **Download Backup**. You'll get a `.zip`.
2. Copy the zip to the new server and run:
   ```bash
   npm run import-base44 -- /path/to/brokerage_backup_2026-11-19.zip
   ```
   * Every record keeps its original ID, so documents, CDAs and accounting entries stay linked to each other.
   * **Every file is downloaded from Base44's storage** (PDFs, CDA PDFs, logo, headshots) into your storage, and the links are rewritten. Do this while the Base44 app is still live.
   * Every agent on the roster gets a login, but with no password yet.
   * It's safe to run again. Anything already imported is skipped, and file copies that failed are retried.
3. Sign in as admin, open **Agent Roster** and use **Send welcome emails**. Each agent gets a one-time link to set their password. Agents can also click "Forgot password?" on the sign-in page at any time.

> Tip: connect Google Drive or Dropbox (section 4) **before** importing, and the imported files go straight into the cloud, filed by agent and property.

## 4. Store files in Google Drive or Dropbox

Go to **Brokerage Settings → File Storage**. An admin clicks **Connect Google Drive** or **Connect Dropbox** and signs in with the company account. After that:

* New uploads are saved to that account under `Agent Portal/`:
  * `Agent Portal/Transactions/<Agent Name>/<Property Address>/`: transaction documents and the approved CDA PDF, renamed to the checklist item (e.g. "Purchase Agreement.pdf")
  * `Agent Portal/Agent Files/<Agent Name>/`: agent office documents (W-9, contractor agreement…)
  * `Agent Portal/Office Resources/`: office-wide resources
  * `Agent Portal/Uploads/<month>/`: everything else (logos, photos, screenshots)
* Files are moved automatically if a property address or agent changes.
* The portal keeps its own link for each file (`/files/<id>/<name>`) and checks permissions when someone opens one. An agent can only open their own files, even if they get hold of a link. Cloud files are never made public.
* **Move existing files** copies everything already on the server (or in the other cloud) into the connected account, and the links in the portal keep working.
* If Drive or Dropbox is ever unreachable, uploads still succeed and are kept on the server until you run **Move existing files** again.

The server needs one set of app credentials per provider. This is a one-time setup of about 10 minutes.

### Google Drive

1. Go to https://console.cloud.google.com and create a project (e.g. "Agent Portal").
2. Go to **APIs & Services → Library**, find **Google Drive API** and click **Enable**.
3. Go to **APIs & Services → OAuth consent screen**. Choose **Internal** if you use Google Workspace (no review needed), otherwise **External** and add your company Google account as a test user.
4. Go to **Credentials → Create credentials → OAuth client ID → Web application**.
   * Authorized redirect URI: `https://agents.resignature.com/api/storage/oauth/google_drive/callback`
5. Copy the client ID and secret into `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then restart.

The portal asks for the `drive.file` permission only. It can see and manage the files and folders it creates, and nothing else in your Drive.

### Dropbox

1. Go to https://www.dropbox.com/developers/apps → **Create app** → **Scoped access**. Choose **Full Dropbox** to have the files in a normal folder, or **App folder** to keep them in `Apps/<app name>/`.
2. On the **Permissions** tab, tick `files.content.write`, `files.content.read` and `account_info.read`, then click **Submit**.
3. On the **Settings** tab, add this redirect URI: `https://agents.resignature.com/api/storage/oauth/dropbox/callback`
4. Copy the App key and App secret into `.env` as `DROPBOX_APP_KEY` and `DROPBOX_APP_SECRET`, then restart.

Run `npm run test:storage` to check the Drive and Dropbox code against a simulated API. It doesn't need real accounts.

## 5. Permissions (new: enforced by the server)

In Base44, hiding things was left to the screens. The API itself would return any record to any signed-in user. Now the server enforces access:

| Role | Can see / do |
|---|---|
| **admin** | Everything, including granting admin. |
| **staff** | Everything except creating or editing admin accounts. |
| **agent** | Their own transactions, documents and accounting entries, plus those of agents who list them as **transaction coordinator** or **lead agent**. They can read the roster, office resources, Agent Talk, categories and vendors. They can edit their own profile but not their role, commission plan, cap or status. They **cannot** approve CDAs, mark payments received, approve documents, or change brokerage settings. Email from an agent account can only go to people at the brokerage. |

Changing an agent's role to *admin* or *staff* in the Agent Roster updates their login. Setting an agent to *inactive* blocks their sign-in.

## 6. What changed compared with the Base44 version

* **Sign-in.** It's the portal's own login page now (`/login`) with forgot-password, instead of the Base44 login.
* **Welcome emails** contain a working "Set up my login" link. The old one pointed to app.base44.com.
* **The "CDA Status Change Notification" automation.** Its function wasn't in the Base44 export, so it was rebuilt: the agent is emailed when a CDA is sent back for corrections, including the correction notes, and when it's marked paid.
* **"CDA submitted" emails come from the server only.** They now also go out when a saved draft is submitted or a corrected CDA is resubmitted (both were missed before), and the browser no longer sends a second copy.
* **Backup restore** now keeps record IDs, so links between records survive a restore.
* **Kept as-is:** CDA PDF generation, accounting-entry sync on approval, AI document audit, Smart File Upload splitting, Excel CDA import, reports, ZIP download and backups.
* **Removed:** Base44 SaaS / multi-tenant pieces (`assignAppInstance`, `getInstanceStats`, the MCP consent page). They were for the Base44 platform, not your portal.

## Project layout

```
server/
  index.js            Express app: API, file downloads, serves the built frontend
  auth.js             logins, sessions, invites, password reset
  access.js           who can read/write what
  entities.js         Base44-compatible entity API (list / filter / create / update / delete)
  hooks.js            automations (former Base44 workflows) + filing files into folders
  store.js, db.js     SQLite storage
  storage/            local disk, Google Drive and Dropbox adapters
  integrations/       email (SMTP), AI (Claude), uploads
  functions/          the 16 backend functions ported from Base44 + sendTransactionStatusEmail
  entities/           data schemas copied from the Base44 export
src/                  the React app (src/api/base44Client.js is the replacement SDK)
scripts/              create-admin, import-base44
deploy/               nginx, systemd and backup examples
```
