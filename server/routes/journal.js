// Teacher journal (lesson marks) and payroll. Teachers see and edit only their own lessons and salary;
// curators/admins (journal.manage / payroll.manage) see everyone, set rates, bonuses/fines and approve months.
import { Router } from 'express';
import { all, get, run, insert, update, tx } from '../db.js';
import { requireAuth, can } from '../auth.js';
import { localDate } from '../services.js';
import {
  FORMATS, LESSON_STATUS, CLASS_STATUS, ADJ_PRESETS, FREE_ABSENCES, formatOf, ladder, monthOf, isMonth, isDate, lockOf,
  computeSalary, salary, plannedLessons, conversionReport, currentRates,
} from '../payroll.js';

const r = Router();
r.use(requireAuth);
r.use((req, res, next) => (can(req.user, 'journal.own') || can(req.user, 'journal.manage') ? next() : res.status(403).json({ error: 'Рұқсат жоқ' })));

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const manager = (u) => can(u, 'journal.manage');
const payrollMgr = (req, res, next) => (can(req.user, 'payroll.manage') ? next() : bad(res, 'Рұқсат жоқ', 403));
const journalMgr = (req, res, next) => (manager(req.user) ? next() : bad(res, 'Рұқсат жоқ', 403));
/** Teachers are always scoped to themselves; managers may pick any teacher (or none = all). */
const teacherScope = (req) => (manager(req.user) ? (req.query.teacher ? Number(req.query.teacher) : null) : req.user.id);
const teacherExists = (id) => !!get("SELECT 1 FROM users WHERE id = ? AND role = 'teacher'", id);
const isTime = (t) => t === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const lockedMsg = (m) => `${m} айының жалақысы бекітілген — өзгерту үшін куратор айды қайта ашуы керек`;

r.get('/meta', (req, res) => {
  res.json({
    FORMATS, LESSON_STATUS, CLASS_STATUS, ADJ_PRESETS, FREE_ABSENCES, today: localDate(),
    teachers: manager(req.user) ? all("SELECT id, name, active FROM users WHERE role = 'teacher' ORDER BY active DESC, name") : undefined,
  });
});

// ---------------- classes (шәкірттер / топтар) ----------------
const classOut = (c) => ({
  ...c, format: formatOf(c), format_label: FORMATS[formatOf(c)],
  slots: all('SELECT weekday, time FROM class_slots WHERE class_id = ? ORDER BY weekday, time', c.id),
  members: c.kind === 'grp' ? all('SELECT id, name, phone FROM class_members WHERE class_id = ? ORDER BY id', c.id) : [],
  held: get("SELECT count(*) n FROM lesson_log WHERE class_id = ? AND status = 'done'", c.id).n,
});

r.get('/classes', (req, res) => {
  const t = teacherScope(req); const status = req.query.status;
  const where = []; const p = [];
  if (t) { where.push('c.teacher_id = ?'); p.push(t); }
  if (status && CLASS_STATUS[status]) { where.push('c.status = ?'); p.push(status); }
  res.json(all(`SELECT c.*, u.name AS teacher FROM classes c LEFT JOIN users u ON u.id = c.teacher_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.status = 'active' DESC, c.kind, c.name`, ...p).map(classOut));
});

function classInput(body) {
  const b = body || {}; const errors = [];
  const out = {
    kind: b.kind, name: String(b.name || '').trim(), phone: b.phone ? String(b.phone).trim() : null,
    teacher_id: b.teacher_id ? Number(b.teacher_id) : null, subject: String(b.subject || 'Құран').trim(),
    lang: b.lang, mode: b.mode, package_lessons: b.package_lessons ? Number(b.package_lessons) : null,
    start_date: b.start_date || null, status: b.status || 'active', note: b.note ? String(b.note) : null,
  };
  if (!['ind', 'grp'].includes(out.kind)) errors.push('Түрін таңдаңыз');
  if (!out.name) errors.push('Атауы міндетті');
  if (!['kaz', 'rus'].includes(out.lang)) errors.push('Тілін таңдаңыз');
  if (!['onl', 'off'].includes(out.mode)) errors.push('Форматын таңдаңыз');
  if (!CLASS_STATUS[out.status]) errors.push('Статус қате');
  if (out.teacher_id && !teacherExists(out.teacher_id)) errors.push('Ұстаз табылмады');
  if (out.start_date && !isDate(out.start_date)) errors.push('Старт күні қате');
  if (out.package_lessons != null && !(out.package_lessons > 0)) errors.push('Сабақ саны оң сан болуы керек');
  const slots = (Array.isArray(b.slots) ? b.slots : []).map((s) => ({ weekday: Number(s.weekday), time: String(s.time || '') }));
  if (slots.some((s) => !(s.weekday >= 0 && s.weekday <= 6) || !s.time || !isTime(s.time))) errors.push('Кесте уақыты қате (СС:ММ)');
  const members = (Array.isArray(b.members) ? b.members : []).map((m) => ({ name: String(m.name || '').trim(), phone: m.phone ? String(m.phone).trim() : null })).filter((m) => m.name);
  return { out, slots, members, errors };
}
function saveChildren(id, slots, members) {
  run('DELETE FROM class_slots WHERE class_id = ?', id);
  slots.forEach((s) => insert('class_slots', { class_id: id, ...s }));
  run('DELETE FROM class_members WHERE class_id = ?', id);
  members.forEach((m) => insert('class_members', { class_id: id, ...m }));
}

r.post('/classes', journalMgr, (req, res) => {
  const { out, slots, members, errors } = classInput(req.body);
  if (errors.length) return bad(res, errors.join('; '));
  const id = tx(() => { const id = insert('classes', out); saveChildren(id, slots, members); return id; });
  res.json(classOut(get('SELECT * FROM classes WHERE id = ?', id)));
});
r.put('/classes/:id', journalMgr, (req, res) => {
  const c = get('SELECT * FROM classes WHERE id = ?', req.params.id);
  if (!c) return bad(res, 'Табылмады', 404);
  const { out, slots, members, errors } = classInput(req.body);
  if (errors.length) return bad(res, errors.join('; '));
  tx(() => { update('classes', c.id, out); saveChildren(c.id, slots, members); });
  res.json(classOut(get('SELECT * FROM classes WHERE id = ?', c.id)));
});
r.delete('/classes/:id', journalMgr, (req, res) => {
  const c = get('SELECT * FROM classes WHERE id = ?', req.params.id);
  if (!c) return bad(res, 'Табылмады', 404);
  // lessons are the payroll record — keep them by archiving instead of deleting
  if (get('SELECT 1 FROM lesson_log WHERE class_id = ? LIMIT 1', c.id)) { update('classes', c.id, { status: 'archive' }); return res.json({ archived: true }); }
  run('DELETE FROM classes WHERE id = ?', c.id);
  res.json({ deleted: true });
});

// ---------------- journal ----------------
/** Planned slots merged with logged lessons for a date range (one week in the UI). */
r.get('/week', (req, res) => {
  const from = req.query.from; const to = req.query.to;
  if (!isDate(from) || !isDate(to) || to < from) return bad(res, 'Күндер қате');
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 42) return bad(res, 'Кезең тым ұзақ');
  const t = teacherScope(req);
  const logs = all(`SELECT l.*, c.name AS class_name, c.kind, c.lang, c.mode, c.teacher_id AS class_teacher, u.name AS teacher
    FROM lesson_log l JOIN classes c ON c.id = l.class_id JOIN users u ON u.id = l.teacher_id
    WHERE l.date BETWEEN ? AND ? ${t ? 'AND (l.teacher_id = ? OR c.teacher_id = ?)' : ''} ORDER BY l.date, l.time`, from, to, ...(t ? [t, t] : []));
  const key = (x) => `${x.class_id}|${x.date}|${x.time}`;
  const byKey = new Map(logs.map((l) => [key(l), l]));
  const items = [];
  for (const p of plannedLessons({ from, to, teacherId: t })) {
    const log = byKey.get(key(p)); byKey.delete(key(p));
    items.push({ date: p.date, time: p.time, planned: true, class_id: p.class_id, class_name: p.name, format: formatOf(p), teacher_id: p.teacher_id, log: log || null });
  }
  for (const l of byKey.values()) items.push({ date: l.date, time: l.time, planned: false, class_id: l.class_id, class_name: l.class_name, format: formatOf(l), teacher_id: l.class_teacher, log: l });
  items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.class_name.localeCompare(b.class_name));
  const months = [...new Set([monthOf(from), monthOf(to)])];
  const locked = t ? months.filter((m) => lockOf(t, m)) : [];
  res.json({ items, locked });
});

r.post('/log', (req, res) => {
  const b = req.body || {};
  const c = get('SELECT * FROM classes WHERE id = ?', b.class_id);
  if (!c) return bad(res, 'Шәкірт / топ табылмады', 404);
  const date = b.date; const time = String(b.time ?? '');
  if (!isDate(date)) return bad(res, 'Күні қате');
  if (!isTime(time)) return bad(res, 'Уақыты қате');
  if (!LESSON_STATUS[b.status]) return bad(res, 'Статусты таңдаңыз');
  const hours = Number(b.hours ?? 1);
  if (!(hours > 0 && hours <= 4 && Math.round(hours * 2) === hours * 2)) return bad(res, 'Сағат 0,5 қадаммен (0,5 – 4)');
  if (['done', 'absent'].includes(b.status) && date > localDate()) return bad(res, 'Болашақ сабақты «Өтті / Кірмеді» деп белгілеуге болмайды');

  const existing = get('SELECT * FROM lesson_log WHERE class_id = ? AND date = ? AND time = ?', c.id, date, time);
  let teacherId;
  if (manager(req.user)) {
    teacherId = Number(b.teacher_id || existing?.teacher_id || c.teacher_id);
    if (!teacherExists(teacherId)) return bad(res, 'Ұстазды таңдаңыз');
  } else {
    // a teacher marks their own classes, or a lesson they already logged as a substitute
    if (c.teacher_id !== req.user.id && existing?.teacher_id !== req.user.id) return bad(res, 'Бұл шәкірт сізге бекітілмеген', 403);
    if (existing && existing.teacher_id !== req.user.id) return bad(res, 'Бұл сабақты басқа ұстаз белгілеген', 403);
    teacherId = req.user.id;
  }
  for (const t of new Set([teacherId, existing?.teacher_id].filter(Boolean))) {
    if (lockOf(t, monthOf(date))) return bad(res, lockedMsg(monthOf(date)), 409);
  }
  const row = { teacher_id: teacherId, status: b.status, hours, tg_ok: !!b.tg_ok, note: b.note ? String(b.note).slice(0, 500) : null, updated_at: new Date().toISOString().slice(0, 19).replace('T', ' ') };
  if (existing) update('lesson_log', existing.id, row);
  else insert('lesson_log', { class_id: c.id, date, time, created_by: req.user.id, ...row });
  res.json(get('SELECT * FROM lesson_log WHERE class_id = ? AND date = ? AND time = ?', c.id, date, time));
});

r.delete('/log/:id', (req, res) => {
  const l = get('SELECT * FROM lesson_log WHERE id = ?', req.params.id);
  if (!l) return bad(res, 'Табылмады', 404);
  if (!manager(req.user) && l.teacher_id !== req.user.id) return bad(res, 'Рұқсат жоқ', 403);
  if (lockOf(l.teacher_id, monthOf(l.date))) return bad(res, lockedMsg(monthOf(l.date)), 409);
  run('DELETE FROM lesson_log WHERE id = ?', l.id);
  res.json({ ok: true });
});

// ---------------- salary ----------------
r.get('/salary', (req, res) => {
  const month = req.query.month;
  if (!isMonth(month)) return bad(res, 'Айды таңдаңыз');
  const t = teacherScope(req);
  if (!t || !teacherExists(t)) return bad(res, 'Ұстазды таңдаңыз');
  res.json({ ...salary(t, month), teacher: get('SELECT id, name FROM users WHERE id = ?', t).name, rates: currentRates(t) });
});

r.get('/payroll', payrollMgr, (req, res) => {
  const month = req.query.month;
  if (!isMonth(month)) return bad(res, 'Айды таңдаңыз');
  res.json(payrollRows(month));
});

function payrollRows(month) {
  // everyone active, plus inactive teachers who still have lessons or a record in this month
  const teachers = all(`SELECT id, name FROM users WHERE role = 'teacher' AND (active = 1
    OR id IN (SELECT teacher_id FROM lesson_log WHERE date LIKE ?) OR id IN (SELECT teacher_id FROM payroll_months WHERE month = ?)) ORDER BY name`, `${month}%`, month);
  return teachers.map((t) => {
    const s = salary(t.id, month);
    return { teacher_id: t.id, name: t.name, hours: s.hours, lessonsAmount: s.lessonsAmount, bonus: s.bonus, fine: s.fine, total: s.total, status: s.status, warnings: s.warnings };
  });
}

r.get('/payroll.csv', payrollMgr, (req, res) => {
  const month = req.query.month;
  if (!isMonth(month)) return bad(res, 'Айды таңдаңыз');
  const STATUS = { draft: 'Черновик', approved: 'Бекітілді', paid: 'Төленді' };
  const esc = (v) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [['Ұстаз', 'Сағат', 'Сабақтар (₸)', 'Бонус (₸)', 'Штраф (₸)', 'Жалпы (₸)', 'Статус']];
  let sum = 0;
  for (const p of payrollRows(month)) { rows.push([p.name, String(p.hours).replace('.', ','), p.lessonsAmount, p.bonus, p.fine, p.total, STATUS[p.status]]); sum += p.total; }
  rows.push(['Барлығы', '', '', '', '', sum, '']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="zp-${month}.csv"`);
  // BOM + ';' so Excel with a Russian/Kazakh locale opens it as a table with Cyrillic intact
  res.send('﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n'));
});

r.post('/payroll/:teacher/:month/approve', payrollMgr, (req, res) => {
  const t = Number(req.params.teacher); const { month } = req.params;
  if (!isMonth(month) || !teacherExists(t)) return bad(res, 'Қате сұраныс');
  if (lockOf(t, month)) return bad(res, 'Бұл ай бекітілген', 409);
  if (month >= monthOf(localDate()) && !req.body?.force) return bad(res, 'Ай әлі аяқталған жоқ. Бәрібір бекіту керек пе?', 422);
  run('INSERT INTO payroll_months (teacher_id, month, status, snapshot, approved_by) VALUES (?,?,?,?,?)', t, month, 'approved', JSON.stringify(computeSalary(t, month)), req.user.id);
  res.json(salary(t, month));
});
r.post('/payroll/:teacher/:month/paid', payrollMgr, (req, res) => {
  const lock = lockOf(Number(req.params.teacher), req.params.month);
  if (!lock) return bad(res, 'Алдымен айды бекітіңіз', 409);
  if (lock.status === 'paid') return bad(res, 'Төленді деп белгіленген', 409);
  run("UPDATE payroll_months SET status = 'paid', paid_at = datetime('now') WHERE teacher_id = ? AND month = ?", Number(req.params.teacher), req.params.month);
  res.json(salary(Number(req.params.teacher), req.params.month));
});
r.post('/payroll/:teacher/:month/reopen', payrollMgr, (req, res) => {
  const t = Number(req.params.teacher); const lock = lockOf(t, req.params.month);
  if (!lock) return bad(res, 'Ай ашық', 409);
  if (lock.status === 'paid' && req.user.role !== 'admin') return bad(res, 'Төленген айды тек әкімші аша алады', 403);
  run('DELETE FROM payroll_months WHERE teacher_id = ? AND month = ?', t, req.params.month);
  res.json(salary(t, req.params.month));
});

// ---------------- bonuses & fines ----------------
r.post('/adjustments', payrollMgr, (req, res) => {
  const b = req.body || {}; const t = Number(b.teacher_id); const amount = Math.round(Number(b.amount));
  if (!teacherExists(t)) return bad(res, 'Ұстазды таңдаңыз');
  if (!isMonth(b.month)) return bad(res, 'Айды таңдаңыз');
  if (!['bonus', 'fine'].includes(b.kind)) return bad(res, 'Бонус па, штраф па?');
  if (!(amount > 0)) return bad(res, 'Сомасы оң сан болуы керек');
  if (!String(b.reason || '').trim()) return bad(res, 'Себебін жазыңыз');
  if (lockOf(t, b.month)) return bad(res, lockedMsg(b.month), 409);
  insert('payroll_adjustments', { teacher_id: t, month: b.month, kind: b.kind, amount, reason: String(b.reason).trim().slice(0, 300), created_by: req.user.id });
  res.json(salary(t, b.month));
});
r.delete('/adjustments/:id', payrollMgr, (req, res) => {
  const a = get('SELECT * FROM payroll_adjustments WHERE id = ?', req.params.id);
  if (!a) return bad(res, 'Табылмады', 404);
  if (lockOf(a.teacher_id, a.month)) return bad(res, lockedMsg(a.month), 409);
  run('DELETE FROM payroll_adjustments WHERE id = ?', a.id);
  res.json(salary(a.teacher_id, a.month));
});

// ---------------- rates ----------------
r.get('/rates/:teacher', (req, res) => {
  const t = Number(req.params.teacher);
  if (!can(req.user, 'payroll.manage') && t !== req.user.id) return bad(res, 'Рұқсат жоқ', 403);
  res.json({ current: currentRates(t), history: all('SELECT * FROM teacher_rates WHERE teacher_id = ? ORDER BY valid_from DESC, format', t) });
});
/** Set rates valid from a date: either {rates: {format: rate}} or {base} to apply the standard ladder. */
r.post('/rates/:teacher', payrollMgr, (req, res) => {
  const t = Number(req.params.teacher); const b = req.body || {};
  if (!teacherExists(t)) return bad(res, 'Ұстаз табылмады');
  if (!isDate(b.valid_from)) return bad(res, 'Қай күннен бастап?');
  const rates = b.base ? ladder(Math.round(Number(b.base))) : b.rates || {};
  const entries = Object.entries(rates).filter(([f, v]) => FORMATS[f] && v !== '' && v != null).map(([f, v]) => [f, Math.round(Number(v))]);
  if (!entries.length || entries.some(([, v]) => !(v >= 0))) return bad(res, 'Ставкаларды толтырыңыз');
  const locked = get('SELECT month FROM payroll_months WHERE teacher_id = ? AND month >= ? ORDER BY month LIMIT 1', t, monthOf(b.valid_from));
  if (locked) return bad(res, lockedMsg(locked.month), 409);
  tx(() => entries.forEach(([format, rate]) => run(`INSERT INTO teacher_rates (teacher_id, format, rate, valid_from) VALUES (?,?,?,?)
    ON CONFLICT (teacher_id, format, valid_from) DO UPDATE SET rate = excluded.rate`, t, format, rate, b.valid_from)));
  res.json({ current: currentRates(t), history: all('SELECT * FROM teacher_rates WHERE teacher_id = ? ORDER BY valid_from DESC, format', t) });
});
r.delete('/rates/:teacher/:from', payrollMgr, (req, res) => {
  const t = Number(req.params.teacher);
  const locked = get('SELECT month FROM payroll_months WHERE teacher_id = ? AND month >= ? ORDER BY month LIMIT 1', t, monthOf(req.params.from));
  if (locked) return bad(res, lockedMsg(locked.month), 409);
  run('DELETE FROM teacher_rates WHERE teacher_id = ? AND valid_from = ?', t, req.params.from);
  res.json({ current: currentRates(t), history: all('SELECT * FROM teacher_rates WHERE teacher_id = ? ORDER BY valid_from DESC, format', t) });
});

// ---------------- report ----------------
r.get('/report', journalMgr, (req, res) => {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to) || to < from) return bad(res, 'Күндер қате');
  res.json(conversionReport(from, to));
});

export default r;
