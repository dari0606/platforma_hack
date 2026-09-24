// Serverless mode: the whole platform runs in the browser from the exported JSON in /data.
// No database, no accounts, no login — progress lives in this browser (localStorage).
// The same screens keep working; only teacher-side features (recordings, review, admin) are absent.

const DATA = {};
const load = async (name) => (DATA[name] ||= fetch(`/data/${name}.json`).then((r) => {
  if (!r.ok) throw new Error(`Мазмұн жүктелмеді: ${name}`);
  return r.json();
}));
const all = (...names) => Promise.all(names.map(load));

// ---------- local progress ----------
const KEY = 'hakk_local_v1';
const empty = { completed: {}, bookmarks: [], hifz: {}, attempts: [], viewed: [], review: null, mistakes: {} };
const readState = () => { try { return { ...empty, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...empty }; } };
let state = readState();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ } };

export const GUEST = { id: 0, name: 'Қонақ', email: null, phone: null, role: 'student', locale: 'kk', is_guest: true, permissions: [], static: true };

const today = () => new Date().toISOString().slice(0, 10);
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- grading (same rules as the server) ----------
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export function grade(q, given) {
  switch (q.type) {
    case 'single': case 'arabic_reading': case 'audio_rule': return Number(given) === Number(q.answer);
    case 'multi': {
      const a = [...(q.answer || [])].map(Number).sort(); const g = [...(given || [])].map(Number).sort();
      return a.length === g.length && a.every((v, i) => v === g[i]);
    }
    case 'tf': return Boolean(given) === Boolean(q.answer) && given !== null && given !== undefined;
    case 'fill': return (Array.isArray(q.answer) ? q.answer : [q.answer]).some((a) => norm(a) === norm(given));
    case 'match': return Array.isArray(given) && (q.options?.pairs || []).length > 0 && q.options.pairs.every((p, i) => norm(given[i]) === norm(p[1]));
    default: return false;
  }
}
function answerText(q) {
  switch (q.type) {
    case 'single': case 'arabic_reading': case 'audio_rule': return q.options?.[q.answer];
    case 'multi': return (q.answer || []).map((i) => q.options?.[i]).join(', ');
    case 'tf': return q.answer ? 'Дұрыс' : 'Қате';
    case 'fill': return Array.isArray(q.answer) ? q.answer[0] : q.answer;
    case 'match': return (q.options?.pairs || []).map((p) => `${p[0]} → ${p[1]}`).join('; ');
    default: return '';
  }
}
const shuffle = (arr, seed = 1) => {
  const a = [...arr]; let s = seed;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const publicQuestion = (q) => (q.type === 'match'
  ? { id: q.id, type: q.type, prompt: q.prompt, arabic: q.arabic, audio_url: q.audio_url, rule_tag: q.rule_tag, left: (q.options?.pairs || []).map((p) => p[0]), right: shuffle((q.options?.pairs || []).map((p) => p[1]), q.id + 7) }
  : { id: q.id, type: q.type, prompt: q.prompt, arabic: q.arabic, audio_url: q.audio_url, rule_tag: q.rule_tag, options: q.options });
const publicExercise = (e) => {
  const base = { id: e.id, type: e.type, prompt: e.prompt, arabic: e.arabic };
  if (e.type === 'match') return { ...base, left: (e.data?.pairs || []).map((p) => p[0]), right: shuffle((e.data?.pairs || []).map((p) => p[1]), e.id + 3) };
  return e.data?.options ? { ...base, options: e.data.options } : base;
};
const asQuestion = (e) => ({ type: e.type, options: e.type === 'match' ? { pairs: e.data?.pairs } : e.data?.options, answer: e.data?.answer });

// ---------- content helpers ----------
const flatLessons = (course) => course.modules.flatMap((m) => m.lessons.map((l) => ({ ...l, module_id: m.id, module_title: m.title, course_id: course.id, course_title: course.title, color: course.color, direction: course.direction })));
const lessonState = (id) => (state.completed[id] ? 'completed' : 'available');
function courseProgress(course) {
  const lessons = flatLessons(course);
  const done = lessons.filter((l) => state.completed[l.id]).length;
  const next = lessons.find((l) => !state.completed[l.id]) || null;
  const modules = course.modules.map((m) => {
    const d = m.lessons.filter((l) => state.completed[l.id]).length;
    return { id: m.id, title: m.title, description: m.description, total: m.lessons.length, done: d,
      percent: m.lessons.length ? Math.round((d / m.lessons.length) * 100) : 0,
      state: m.lessons.length && d === m.lessons.length ? 'completed' : 'active',
      lessons: m.lessons.map((l) => ({ id: l.id, title: l.title, duration_min: l.duration_min, status: 'published', state: lessonState(l.id) })) };
  });
  return { course: { id: course.id, title: course.title, subtitle: course.subtitle, description: course.description, direction: course.direction, level: course.level, color: course.color },
    modules, total: lessons.length, done, percent: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
    next: next && { id: next.id, title: next.title, module: next.module_title } };
}
const bookmarked = (type, id) => state.bookmarks.some((b) => b.item_type === type && b.item_id === id);
const testFor = (tests, id) => tests.find((t) => t.id === id) || null;

// ---------- search ----------
const STOP = new Set(['деген', 'дегеніміз', 'не', 'қалай', 'қандай', 'бұл', 'және', 'мен', 'ма', 'ме', 'ба', 'бе', 'па', 'пе', 'үшін', 'қай', 'нені', 'неге', 'что', 'такое', 'как', 'это']);
const SYN = { тажвид: 'тәжуид', таджвид: 'тәжуид', тажуид: 'тәжуид', гунна: 'ғунна', мад: 'мәд', мадд: 'мәд', тафсир: 'тәпсір', тәфсир: 'тәпсір', калкала: 'қалқала', ихлас: 'ықылас', ыхлас: 'ықылас', сура: 'сүре', харакат: 'харакаттар' };
const stems = (q) => String(q).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
  .filter((t) => t && !STOP.has(t)).map((t) => { t = SYN[t] || t; return t.length >= 6 ? t.slice(0, Math.max(4, t.length - 3)) : t; });

function runSearch(index, q) {
  const terms = stems(q);
  if (!terms.length) return [];
  const scored = [];
  for (const row of index) {
    const title = (row.title || '').toLowerCase();
    const body = (row.body || '').toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 8;
      const hits = body.split(t).length - 1;
      score += Math.min(hits, 5);
    }
    if (score > 0) {
      const t0 = terms.find((t) => body.includes(t));
      let snippet = '';
      if (t0) {
        const i = body.indexOf(t0);
        const raw = (row.body || '').slice(Math.max(0, i - 40), i + 80);
        snippet = (i > 40 ? '…' : '') + raw.replace(new RegExp(`(${t0}[\\p{L}]*)`, 'giu'), '<mark>$1</mark>') + '…';
      }
      scored.push({ ...row, snippet, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 60);
}

// ---------- endpoint handlers ----------
const ok = (data) => data;
const routes = [
  ['GET', /^\/api\/health$/, async () => ({ ok: true, mode: 'static' })],
  ['GET', /^\/api\/auth\/me$/, async () => ({ user: GUEST, demo: false, guest: true, static: true })],
  ['POST', /^\/api\/auth\/logout$/, async () => ({ ok: true })],
  ['GET', /^\/api\/meta$/, async () => load('meta')],
  ['GET', /^\/api\/letters$/, async () => load('letters')],

  ['GET', /^\/api\/courses$/, async () => {
    const courses = await load('courses');
    return courses.map((c) => { const p = courseProgress(c); return { ...p.course, percent: p.percent, done: p.done, total: p.total, next: p.next, modules: p.modules.map((m) => ({ id: m.id, title: m.title, percent: m.percent, state: m.state, total: m.total })) }; });
  }],
  ['GET', /^\/api\/courses\/(\d+)$/, async (m) => {
    const courses = await load('courses');
    const c = courses.find((x) => x.id === Number(m[1]));
    if (!c) throw new Error('Курс табылмады');
    return { ...courseProgress(c), certificate: null };
  }],
  ['GET', /^\/api\/lessons$/, async () => {
    const courses = await load('courses');
    return courses.flatMap(flatLessons).map((l) => ({ id: l.id, title: l.title, duration_min: l.duration_min, youtube_url: l.youtube_url, goal: l.goal, course_id: l.course_id, course_title: l.course_title, direction: l.direction, color: l.color, module_title: l.module_title, state: lessonState(l.id) }));
  }],
  ['GET', /^\/api\/lessons\/(\d+)$/, async (m) => {
    const [courses, tests] = await all('courses', 'tests');
    const id = Number(m[1]);
    const course = courses.find((c) => c.modules.some((x) => x.lessons.some((l) => l.id === id)));
    if (!course) throw new Error('Сабақ табылмады');
    const p = courseProgress(course);
    const flat = flatLessons(course);
    const idx = flat.findIndex((l) => l.id === id);
    const lesson = flat[idx];
    return {
      lesson, verification: lesson.verification, course: p.course, module_id: lesson.module_id,
      modules: p.modules.map((mm) => ({ id: mm.id, title: mm.title, percent: mm.percent, lessons: mm.lessons })),
      prev: flat[idx - 1] ? { id: flat[idx - 1].id, title: flat[idx - 1].title } : null,
      next: flat[idx + 1] ? { id: flat[idx + 1].id, title: flat[idx + 1].title, state: lessonState(flat[idx + 1].id) } : null,
      state: lessonState(id), exercises: (lesson.exercises || []).map(publicExercise),
      test: lesson.test_id ? { id: lesson.test_id, title: testFor(tests, lesson.test_id)?.title } : null,
      assignments: [], bookmarked: bookmarked('lesson', id), percent: p.percent,
    };
  }],
  ['POST', /^\/api\/lessons\/(\d+)\/complete$/, async (m) => {
    const id = Number(m[1]);
    state.completed[id] = new Date().toISOString(); save();
    const courses = await load('courses');
    const course = courses.find((c) => c.modules.some((x) => x.lessons.some((l) => l.id === id)));
    const p = courseProgress(course);
    return { ok: true, percent: p.percent, next: p.next };
  }],
  ['POST', /^\/api\/exercises\/(\d+)\/check$/, async (m, body) => {
    const [courses, kb] = await all('courses', 'kb');
    const list = [...courses.flatMap(flatLessons).flatMap((l) => l.exercises || []), ...kb.flatMap((t) => t.exercises || [])];
    const e = list.find((x) => x.id === Number(m[1]));
    if (!e) throw new Error('Табылмады');
    const q = asQuestion(e);
    return { correct: grade(q, body?.given), explanation: e.explanation, answer: answerText({ ...q, options: q.options }) };
  }],

  ['GET', /^\/api\/tafsir$/, async () => {
    const surahs = await load('surahs');
    return surahs.slice().reverse().map((s) => ({ id: s.id, name_kk: s.name_kk, name_ar: s.name_ar, name_meaning: s.name_meaning, ayah_count: s.ayah_count, revelation: s.revelation, description: s.description, duration_min: s.duration_min, teacher_name: s.teacher_name, youtube_url: s.youtube_url, status: 'published', is_demo: s.verification?.is_demo, verified: s.verification?.verified, viewed: state.viewed.includes(s.id), hifz: state.hifz[s.id] || null }));
  }],
  ['GET', /^\/api\/tafsir\/(\d+)$/, async (m) => {
    const [surahs, tests] = await all('surahs', 'tests');
    const id = Number(m[1]);
    const s = surahs.find((x) => x.id === id);
    if (!s) throw new Error('Сүре табылмады');
    if (!state.viewed.includes(id)) { state.viewed.push(id); save(); }
    const i = surahs.findIndex((x) => x.id === id);
    return {
      surah: s, verification: s.verification,
      ayahs: s.ayahs.map((a) => ({ ...a, bookmarked: bookmarked('ayah', a.id) })),
      test: s.test_id ? { id: s.test_id, title: testFor(tests, s.test_id)?.title } : null,
      nav: { prev: surahs[i - 1] ? { id: surahs[i - 1].id, name_kk: surahs[i - 1].name_kk } : null, next: surahs[i + 1] ? { id: surahs[i + 1].id, name_kk: surahs[i + 1].name_kk } : null },
      bookmarked: bookmarked('surah', id), hifz: state.hifz[id] || null,
    };
  }],
  ['GET', /^\/api\/hifz$/, async () => {
    const surahs = (await load('surahs')).filter((s) => s.id >= 78);
    const memorized = surahs.filter((s) => state.hifz[s.id] === 'memorized').length;
    const learning = surahs.filter((s) => state.hifz[s.id] === 'learning').length;
    return { total: surahs.length, memorized, learning, surahs: surahs.slice().reverse().map((s) => ({ id: s.id, name_kk: s.name_kk, name_ar: s.name_ar, name_meaning: s.name_meaning, ayah_count: s.ayah_count, status: state.hifz[s.id] || null })) };
  }],
  ['POST', /^\/api\/hifz\/(\d+)$/, async (m, body) => {
    const id = Number(m[1]);
    if (body?.status) state.hifz[id] = body.status; else delete state.hifz[id];
    save();
    const surahs = (await load('surahs')).filter((s) => s.id >= 78);
    return { status: state.hifz[id] || null, summary: { total: surahs.length, memorized: surahs.filter((s) => state.hifz[s.id] === 'memorized').length, learning: surahs.filter((s) => state.hifz[s.id] === 'learning').length } };
  }],

  ['GET', /^\/api\/kb$/, async (m, body, url) => {
    const topics = await load('kb');
    const cat = new URL(url, location.origin).searchParams.get('category');
    const counts = topics.reduce((a, t) => ((a[t.category] = (a[t.category] || 0) + 1), a), {});
    return { topics: (cat ? topics.filter((t) => t.category === cat) : topics).map((t) => ({ id: t.id, slug: t.slug, category: t.category, section: t.section, title: t.title, summary: t.summary, arabic: t.arabic, rule_tag: t.rule_tag, youtube_url: t.youtube_url, status: 'published', is_demo: t.verification?.is_demo })), counts };
  }],
  ['GET', /^\/api\/kb\/([^/?]+)$/, async (m) => {
    const [kb, courses, tests] = await all('kb', 'courses', 'tests');
    const t = kb.find((x) => x.slug === decodeURIComponent(m[1]));
    if (!t) throw new Error('Мақала табылмады');
    const lesson = t.lesson_id ? courses.flatMap(flatLessons).find((l) => l.id === t.lesson_id) : null;
    return {
      topic: t, verification: t.verification, exercises: (t.exercises || []).map(publicExercise),
      test: t.test_id ? { id: t.test_id, title: testFor(tests, t.test_id)?.title } : null,
      lesson: lesson ? { id: lesson.id, title: lesson.title } : null,
      related: kb.filter((x) => x.category === t.category && x.id !== t.id).slice(0, 6).map((x) => ({ slug: x.slug, title: x.title, section: x.section })),
      myMistakes: 0, bookmarked: bookmarked('topic', t.id),
    };
  }],

  ['GET', /^\/api\/arabic$/, async () => {
    const [courses, words] = await all('courses', 'words');
    return { courses: courses.filter((c) => c.direction === 'arabic').map((c) => { const p = courseProgress(c); return { ...p.course, hasAccess: true, percent: p.percent, done: p.done, total: p.total, next: p.next, modules: p.modules.map((mm) => ({ id: mm.id, title: mm.title, percent: mm.percent, total: mm.total })) }; }), words: words.length };
  }],
  ['GET', /^\/api\/words\/topics$/, async () => {
    const words = await load('words');
    const byTopic = new Map();
    for (const w of words) byTopic.set(w.topic, (byTopic.get(w.topic) || 0) + 1);
    return [...byTopic].map(([topic, n]) => ({ topic, n }));
  }],
  ['GET', /^\/api\/words/, async (m, body, url) => {
    const words = await load('words');
    const p = new URL(url, location.origin).searchParams;
    const q = (p.get('q') || '').toLowerCase(); const level = p.get('level'); const topic = p.get('topic');
    return words.filter((w) => (!level || w.level === level) && (!topic || w.topic === topic)
      && (!q || (w.arabic || '').includes(q) || (w.translit || '').toLowerCase().includes(q) || (w.meaning || '').toLowerCase().includes(q)))
      .slice(0, 300).map((w) => ({ ...w, saved: bookmarked('word', w.id) }));
  }],

  ['GET', /^\/api\/search/, async (m, body, url) => {
    const index = await load('search');
    const q = new URL(url, location.origin).searchParams.get('q') || '';
    const results = runSearch(index, q);
    return { q, counts: results.reduce((a, r) => ((a[r.kind] = (a[r.kind] || 0) + 1), a), {}), results };
  }],

  ['GET', /^\/api\/tests$/, async () => {
    const tests = await load('tests');
    return tests.map((t) => {
      const mine = state.attempts.filter((a) => a.test_id === t.id);
      return { id: t.id, title: t.title, description: t.description, category: t.category, pass_score: t.pass_score, status: 'published', count: t.questions.length, best: mine.length ? Math.max(...mine.map((a) => a.score)) : null, attempts: mine.length };
    });
  }],
  ['GET', /^\/api\/tests\/(\d+)$/, async (m) => {
    const tests = await load('tests');
    const t = testFor(tests, Number(m[1]));
    if (!t) throw new Error('Тест табылмады');
    return { test: t, questions: t.questions.map(publicQuestion), history: state.attempts.filter((a) => a.test_id === t.id).slice(-5).reverse() };
  }],
  ['POST', /^\/api\/questions\/(\d+)\/check$/, async (m, body) => {
    const [tests, meta] = await all('tests', 'meta');
    const q = tests.flatMap((t) => t.questions).find((x) => x.id === Number(m[1]));
    if (!q) throw new Error('Сұрақ табылмады');
    const correct = grade(q, body?.given);
    if (!correct && q.rule_tag) { state.mistakes[q.rule_tag] = (state.mistakes[q.rule_tag] || 0) + 1; save(); }
    return { correct, explanation: q.explanation, answer: answerText(q), rule: q.rule_tag && meta.RULE_TAGS[q.rule_tag] };
  }],
  ['POST', /^\/api\/tests\/(\d+)\/submit$/, async (m, body) => {
    const tests = await load('tests');
    const t = testFor(tests, Number(m[1]));
    const given = body?.answers || {};
    const correct = t.questions.filter((q) => grade(q, given[q.id])).length;
    const score = t.questions.length ? Math.round((correct / t.questions.length) * 100) : 0;
    state.attempts.push({ test_id: t.id, title: t.title, score, created_at: new Date().toISOString() }); save();
    return { attempt_id: null, score, correct, total: t.questions.length, passed: score >= t.pass_score };
  }],

  ['GET', /^\/api\/review\/today$/, async () => {
    const [kb, words, surahs, tests, meta] = await all('kb', 'words', 'surahs', 'tests', 'meta');
    const seed = Number(today().replace(/-/g, ''));
    const weak = Object.entries(state.mistakes).sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
    const pool = kb.filter((t) => ['tajweed', 'quran_reading'].includes(t.category));
    const picked = [...pool.filter((t) => weak.includes(t.rule_tag)), ...shuffle(pool, seed)].slice(0, 2);
    const qs = shuffle(tests.flatMap((t) => t.questions).filter((q) => q.type !== 'audio_rule'), seed + 3).slice(0, 5);
    return {
      date: today(), minutes: 8, done: state.review === today(),
      topics: picked.map((t) => ({ id: t.id, slug: t.slug, title: t.title, summary: t.summary, arabic: t.arabic })),
      words: shuffle(words, seed + 1).slice(0, 3), surah: shuffle(surahs, seed + 2)[0] || null,
      questions: qs.map(publicQuestion), weakTags: weak.map((t) => meta.RULE_TAGS[t] || t),
    };
  }],
  ['POST', /^\/api\/review\/complete$/, async () => { state.review = today(); save(); return { ok: true, streak: 1 }; }],

  ['GET', /^\/api\/materials$/, async () => load('materials')],
  ['GET', /^\/api\/calendar/, async (m, body, url) => {
    const events = await load('events');
    const p = new URL(url, location.origin).searchParams;
    const from = p.get('from') || localDate(); const to = p.get('to') || localDate();
    const out = [];
    for (let d = new Date(from + 'T00:00'); d <= new Date(to + 'T23:59'); d.setDate(d.getDate() + 1)) {
      for (const e of events) {
        if (e.weekday != null && e.time && (d.getDay() + 6) % 7 === e.weekday) out.push({ ...e, date: localDate(d), at: `${localDate(d)}T${e.time}` });
      }
    }
    for (const e of events) if (e.starts_at && e.starts_at.slice(0, 10) >= from && e.starts_at.slice(0, 10) <= to) out.push({ ...e, date: e.starts_at.slice(0, 10), at: e.starts_at.slice(0, 16), time: e.starts_at.slice(11, 16) });
    return { from, to, events: out.sort((a, b) => a.at.localeCompare(b.at)), live: events.filter((e) => e.is_live) };
  }],

  ['GET', /^\/api\/progress$/, async () => {
    const [courses, surahs] = await all('courses', 'surahs');
    const per = courses.map(courseProgress);
    const total = per.reduce((s, p) => s + p.total, 0); const done = per.reduce((s, p) => s + p.done, 0);
    const best = new Map();
    for (const a of state.attempts) best.set(a.test_id, Math.max(best.get(a.test_id) || 0, a.score));
    const hifz = surahs.filter((s) => s.id >= 78);
    return {
      percent: total ? Math.round((done / total) * 100) : 0, lessons: done, tasks: 0,
      testAvg: best.size ? Math.round([...best.values()].reduce((a, b) => a + b, 0) / best.size) : null,
      tafsir: state.viewed.length, quranPractice: 0, streak: 0,
      courses: per.map((p) => ({ id: p.course.id, title: p.course.title, color: p.course.color, percent: p.percent, done: p.done, total: p.total, modules: p.modules.map((mm) => ({ id: mm.id, title: mm.title, percent: mm.percent, state: mm.state })) })),
      attempts: state.attempts.slice(-10).reverse(), certificates: [], mistakes: [], activity: [],
      hifz: { total: hifz.length, memorized: hifz.filter((s) => state.hifz[s.id] === 'memorized').length, learning: hifz.filter((s) => state.hifz[s.id] === 'learning').length },
    };
  }],
  ['GET', /^\/api\/mistakes$/, async () => []],
  ['GET', /^\/api\/bookmarks$/, async () => state.bookmarks.slice().reverse()],
  ['POST', /^\/api\/bookmarks$/, async (m, body) => {
    const i = state.bookmarks.findIndex((b) => b.item_type === body.item_type && b.item_id === Number(body.item_id));
    if (i >= 0) { state.bookmarks.splice(i, 1); save(); return { saved: false }; }
    state.bookmarks.push({ id: Date.now(), item_type: body.item_type, item_id: Number(body.item_id), title: body.title, subtitle: body.subtitle, link: body.link, created_at: new Date().toISOString() });
    save(); return { saved: true };
  }],
  ['GET', /^\/api\/notifications$/, async () => []],
  ['POST', /^\/api\/notifications\/read$/, async () => ({ ok: true })],
  ['GET', /^\/api\/practice$/, async () => ({ assignments: [], recordings: [], history: [] })],
  ['GET', /^\/api\/questions$/, async () => []],
  ['GET', /^\/api\/dashboard$/, async () => {
    const [courses, surahs, words, meta] = await all('courses', 'surahs', 'words', 'meta');
    const per = courses.map(courseProgress);
    const current = per.find((p) => p.percent < 100) || per[0] || null;
    const total = per.reduce((s, p) => s + p.total, 0); const done = per.reduce((s, p) => s + p.done, 0);
    const last = state.attempts[state.attempts.length - 1] || null;
    const unseen = surahs.filter((s) => s.youtube_url && !state.viewed.includes(s.id));
    const rec = unseen[unseen.length - 1];
    const quranWords = words.filter((w) => w.in_quran && w.topic === 'Әмма парасындағы сөздер');
    const hifz = surahs.filter((s) => s.id >= 78);
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ date: localDate(d), wd: (d.getDay() + 6) % 7, active: false }); }
    return {
      user: { name: 'Қонақ' },
      current: current && { course: { id: current.course.id, title: current.course.title, color: current.course.color }, percent: current.percent, done: current.done, total: current.total, next: current.next },
      event: null, live: [],
      week: { lessons: 0, tasks: 0, testAvg: last?.score ?? null, streak: 0, percent: total ? Math.round((done / total) * 100) : 0, days },
      lastTest: last && { score: last.score, title: last.title, created_at: last.created_at },
      recommended: rec ? { kind: 'tafsir', title: `${rec.name_kk} сүресінің тәпсірі`, subtitle: rec.teacher_name, arabic: rec.name_ar, minutes: rec.duration_min || 12, link: `/tafsir/${rec.id}` } : null,
      review: { minutes: 8, done: state.review === today(), count: 10, topics: 2, words: 3, surah: true, questions: 5 },
      mistakes: [], unread: 0, certificateReady: [],
      hifz: { total: hifz.length, memorized: hifz.filter((s) => state.hifz[s.id] === 'memorized').length, learning: hifz.filter((s) => state.hifz[s.id] === 'learning').length },
      word: quranWords.length ? quranWords[Number(today().replace(/-/g, '')) % quranWords.length] : null,
    };
  }],
];

/** Handles an API call entirely in the browser. Throws for endpoints that need a server. */
export async function handle(method, url, body) {
  const path = url.split('?')[0];
  for (const [m, re, fn] of routes) {
    if (m !== method) continue;
    const match = re.exec(path);
    if (match) return ok(await fn(match, body, url));
  }
  const err = new Error('Бұл мүмкіндік серверсіз нұсқада қолжетімсіз');
  err.status = 501;
  throw err;
}

export const resetLocalProgress = () => { state = { ...empty }; save(); };
