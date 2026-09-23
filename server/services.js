// Core learning logic: access, progress, locking, schedule, search, grading, notifications.
// All SQL here is portable between SQLite (local) and Postgres (cloud): timestamps are UTC strings
// generated in JS, and dialect-specific parts (full-text search) branch on DIALECT.
import { all, get, run, insert, parse, tx, DIALECT, sqlNow, sqlAgo, startOfToday, DAY } from './db.js';
import { RULE_TAGS } from './constants.js';

export const isStaff = (u) => u && u.role !== 'student';

// ---------- dates (server runs in Asia/Almaty, see index.js) ----------
const pad = (n) => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localDateTime = (d = new Date()) => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
// stored timestamps are UTC ('YYYY-MM-DD HH:MM:SS'); convert to the local calendar date
export const utcToLocalDate = (s) => localDate(new Date(String(s).replace(' ', 'T') + 'Z'));

// ---------- access ----------
export async function userGroupIds(userId) {
  return (await all('SELECT group_id FROM group_members WHERE user_id = ?', userId)).map((r) => r.group_id);
}

export async function accessibleCourseIds(user) {
  if (isStaff(user)) return (await all('SELECT id FROM courses ORDER BY sort, id')).map((r) => r.id);
  if (user?.is_guest) return (await all("SELECT id FROM courses WHERE status = 'published' ORDER BY sort, id")).map((r) => r.id);
  const rows = await all(`
    SELECT DISTINCT c.id, c.sort FROM courses c
    JOIN course_access a ON a.course_id = c.id
    WHERE c.status = 'published'
      AND (a.user_id = ? OR a.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?))
    ORDER BY c.sort, c.id`, user.id, user.id);
  return rows.map((r) => r.id);
}
export const canAccessCourse = async (user, courseId) => (await accessibleCourseIds(user)).includes(Number(courseId));

/** SQL filter for publication status — staff preview everything, students only see Published. */
export const pubFilter = (user, alias = '') => (isStaff(user) ? '1=1' : `${alias ? alias + '.' : ''}status = 'published'`);

// ---------- course tree & progress ----------
export async function courseTree(user, courseId) {
  const course = await get('SELECT * FROM courses WHERE id = ?', courseId);
  if (!course) return null;
  const modules = await all('SELECT * FROM modules WHERE course_id = ? ORDER BY sort, id', courseId);
  const lessons = await all(`SELECT l.id, l.module_id, l.title, l.duration_min, l.youtube_url, l.status, l.sort, l.rule_tag, m.sort AS module_sort
    FROM lessons l JOIN modules m ON m.id = l.module_id
    WHERE m.course_id = ? AND ${pubFilter(user, 'l')} ORDER BY m.sort, m.id, l.sort, l.id`, courseId);
  const prog = new Map((await all('SELECT lesson_id, status FROM student_progress WHERE user_id = ?', user.id))
    .map((r) => [r.lesson_id, r.status]));

  let blocked = false; // once a lesson is not completed, the following ones are locked (sequential courses)
  let next = null;
  for (const l of lessons) {
    const p = prog.get(l.id);
    if (p === 'completed') l.state = 'completed';
    else if (blocked && course.sequential && !isStaff(user) && !user?.is_guest) l.state = 'locked';
    else { l.state = p === 'in_progress' ? 'in_progress' : 'available'; if (!next) next = l; blocked = true; }
  }
  const done = lessons.filter((l) => l.state === 'completed').length;
  const mods = modules.map((m) => {
    const ls = lessons.filter((l) => l.module_id === m.id);
    const d = ls.filter((l) => l.state === 'completed').length;
    const percent = ls.length ? Math.round((d / ls.length) * 100) : 0;
    const state = ls.length && d === ls.length ? 'completed' : ls.length && ls.every((l) => l.state === 'locked') ? 'locked' : 'active';
    return { ...m, lessons: ls, done: d, total: ls.length, percent, state };
  });
  return {
    course, modules: mods, total: lessons.length, done,
    percent: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
    next: next && { id: next.id, title: next.title, module: modules.find((m) => m.id === next.module_id)?.title },
  };
}

export async function lessonCourseId(lessonId) {
  return (await get('SELECT m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?', lessonId))?.course_id;
}

export function logActivity(userId, kind, refId = null) {
  return run('INSERT INTO activity (user_id, kind, ref_id, created_at) VALUES (?,?,?,?)', userId, kind, refId, sqlNow());
}

/** Consecutive days (ending today or yesterday) with any learning activity. */
export async function streak(userId) {
  const rows = await all(`SELECT DISTINCT created_at FROM activity WHERE user_id = ? AND kind != 'login' AND created_at > ?`, userId, sqlAgo(120 * DAY));
  const days = new Set(rows.map((r) => utcToLocalDate(r.created_at)));
  let n = 0; const d = new Date();
  if (!days.has(localDate(d))) d.setDate(d.getDate() - 1);
  while (days.has(localDate(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export async function completeLesson(user, lessonId) {
  const now = sqlNow();
  await tx(async () => {
    await run(`INSERT INTO student_progress (user_id, lesson_id, status, started_at, completed_at) VALUES (?,?,'completed',?,?)
      ON CONFLICT (user_id, lesson_id) DO UPDATE SET status = 'completed', completed_at = COALESCE(student_progress.completed_at, ?)`,
    user.id, lessonId, now, now, now);
    await logActivity(user.id, 'lesson_complete', lessonId);
  });
  const courseId = await lessonCourseId(lessonId);
  const tree = await courseTree(user, courseId);
  if (tree && tree.total && tree.percent === 100 && !(await get('SELECT 1 FROM certificates WHERE user_id = ? AND course_id = ?', user.id, courseId))) {
    await insert('certificates', { user_id: user.id, course_id: courseId, percent: 100, completed_at: sqlNow() });
    await notify(user.id, '🎓 Сертификат алуға дайынсыз', `«${tree.course.title}» бағдарламасын аяқтадыңыз.`, '/progress', 'success');
  }
  return tree;
}

// ---------- schedule ----------
/** Expand weekly recurring + one-off events into occurrences between two local dates (inclusive). */
export async function eventOccurrences(user, fromDate, toDate) {
  const groups = await userGroupIds(user.id);
  const events = (await all('SELECT * FROM events')).filter((e) => isStaff(user) || !e.group_id || groups.includes(e.group_id));
  const out = [];
  const start = new Date(fromDate + 'T00:00'); const end = new Date(toDate + 'T23:59');
  for (const e of events) {
    if (e.weekday != null && e.time) {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if ((d.getDay() + 6) % 7 === e.weekday) out.push({ ...e, date: localDate(d), at: `${localDate(d)}T${e.time}` });
      }
    } else if (e.starts_at) {
      const s = new Date(e.starts_at);
      if (s >= start && s <= end) out.push({ ...e, date: localDate(s), at: e.starts_at.slice(0, 16), time: e.starts_at.slice(11, 16) });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export async function liveNow(user) {
  const groups = await userGroupIds(user.id);
  return (await all('SELECT * FROM events WHERE is_live = 1')).filter((e) => isStaff(user) || !e.group_id || groups.includes(e.group_id));
}

// ---------- notifications ----------
export function notify(userId, title, body = null, link = null, kind = 'info') {
  return insert('notifications', { user_id: userId, title, body, link, kind, created_at: sqlNow() });
}
export async function notifyMany(userIds, title, body, link, kind) {
  await tx(async () => { for (const id of userIds) await notify(id, title, body, link, kind); });
}

/** Periodic reminders: upcoming lessons tomorrow & inactivity nudges. Deduplicated by title per ~day. */
export async function runReminders() {
  const students = await all("SELECT * FROM users WHERE role = 'student' AND active = 1");
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const recent = (uid, title, hours) => get('SELECT 1 FROM notifications WHERE user_id = ? AND title = ? AND created_at > ?', uid, title, sqlAgo(hours * 3600000));
  for (const s of students) {
    for (const ev of await eventOccurrences(s, localDate(tomorrow), localDate(tomorrow))) {
      const title = `Ертең ${ev.time}-де ${ev.title} бар`;
      if (!(await recent(s.id, title, 20))) await notify(s.id, title, ev.teacher_name ? `Ұстаз: ${ev.teacher_name}` : null, '/calendar', 'reminder');
    }
    const last = (await get(`SELECT max(created_at) AS t FROM activity WHERE user_id = ? AND kind IN ('lesson_view','lesson_complete','test','practice','review')`, s.id))?.t;
    if (last && Date.now() - new Date(String(last).replace(' ', 'T') + 'Z') > 3 * DAY) {
      const title = '3 күннен бері сабақ өтпедіңіз';
      if (!(await recent(s.id, title, 72))) await notify(s.id, title, 'Бүгін 10 минут бөліп, қайталаудан бастаңыз.', '/', 'nudge');
    }
  }
}

// ---------- grading ----------
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Returns true/false for a question-like object ({type, options, answer}) and a given answer. */
export function grade(q, given) {
  const answer = typeof q.answer === 'string' ? parse(q.answer) : q.answer;
  const options = typeof q.options === 'string' ? parse(q.options) : q.options;
  switch (q.type) {
    case 'single': case 'arabic_reading': case 'audio_rule':
      return Number(given) === Number(answer);
    case 'multi': {
      const a = [...(answer || [])].map(Number).sort(); const g = [...(given || [])].map(Number).sort();
      return a.length === g.length && a.every((v, i) => v === g[i]);
    }
    case 'tf': return Boolean(given) === Boolean(answer) && given !== null && given !== undefined;
    case 'fill': return (Array.isArray(answer) ? answer : [answer]).some((a) => norm(a) === norm(given));
    case 'match': {
      const pairs = options?.pairs || [];
      return Array.isArray(given) && pairs.length > 0 && pairs.every((p, i) => norm(given[i]) === norm(p[1]));
    }
    default: return false;
  }
}

/** Human-readable correct answer for the "Неге?" explanation. */
export function correctAnswerText(q) {
  const answer = typeof q.answer === 'string' ? parse(q.answer) : q.answer;
  const options = typeof q.options === 'string' ? parse(q.options) : q.options;
  switch (q.type) {
    case 'single': case 'arabic_reading': case 'audio_rule': return options?.[answer];
    case 'multi': return (answer || []).map((i) => options?.[i]).join(', ');
    case 'tf': return answer ? 'Дұрыс' : 'Қате';
    case 'fill': return Array.isArray(answer) ? answer[0] : answer;
    case 'match': return (options?.pairs || []).map((p) => `${p[0]} → ${p[1]}`).join('; ');
    default: return '';
  }
}

const shuffle = (arr, seed = 1) => {
  const a = [...arr]; let s = seed;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** Strip answers before sending to students; shuffle right column of matching. */
export function publicQuestion(q) {
  const options = parse(q.options);
  const out = { id: q.id, type: q.type, prompt: q.prompt, arabic: q.arabic, audio_url: q.audio_url, rule_tag: q.rule_tag };
  if (q.type === 'match') {
    const pairs = options?.pairs || [];
    out.left = pairs.map((p) => p[0]);
    out.right = shuffle(pairs.map((p) => p[1]), q.id + 7);
  } else out.options = options;
  return out;
}
export function publicExercise(e) {
  const data = parse(e.data, {});
  const out = { id: e.id, type: e.type, prompt: e.prompt, arabic: e.arabic, lesson_id: e.lesson_id, topic_id: e.topic_id };
  if (e.type === 'match') {
    const pairs = data.pairs || [];
    out.left = pairs.map((p) => p[0]); out.right = shuffle(pairs.map((p) => p[1]), e.id + 3);
  } else if (data.options) out.options = data.options;
  return out;
}
export const exerciseAsQuestion = (e) => {
  const data = parse(e.data, {});
  return { type: e.type, options: e.type === 'match' ? { pairs: data.pairs } : data.options, answer: data.answer };
};

// ---------- search ----------
const STOP = new Set(['деген', 'дегеніміз', 'не', 'қалай', 'қандай', 'бұл', 'және', 'мен', 'ма', 'ме', 'ба', 'бе', 'па', 'пе', 'үшін', 'қай', 'нені', 'неге', 'что', 'такое', 'как', 'это']);
const SYNONYMS = { тажвид: 'тәжуид', таджвид: 'тәжуид', тажуид: 'тәжуид', гунна: 'ғунна', мад: 'мәд', мадд: 'мәд', тафсир: 'тәпсір', тәфсир: 'тәпсір', калкала: 'қалқала', ихлас: 'ықылас', ыхлас: 'ықылас', сура: 'сүре', харакат: 'харакаттар', шадда: 'шадда', араб: 'араб' };

/** Query → word stems ('ғуннаның' → 'ғунна'), dropping stop words. */
export function searchStems(q) {
  return String(q).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .map((t) => { t = SYNONYMS[t] || t; return t.length >= 6 ? t.slice(0, Math.max(4, t.length - 3)) : t; });
}
export function buildMatch(q) {
  const terms = searchStems(q).map((t) => `"${t.replace(/"/g, '')}"*`);
  return terms.length ? terms.join(' OR ') : null;
}

export async function search(user, q, limit = 60) {
  const stems = searchStems(q);
  if (!stems.length) return [];
  const allowed = new Set(await accessibleCourseIds(user));
  let rows = [];
  try {
    if (DIALECT === 'pg') {
      const tsq = stems.map((t) => t.replace(/[^\p{L}\p{N}]/gu, '') + ':*').filter((t) => t.length > 2).join(' | ');
      if (!tsq) return [];
      rows = await all(`SELECT kind, ref_id, link, scope, subtitle, title,
        ts_headline('simple', body, to_tsquery('simple', ?), 'StartSel=<mark>,StopSel=</mark>,MaxWords=18,MinWords=6,MaxFragments=1') AS snippet,
        ts_rank_cd(doc, to_tsquery('simple', ?)) AS rank
        FROM search_index WHERE doc @@ to_tsquery('simple', ?) ORDER BY rank DESC LIMIT 300`, tsq, tsq, tsq);
    } else {
      rows = await all(`SELECT kind, ref_id, link, scope, subtitle, title,
        snippet(search_index, 4, '<mark>', '</mark>', '…', 16) AS snippet, bm25(search_index, 8.0, 1.0) AS rank
        FROM search_index WHERE search_index MATCH ? ORDER BY rank LIMIT 300`, buildMatch(q));
    }
  } catch (e) { console.error('search failed:', e.message); return []; }
  return rows.filter((r) => !r.scope || allowed.has(Number(r.scope))).slice(0, limit);
}

const strip = (...parts) => parts.filter(Boolean).join(' \n ');

/** Rebuild the search index from published content (cheap at this scale; called after content changes). */
export async function rebuildSearchIndex() {
  const rows = [];
  for (const l of await all(`SELECT l.*, m.course_id, m.title AS module_title, c.title AS course_title FROM lessons l
      JOIN modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id WHERE l.status = 'published'`)) {
    const body = strip(l.goal, l.key_concept, l.remember, l.example, l.common_mistake, l.body, l.module_title, l.course_title);
    rows.push(['lesson', l.id, `/lessons/${l.id}`, l.course_id, `${l.course_title} · ${l.module_title}`, l.title, body]);
    if (l.youtube_url) rows.push(['video', l.id, `/lessons/${l.id}`, l.course_id, `${l.duration_min || ''} мин · ${l.course_title}`, l.title, body]);
  }
  for (const t of await all(`SELECT * FROM kb_topics WHERE status = 'published'`)) {
    rows.push(['article', t.id, `/kb/${t.slug}`, null, t.section || '', t.title, strip(t.summary, t.simple, t.rule, t.mistakes, t.section)]);
  }
  for (const s of await all(`SELECT * FROM surahs WHERE status = 'published'`)) {
    const ay = (await all('SELECT translation, explanation, key_meaning FROM ayahs WHERE surah_id = ?', s.id))
      .map((a) => strip(a.translation, a.explanation, a.key_meaning)).join(' ');
    rows.push(['tafsir', s.id, `/tafsir/${s.id}`, null, `${s.id}-сүре · ${s.ayah_count} аят`, `${s.name_kk} сүресінің тәпсірі`,
      strip(s.name_meaning, s.description, s.reflection, (parse(s.takeaways, []) || []).join(' '), ay, 'тәпсір сүре')]);
    if (s.youtube_url) rows.push(['video', s.id, `/tafsir/${s.id}`, null, `Тәпсір · ${s.duration_min || ''} мин`, `${s.name_kk} сүресінің тәпсірі`, strip(s.description, 'тәпсір')]);
  }
  for (const w of await all('SELECT * FROM words')) {
    rows.push(['word', w.id, `/dictionary?w=${w.id}`, null, `${w.arabic} · ${w.translit || ''}`, w.meaning, strip(w.translit, w.example_kk, w.topic, 'сөз сөздік')]);
  }
  for (const m of await all(`SELECT * FROM materials WHERE status = 'published'`)) {
    rows.push([m.kind === 'video' || m.kind === 'recording' ? 'video' : 'material', m.id, `/materials?m=${m.id}`, m.course_id, m.category || '', m.title, strip(m.description, m.category)]);
  }
  await tx(async () => {
    await run('DELETE FROM search_index');
    for (const r of rows) await run('INSERT INTO search_index (kind, ref_id, link, scope, subtitle, title, body) VALUES (?,?,?,?,?,?,?)', ...r);
  });
  return rows.length;
}

let rebuildTimer = null;
export const scheduleReindex = () => {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => rebuildSearchIndex().catch((e) => console.error('reindex', e.message)), 300);
};

// ---------- mistakes & daily review ----------
export async function mistakeSummary(userId) {
  const rows = await all(`SELECT rule_tag, count(*) AS count, sum(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) AS open, max(created_at) AS last
    FROM mistakes WHERE user_id = ? GROUP BY rule_tag ORDER BY open DESC, count DESC`, userId);
  const out = [];
  for (const m of rows) {
    const topic = await get(`SELECT slug, title FROM kb_topics WHERE rule_tag = ? AND status = 'published' ORDER BY sort LIMIT 1`, m.rule_tag);
    const lesson = await get(`SELECT id, title FROM lessons WHERE rule_tag = ? AND status = 'published' ORDER BY id LIMIT 1`, m.rule_tag);
    out.push({ ...m, count: Number(m.count), open: Number(m.open), label: RULE_TAGS[m.rule_tag] || m.rule_tag, topic, lesson });
  }
  return out;
}

const daySeed = (userId) => Number(localDate().replace(/-/g, '')) + userId * 31;

/** Deterministic daily 5–10 minute review set, personalised by open mistakes. */
export async function dailyReview(user) {
  const seed = daySeed(user.id);
  const weakTags = (await all('SELECT rule_tag FROM mistakes WHERE user_id = ? AND resolved = 0 GROUP BY rule_tag ORDER BY count(*) DESC', user.id)).map((r) => r.rule_tag);
  const topicsAll = await all(`SELECT id, slug, title, summary, rule_tag, arabic FROM kb_topics WHERE category IN ('tajweed','quran_reading') AND status = 'published'`);
  const weak = topicsAll.filter((t) => weakTags.includes(t.rule_tag));
  const topics = [...weak, ...shuffle(topicsAll.filter((t) => !weak.includes(t)), seed)].slice(0, 2);
  const words = shuffle(await all('SELECT id, arabic, translit, meaning FROM words'), seed + 1).slice(0, 3);
  const surah = shuffle(await all(`SELECT id, name_kk, name_ar, ayah_count FROM surahs WHERE status = 'published'`), seed + 2)[0] || null;
  const wrongQ = await all('SELECT DISTINCT q.* FROM answers a JOIN questions q ON q.id = a.question_id WHERE a.user_id = ? AND a.correct = 0', user.id);
  const pool = await all(`SELECT q.* FROM questions q JOIN tests t ON t.id = q.test_id WHERE t.status = 'published' AND q.type != 'audio_rule'`);
  const qs = [...shuffle(wrongQ, seed), ...shuffle(pool, seed + 3)].filter((q, i, a) => a.findIndex((x) => x.id === q.id) === i).slice(0, 5);
  const done = !!(await get(`SELECT 1 FROM activity WHERE user_id = ? AND kind = 'review' AND created_at >= ?`, user.id, startOfToday()));
  return { date: localDate(), minutes: 8, done, topics, words, surah, questions: qs.map(publicQuestion), weakTags: weakTags.map((t) => RULE_TAGS[t] || t) };
}

// ---------- religious content workflow ----------
export const WORKFLOW_TABLES = ['lessons', 'surahs', 'kb_topics'];
export const hasSource = (row) => !!(row.source_id || row.book || row.scholar);

/** Validate a status transition; returns error text or null. */
export function checkTransition(user, row, to) {
  const from = row.status;
  const allowed = { draft: ['review'], review: ['approved', 'draft'], approved: ['published', 'draft', 'review'], published: ['draft', 'review'] };
  if (!allowed[from]?.includes(to)) return `${from} → ${to} ауысуы мүмкін емес`;
  if (to === 'approved') {
    if (!['teacher', 'admin'].includes(user.role)) return 'Тек жауапты ұстаз бекіте алады';
    if (!hasSource(row)) return 'Бекіту үшін дереккөзді толтырыңыз (Дереккөз / Ғалым / Кітап)';
  }
  if (to === 'published') {
    if (user.role !== 'admin') return 'Жариялауды тек әкімші жасай алады';
    if (!row.reviewed_by) return 'Материал ұстаз тексеруінен өтпеген';
  }
  return null;
}
