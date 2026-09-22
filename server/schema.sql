-- Hakk Academy database schema (SQLite; written to be portable to PostgreSQL)
-- Review workflow columns (status/source/reviewed_by...) are shared by all religious content tables.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','teacher','curator','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  locale TEXT NOT NULL DEFAULT 'kk',
  bio TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  curator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  book TEXT,
  url TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  direction TEXT NOT NULL DEFAULT 'quran' CHECK (direction IN ('quran','tajweed','arabic','tafsir','hifz')),
  level TEXT,
  color TEXT DEFAULT '#6D4AFF',
  sequential INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS course_access (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  granted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modules (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal TEXT,
  youtube_url TEXT,
  duration_min INTEGER DEFAULT 10,
  key_concept TEXT,
  remember TEXT,
  example TEXT,
  example_ar TEXT,
  common_mistake TEXT,
  body TEXT,
  rule_tag TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','published')),
  source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  scholar TEXT, book TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- practice items attached to a lesson / KB topic
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  topic_id INTEGER REFERENCES kb_topics(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('read_aloud','text','single','tf','match','fill','upload')),
  prompt TEXT NOT NULL,
  arabic TEXT,          -- newline separated words / lines shown big
  data TEXT,            -- JSON: options, pairs, answer...
  explanation TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
  surah_id INTEGER REFERENCES surahs(id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES kb_topics(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'tajweed',
  pass_score INTEGER NOT NULL DEFAULT 70,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('single','multi','tf','match','fill','arabic_reading','audio_rule')),
  prompt TEXT NOT NULL,
  arabic TEXT,
  audio_url TEXT,
  options TEXT,   -- JSON array (or pairs for match)
  answer TEXT,    -- JSON: index | [indexes] | bool | string | {left:right}
  explanation TEXT,
  rule_tag TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS test_attempts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY,
  attempt_id INTEGER NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  given TEXT,
  correct INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','upload','audio')),
  due_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- homework answers + audio recordings (AudioSubmissions) reviewed by a teacher
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
  exercise_id INTEGER REFERENCES exercises(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('text','upload','audio')),
  text TEXT,
  file_path TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','reread','fix')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teacher_feedback (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- "Менің қателерім": concrete rule mistakes marked by a teacher
CREATE TABLE IF NOT EXISTS mistakes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
  rule_tag TEXT NOT NULL,
  note TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS student_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS surahs (
  id INTEGER PRIMARY KEY,         -- surah number in the mushaf
  name_kk TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  ayah_count INTEGER NOT NULL,
  revelation TEXT CHECK (revelation IN ('mecca','medina')),
  description TEXT,
  audio_url TEXT,
  youtube_url TEXT,
  duration_min INTEGER,
  teacher_name TEXT,
  takeaways TEXT,                 -- JSON array
  reflection TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','published')),
  source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  scholar TEXT, book TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ayahs (
  id INTEGER PRIMARY KEY,
  surah_id INTEGER NOT NULL REFERENCES surahs(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  arabic TEXT NOT NULL,
  translation TEXT,
  explanation TEXT,
  key_meaning TEXT,
  UNIQUE (surah_id, number)
);

CREATE TABLE IF NOT EXISTS kb_topics (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,         -- quran_reading | tajweed | tafsir | arabic | surahs | duas | terms | useful | faq
  section TEXT,                   -- sub-group, e.g. 'Әріптер', 'Мәд'
  title TEXT NOT NULL,
  summary TEXT,
  simple TEXT,
  rule TEXT,
  examples TEXT,                  -- JSON [{ar, note}]
  arabic TEXT,
  audio_url TEXT,
  youtube_url TEXT,
  mistakes TEXT,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE SET NULL,
  rule_tag TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','published')),
  source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  scholar TEXT, book TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY,
  arabic TEXT NOT NULL,
  translit TEXT,
  meaning TEXT NOT NULL,
  level TEXT DEFAULT 'beginner',
  audio_url TEXT,
  example_ar TEXT,
  example_kk TEXT,
  in_quran INTEGER NOT NULL DEFAULT 0,
  quran_ref TEXT
);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'pdf' CHECK (kind IN ('pdf','audio','video','link','recording')),
  category TEXT,
  url TEXT,
  file_path TEXT,
  course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular','live','offline','exam','event')),
  weekday INTEGER,               -- 0=Mon..6=Sun for weekly recurring lessons
  time TEXT,                     -- 'HH:MM' for recurring
  starts_at TEXT,                -- one-off events (ISO local)
  duration_min INTEGER NOT NULL DEFAULT 60,
  teacher_name TEXT,
  format TEXT NOT NULL DEFAULT 'online' CHECK (format IN ('online','offline')),
  link TEXT,
  location TEXT,
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  is_live INTEGER NOT NULL DEFAULT 0,
  recording_url TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  kind TEXT DEFAULT 'info',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,       -- lesson | ayah | topic | word | surah | exercise | material
  item_id INTEGER NOT NULL,
  title TEXT,
  subtitle TEXT,
  link TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, item_type, item_id)
);

CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  percent INTEGER NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  downloadable INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS qa_threads (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  file_path TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS qa_replies (
  id INTEGER PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES qa_threads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,            -- login | lesson_view | lesson_complete | test | practice | review
  ref_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- full-text search index over the whole knowledge base (rebuilt from content tables)
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  kind UNINDEXED, ref_id UNINDEXED, link UNINDEXED, scope UNINDEXED, subtitle UNINDEXED, title, body,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_id, sort);
CREATE INDEX IF NOT EXISTS idx_modules_course ON modules(course_id, sort);
CREATE INDEX IF NOT EXISTS idx_progress_user ON student_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_kind ON activity(kind, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_sub_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_answers_q ON answers(question_id, correct);
CREATE INDEX IF NOT EXISTS idx_access_course ON course_access(course_id);
CREATE INDEX IF NOT EXISTS idx_mistakes_user ON mistakes(user_id, rule_tag);

-- ================= Journal & payroll (ұстаздар журналы және жалақы) =================
-- A "class" is what a teacher's report row is: one individual student or one group.
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('ind','grp')),
  name TEXT NOT NULL,                       -- student name or "гр 150"
  phone TEXT,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL DEFAULT 'Құран',
  lang TEXT NOT NULL DEFAULT 'kaz' CHECK (lang IN ('kaz','rus')),
  mode TEXT NOT NULL DEFAULT 'onl' CHECK (mode IN ('onl','off')),
  package_lessons INTEGER,                  -- e.g. 3 ай → 24 / 36 сабақ
  start_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','finished','archive')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id, status);

CREATE TABLE IF NOT EXISTS class_members (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT
);

CREATE TABLE IF NOT EXISTS class_slots (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0 = дүйсенбі
  time TEXT NOT NULL                                           -- HH:MM
);
CREATE INDEX IF NOT EXISTS idx_class_slots ON class_slots(class_id);

-- One row per held/missed lesson. Paid only when status = 'done' and both reports
-- (journal + telegram) are in — same rule as the old "телеграм ✅ + таблица ✅" sheet.
CREATE TABLE IF NOT EXISTS lesson_log (
  id INTEGER PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES users(id),           -- who taught (may be a substitute)
  date TEXT NOT NULL,                                          -- YYYY-MM-DD
  time TEXT NOT NULL DEFAULT '',                               -- '' = time not set
  status TEXT NOT NULL CHECK (status IN ('done','absent','moved','frozen','cancelled')),
  hours REAL NOT NULL DEFAULT 1,
  tg_ok INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (class_id, date, time)
);
CREATE INDEX IF NOT EXISTS idx_lesson_log_teacher ON lesson_log(teacher_id, date);

-- Hourly rate per lesson format; the row with the latest valid_from <= lesson date applies.
CREATE TABLE IF NOT EXISTS teacher_rates (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  format TEXT NOT NULL,                                        -- ind_kaz_onl … grp_rus_off
  rate INTEGER NOT NULL,
  valid_from TEXT NOT NULL,
  UNIQUE (teacher_id, format, valid_from)
);

CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,                                         -- YYYY-MM
  kind TEXT NOT NULL CHECK (kind IN ('bonus','fine')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payroll_adj ON payroll_adjustments(month, teacher_id);

-- Approved months are frozen: lessons/adjustments can no longer change and the snapshot is what gets paid.
CREATE TABLE IF NOT EXISTS payroll_months (
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved','paid')),
  snapshot TEXT NOT NULL,
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT,
  PRIMARY KEY (teacher_id, month)
);
