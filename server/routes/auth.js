import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { get, run, sqlNow } from '../db.js';
import {
  findByLogin, checkPassword, setSession, clearSession, publicUser, createResetToken, consumeResetToken, hashPassword, requireAuth,
} from '../auth.js';
import { logActivity } from '../services.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Тым көп әрекет. 15 минуттан кейін қайталаңыз.' } });

r.post('/login', limiter, async (req, res) => {
  const { login, password } = req.body || {};
  const u = await findByLogin(login);
  if (!u || !checkPassword(String(password || ''), u.password_hash)) return res.status(401).json({ error: 'Логин немесе құпиясөз қате' });
  if (!u.active) return res.status(403).json({ error: 'Аккаунтыңыз уақытша бұғатталған. Куратормен байланысыңыз.' });
  await run('UPDATE users SET last_login_at = ? WHERE id = ?', sqlNow(), u.id);
  await logActivity(u.id, 'login');
  setSession(res, u);
  res.json({ user: publicUser(u) });
});

r.post('/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });

// demo login shortcuts are shown only in local development
const SHOW_DEMO = process.env.NODE_ENV !== 'production' || process.env.SHOW_DEMO === '1';
r.get('/me', (req, res) => res.json({ user: publicUser(req.user) || null, demo: SHOW_DEMO, guest: !!req.isGuest }));

// Password recovery. In production the link is sent by email/SMS; the mailer hook is left as a TODO integration point.
r.post('/forgot', limiter, async (req, res) => {
  const u = await findByLogin(req.body?.login);
  const out = { ok: true, message: 'Егер аккаунт табылса, қалпына келтіру сілтемесі жіберілді.' };
  if (u && u.active) {
    const token = await createResetToken(u.id);
    const link = `/reset/${token}`;
    console.log(`[password reset] ${u.email || u.phone}: ${link}`);
    if (process.env.NODE_ENV !== 'production') out.devLink = link; // demo convenience only
  }
  res.json(out);
});

r.post('/reset', limiter, async (req, res) => {
  const { token, password } = req.body || {};
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Құпиясөз кемінде 6 таңбадан тұруы керек' });
  const uid = await consumeResetToken(token);
  if (!uid) return res.status(400).json({ error: 'Сілтеме жарамсыз немесе мерзімі өтіп кеткен' });
  await run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), uid);
  res.json({ ok: true });
});

r.post('/password', requireAuth, async (req, res) => {
  if (req.isGuest) return res.status(403).json({ error: 'Қонақ режимінде қолжетімсіз', guest: true });
  const { current, password } = req.body || {};
  if (!checkPassword(String(current || ''), req.user.password_hash)) return res.status(400).json({ error: 'Қазіргі құпиясөз қате' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Жаңа құпиясөз кемінде 6 таңба' });
  await run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), req.user.id);
  res.json({ ok: true });
});

r.put('/profile', requireAuth, async (req, res) => {
  if (req.isGuest) return res.status(403).json({ error: 'Қонақ режимінде қолжетімсіз', guest: true });
  const { name, bio, locale } = req.body || {};
  await run('UPDATE users SET name = COALESCE(?, name), bio = ?, locale = COALESCE(?, locale) WHERE id = ?',
    name?.trim() || null, bio ?? null, ['kk', 'ru'].includes(locale) ? locale : null, req.user.id);
  res.json({ user: publicUser(await get('SELECT * FROM users WHERE id = ?', req.user.id)) });
});

export default r;
