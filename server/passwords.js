// Sets new random passwords for all staff accounts and the demo student before going public.
// Usage: npm run passwords   (prints the new passwords once — save them)
import crypto from 'node:crypto';
import { all, run } from './db.js';
import { hashPassword } from './auth.js';

const gen = () => crypto.randomBytes(9).toString('base64url');
const users = all("SELECT id, name, email, role FROM users WHERE role != 'student' OR email = 'student@hakk.kz'");
console.log('\nЖаңа құпиясөздер (сақтап қойыңыз):\n');
for (const u of users) {
  const pw = gen();
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(pw), u.id);
  console.log(`${u.role.padEnd(8)} ${String(u.email).padEnd(22)} ${pw}`);
}
// other demo students get one shared random password; change or deactivate them in the admin panel
const shared = gen();
run("UPDATE users SET password_hash = ? WHERE role = 'student' AND email LIKE 'student%@hakk.kz' AND email != 'student@hakk.kz'", hashPassword(shared));
console.log(`\nҚалған демо оқушылар (student1..24@hakk.kz): ${shared}\n`);
