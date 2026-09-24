// First-run setup for a cloud database: fills an empty database with the exported content
// (the same JSON the serverless site uses) and creates an administrator account.
// Runs once per cold start, so hosting needs no terminal commands.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, get, run, query, DIALECT, sqlNow } from './db.js';
import { hashPassword } from './auth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, '..', 'client', 'public', 'data');
const read = (name) => JSON.parse(fs.readFileSync(path.join(DATA, `${name}.json`), 'utf8'));
const J = JSON.stringify;

/** Inserts many rows in one statement (cloud databases are slow one row at a time). */
async function insertMany(table, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const values = chunk.map(() => `(${keys.map(() => '?').join(',')})`).join(',');
    const params = chunk.flatMap((r) => keys.map((k) => r[k] ?? null));
    await query(`INSERT INTO ${table} (${keys.join(',')}) VALUES ${values} ON CONFLICT DO NOTHING`, ...params);
  }
  if (DIALECT === 'pg' && keys.includes('id')) {
    await query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM ${table}))`).catch(() => {});
  }
}

async function importExported() {
  const courses = read('courses'); const surahs = read('surahs'); const kb = read('kb');
  const tests = read('tests'); const words = read('words'); const materials = read('materials'); const events = read('events');
  const now = sqlNow();

  const src = await get('SELECT id FROM sources WHERE title = ?', 'Hakk Academy оқу бағдарламасы')
    || { id: await (await import('./db.js')).insert('sources', { title: 'Hakk Academy оқу бағдарламасы', author: 'Hakk Academy ұстаздары' }) };

  await insertMany('courses', courses.map((c, i) => ({ id: c.id, title: c.title, subtitle: c.subtitle, description: c.description, direction: c.direction, level: c.level, color: c.color, sequential: 1, status: 'published', sort: i + 1, created_at: now })));
  await insertMany('modules', courses.flatMap((c) => c.modules.map((m, i) => ({ id: m.id, course_id: c.id, title: m.title, description: m.description, sort: i + 1 }))));
  await insertMany('lessons', courses.flatMap((c) => c.modules.flatMap((m) => m.lessons.map((l, i) => ({
    id: l.id, module_id: m.id, title: l.title, goal: l.goal, youtube_url: l.youtube_url, duration_min: l.duration_min,
    key_concept: l.key_concept, remember: l.remember, example: l.example, example_ar: l.example_ar, common_mistake: l.common_mistake,
    body: l.body, rule_tag: l.rule_tag, sort: i + 1, status: 'published', source_id: src.id, is_demo: 1, updated_at: now,
  })))));
  await insertMany('surahs', surahs.map((s) => ({
    id: s.id, name_kk: s.name_kk, name_ar: s.name_ar, name_meaning: s.name_meaning, ayah_count: s.ayah_count, revelation: s.revelation,
    description: s.description, audio_url: s.audio_url, youtube_url: s.youtube_url, duration_min: s.duration_min, teacher_name: s.teacher_name,
    takeaways: J(s.takeaways || []), reflection: s.reflection, status: 'published', source_id: src.id, is_demo: 1, updated_at: now,
  })));
  await insertMany('ayahs', surahs.flatMap((s) => s.ayahs.map((a) => ({ id: a.id, surah_id: s.id, number: a.number, arabic: a.arabic, global_number: a.global_number, translation: a.translation, translation_source: a.translation_source, explanation: a.explanation, key_meaning: a.key_meaning }))));
  await insertMany('kb_topics', kb.map((t) => ({
    id: t.id, slug: t.slug, category: t.category, section: t.section, title: t.title, summary: t.summary, simple: t.simple, rule: t.rule,
    examples: J(t.examples || []), arabic: t.arabic, audio_url: t.audio_url, youtube_url: t.youtube_url, mistakes: t.mistakes,
    lesson_id: t.lesson_id, rule_tag: t.rule_tag, sort: 0, status: 'published', source_id: src.id, is_demo: 1, updated_at: now,
  })));
  await insertMany('tests', tests.map((t) => ({ id: t.id, title: t.title, description: t.description, category: t.category, pass_score: t.pass_score, lesson_id: t.lesson_id, surah_id: t.surah_id, topic_id: t.topic_id, status: 'published', created_at: now })));
  await insertMany('questions', tests.flatMap((t) => t.questions.map((q, i) => ({ id: q.id, test_id: t.id, type: q.type, prompt: q.prompt, arabic: q.arabic, audio_url: q.audio_url, options: J(q.options ?? null), answer: J(q.answer ?? null), explanation: q.explanation, rule_tag: q.rule_tag, sort: i + 1 }))));
  const exercises = [
    ...courses.flatMap((c) => c.modules.flatMap((m) => m.lessons.flatMap((l) => (l.exercises || []).map((e, i) => ({ id: e.id, lesson_id: l.id, topic_id: null, type: e.type, prompt: e.prompt, arabic: e.arabic, data: J(e.data || {}), explanation: e.explanation, sort: i + 1 }))))),
    ...kb.flatMap((t) => (t.exercises || []).map((e, i) => ({ id: e.id, lesson_id: null, topic_id: t.id, type: e.type, prompt: e.prompt, arabic: e.arabic, data: J(e.data || {}), explanation: e.explanation, sort: i + 1 }))),
  ];
  await insertMany('exercises', exercises);
  await insertMany('words', words.map((w) => ({ id: w.id, arabic: w.arabic, translit: w.translit, meaning: w.meaning, level: w.level, topic: w.topic, audio_url: w.audio_url, example_ar: w.example_ar, example_kk: w.example_kk, in_quran: w.in_quran, quran_ref: w.quran_ref })));
  await insertMany('materials', materials.map((m) => ({ id: m.id, title: m.title, description: m.description, kind: m.kind, category: m.category, url: m.url, course_id: m.course_id, status: 'published', created_at: now })));
  await insertMany('events', events.map((e) => ({ id: e.id, title: e.title, kind: e.kind, weekday: e.weekday, time: e.time, starts_at: e.starts_at, duration_min: e.duration_min, teacher_name: e.teacher_name, format: e.format, link: e.link, location: e.location, recording_url: e.recording_url })));

  // every published course is open to everyone who signs in
  const { insert } = await import('./db.js');
  for (const c of courses) {
    if (!(await get('SELECT 1 FROM course_access WHERE course_id = ? AND user_id IS NULL AND group_id IS NULL', c.id))) {
      await insert('course_access', { course_id: c.id, granted_at: now });
    }
  }
  return { courses: courses.length, surahs: surahs.length, topics: kb.length, tests: tests.length, words: words.length };
}

let ready = null;
/** Called on every request; does the work only once, and only when the database is empty. */
export function ensureReady() {
  ready ||= (async () => {
    const { insert } = await import('./db.js');
    if (!(await get("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1"))) {
      const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
      await insert('users', { name: 'Әкімші', email: 'admin@hakk.kz', password_hash: hashPassword(pw), role: 'admin', active: 1, locale: 'kk', created_at: sqlNow() });
      console.log(`[setup] admin@hakk.kz password: ${pw}  (change it after the first login)`);
    }
    if (!(await get('SELECT 1 FROM kb_topics LIMIT 1'))) {
      console.log('[setup] empty database — importing exported content…');
      const stats = await importExported();
      const { rebuildSearchIndex } = await import('./services.js');
      await rebuildSearchIndex();
      console.log('[setup] imported', stats);
    }
  })().catch((e) => { ready = null; throw e; });
  return ready;
}
