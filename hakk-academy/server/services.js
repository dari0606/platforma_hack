// Core learning logic: access, progress, locking, schedule, search, grading, notifications.
import { all, get, run, insert, parse, tx } from './db.js';
import { RULE_TAGS } from './constants.js';

export const isStaff = (u) => u && u.role !== 'student';

// ---------- dates (server runs in Asia/Almaty, see index.js) ----------
const pad = (n) => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localDateTime = (d = new Date()) => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
// SQLite datetime('now') is UTC; convert to local date string for grouping
export const utcToLocalDate = (s) => localDate(new Date(s.replace(' ', 'T') + 'Z'));

// ---------- access ----------
export function userGroupIds(userId) {
  return all('SELECT group_id FROM group_members WHERE user_id = ?', userId).map((r) => r.group_id);
}

export function accessibleCourseIds(user) {
  if (isStaff(user)) return all('SELECT id FROM courses ORDER BY sort, id').map((r) => r.id);
  return all(`
    SELECT DISTINCT c.id FROM courses c
    JOIN course_access a ON a.course_id = c.id
    WHERE c.status = 'published'
      AND (a.user_id = ? OR a.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?))
    ORDER BY c.sort, c.id`, user.id, user.id).map((r) => r.id);
}
export const canAccessCourse = (user, courseId) => accessibleCourseIds(user).includes(Number(courseId));

/** SQL filter for publication status — staff preview everything, students only see Published. */
export const pubFilter = (user, alias = '') => (isStaff(user) ? '1=1' : `${alias ? alias + '.' : ''}status = 'published'`);

// ---------- course tree & progress ----------
export function courseTree(user, courseId) {
  const course = get('SELECT * FROM courses WHERE id = ?', courseId);
  if (!course) return null;
  const modules = all('SELECT * FROM modules WHERE course_id = ? ORDER BY sort, id', courseId);
  const lessons = all(`SELECT l.id, l.module_id, l.title, l.duration_min, l.youtube_url, l.status, l.sort, l.rule_tag
    FROM lessons l JOIN modules m ON m.id = l.module_id
    WHERE m.course_id = ? AND ${pubFilter(user, 'l')} ORDER BY m.sort, m.id, l.sort, l.id`, courseId);
  const prog = new Map(all(`SELECT lesson_id, status FROM student_progress WHERE user_id = ?`, user.id)
    .map((r) => [r.lesson_id, r.status]));

  let blocked = false; // once a lesson is not completed, the following ones are locked (sequential courses)
  let next = null;
  for (const l of lessons) {
    const p = prog.get(l.id);
    if (p === 'completed') l.state = 'completed';
    else if (blocked && course.sequential && !isStaff(user)) l.state = 'locked';
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

export function lessonCourseId(lessonId) {
  return get('SELECT m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = ?', lessonId)?.course_id;
}

export function logActivity(userId, kind, refId = null) {
  run('INSERT INTO activity (user_id, kind, ref_id) VALUES (?,?,?)', userId, kind, refId);
}

/** Consecutive days (ending today or yesterday) with any learning activity. */
export function streak(userId) {
  const days = new Set(all(`SELECT DISTINCT created_at FROM activity WHERE user_id = ? AND kind != 'login'
    AND created_at > datetime('now','-120 days')`, userId).map((r) => utcToLocalDate(r.created_at)));
  let n = 0; const d = new Date();
  if (!days.has(localDate(d))) d.setDate(d.getDate() - 1);
  while (days.has(localDate(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function completeLesson(user, lessonId) {
  tx(() => {
    run(`INSERT INTO student_progress (user_id, lesson_id, status, completed_at) VALUES (?,?,'completed',datetime('now'))
      ON CONFLICT(user_id, lesson_id) DO UPDATE SET status='completed', completed_at=COALESCE(completed_at, datetime('now'))`, user.id, lessonId);
    logActivity(user.id, 'lesson_complete', lessonId);
  });
  const courseId = lessonCourseId(lessonId);
  const tree = courseTree(user, courseId);
  if (tree && tree.total && tree.percent === 100 && !get('SELECT 1 FROM certificates WHERE user_id=? AND course_id=?', user.id, courseId)) {
    insert('certificates', { user_id: user.id, course_id: courseId, percent: 100 });
    notify(user.id, '🎓 Сертификат алуға дайынсыз', `«${tree.course.title}» бағдарламасын аяқтадыңыз.`, '/progress', 'success');
  }
  return tree;
}

// ---------- schedule ----------
/** Expand weekly recurring + one-off events into occurrences between two local dates (inclusive). */
export function eventOccurrences(user, fromDate, toDate) {
  const groups = userGroupIds(user.id);
  const events = all('SELECT * FROM events').filter((e) => isStaff(user) || !e.group_id || groups.includes(e.group_id));
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

export function liveNow(user) {
  const groups = userGroupIds(user.id);
  return all('SELECT * FROM events WHERE is_live = 1').filter((e) => isStaff(user) || !e.group_id || groups.includes(e.group_id));
}

// ---------- notifications ----------
export function notify(userId, title, body = null, link = null, kind = 'info') {
  insert('notifications', { user_id: userId, title, body, link, kind });
}
export function notifyMany(userIds, title, body, link, kind) {
  tx(() => userIds.forEach((id) => notify(id, title, body, link, kind)));
}

/** Periodic reminders: upcoming lessons tomorrow & inactivity nudges. Deduplicated by title per ~day. */
export function runReminders() {
  const students = all("SELECT * FROM users WHERE role = 'student' AND active = 1");
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const recent = (uid, title, hours) => get(`SELECT 1 FROM notifications WHERE user_id = ? AND title = ? AND created_at > datetime('now', ?)`, uid, title, `-${hours} hours`);
  for (const s of students) {
    for (const ev of eventOccurrences(s, localDate(tomorrow), localDate(tomorrow))) {
      const title = `Ертең ${ev.time}-де ${ev.title} бар`;
      if (!recent(s.id, title, 20)) notify(s.id, title, ev.teacher_name ? `Ұстаз: ${ev.teacher_name}` : null, '/calendar', 'reminder');
    }
    const last = get(`SELECT max(created_at) t FROM activity WHERE user_id = ? AND kind IN ('lesson_view','lesson_complete','test','practice','review')`, s.id)?.t;
    if (last && Date.now() - new Date(last.replace(' ', 'T') + 'Z') > 3 * 864e5) {
      const title = '3 күннен бері сабақ өтпедіңіз';
      if (!recent(s.id, title, 72)) notify(s.id, title, 'Бүгін 10 минут бөліп, қайталаудан бастаңыз.', '/', 'nudge');
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

export function buildMatch(q) {
  const toks = String(q).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((t) => t && !STOP.has(t));
  const terms = toks.map((t) => {
    t = SYNONYMS[t] || t;
    const stem = t.length >= 6 ? t.slice(0, Math.max(4, t.length - 3)) : t; // crude Kazakh suffix trimming
    return `"${stem.replace(/"/g, '')}"*`;
  });
  return terms.length ? terms.join(' OR ') : null;
}

export function search(user, q, limit = 60) {
  const match = buildMatch(q);
  if (!match) return [];
  const allowed = new Set(accessibleCourseIds(user));
  let rows;
  try {
    rows = all(`SELECT kind, ref_id, link, scope, subtitle, title,
      snippet(search_index, 4, '<mark>', '</mark>', '…', 16) AS snippet, bm25(search_index, 8.0, 1.0) AS rank
      FROM search_index WHERE search_index MATCH ? ORDER BY rank LIMIT 300`, match);
  } catch { return []; }
  return rows.filter((r) => !r.scope || allowed.has(Number(r.scope))).slice(0, limit);
}

const strip = (...parts) => parts.filter(Boolean).join(' \n ');

/** Rebuild the FTS index from published content (cheap for MVP scale; call after content changes). */
export function rebuildSearchIndex() {
  const rows = [];
  for (const l of all(`SELECT l.*, m.course_id, m.title AS module_title, c.title AS course_title FROM lessons l
      JOIN modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id WHERE l.status = 'published'`)) {
    const body = strip(l.goal, l.key_concept, l.remember, l.example, l.common_mistake, l.body, l.module_title, l.course_title);
    rows.push(['lesson', l.id, `/lessons/${l.id}`, l.course_id, `${l.course_title} · ${l.module_title}`, l.title, body]);
    if (l.youtube_url) rows.push(['video', l.id, `/lessons/${l.id}`, l.course_id, `${l.duration_min || ''} мин · ${l.course_title}`, l.title, body]);
  }
  for (const t of all(`SELECT * FROM kb_topics WHERE status = 'published'`)) {
    rows.push(['article', t.id, `/kb/${t.slug}`, null, t.section || '', t.title, strip(t.summary, t.simple, t.rule, t.mistakes, t.section)]);
  }
  for (const s of all(`SELECT * FROM surahs WHERE status = 'published'`)) {
    const ay = all('SELECT translation, explanation, key_meaning FROM ayahs WHERE surah_id = ?', s.id)
      .map((a) => strip(a.translation, a.explanation, a.key_meaning)).join(' ');
    rows.push(['tafsir', s.id, `/tafsir/${s.id}`, null, `${s.id}-сүре · ${s.ayah_count} аят`, `${s.name_kk} сүресінің тәпсірі`,
      strip(s.description, s.reflection, (parse(s.takeaways, []) || []).join(' '), ay, 'тәпсір сүре')]);
    if (s.youtube_url) rows.push(['video', s.id, `/tafsir/${s.id}`, null, `Тәпсір · ${s.duration_min || ''} мин`, `${s.name_kk} сүресінің тәпсірі`, strip(s.description, 'тәпсір')]);
  }
  for (const w of all('SELECT * FROM words')) {
    rows.push(['word', w.id, `/dictionary?w=${w.id}`, null, `${w.arabic} · ${w.translit || ''}`, w.meaning, strip(w.translit, w.example_kk, 'сөз сөздік')]);
  }
  for (const m of all(`SELECT * FROM materials WHERE status = 'published'`)) {
    rows.push([m.kind === 'video' || m.kind === 'recording' ? 'video' : 'material', m.id, `/materials?m=${m.id}`, m.course_id, m.category || '', m.title, strip(m.description, m.category)]);
  }
  tx(() => {
    run('DELETE FROM search_index');
    for (const r of rows) run('INSERT INTO search_index (kind, ref_id, link, scope, subtitle, title, body) VALUES (?,?,?,?,?,?,?)', ...r);
  });
  return rows.length;
}

let rebuildTimer = null;
export const scheduleReindex = () => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuildSearchIndex, 300); };

// ---------- mistakes & daily review ----------
export function mistakeSummary(userId) {
  return all(`SELECT rule_tag, count(*) AS count, sum(resolved = 0) AS open, max(created_at) AS last
    FROM mistakes WHERE user_id = ? GROUP BY rule_tag ORDER BY open DESC, count DESC`, userId).map((m) => {
    const topic = get(`SELECT slug, title FROM kb_topics WHERE rule_tag = ? AND status = 'published' ORDER BY sort LIMIT 1`, m.rule_tag);
    const lesson = get(`SELECT id, title FROM lessons WHERE rule_tag = ? AND status = 'published' ORDER BY id LIMIT 1`, m.rule_tag);
    return { ...m, label: RULE_TAGS[m.rule_tag] || m.rule_tag, topic, lesson };
  });
}

const daySeed = (userId) => Number(localDate().replace(/-/g, '')) + userId * 31;

/** Deterministic daily 5–10 minute review set, personalised by open mistakes. */
export function dailyReview(user) {
  const seed = daySeed(user.id);
  const weakTags = all('SELECT rule_tag FROM mistakes WHERE user_id = ? AND resolved = 0 GROUP BY rule_tag ORDER BY count(*) DESC', user.id).map((r) => r.rule_tag);
  const topicsAll = all(`SELECT id, slug, title, summary, rule_tag, arabic FROM kb_topics WHERE category IN ('tajweed','quran_reading') AND status='published'`);
  const weak = topicsAll.filter((t) => weakTags.includes(t.rule_tag));
  const topics = [...weak, ...shuffle(topicsAll.filter((t) => !weak.includes(t)), seed)].slice(0, 2);
  const words = shuffle(all('SELECT id, arabic, translit, meaning FROM words'), seed + 1).slice(0, 3);
  const surah = shuffle(all(`SELECT id, name_kk, name_ar, ayah_count FROM surahs WHERE status='published'`), seed + 2)[0] || null;
  const wrongQ = all(`SELECT DISTINCT q.* FROM answers a JOIN questions q ON q.id = a.question_id WHERE a.user_id = ? AND a.correct = 0`, user.id);
  const pool = all(`SELECT q.* FROM questions q JOIN tests t ON t.id = q.test_id WHERE t.status='published' AND q.type != 'audio_rule'`);
  const qs = [...shuffle(wrongQ, seed), ...shuffle(pool, seed + 3)].filter((q, i, a) => a.findIndex((x) => x.id === q.id) === i).slice(0, 5);
  const done = !!get(`SELECT 1 FROM activity WHERE user_id = ? AND kind = 'review' AND created_at >= datetime('now','start of day')`, user.id);
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
