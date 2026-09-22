// Idempotent knowledge import: adds/updates demo knowledge without touching students' data.
// Run: `npm run content` (also executed by the seed). Items keep status/review fields once a teacher
// has reviewed them — only rows that are still demo (is_demo = 1) are overwritten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, get, run, insert, update, tx } from './db.js';
import { TOPICS, EXTRA_TESTS } from './seed-data/tajweed.js';
import { ARABIC, ARABIC_TESTS } from './seed-data/arabic.js';
import { WORD_TOPICS } from './seed-data/words.js';
import { SURAH_NAMES, GUIDES } from './seed-data/reference.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const J = JSON.stringify;
const HAKK_VIDEOS = { 89: 'C0bPohqx1RY', 90: 'SpRgLHgj7iI', 91: 'kgRmtXD0bJI', 92: 'kgRmtXD0bJI', 93: 'KkavdhRFBfo', 94: 'hONz_v8qfBc', 95: 'hONz_v8qfBc', 96: '4l162FdosmQ', 97: 'xVIy6dryyww', 98: 'kYdHIAbkKb8', 99: '3sGDJp8-a40', 100: 'ZhLujuvUMi4', 101: 'djnAwo7W6b8', 102: '9XtDkg5hSBk', 103: 'OBB2WUChFTQ', 104: '3qE7nVBgvL8', 105: '5exjgPBU9cU', 106: 'z-1cQn12pZU', 107: 'yR20pgupNDw', 108: '5U8mnGLmoTc', 109: 'cLiuOdDcZNQ', 110: 'mS7t8VmPKhU', 111: 'gAZLe9mbFt0', 112: 'h0t2NrcL7sA', 114: 'h0t2NrcL7sA' };

function source(title, extra) {
  return get('SELECT id FROM sources WHERE title = ?', title)?.id || insert('sources', { title, ...extra });
}

function upsertTest(t, links = {}) {
  let test = get('SELECT id FROM tests WHERE title = ?', t.title);
  if (!test) test = { id: insert('tests', { title: t.title, category: t.category || 'tajweed', status: 'published', pass_score: 70, ...links }) };
  else update('tests', test.id, links);
  // never delete existing questions: students' answers and analytics reference them
  if (get('SELECT 1 FROM questions WHERE test_id = ? LIMIT 1', test.id)) return test.id;
  t.questions.forEach((q, i) => insert('questions', {
    test_id: test.id, sort: i + 1, type: q.type, prompt: q.prompt, arabic: q.arabic || null, audio_url: q.audio_url || null,
    options: q.options == null ? null : J(q.options), answer: J(q.answer ?? null), explanation: q.explanation || null, rule_tag: q.rule_tag || null,
  }));
  return test.id;
}

function exData(e) { return e.data ? J(e.data) : null; }

export function importContent({ log = true } = {}) {
  const stats = { surahs: 0, ayahs: 0, topics: 0, lessons: 0, words: 0, tests: 0 };
  const juz = JSON.parse(fs.readFileSync(path.join(here, 'seed-data', 'juz30.json'), 'utf8'));
  const srcAr = source('Tanzil Quran Text (Uthmani)', { author: 'Tanzil Project', book: 'Мұсхаф мәтіні (Хафс ривояты)', url: 'https://tanzil.net', note: juz.source_ar });
  source('Халифа Алтай — Құран Кәрім қазақша мағына және түсінігі', { author: 'Халифа Алтай', book: 'Құран Кәрім қазақша мағына және түсінігі', note: juz.source_kk });
  const srcProgram = source('Hakk Academy оқу бағдарламасы', { author: 'Hakk Academy ұстаздары', book: 'Құран оқу және тәжуид курсы (ішкі)' });

  tx(() => {
    // ---------- Juz ʿAmma: all 37 surahs with verbatim text + Khalifa Altai translation ----------
    for (const [num, s] of Object.entries(juz.surahs)) {
      const n = Number(num);
      const [kk, meaning] = SURAH_NAMES[n];
      const ex = get('SELECT * FROM surahs WHERE id = ?', n);
      const base = { name_kk: kk, name_ar: s.name_ar, ayah_count: s.count, revelation: s.revelation === 'Meccan' ? 'mecca' : 'medina', name_meaning: meaning };
      if (!ex) {
        insert('surahs', {
          id: n, ...base, status: 'published', is_demo: 1, source_id: srcAr, teacher_name: 'Hakk Academy',
          youtube_url: HAKK_VIDEOS[n] ? `https://www.youtube.com/watch?v=${HAKK_VIDEOS[n]}` : null,
          description: 'Тәпсір сабағы дайындалуда.', takeaways: J([]),
          audio_url: `https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/${n}.mp3`,
        });
      } else update('surahs', n, { name_meaning: meaning, name_kk: ex.is_demo ? kk : ex.name_kk });
      stats.surahs++;
      for (const a of s.ayahs) {
        const row = get('SELECT id, translation FROM ayahs WHERE surah_id = ? AND number = ?', n, a.n);
        const patch = { global_number: a.g };
        if (!row) insert('ayahs', { surah_id: n, number: a.n, arabic: a.ar, translation: a.kk, translation_source: 'Халифа Алтай', ...patch });
        else update('ayahs', row.id, row.translation ? patch : { ...patch, translation: a.kk, translation_source: 'Халифа Алтай' });
        stats.ayahs++;
      }
      // factual self-check test for every surah (derived from mushaf data — no interpretation)
      const others = Object.keys(juz.surahs).map(Number).filter((x) => x !== n);
      const pick = (k, ok = () => true) => { const out = []; for (let i = 0; out.length < k && i < others.length; i++) { const c = others[(n * 7 + i * 11) % others.length]; if (!out.includes(c) && ok(c)) out.push(c); } return out; };
      const wrongCounts = [...new Set([s.count + 1, Math.max(1, s.count - 1), s.count + 3])].filter((c) => c !== s.count).slice(0, 2);
      const countOpts = [s.count, ...wrongCounts].sort((a, b) => a - b);
      const nameOpts = [n, ...pick(2)].sort((a, b) => a - b);
      const meaningOpts = [meaning, ...[...new Set(pick(6, (x) => SURAH_NAMES[x][1] !== meaning).map((x) => SURAH_NAMES[x][1]))].slice(0, 2)].sort();
      upsertTest({
        title: `${kk} сүресі: өзіңізді тексеріңіз`, category: 'tafsir', questions: [
          { type: 'single', prompt: `${kk} сүресі неше аяттан тұрады?`, options: countOpts.map(String), answer: countOpts.indexOf(s.count), explanation: `${kk} сүресі — ${s.count} аят.` },
          { type: 'single', prompt: 'Бұл аят қай сүренің басы?', arabic: s.ayahs[0].ar, options: nameOpts.map((x) => SURAH_NAMES[x][0]), answer: nameOpts.indexOf(n), explanation: `Бұл — ${kk} сүресінің 1-аяты.` },
          { type: 'tf', prompt: `${kk} сүресі мұсхафта ${s.revelation === 'Meccan' ? 'меккелік' : 'мединелік'} сүре ретінде белгіленген.`, answer: true, explanation: 'Мұсхафтағы (Tanzil метадеректері) белгі бойынша.' },
          { type: 'single', prompt: `«${kk}» атауының мағынасы:`, options: meaningOpts, answer: meaningOpts.indexOf(meaning), explanation: `«${kk}» — «${meaning}» деген мағынаны білдіреді.` },
        ],
      }, { surah_id: n });
      stats.tests++;
    }
    run(`UPDATE ayahs SET translation_source = 'Халифа Алтай' WHERE translation IS NOT NULL AND translation_source IS NULL`);

    // ---------- knowledge base topics ----------
    const lessonByTag = (tag) => get(`SELECT id FROM lessons WHERE rule_tag = ? AND status = 'published' ORDER BY id LIMIT 1`, tag)?.id || null;
    for (const t of [...TOPICS, ...GUIDES]) {
      const fields = {
        category: t.category, section: t.section || null, title: t.title, summary: t.summary || null, simple: t.simple || null, rule: t.rule || null,
        examples: J(t.examples || []), arabic: t.arabic || null, mistakes: t.mistakes || null, rule_tag: t.rule_tag || null, sort: t.sort ?? 0,
      };
      let row = get('SELECT id, is_demo FROM kb_topics WHERE slug = ?', t.slug);
      if (!row) row = { id: insert('kb_topics', { slug: t.slug, ...fields, status: 'published', is_demo: 1, source_id: srcProgram, lesson_id: t.rule_tag ? lessonByTag(t.rule_tag) : null }) };
      else if (row.is_demo) update('kb_topics', row.id, { ...fields, status: 'published' });
      else continue; // reviewed by a teacher — leave untouched
      if (t.exercises && !get('SELECT 1 FROM exercises WHERE topic_id = ? LIMIT 1', row.id)) {
        t.exercises.forEach((e, i) => insert('exercises', { topic_id: row.id, type: e.type, prompt: e.prompt, arabic: e.arabic || null, data: exData(e), explanation: e.explanation || null, sort: i + 1 }));
      }
      if (t.test) { upsertTest({ ...t.test, category: 'tajweed' }, { topic_id: row.id }); stats.tests++; }
      stats.topics++;
    }
    for (const t of [...EXTRA_TESTS, ...ARABIC_TESTS]) { upsertTest(t); stats.tests++; }

    // ---------- Arabic lessons ----------
    for (const block of ARABIC) {
      const course = get('SELECT id FROM courses WHERE title = ?', block.course);
      if (!course) continue;
      let mod = get('SELECT id FROM modules WHERE course_id = ? AND title = ?', course.id, block.module);
      if (!mod) mod = { id: insert('modules', { course_id: course.id, title: block.module, sort: (get('SELECT max(sort) m FROM modules WHERE course_id = ?', course.id).m || 0) + 1 }) };
      for (const l of block.lessons) {
        const fields = { title: l.title, goal: l.goal, key_concept: l.key, remember: l.remember, example: l.ex, example_ar: l.ar, common_mistake: l.mistake, duration_min: l.min || 12 };
        let row = get('SELECT id, is_demo FROM lessons WHERE module_id = ? AND title = ?', mod.id, l.title);
        if (!row) {
          const sort = (get('SELECT max(sort) m FROM lessons WHERE module_id = ?', mod.id).m || 0) + 1;
          row = { id: insert('lessons', { module_id: mod.id, sort, ...fields, status: 'published', is_demo: 1, source_id: srcProgram }) };
        } else if (row.is_demo) update('lessons', row.id, { ...fields, status: 'published' });
        else continue;
        if (l.exercises && !get('SELECT 1 FROM exercises WHERE lesson_id = ? LIMIT 1', row.id)) {
          l.exercises.forEach((e, i) => insert('exercises', { lesson_id: row.id, type: e.type, prompt: e.prompt, arabic: e.arabic || null, data: exData(e), explanation: e.explanation || null, sort: i + 1 }));
        }
        stats.lessons++;
      }
    }
    // publish the previously drafted intermediate lessons that now have full content
    run(`UPDATE lessons SET status = 'published' WHERE is_demo = 1 AND status IN ('draft','review') AND title IN ('Үш әріпті түбір','Атаулы сөйлем')`);

    // ---------- dictionary ----------
    for (const [topic, list] of Object.entries(WORD_TOPICS)) {
      for (const [arabic, translit, meaning, ref] of list) {
        const ex = get('SELECT id FROM words WHERE arabic = ? AND (topic = ? OR topic IS NULL)', arabic, topic);
        const lvl = topic === 'Етістіктер' ? 'intermediate' : 'beginner';
        const f = { translit, meaning, topic, in_quran: ref ? 1 : 0, quran_ref: ref, level: lvl };
        if (ex) update('words', ex.id, f); else insert('words', { arabic, ...f });
        stats.words++;
      }
    }
    run(`UPDATE words SET topic = 'Әмма парасындағы сөздер' WHERE topic IS NULL AND in_quran = 1`);
    run(`UPDATE words SET topic = 'Оқу және мектеп' WHERE topic IS NULL`);
  });
  if (log) console.log('✓ Knowledge imported:', stats);
  return stats;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  importContent();
  const { rebuildSearchIndex } = await import('./services.js');
  console.log('Search index rows:', rebuildSearchIndex());
}
