import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { get, run, DATA_DIR } from './db.js';

// Secret is persisted so sessions survive restarts; override with JWT_SECRET in production.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const f = path.join(DATA_DIR, '.jwt_secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8').trim();
}
const SECRET = loadSecret();
const COOKIE = 'hakk_session';
const MAX_AGE = 1000 * 60 * 60 * 24 * 30;

/** Role → permissions. Admin has everything. */
export const PERMISSIONS = {
  student: [],
  teacher: ['content.edit', 'content.approve', 'submissions.review', 'questions.answer', 'events.manage', 'analytics.view', 'assignments.manage', 'journal.own'],
  curator: ['questions.answer', 'users.manage', 'groups.manage', 'access.grant', 'events.manage', 'notify.send', 'analytics.view', 'assignments.manage', 'journal.manage', 'payroll.manage'],
  admin: ['*'],
};
export const can = (user, perm) => {
  const p = PERMISSIONS[user?.role] || [];
  return p.includes('*') || p.includes(perm);
};
export const permsFor = (role) => (role === 'admin'
  ? [...new Set(Object.values(PERMISSIONS).flat().filter((p) => p !== '*')), 'content.publish', 'users.delete']
  : PERMISSIONS[role] || []);

export const hashPassword = (pw) => bcrypt.hashSync(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compareSync(pw, hash);

export function setSession(res, user) {
  const token = jwt.sign({ uid: user.id, role: user.role }, SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIE !== '1',
  });
}
export const clearSession = (res) => res.clearCookie(COOKIE);

export const publicUser = (u) => u && ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role,
  locale: u.locale, bio: u.bio, created_at: u.created_at, permissions: permsFor(u.role),
});

/** Attaches req.user when a valid session cookie is present (role is re-read from DB). */
export function sessionMiddleware(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { uid } = jwt.verify(token, SECRET);
      const u = get('SELECT * FROM users WHERE id = ? AND active = 1', uid);
      if (u) req.user = u;
    } catch { /* invalid/expired token → anonymous */ }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Жүйеге кіру қажет' });
  next();
}
export const requirePerm = (perm) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Жүйеге кіру қажет' });
  if (perm === 'content.publish' || perm === 'users.delete'
    ? req.user.role !== 'admin' : !can(req.user, perm)) {
    return res.status(403).json({ error: 'Бұл әрекетке рұқсатыңыз жоқ' });
  }
  next();
};

export function findByLogin(login) {
  const v = String(login || '').trim().toLowerCase();
  if (!v) return null;
  if (v.includes('@')) return get('SELECT * FROM users WHERE lower(email) = ?', v);
  return get('SELECT * FROM users WHERE phone = ?', normalizePhone(v));
}
export function normalizePhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return d ? '+' + d : null;
}

export function createResetToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const exp = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  run('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)', hash, userId, exp);
  return token;
}
export function consumeResetToken(token) {
  const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const r = get('SELECT * FROM password_resets WHERE token_hash = ? AND used = 0', hash);
  if (!r || new Date(r.expires_at) < new Date()) return null;
  run('UPDATE password_resets SET used = 1 WHERE token_hash = ?', hash);
  return r.user_id;
}
