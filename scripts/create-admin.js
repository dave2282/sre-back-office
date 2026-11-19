// Usage: npm run create-admin -- email@domain.com "Full Name" [password]
// Creates (or promotes) an admin login. Without a password, prints a one-time set-password link.
import bcrypt from 'bcryptjs';
import { users } from '../server/store.js';
import { setupLinkFor } from '../server/auth.js';

const [email, fullName = '', password] = process.argv.slice(2);
if (!email) {
  console.error('Usage: npm run create-admin -- email@domain.com "Full Name" [password]');
  process.exit(1);
}

let row = users.rowByEmail(email);
let user = row ? users.update(row.id, { role: 'admin', status: 'active', ...(fullName ? { full_name: fullName } : {}) })
  : users.create({ email, full_name: fullName, role: 'admin' });

if (password) {
  if (password.length < 8) { console.error('Password must be at least 8 characters'); process.exit(1); }
  users.setPassword(user.id, await bcrypt.hash(password, 12));
  console.log(`Admin ready: ${user.email} — sign in at /login`);
} else {
  user = users.get(user.id);
  console.log(`Admin ready: ${user.email}`);
  console.log(`Open this link to set the password (valid 14 days):\n  ${setupLinkFor({ ...user, has_password: false })}`);
}
process.exit(0);
