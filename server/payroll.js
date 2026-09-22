// Teacher journal + payroll rules. Mirrors the academy's "ЗП устазы" sheet and регламент:
//   pay = Σ hours × hourly rate of the lesson format (rate valid on the lesson date) + bonuses − fines.
import { all, get } from './db.js';
import { localDate } from './services.js';

export const FORMATS = {
  ind_kaz_onl: 'Индив · каз · онлайн',
  ind_rus_onl: 'Индив · рус · онлайн',
  ind_kaz_off: 'Индив · каз · оффлайн',
  ind_rus_off: 'Индив · рус · оффлайн',
  grp_kaz_onl: 'Топ · каз · онлайн',
  grp_rus_onl: 'Топ · рус · онлайн',
  grp_kaz_off: 'Топ · каз · оффлайн',
  grp_rus_off: 'Топ · рус · оффлайн',
};
export const formatOf = (c) => `${c.kind}_${c.lang}_${c.mode}`;

/** The academy's usual ladder from one base rate: рус +100, оффлайн +200, топ +200 (e.g. 1200 → 1200/1300/1400/1500/1400/1500/1600/1700). */
export function ladder(base) {
  const out = {};
  for (const f of Object.keys(FORMATS)) {
    const [kind, lang, mode] = f.split('_');
    out[f] = base + (lang === 'rus' ? 100 : 0) + (mode === 'off' ? 200 : 0) + (kind === 'grp' ? 200 : 0);
  }
  return out;
}

export const LESSON_STATUS = { done: 'Өтті', absent: 'Кірмеді', moved: 'Перенос', frozen: 'Заморозка', cancelled: 'Отмена' };
export const CLASS_STATUS = { active: 'Белсенді', frozen: 'Заморозка', finished: 'Бітірді', archive: 'Архив' };

// регламент: after 3 no-shows in a calendar month further missed lessons "burn" — the teacher is paid for them
export const FREE_ABSENCES = 3;

export const ADJ_PRESETS = [
  { kind: 'bonus', amount: 5000, reason: 'Аптаның ең көп сағат берген ұстазы' },
  { kind: 'bonus', amount: 20000, reason: 'Айдың ең көп сағат берген 2 ұстазының бірі' },
  { kind: 'bonus', amount: 20000, reason: 'Шәкірт араб тілін жалғастырды' },
  { kind: 'bonus', amount: 10000, reason: 'Шәкірт жаттау / хатымды жалғастырды' },
  { kind: 'fine', amount: 5000, reason: 'Ұстаздың кесірінен шәкірт возврат жасады' },
  { kind: 'fine', amount: 1000, reason: 'Сабаққа ескертпей қатыспады / ұйықтап қалды' },
  { kind: 'fine', amount: 2000, reason: 'Жексенбілік жиналысқа себепсіз келмеді' },
  { kind: 'fine', amount: 1000, reason: 'Айына до/после видео жіберілмеді' },
  { kind: 'fine', amount: 2000, reason: 'Графиктегі бос уақытқа берілген шәкіртті алмады' },
];

export const monthOf = (date) => String(date).slice(0, 7);
export const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
export const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !Number.isNaN(Date.parse(d));
const monthEnd = (m) => { const [y, mo] = m.split('-').map(Number); return localDate(new Date(y, mo, 0)); };

export const lockOf = (teacherId, month) => get('SELECT status, approved_at, paid_at FROM payroll_months WHERE teacher_id = ? AND month = ?', teacherId, month);

/** Rate lookup with the history loaded once per computation. */
function rateBook(teacherId) {
  const rows = all('SELECT format, rate, valid_from FROM teacher_rates WHERE teacher_id = ? ORDER BY valid_from DESC', teacherId);
  return (format, date) => rows.find((r) => r.format === format && r.valid_from <= date)?.rate ?? null;
}

export function currentRates(teacherId, date = localDate()) {
  const rate = rateBook(teacherId);
  return Object.fromEntries(Object.keys(FORMATS).map((f) => [f, rate(f, date)]));
}

/**
 * Which absences in the month are paid: per class, absences are numbered by date;
 * the first FREE_ABSENCES are not paid, the rest are. Counted across all teachers of the class.
 */
function paidAbsenceIds(month, classIds) {
  if (!classIds.length) return new Set();
  const rows = all(`SELECT id, class_id FROM lesson_log WHERE status = 'absent' AND date BETWEEN ? AND ?
    AND class_id IN (${classIds.map(() => '?').join(',')}) ORDER BY class_id, date, time, id`, `${month}-01`, monthEnd(month), ...classIds);
  const seen = new Map(); const paid = new Set();
  for (const r of rows) {
    const n = (seen.get(r.class_id) || 0) + 1; seen.set(r.class_id, n);
    if (n > FREE_ABSENCES) paid.add(r.id);
  }
  return paid;
}

/** Live salary calculation for one teacher and month (ignores any approved snapshot). */
export function computeSalary(teacherId, month) {
  const rate = rateBook(teacherId);
  const logs = all(`SELECT l.*, c.name AS class_name, c.kind, c.lang, c.mode FROM lesson_log l JOIN classes c ON c.id = l.class_id
    WHERE l.teacher_id = ? AND l.date BETWEEN ? AND ? ORDER BY l.date, l.time`, teacherId, `${month}-01`, monthEnd(month));
  const paidAbs = paidAbsenceIds(month, [...new Set(logs.filter((l) => l.status === 'absent').map((l) => l.class_id))]);

  const lines = new Map(); const warnings = [];
  const counts = { done: 0, absent_paid: 0, absent_free: 0, no_tg: 0, no_rate: 0, moved: 0, frozen: 0, cancelled: 0 };
  const lessons = logs.map((l) => {
    const format = formatOf(l);
    let paid = false; let why = null;
    if (l.status === 'done') { paid = true; counts.done++; }
    else if (l.status === 'absent') {
      paid = paidAbs.has(l.id);
      if (paid) { counts.absent_paid++; why = `${FREE_ABSENCES} реттен артық кірмеді — күйіп кетті, төленеді`; } else counts.absent_free++;
    } else counts[l.status]++;
    if (paid && !l.tg_ok) { paid = false; counts.no_tg++; why = 'Телеграм отчет жоқ'; }
    const r = paid ? rate(format, l.date) : null;
    if (paid && r == null) { paid = false; counts.no_rate++; why = 'Ставка белгіленбеген'; }
    const amount = paid ? Math.round(l.hours * r) : 0;
    if (paid) {
      const key = `${format}|${r}`;
      const line = lines.get(key) || { format, label: FORMATS[format], rate: r, hours: 0, lessons: 0, amount: 0 };
      line.hours += l.hours; line.lessons++; line.amount += amount; lines.set(key, line);
    }
    return { id: l.id, date: l.date, time: l.time, class_id: l.class_id, class_name: l.class_name, format, status: l.status, hours: l.hours, tg_ok: !!l.tg_ok, paid, amount, why, note: l.note };
  });
  if (counts.no_tg) warnings.push(`${counts.no_tg} сабақта Телеграм отчет белгіленбеген — олар есептелмеді`);
  if (counts.no_rate) warnings.push(`${counts.no_rate} сабаққа ставка жоқ — «Ставкалар» бөлімінде қосыңыз`);

  const adjustments = all(`SELECT a.*, u.name AS author FROM payroll_adjustments a LEFT JOIN users u ON u.id = a.created_by
    WHERE a.teacher_id = ? AND a.month = ? ORDER BY a.id`, teacherId, month);
  const byFormat = [...lines.values()].sort((a, b) => a.format.localeCompare(b.format) || a.rate - b.rate);
  const hours = byFormat.reduce((s, l) => s + l.hours, 0);
  const lessonsAmount = byFormat.reduce((s, l) => s + l.amount, 0);
  const bonus = adjustments.filter((a) => a.kind === 'bonus').reduce((s, a) => s + a.amount, 0);
  const fine = adjustments.filter((a) => a.kind === 'fine').reduce((s, a) => s + a.amount, 0);
  return { teacher_id: teacherId, month, byFormat, hours, lessonsAmount, bonus, fine, total: lessonsAmount + bonus - fine, counts, warnings, adjustments, lessons };
}

/** Salary as it stands: the frozen snapshot for approved/paid months, otherwise live. */
export function salary(teacherId, month) {
  const lock = get('SELECT * FROM payroll_months WHERE teacher_id = ? AND month = ?', teacherId, month);
  if (lock) return { ...JSON.parse(lock.snapshot), status: lock.status, approved_at: lock.approved_at, paid_at: lock.paid_at };
  return { ...computeSalary(teacherId, month), status: 'draft' };
}

/** Planned lessons from weekly slots for active classes in [from, to]. */
export function plannedLessons({ from, to, teacherId }) {
  const slots = all(`SELECT s.weekday, s.time, c.id AS class_id, c.name, c.kind, c.lang, c.mode, c.teacher_id, c.start_date
    FROM class_slots s JOIN classes c ON c.id = s.class_id WHERE c.status = 'active' ${teacherId ? 'AND c.teacher_id = ?' : ''}`, ...(teacherId ? [teacherId] : []));
  const out = [];
  for (let d = new Date(`${from}T12:00:00`); localDate(d) <= to; d.setDate(d.getDate() + 1)) {
    const date = localDate(d); const wd = (d.getDay() + 6) % 7;
    for (const s of slots) if (s.weekday === wd && (!s.start_date || s.start_date <= date)) out.push({ ...s, date });
  }
  return out;
}

/** Planned vs held per teacher (the old weekly "конверсия в проведено" report) plus hours leaderboard. */
export function conversionReport(from, to) {
  const teachers = all("SELECT id, name FROM users WHERE role = 'teacher' AND active = 1 ORDER BY name");
  const planned = plannedLessons({ from, to });
  const logs = all("SELECT teacher_id, status, hours, tg_ok FROM lesson_log WHERE date BETWEEN ? AND ?", from, to);
  return teachers.map((t) => {
    const mine = logs.filter((l) => l.teacher_id === t.id);
    const plan = planned.filter((p) => p.teacher_id === t.id).length;
    const done = mine.filter((l) => l.status === 'done').length;
    const hours = mine.filter((l) => l.status === 'done' && l.tg_ok).reduce((s, l) => s + l.hours, 0);
    return { teacher_id: t.id, name: t.name, planned: plan, done, missed: mine.filter((l) => l.status !== 'done').length, hours, conversion: plan ? Math.round((done / plan) * 100) : null };
  });
}
