// Exports all published content into JSON files that ship with the site,
// so the platform can run with no server, no database and no login.
// Usage: npm run export:static   (reads the local SQLite database)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, get, parse } from '../server/db.js';
import { LETTERS } from '../server/seed-data/reference.js';
import { RULE_TAGS, KB_CATEGORIES, QA_CATEGORIES, ROLES, SUBMISSION_STATUS, WEEKDAYS, EVENT_KINDS, CONTENT_STATUS } from '../server/constants.js';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public', 'data');
fs.mkdirSync(out, { recursive: true });
const write = (name, data) => {
  const file = path.join(out, name);
  fs.writeFileSync(file, JSON.stringify(data));
  return `${name} — ${(fs.statSync(file).size / 1024).toFixed(0)} KB`;
};
const sourceOf = async (row) => (row.source_id ? get('SELECT * FROM sources WHERE id = ?', row.source_id) : null);
const verification = async (row) => ({
  status: row.status, verified: row.status === 'published' && !!row.reviewed_by,
  reviewed_by: row.reviewed_by ? (await get('SELECT name FROM users WHERE id = ?', row.reviewed_by))?.name : null,
  reviewed_at: row.reviewed_at, scholar: row.scholar, book: row.book, source: await sourceOf(row), is_demo: !!row.is_demo,
});
const exercisesFor = async (where, id) => (await all(`SELECT * FROM exercises WHERE ${where} = ? ORDER BY sort, id`, id))
  .map((e) => ({ id: e.id, type: e.type, prompt: e.prompt, arabic: e.arabic, explanation: e.explanation, data: parse(e.data, {}) }));
const testIdFor = async (col, id) => (await get(`SELECT id FROM tests WHERE ${col} = ? AND status = 'published'`, id))?.id || null;

const log = [];

// ---------- courses → modules → lessons (with practice) ----------
const courses = [];
for (const c of await all("SELECT * FROM courses WHERE status = 'published' ORDER BY sort, id")) {
  const modules = [];
  for (const m of await all('SELECT * FROM modules WHERE course_id = ? ORDER BY sort, id', c.id)) {
    const lessons = [];
    for (const l of await all(`SELECT * FROM lessons WHERE module_id = ? AND status = 'published' ORDER BY sort, id`, m.id)) {
      lessons.push({
        id: l.id, title: l.title, goal: l.goal, youtube_url: l.youtube_url, duration_min: l.duration_min,
        key_concept: l.key_concept, remember: l.remember, example: l.example, example_ar: l.example_ar,
        common_mistake: l.common_mistake, body: l.body, rule_tag: l.rule_tag,
        verification: await verification(l), exercises: await exercisesFor('lesson_id', l.id), test_id: await testIdFor('lesson_id', l.id),
      });
    }
    modules.push({ id: m.id, title: m.title, description: m.description, lessons });
  }
  courses.push({ id: c.id, title: c.title, subtitle: c.subtitle, description: c.description, direction: c.direction, level: c.level, color: c.color, modules });
}
log.push(write('courses.json', courses));

// ---------- tafsir ----------
const surahs = [];
for (const s of await all("SELECT * FROM surahs WHERE status = 'published' ORDER BY id")) {
  surahs.push({
    id: s.id, name_kk: s.name_kk, name_ar: s.name_ar, name_meaning: s.name_meaning, ayah_count: s.ayah_count,
    revelation: s.revelation, description: s.description, audio_url: s.audio_url, youtube_url: s.youtube_url,
    duration_min: s.duration_min, teacher_name: s.teacher_name, takeaways: parse(s.takeaways, []), reflection: s.reflection,
    verification: await verification(s), test_id: await testIdFor('surah_id', s.id),
    ayahs: (await all('SELECT * FROM ayahs WHERE surah_id = ? ORDER BY number', s.id))
      .map((a) => ({ id: a.id, number: a.number, arabic: a.arabic, translation: a.translation, translation_source: a.translation_source, global_number: a.global_number, explanation: a.explanation, key_meaning: a.key_meaning })),
  });
}
log.push(write('surahs.json', surahs));

// ---------- knowledge base ----------
const topics = [];
for (const t of await all("SELECT * FROM kb_topics WHERE status = 'published' ORDER BY category, sort, id")) {
  topics.push({
    id: t.id, slug: t.slug, category: t.category, section: t.section, title: t.title, summary: t.summary, simple: t.simple,
    rule: t.rule, examples: parse(t.examples, []), arabic: t.arabic, audio_url: t.audio_url, youtube_url: t.youtube_url,
    mistakes: t.mistakes, lesson_id: t.lesson_id, rule_tag: t.rule_tag,
    verification: await verification(t), exercises: await exercisesFor('topic_id', t.id), test_id: await testIdFor('topic_id', t.id),
  });
}
log.push(write('kb.json', topics));

// ---------- tests (answers travel with the page: checking happens in the browser) ----------
const tests = [];
for (const t of await all("SELECT * FROM tests WHERE status = 'published' ORDER BY id")) {
  tests.push({
    id: t.id, title: t.title, description: t.description, category: t.category, pass_score: t.pass_score,
    lesson_id: t.lesson_id, surah_id: t.surah_id, topic_id: t.topic_id,
    questions: (await all('SELECT * FROM questions WHERE test_id = ? ORDER BY sort, id', t.id))
      .map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, arabic: q.arabic, audio_url: q.audio_url, options: parse(q.options), answer: parse(q.answer), explanation: q.explanation, rule_tag: q.rule_tag })),
  });
}
log.push(write('tests.json', tests));

// ---------- dictionary, alphabet, materials, schedule, search ----------
log.push(write('words.json', await all('SELECT id, arabic, translit, meaning, level, topic, audio_url, example_ar, example_kk, in_quran, quran_ref FROM words ORDER BY id')));
log.push(write('letters.json', LETTERS.map(([ch, name, sound, makhraj, heavy, joins, example, meaning]) => ({
  ch, name, sound, makhraj, heavy: !!heavy, joins: !!joins, example, meaning,
  forms: joins ? { isolated: ch, initial: ch + 'ـ', medial: 'ـ' + ch + 'ـ', final: 'ـ' + ch } : { isolated: ch, initial: ch, medial: 'ـ' + ch, final: 'ـ' + ch },
}))));
log.push(write('materials.json', await all("SELECT id, title, description, kind, category, url, course_id FROM materials WHERE status = 'published' ORDER BY id DESC")));
log.push(write('events.json', await all('SELECT id, title, kind, weekday, time, starts_at, duration_min, teacher_name, format, link, location, recording_url FROM events WHERE group_id IS NULL ORDER BY weekday, time')));
log.push(write('search.json', await all('SELECT kind, ref_id, link, subtitle, title, body FROM search_index')));
log.push(write('meta.json', { RULE_TAGS, KB_CATEGORIES, QA_CATEGORIES, ROLES, SUBMISSION_STATUS, WEEKDAYS, EVENT_KINDS, CONTENT_STATUS, generated_at: new Date().toISOString() }));

console.log('Static content exported to client/public/data:\n  ' + log.join('\n  '));
process.exit(0);
