// Student-facing API (also used by staff in preview mode). All routes require a session.
import { Router } from 'express';
import { all, get, run, insert, parse, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  RULE_TAGS, KB_CATEGORIES, QA_CATEGORIES, ROLES, SUBMISSION_STATUS, WEEKDAYS, EVENT_KINDS, CONTENT_STATUS,
} from '../constants.js';
import {
  isStaff, accessibleCourseIds, canAccessCourse, pubFilter, courseTree, lessonCourseId, logActivity, streak, completeLesson,
  eventOccurrences, liveNow, localDate, grade, correctAnswerText, publicQuestion, publicExercise, exerciseAsQuestion, search,
  mistakeSummary, dailyReview, notify, userGroupIds,
} from '../services.js';
import { privateUpload, fileUrl } from '../uploads.js';
import { LETTERS } from '../seed-data/reference.js';

const r = Router();
r.use(requireAuth);

const reviewer = (row) => row.reviewed_by && get('SELECT name FROM users WHERE id = ?', row.reviewed_by)?.name;
const sourceOf = (row) => (row.source_id ? get('SELECT * FROM sources WHERE id = ?', row.source_id) : null);
/** Verification block shown on religious materials ("✓ Hakk Academy тексерген"). */
const verification = (row) => ({
  status: row.status, verified: row.status === 'published' && !!row.reviewed_by,
  reviewed_by: reviewer(row), reviewed_at: row.reviewed_at, scholar: row.scholar, book: row.book, source: sourceOf(row), is_demo: !!row.is_demo,
});
const bookmarked = (uid, type, id) => !!get('SELECT 1 FROM bookmarks WHERE user_id=? AND item_type=? AND item_id=?', uid, type, id);

r.get('/meta', (_req, res) => res.json({ RULE_TAGS, KB_CATEGORIES, QA_CATEGORIES, ROLES, SUBMISSION_STATUS, WEEKDAYS, EVENT_KINDS, CONTENT_STATUS }));

// ---------------- dashboard ----------------
function overall(user) {
  const trees = accessibleCourseIds(user).map((id) => courseTree(user, id));
  const total = trees.reduce((s, t) => s + t.total, 0); const done = trees.reduce((s, t) => s + t.done, 0);
  return { trees, total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

function currentTree(user, trees) {
  const last = get(`SELECT a.ref_id FROM activity a WHERE a.user_id = ? AND a.kind IN ('lesson_view','lesson_complete') ORDER BY a.created_at DESC LIMIT 1`, user.id);
  const cid = last && lessonCourseId(last.ref_id);
  return trees.find((t) => t.course.id === cid && t.percent < 100) || trees.find((t) => t.percent < 100) || trees[0] || null;
}

function recommendation(user) {
  const m = mistakeSummary(user.id).find((x) => x.open > 0 && x.topic);
  if (m) return { kind: 'rule', title: m.topic.title, subtitle: `${m.label} ережесінде ${m.open} рет қате жібердіңіз`, minutes: 6, link: `/kb/${m.topic.slug}` };
  const s = get(`SELECT * FROM surahs WHERE status='published' AND youtube_url IS NOT NULL
    AND id NOT IN (SELECT ref_id FROM activity WHERE user_id = ? AND kind = 'tafsir_view') ORDER BY id DESC LIMIT 1`, user.id);
  if (s) return { kind: 'tafsir', title: `${s.name_kk} сүресінің тәпсірі`, subtitle: s.teacher_name, arabic: s.name_ar, minutes: s.duration_min || 12, link: `/tafsir/${s.id}` };
  const t = get(`SELECT * FROM kb_topics WHERE status='published' ORDER BY random() LIMIT 1`);
  return t ? { kind: 'article', title: t.title, subtitle: t.summary, minutes: 5, link: `/kb/${t.slug}` } : null;
}

r.get('/dashboard', (req, res) => {
  const u = req.user;
  const ov = overall(u);
  const cur = currentTree(u, ov.trees);
  const today = localDate();
  const week = new Date(); week.setDate(week.getDate() + 7);
  const occ = eventOccurrences(u, today, localDate(week));
  const nowStr = new Date().toTimeString().slice(0, 5);
  const todayEvent = occ.find((e) => e.date === today && (e.time || '00:00') >= addMin(nowStr, -90)) || null;
  const nextEvent = todayEvent || occ.find((e) => e.date > today) || null;
  const w = "datetime('now','-7 days')";
  const lastTest = get(`SELECT ta.score, t.title, ta.created_at FROM test_attempts ta JOIN tests t ON t.id = ta.test_id WHERE ta.user_id = ? ORDER BY ta.created_at DESC LIMIT 1`, u.id);
  res.json({
    user: { name: u.name.split(' ')[0] },
    current: cur && { course: { id: cur.course.id, title: cur.course.title, color: cur.course.color }, percent: cur.percent, done: cur.done, total: cur.total, next: cur.next },
    event: nextEvent && { ...nextEvent, isToday: nextEvent.date === today },
    live: liveNow(u),
    week: {
      lessons: get(`SELECT count(DISTINCT ref_id) n FROM activity WHERE user_id = ? AND kind='lesson_complete' AND created_at > ${w}`, u.id).n,
      tasks: get(`SELECT count(*) n FROM submissions WHERE user_id = ? AND created_at > ${w}`, u.id).n
        + get(`SELECT count(*) n FROM activity WHERE user_id = ? AND kind='practice' AND created_at > ${w}`, u.id).n,
      testAvg: get(`SELECT round(avg(score)) n FROM test_attempts WHERE user_id = ? AND created_at > ${w}`, u.id).n,
      streak: streak(u.id),
      percent: ov.percent,
      days: weekDays(u.id),
    },
    lastTest,
    recommended: recommendation(u),
    review: (({ minutes, done, topics, words, surah, questions }) => ({ minutes, done, count: topics.length + words.length + (surah ? 1 : 0) + questions.length, topics: topics.length, words: words.length, surah: !!surah, questions: questions.length }))(dailyReview(u)),
    mistakes: mistakeSummary(u.id).filter((m) => m.open > 0).slice(0, 3),
    unread: get('SELECT count(*) n FROM notifications WHERE user_id = ? AND read = 0', u.id).n,
    hifz: hifzSummary(u.id),
    word: (() => { const ws = all(`SELECT * FROM words WHERE in_quran = 1 AND topic = 'Әмма парасындағы сөздер' ORDER BY id`); return ws.length ? ws[Number(localDate().replace(/-/g, '')) % ws.length] : null; })(),
    certificateReady: all(`SELECT c.id, co.title FROM certificates c JOIN courses co ON co.id = c.course_id WHERE c.user_id = ?`, u.id),
  });
});

function addMin(hhmm, m) { const [h, mi] = hhmm.split(':').map(Number); const t = Math.max(0, h * 60 + mi + m); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }
function weekDays(uid) {
  const rows = all(`SELECT created_at FROM activity WHERE user_id = ? AND kind != 'login' AND created_at > datetime('now','-8 days')`, uid);
  const set = new Set(rows.map((x) => localDate(new Date(x.created_at.replace(' ', 'T') + 'Z'))));
  const out = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); out.push({ date: localDate(d), wd: (d.getDay() + 6) % 7, active: set.has(localDate(d)) }); }
  return out;
}

// ---------------- courses & lessons ----------------
r.get('/courses', (req, res) => {
  const dir = req.query.direction;
  const trees = accessibleCourseIds(req.user).map((id) => courseTree(req.user, id)).filter((t) => !dir || t.course.direction === dir);
  res.json(trees.map((t) => ({ ...t.course, percent: t.percent, done: t.done, total: t.total, next: t.next, modules: t.modules.map((m) => ({ id: m.id, title: m.title, percent: m.percent, state: m.state, total: m.total })) })));
});

r.get('/courses/:id', (req, res) => {
  if (!canAccessCourse(req.user, req.params.id)) return res.status(403).json({ error: 'Бұл курсқа қолжетімділік ашылмаған' });
  const t = courseTree(req.user, req.params.id);
  const cert = get('SELECT * FROM certificates WHERE user_id = ? AND course_id = ?', req.user.id, req.params.id);
  res.json({ ...t, certificate: cert || null });
});

// "Сабақтар" — video lesson library across all accessible courses
r.get('/lessons', (req, res) => {
  const ids = accessibleCourseIds(req.user);
  if (!ids.length) return res.json([]);
  const rows = all(`SELECT l.id, l.title, l.duration_min, l.youtube_url, l.goal, c.id AS course_id, c.title AS course_title, c.direction, c.color, m.title AS module_title
    FROM lessons l JOIN modules m ON m.id = l.module_id JOIN courses c ON c.id = m.course_id
    WHERE c.id IN (${ids.map(Number).join(',')}) AND ${pubFilter(req.user, 'l')} ORDER BY c.sort, m.sort, l.sort`);
  const trees = new Map(ids.map((id) => [id, courseTree(req.user, id)]));
  res.json(rows.map((l) => ({ ...l, state: trees.get(l.course_id).modules.flatMap((m) => m.lessons).find((x) => x.id === l.id)?.state })));
});

r.get('/lessons/:id', (req, res) => {
  const l = get('SELECT * FROM lessons WHERE id = ?', req.params.id);
  if (!l || (!isStaff(req.user) && l.status !== 'published')) return res.status(404).json({ error: 'Сабақ табылмады' });
  const courseId = lessonCourseId(l.id);
  if (!canAccessCourse(req.user, courseId)) return res.status(403).json({ error: 'Бұл курсқа қолжетімділік ашылмаған' });
  const tree = courseTree(req.user, courseId);
  const flat = tree.modules.flatMap((m) => m.lessons);
  const me = flat.find((x) => x.id === l.id);
  if (me?.state === 'locked') return res.status(423).json({ error: 'Алдымен алдыңғы сабақты аяқтаңыз', locked: true, next: tree.next });
  run(`INSERT INTO student_progress (user_id, lesson_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, req.user.id, l.id);
  logActivity(req.user.id, 'lesson_view', l.id);
  const idx = flat.findIndex((x) => x.id === l.id);
  const test = get('SELECT id, title FROM tests WHERE lesson_id = ? AND status = ?', l.id, 'published');
  const groups = userGroupIds(req.user.id);
  const assignments = all('SELECT * FROM assignments WHERE lesson_id = ?', l.id).filter((a) => isStaff(req.user) || !a.group_id || groups.includes(a.group_id))
    .map((a) => ({ ...a, submission: get('SELECT id, status, created_at FROM submissions WHERE assignment_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1', a.id, req.user.id) }));
  const exercises = all('SELECT * FROM exercises WHERE lesson_id = ? ORDER BY sort, id', l.id).map((e) => ({
    ...publicExercise(e),
    submission: ['read_aloud', 'text', 'upload'].includes(e.type) ? lastSubmission(req.user.id, { exercise_id: e.id }) : undefined,
  }));
  res.json({
    lesson: { ...l, reviewed_by: undefined }, verification: verification(l), course: tree.course,
    modules: tree.modules.map((m) => ({ id: m.id, title: m.title, percent: m.percent, lessons: m.lessons.map((x) => ({ id: x.id, title: x.title, state: x.state, duration_min: x.duration_min })) })),
    module_id: l.module_id, prev: flat[idx - 1] || null, next: flat[idx + 1] || null, state: me?.state,
    exercises, test, assignments, bookmarked: bookmarked(req.user.id, 'lesson', l.id), percent: tree.percent,
  });
});

function lastSubmission(uid, { exercise_id, assignment_id }) {
  const s = exercise_id
    ? get('SELECT * FROM submissions WHERE user_id = ? AND exercise_id = ? ORDER BY id DESC LIMIT 1', uid, exercise_id)
    : get('SELECT * FROM submissions WHERE user_id = ? AND assignment_id = ? ORDER BY id DESC LIMIT 1', uid, assignment_id);
  if (!s) return null;
  const fb = all('SELECT f.*, u.name AS teacher FROM teacher_feedback f LEFT JOIN users u ON u.id = f.teacher_id WHERE submission_id = ? ORDER BY f.id', s.id);
  return { ...s, feedback: fb };
}

r.post('/lessons/:id/complete', (req, res) => {
  const courseId = lessonCourseId(req.params.id);
  if (!courseId || !canAccessCourse(req.user, courseId)) return res.status(403).json({ error: 'Рұқсат жоқ' });
  const tree = courseTree(req.user, courseId);
  const me = tree.modules.flatMap((m) => m.lessons).find((x) => x.id === Number(req.params.id));
  if (!me || me.state === 'locked') return res.status(423).json({ error: 'Алдымен алдыңғы сабақты аяқтаңыз' });
  const t = completeLesson(req.user, Number(req.params.id));
  res.json({ ok: true, percent: t.percent, next: t.next });
});

// auto-checked practice (single / tf / fill / match)
r.post('/exercises/:id/check', (req, res) => {
  const e = get('SELECT * FROM exercises WHERE id = ?', req.params.id);
  if (!e) return res.status(404).json({ error: 'Табылмады' });
  const ok = grade(exerciseAsQuestion(e), req.body?.given);
  logActivity(req.user.id, 'practice', e.id);
  res.json({ correct: ok, explanation: e.explanation, answer: correctAnswerText(exerciseAsQuestion(e)) });
});

// ---------------- submissions (homework, voice recordings) ----------------
r.post('/submissions', privateUpload.single('file'), (req, res) => {
  const { exercise_id, assignment_id, text } = req.body || {};
  if (!exercise_id && !assignment_id) return res.status(400).json({ error: 'Тапсырма көрсетілмеген' });
  const kind = req.file ? (req.file.mimetype.startsWith('audio/') ? 'audio' : 'upload') : 'text';
  if (kind === 'text' && !String(text || '').trim()) return res.status(400).json({ error: 'Жауап бос' });
  const id = insert('submissions', {
    user_id: req.user.id, exercise_id: exercise_id ? Number(exercise_id) : null, assignment_id: assignment_id ? Number(assignment_id) : null,
    kind, text: text || null, file_path: req.file ? fileUrl('private', req.file.filename) : null, file_name: req.file?.originalname || null,
  });
  logActivity(req.user.id, 'practice', id);
  res.json(lastSubmission(req.user.id, exercise_id ? { exercise_id } : { assignment_id }));
});

r.get('/practice', (req, res) => {
  const ids = accessibleCourseIds(req.user);
  const groups = userGroupIds(req.user.id);
  const inCourses = ids.length ? `m.course_id IN (${ids.map(Number).join(',')})` : '0';
  const assignments = all(`SELECT a.*, l.title AS lesson_title FROM assignments a LEFT JOIN lessons l ON l.id = a.lesson_id
      LEFT JOIN modules m ON m.id = l.module_id WHERE (a.lesson_id IS NULL OR ${inCourses}) ORDER BY a.due_at IS NULL, a.due_at`)
    .filter((a) => isStaff(req.user) || !a.group_id || groups.includes(a.group_id))
    .map((a) => ({ ...a, submission: lastSubmission(req.user.id, { assignment_id: a.id }) }));
  const recordings = all(`SELECT e.*, l.title AS lesson_title FROM exercises e JOIN lessons l ON l.id = e.lesson_id JOIN modules m ON m.id = l.module_id
      WHERE e.type = 'read_aloud' AND ${inCourses} AND ${pubFilter(req.user, 'l')} ORDER BY m.sort, l.sort`)
    .map((e) => ({ ...publicExercise(e), lesson_title: e.lesson_title, submission: lastSubmission(req.user.id, { exercise_id: e.id }) }));
  const history = all(`SELECT s.*, COALESCE(a.title, e.prompt) AS title FROM submissions s LEFT JOIN assignments a ON a.id = s.assignment_id
      LEFT JOIN exercises e ON e.id = s.exercise_id WHERE s.user_id = ? ORDER BY s.id DESC LIMIT 30`, req.user.id)
    .map((s) => ({ ...s, feedback: all('SELECT f.*, u.name AS teacher FROM teacher_feedback f LEFT JOIN users u ON u.id=f.teacher_id WHERE submission_id = ?', s.id) }));
  res.json({ assignments, recordings, history });
});

// ---------------- tafsir ----------------
r.get('/tafsir', (req, res) => {
  const rows = all(`SELECT id, name_kk, name_ar, name_meaning, ayah_count, revelation, description, duration_min, teacher_name, youtube_url, status, reviewed_by, is_demo
    FROM surahs WHERE ${pubFilter(req.user)} ORDER BY id DESC`);
  const viewed = new Set(all(`SELECT DISTINCT ref_id FROM activity WHERE user_id = ? AND kind='tafsir_view'`, req.user.id).map((x) => x.ref_id));
  const hifz = hifzMap(req.user.id);
  res.json(rows.map((s) => ({ ...s, viewed: viewed.has(s.id), hifz: hifz.get(s.id) || null, verified: s.status === 'published' && !!s.reviewed_by, reviewed_by: undefined })));
});

r.get('/tafsir/:id', (req, res) => {
  const s = get(`SELECT * FROM surahs WHERE id = ? AND ${pubFilter(req.user)}`, req.params.id);
  if (!s) return res.status(404).json({ error: 'Сүре табылмады' });
  logActivity(req.user.id, 'tafsir_view', s.id);
  const ayahs = all('SELECT * FROM ayahs WHERE surah_id = ? ORDER BY number', s.id)
    .map((a) => ({ ...a, bookmarked: bookmarked(req.user.id, 'ayah', a.id) }));
  const test = get(`SELECT id, title FROM tests WHERE surah_id = ? AND status = 'published'`, s.id);
  const nav = { prev: get(`SELECT id, name_kk FROM surahs WHERE id < ? AND ${pubFilter(req.user)} ORDER BY id DESC LIMIT 1`, s.id), next: get(`SELECT id, name_kk FROM surahs WHERE id > ? AND ${pubFilter(req.user)} ORDER BY id LIMIT 1`, s.id) };
  res.json({ surah: { ...s, takeaways: parse(s.takeaways, []), reviewed_by: undefined }, verification: verification(s), ayahs, test, nav, bookmarked: bookmarked(req.user.id, 'surah', s.id), hifz: hifzMap(req.user.id).get(s.id) || null });
});

// ---------------- memorisation (hifz) ----------------
function hifzMap(uid) { return new Map(all('SELECT surah_id, status FROM memorization WHERE user_id = ?', uid).map((r) => [r.surah_id, r.status])); }
function hifzSummary(uid) {
  const total = get(`SELECT count(*) n FROM surahs WHERE id >= 78 AND status = 'published'`).n;
  const r = get(`SELECT sum(status='memorized') m, sum(status='learning') l FROM memorization WHERE user_id = ? AND surah_id >= 78`, uid);
  return { total, memorized: r.m || 0, learning: r.l || 0 };
}
r.get('/hifz', (req, res) => {
  const map = hifzMap(req.user.id);
  const rows = all(`SELECT id, name_kk, name_ar, name_meaning, ayah_count FROM surahs WHERE id >= 78 AND ${pubFilter(req.user)} ORDER BY id DESC`)
    .map((s) => ({ ...s, status: map.get(s.id) || null }));
  res.json({ ...hifzSummary(req.user.id), surahs: rows });
});
r.post('/hifz/:id', (req, res) => {
  const st = req.body?.status;
  if (!get('SELECT 1 FROM surahs WHERE id = ?', req.params.id)) return res.status(404).json({ error: 'Сүре табылмады' });
  if (st === 'learning' || st === 'memorized') {
    run(`INSERT INTO memorization (user_id, surah_id, status) VALUES (?,?,?) ON CONFLICT(user_id, surah_id) DO UPDATE SET status = excluded.status, updated_at = datetime('now')`, req.user.id, req.params.id, st);
    logActivity(req.user.id, 'practice', Number(req.params.id));
  } else run('DELETE FROM memorization WHERE user_id = ? AND surah_id = ?', req.user.id, req.params.id);
  res.json({ status: st || null, summary: hifzSummary(req.user.id) });
});

// ---------------- alphabet ----------------
r.get('/letters', (_req, res) => res.json(LETTERS.map(([ch, name, sound, makhraj, heavy, joins, example, meaning]) => ({
  ch, name, sound, makhraj, heavy: !!heavy, joins: !!joins, example, meaning,
  forms: joins ? { isolated: ch, initial: ch + '\u0640', medial: '\u0640' + ch + '\u0640', final: '\u0640' + ch } : { isolated: ch, initial: ch, medial: '\u0640' + ch, final: '\u0640' + ch },
}))));

// ---------------- knowledge base ----------------
r.get('/kb', (req, res) => {
  const cat = req.query.category;
  const rows = all(`SELECT id, slug, category, section, title, summary, arabic, rule_tag, youtube_url, status, is_demo FROM kb_topics
    WHERE ${pubFilter(req.user)} ${cat ? 'AND category = ?' : ''} ORDER BY category, sort, id`, ...(cat ? [cat] : []));
  const counts = all(`SELECT category, count(*) n FROM kb_topics WHERE ${pubFilter(req.user)} GROUP BY category`);
  res.json({ topics: rows, counts: Object.fromEntries(counts.map((c) => [c.category, c.n])) });
});

r.get('/kb/:slug', (req, res) => {
  const t = get(`SELECT * FROM kb_topics WHERE slug = ? AND ${pubFilter(req.user)}`, req.params.slug);
  if (!t) return res.status(404).json({ error: 'Мақала табылмады' });
  logActivity(req.user.id, 'topic_view', t.id);
  const exercises = all('SELECT * FROM exercises WHERE topic_id = ? ORDER BY sort, id', t.id).map(publicExercise);
  const test = get(`SELECT id, title FROM tests WHERE topic_id = ? AND status='published'`, t.id);
  const lesson = t.lesson_id ? get('SELECT id, title FROM lessons WHERE id = ?', t.lesson_id) : null;
  const related = all(`SELECT slug, title, section FROM kb_topics WHERE category = ? AND id != ? AND ${pubFilter(req.user)} ORDER BY sort LIMIT 6`, t.category, t.id);
  const mistakes = t.rule_tag ? get('SELECT count(*) n FROM mistakes WHERE user_id = ? AND rule_tag = ? AND resolved = 0', req.user.id, t.rule_tag).n : 0;
  res.json({ topic: { ...t, examples: parse(t.examples, []), reviewed_by: undefined }, verification: verification(t), exercises, test, lesson, related, myMistakes: mistakes, bookmarked: bookmarked(req.user.id, 'topic', t.id) });
});

// ---------------- arabic & dictionary ----------------
r.get('/arabic', (req, res) => {
  const mine = new Set(accessibleCourseIds(req.user));
  const courses = all(`SELECT * FROM courses WHERE direction = 'arabic' AND ${pubFilter(req.user)} ORDER BY sort, id`).map((c) => {
    if (!mine.has(c.id)) return { ...c, hasAccess: false };
    const t = courseTree(req.user, c.id);
    return { ...c, hasAccess: true, percent: t.percent, done: t.done, total: t.total, next: t.next, modules: t.modules.map((m) => ({ id: m.id, title: m.title, percent: m.percent, total: m.total })) };
  });
  res.json({ courses, words: get('SELECT count(*) n FROM words').n });
});

r.get('/words', (req, res) => {
  const q = String(req.query.q || '').trim();
  const level = req.query.level;
  const where = []; const p = [];
  if (q) { where.push('(arabic LIKE ? OR translit LIKE ? OR lower(meaning) LIKE lower(?))'); p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (level) { where.push('level = ?'); p.push(level); }
  if (req.query.topic) { where.push('topic = ?'); p.push(req.query.topic); }
  const rows = all(`SELECT * FROM words ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id LIMIT 300`, ...p);
  const saved = new Set(all(`SELECT item_id FROM bookmarks WHERE user_id = ? AND item_type = 'word'`, req.user.id).map((x) => x.item_id));
  res.json(rows.map((w) => ({ ...w, saved: saved.has(w.id) })));
});

r.get('/words/topics', (_req, res) => res.json(all('SELECT topic, count(*) n FROM words GROUP BY topic ORDER BY min(id)')));

// ---------------- search ----------------
r.get('/search', (req, res) => {
  const q = String(req.query.q || '').slice(0, 120);
  const results = search(req.user, q);
  const counts = results.reduce((a, x) => ((a[x.kind] = (a[x.kind] || 0) + 1), a), {});
  res.json({ q, counts, results });
});

// ---------------- tests ----------------
r.get('/tests', (req, res) => {
  const rows = all(`SELECT t.*, (SELECT count(*) FROM questions q WHERE q.test_id = t.id) AS count,
    (SELECT max(score) FROM test_attempts a WHERE a.test_id = t.id AND a.user_id = ?) AS best,
    (SELECT count(*) FROM test_attempts a WHERE a.test_id = t.id AND a.user_id = ?) AS attempts
    FROM tests t WHERE ${pubFilter(req.user, 't')} ORDER BY t.id`, req.user.id, req.user.id);
  res.json(rows);
});

r.get('/tests/:id', (req, res) => {
  const t = get(`SELECT * FROM tests WHERE id = ? AND ${pubFilter(req.user)}`, req.params.id);
  if (!t) return res.status(404).json({ error: 'Тест табылмады' });
  const qs = all('SELECT * FROM questions WHERE test_id = ? ORDER BY sort, id', t.id).map(publicQuestion);
  const history = all('SELECT score, created_at FROM test_attempts WHERE test_id = ? AND user_id = ? ORDER BY id DESC LIMIT 5', t.id, req.user.id);
  res.json({ test: t, questions: qs, history });
});

function checkQuestion(qid, given) {
  const q = get('SELECT * FROM questions WHERE id = ?', qid);
  if (!q) return null;
  const correct = grade(q, given);
  return { q, correct, explanation: q.explanation, answer: correctAnswerText(q), rule: q.rule_tag && RULE_TAGS[q.rule_tag] };
}

// instant feedback per question ("✓ Дұрыс / ✕ Қате" + "Неге?")
r.post('/questions/:id/check', (req, res) => {
  const c = checkQuestion(req.params.id, req.body?.given);
  if (!c) return res.status(404).json({ error: 'Сұрақ табылмады' });
  const { q, ...out } = c;
  res.json(out);
});

r.post('/tests/:id/submit', (req, res) => {
  const t = get('SELECT * FROM tests WHERE id = ?', req.params.id);
  if (!t) return res.status(404).json({ error: 'Тест табылмады' });
  const given = req.body?.answers || {};
  const qs = all('SELECT * FROM questions WHERE test_id = ?', t.id);
  const results = qs.map((q) => ({ id: q.id, correct: grade(q, given[q.id]), given: given[q.id] }));
  const correct = results.filter((x) => x.correct).length;
  const score = qs.length ? Math.round((correct / qs.length) * 100) : 0;
  const attemptId = tx(() => {
    const id = insert('test_attempts', { user_id: req.user.id, test_id: t.id, score, correct, total: qs.length });
    for (const x of results) insert('answers', { attempt_id: id, question_id: x.id, user_id: req.user.id, given: JSON.stringify(x.given ?? null), correct: x.correct ? 1 : 0 });
    logActivity(req.user.id, 'test', t.id);
    return id;
  });
  res.json({ attempt_id: attemptId, score, correct, total: qs.length, passed: score >= t.pass_score });
});

// ---------------- daily review ----------------
r.get('/review/today', (req, res) => res.json(dailyReview(req.user)));
r.post('/review/complete', (req, res) => {
  if (!dailyReview(req.user).done) logActivity(req.user.id, 'review');
  res.json({ ok: true, streak: streak(req.user.id) });
});

// ---------------- materials ----------------
r.get('/materials', (req, res) => {
  const ids = accessibleCourseIds(req.user);
  const rows = all(`SELECT m.*, c.title AS course_title FROM materials m LEFT JOIN courses c ON c.id = m.course_id WHERE ${pubFilter(req.user, 'm')} ORDER BY m.id DESC`)
    .filter((m) => !m.course_id || ids.includes(m.course_id));
  res.json(rows);
});

// ---------------- calendar ----------------
r.get('/calendar', (req, res) => {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : localDate();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : (() => { const d = new Date(from); d.setDate(d.getDate() + 6); return localDate(d); })();
  res.json({ from, to, events: eventOccurrences(req.user, from, to), live: liveNow(req.user) });
});

// ---------------- progress & mistakes & certificates ----------------
r.get('/progress', (req, res) => {
  const u = req.user;
  const ov = overall(u);
  const tests = get('SELECT round(avg(best)) avg FROM (SELECT max(score) best FROM test_attempts WHERE user_id = ? GROUP BY test_id)', u.id).avg;
  const attempts = all(`SELECT ta.score, ta.created_at, t.title, t.id AS test_id FROM test_attempts ta JOIN tests t ON t.id = ta.test_id WHERE ta.user_id = ? ORDER BY ta.created_at DESC LIMIT 10`, u.id);
  const certs = all(`SELECT c.*, co.title FROM certificates c JOIN courses co ON co.id = c.course_id WHERE c.user_id = ?`, u.id);
  const activity = all(`SELECT date(created_at) d, count(*) n FROM activity WHERE user_id = ? AND kind != 'login' AND created_at > datetime('now','-28 days') GROUP BY d`, u.id);
  res.json({
    percent: ov.percent,
    lessons: ov.done,
    tasks: get('SELECT count(*) n FROM submissions WHERE user_id = ?', u.id).n + get(`SELECT count(DISTINCT ref_id) n FROM activity WHERE user_id = ? AND kind = 'practice'`, u.id).n,
    testAvg: tests,
    tafsir: get(`SELECT count(DISTINCT ref_id) n FROM activity WHERE user_id = ? AND kind = 'tafsir_view'`, u.id).n,
    quranPractice: get(`SELECT count(*) n FROM submissions WHERE user_id = ? AND kind = 'audio'`, u.id).n,
    streak: streak(u.id),
    courses: ov.trees.map((t) => ({ id: t.course.id, title: t.course.title, color: t.course.color, percent: t.percent, done: t.done, total: t.total, modules: t.modules.map((m) => ({ id: m.id, title: m.title, percent: m.percent, state: m.state })) })),
    attempts, certificates: certs, mistakes: mistakeSummary(u.id), activity, hifz: hifzSummary(u.id),
  });
});

r.get('/mistakes', (req, res) => res.json(mistakeSummary(req.user.id)));
r.post('/mistakes/:tag/resolve', (req, res) => {
  run('UPDATE mistakes SET resolved = 1 WHERE user_id = ? AND rule_tag = ?', req.user.id, req.params.tag);
  res.json({ ok: true });
});

r.get('/certificates/:id', (req, res) => {
  const c = get(`SELECT c.*, co.title AS course_title, u.name AS student FROM certificates c JOIN courses co ON co.id = c.course_id JOIN users u ON u.id = c.user_id WHERE c.id = ?`, req.params.id);
  if (!c || (c.user_id !== req.user.id && !isStaff(req.user))) return res.status(404).json({ error: 'Табылмады' });
  res.json(c);
});

// ---------------- bookmarks ----------------
const BOOKMARK_TYPES = ['lesson', 'ayah', 'topic', 'word', 'surah', 'exercise', 'material', 'video'];
r.get('/bookmarks', (req, res) => res.json(all('SELECT * FROM bookmarks WHERE user_id = ? ORDER BY id DESC', req.user.id)));
r.post('/bookmarks', (req, res) => {
  const { item_type, item_id, title, subtitle, link } = req.body || {};
  if (!BOOKMARK_TYPES.includes(item_type) || !Number(item_id)) return res.status(400).json({ error: 'Қате дерек' });
  const existing = get('SELECT id FROM bookmarks WHERE user_id=? AND item_type=? AND item_id=?', req.user.id, item_type, item_id);
  if (existing) { run('DELETE FROM bookmarks WHERE id = ?', existing.id); return res.json({ saved: false }); }
  insert('bookmarks', { user_id: req.user.id, item_type, item_id: Number(item_id), title: String(title || '').slice(0, 200), subtitle: subtitle ? String(subtitle).slice(0, 300) : null, link: String(link || '').startsWith('/') ? link : null });
  res.json({ saved: true });
});

// ---------------- questions to teacher ----------------
function threadOut(t) {
  return { ...t, author: get('SELECT name FROM users WHERE id = ?', t.user_id)?.name, replies: all(`SELECT r.*, u.name, u.role FROM qa_replies r JOIN users u ON u.id = r.user_id WHERE thread_id = ? ORDER BY r.id`, t.id) };
}
r.get('/questions', (req, res) => {
  const staff = isStaff(req.user) && req.query.scope === 'all';
  const rows = staff ? all('SELECT * FROM qa_threads ORDER BY status = \'answered\', id DESC LIMIT 200') : all('SELECT * FROM qa_threads WHERE user_id = ? ORDER BY id DESC', req.user.id);
  res.json(rows.map(threadOut));
});
r.post('/questions', privateUpload.single('file'), (req, res) => {
  const { category, text } = req.body || {};
  if (!QA_CATEGORIES.includes(category) || !String(text || '').trim()) return res.status(400).json({ error: 'Санат пен сұрақ мәтінін толтырыңыз' });
  const id = insert('qa_threads', { user_id: req.user.id, category, text: String(text).trim(), file_path: req.file ? fileUrl('private', req.file.filename) : null, file_name: req.file?.originalname || null });
  // notify the student's teachers/curators
  const staff = all(`SELECT DISTINCT x.id FROM groups g JOIN group_members gm ON gm.group_id = g.id JOIN users x ON x.id IN (g.teacher_id, g.curator_id) WHERE gm.user_id = ?`, req.user.id);
  staff.forEach((s) => notify(s.id, `Жаңа сұрақ: ${category}`, `${req.user.name}: ${String(text).slice(0, 80)}`, '/teach/questions', 'question'));
  res.json(threadOut(get('SELECT * FROM qa_threads WHERE id = ?', id)));
});
r.post('/questions/:id/reply', (req, res) => {
  const t = get('SELECT * FROM qa_threads WHERE id = ?', req.params.id);
  const text = String(req.body?.text || '').trim();
  if (!t || !text) return res.status(400).json({ error: 'Қате дерек' });
  const staff = isStaff(req.user);
  if (!staff && t.user_id !== req.user.id) return res.status(403).json({ error: 'Рұқсат жоқ' });
  insert('qa_replies', { thread_id: t.id, user_id: req.user.id, text });
  if (staff) {
    run("UPDATE qa_threads SET status = 'answered' WHERE id = ?", t.id);
    notify(t.user_id, 'Ұстаз сұрағыңызға жауап берді', text.slice(0, 100), '/questions', 'answer');
  } else run("UPDATE qa_threads SET status = 'open' WHERE id = ?", t.id);
  res.json(threadOut(get('SELECT * FROM qa_threads WHERE id = ?', t.id)));
});

// ---------------- notifications ----------------
r.get('/notifications', (req, res) => res.json(all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', req.user.id)));
r.post('/notifications/read', (req, res) => {
  if (req.body?.id) run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', req.body.id, req.user.id);
  else run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user.id);
  res.json({ ok: true });
});

export default r;
