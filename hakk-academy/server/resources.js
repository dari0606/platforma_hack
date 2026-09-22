// CMS resource definitions: single source of truth for admin tables, forms and permissions.
// The client renders forms from this metadata, so adding a field here is enough to make it editable.
import { RULE_TAGS, KB_CATEGORIES, ROLES, EVENT_KINDS, WEEKDAYS } from './constants.js';

const opts = (obj) => Object.entries(obj).map(([value, label]) => ({ value, label }));
const RULES = [{ value: '', label: '—' }, ...opts(RULE_TAGS)];
const LEVELS = [{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }];
const source = [
  { name: 'source_id', label: 'Дереккөз', type: 'ref', ref: 'sources', section: 'Дереккөз және тексеру' },
  { name: 'scholar', label: 'Автор / Ғалым', type: 'text', section: 'Дереккөз және тексеру' },
  { name: 'book', label: 'Кітап', type: 'text', section: 'Дереккөз және тексеру' },
];

export const RESOURCES = {
  users: {
    table: 'users', label: 'Пайдаланушылар', perm: 'users.manage', order: 'id DESC', search: ['name', 'email', 'phone'],
    fields: [
      { name: 'name', label: 'Аты-жөні', type: 'text', required: true, list: true },
      { name: 'email', label: 'Email', type: 'text', list: true },
      { name: 'phone', label: 'Телефон', type: 'text', list: true, help: '+7 700 000 00 00' },
      { name: 'role', label: 'Рөлі', type: 'select', options: opts(ROLES), list: true, default: 'student' },
      { name: 'active', label: 'Белсенді', type: 'bool', list: true, default: 1 },
      { name: 'password', label: 'Құпиясөз', type: 'password', help: 'Өңдеу кезінде бос қалдырсаңыз, өзгермейді', virtual: true },
      { name: 'bio', label: 'Қосымша ақпарат', type: 'textarea' },
    ],
  },
  groups: {
    table: 'groups', label: 'Топтар', perm: 'groups.manage', search: ['name'],
    fields: [
      { name: 'name', label: 'Топ атауы', type: 'text', required: true, list: true },
      { name: 'description', label: 'Сипаттама', type: 'textarea' },
      { name: 'teacher_id', label: 'Ұстаз', type: 'ref', ref: 'users', refFilter: { role: 'teacher' }, list: true },
      { name: 'curator_id', label: 'Куратор', type: 'ref', ref: 'users', refFilter: { role: 'curator' }, list: true },
    ],
  },
  courses: {
    table: 'courses', label: 'Курстар', perm: 'content.edit', order: 'sort, id', search: ['title'],
    fields: [
      { name: 'title', label: 'Курс атауы', type: 'text', required: true, list: true },
      { name: 'subtitle', label: 'Қысқаша', type: 'text' },
      { name: 'description', label: 'Сипаттама', type: 'textarea' },
      { name: 'direction', label: 'Бағыт', type: 'select', list: true, options: [{ value: 'quran', label: 'Құран оқу' }, { value: 'tajweed', label: 'Тәжуид' }, { value: 'arabic', label: 'Араб тілі' }, { value: 'tafsir', label: 'Тәпсір' }, { value: 'hifz', label: 'Жаттау' }] },
      { name: 'level', label: 'Деңгей', type: 'select', options: LEVELS, list: true },
      { name: 'color', label: 'Түс', type: 'color', default: '#6D4AFF' },
      { name: 'sequential', label: 'Сабақтар ретімен ашылады', type: 'bool', default: 1 },
      { name: 'status', label: 'Күйі', type: 'select', list: true, options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }], default: 'draft' },
      { name: 'sort', label: 'Реті', type: 'number', default: 0 },
    ],
  },
  modules: {
    table: 'modules', label: 'Модульдер', perm: 'content.edit', order: 'sort, id', parent: 'course_id',
    fields: [
      { name: 'course_id', label: 'Курс', type: 'ref', ref: 'courses', required: true, list: true },
      { name: 'title', label: 'Модуль атауы', type: 'text', required: true, list: true },
      { name: 'description', label: 'Сипаттама', type: 'textarea' },
      { name: 'sort', label: 'Реті', type: 'number', default: 0, list: true },
    ],
  },
  lessons: {
    table: 'lessons', label: 'Сабақтар', perm: 'content.edit', order: 'sort, id', parent: 'module_id', workflow: true, search: ['title'],
    fields: [
      { name: 'module_id', label: 'Модуль', type: 'ref', ref: 'modules', required: true },
      { name: 'title', label: 'Сабақ атауы', type: 'text', required: true, list: true },
      { name: 'goal', label: '1. Сабақтың мақсаты', type: 'textarea' },
      { name: 'youtube_url', label: '2. YouTube сілтемесі', type: 'youtube', help: 'youtube.com/watch?v=… немесе youtu.be/… сілтемесін қойыңыз' },
      { name: 'duration_min', label: 'Ұзақтығы (мин)', type: 'number', default: 10, list: true },
      { name: 'key_concept', label: 'Негізгі түсінік', type: 'textarea', section: '3. Қысқаша конспект' },
      { name: 'remember', label: 'Есте сақтаңыз', type: 'textarea', section: '3. Қысқаша конспект' },
      { name: 'example', label: 'Мысал (түсіндірме)', type: 'textarea', section: '3. Қысқаша конспект' },
      { name: 'example_ar', label: 'Мысал (арабша)', type: 'arabic', section: '3. Қысқаша конспект' },
      { name: 'common_mistake', label: 'Жиі жіберілетін қате', type: 'textarea', section: '3. Қысқаша конспект' },
      { name: 'body', label: 'Қосымша мәтін', type: 'textarea', section: '3. Қысқаша конспект' },
      { name: 'rule_tag', label: 'Тәжуид ережесі (қателер үшін)', type: 'select', options: RULES },
      { name: 'sort', label: 'Реті', type: 'number', default: 0 },
      ...source,
    ],
  },
  exercises: {
    table: 'exercises', label: 'Практика', perm: 'content.edit', order: 'sort, id', parent: 'lesson_id',
    fields: [
      { name: 'lesson_id', label: 'Сабақ', type: 'ref', ref: 'lessons' },
      { name: 'topic_id', label: 'Білім базасы тақырыбы', type: 'ref', ref: 'kb_topics' },
      { name: 'type', label: 'Түрі', type: 'select', list: true, options: [
        { value: 'read_aloud', label: '🎙 Дауыспен оқу (ұстазға)' }, { value: 'single', label: 'Бір дұрыс жауап' }, { value: 'tf', label: 'Дұрыс / Қате' },
        { value: 'match', label: 'Сәйкестендіру' }, { value: 'fill', label: 'Бос орынды толтыру' }, { value: 'text', label: 'Мәтіндік жауап' }, { value: 'upload', label: 'Файл жүктеу' }] },
      { name: 'prompt', label: 'Тапсырма', type: 'textarea', required: true, list: true },
      { name: 'arabic', label: 'Арабша мәтін (әр жол — бөлек сөз)', type: 'arabic' },
      { name: 'data', label: 'Жауаптар', type: 'answers' },
      { name: 'explanation', label: 'Түсіндірме («Неге?»)', type: 'textarea' },
      { name: 'sort', label: 'Реті', type: 'number', default: 0 },
    ],
  },
  tests: {
    table: 'tests', label: 'Тесттер', perm: 'content.edit', search: ['title'],
    fields: [
      { name: 'title', label: 'Тест атауы', type: 'text', required: true, list: true },
      { name: 'description', label: 'Сипаттама', type: 'textarea' },
      { name: 'category', label: 'Санат', type: 'select', list: true, options: [{ value: 'tajweed', label: 'Тәжуид' }, { value: 'quran', label: 'Құран оқу' }, { value: 'tafsir', label: 'Тәпсір' }, { value: 'arabic', label: 'Араб тілі' }] },
      { name: 'lesson_id', label: 'Сабаққа байланысты', type: 'ref', ref: 'lessons' },
      { name: 'surah_id', label: 'Сүреге байланысты', type: 'ref', ref: 'surahs' },
      { name: 'topic_id', label: 'Тақырыпқа байланысты', type: 'ref', ref: 'kb_topics' },
      { name: 'pass_score', label: 'Өту шегі (%)', type: 'number', default: 70 },
      { name: 'status', label: 'Күйі', type: 'select', list: true, options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }], default: 'draft' },
    ],
  },
  questions: {
    table: 'questions', label: 'Сұрақтар', perm: 'content.edit', order: 'sort, id', parent: 'test_id',
    fields: [
      { name: 'test_id', label: 'Тест', type: 'ref', ref: 'tests', required: true },
      { name: 'type', label: 'Сұрақ түрі', type: 'select', list: true, options: [
        { value: 'single', label: 'Бір дұрыс жауап' }, { value: 'multi', label: 'Бірнеше дұрыс жауап' }, { value: 'tf', label: 'Дұрыс / Қате' },
        { value: 'match', label: 'Сәйкестендіру' }, { value: 'fill', label: 'Пропущенное слово' }, { value: 'arabic_reading', label: 'Арабша сөз → дұрыс оқылуы' }, { value: 'audio_rule', label: 'Аудио → ережені анықтау' }] },
      { name: 'prompt', label: 'Сұрақ', type: 'textarea', required: true, list: true },
      { name: 'arabic', label: 'Арабша мәтін', type: 'arabic' },
      { name: 'audio_url', label: 'Аудио', type: 'file', accept: 'audio/*' },
      { name: 'options', label: 'Жауаптар', type: 'answers' },
      { name: 'explanation', label: 'Неге? (түсіндірме)', type: 'textarea' },
      { name: 'rule_tag', label: 'Ереже', type: 'select', options: RULES },
      { name: 'sort', label: 'Реті', type: 'number', default: 0 },
    ],
  },
  assignments: {
    table: 'assignments', label: 'Үй тапсырмалары', perm: 'assignments.manage', order: 'id DESC',
    fields: [
      { name: 'title', label: 'Атауы', type: 'text', required: true, list: true },
      { name: 'description', label: 'Тапсырма мәтіні', type: 'textarea' },
      { name: 'kind', label: 'Жауап түрі', type: 'select', list: true, options: [{ value: 'text', label: 'Мәтін' }, { value: 'upload', label: 'Файл' }, { value: 'audio', label: 'Аудио жазба' }] },
      { name: 'lesson_id', label: 'Сабақ', type: 'ref', ref: 'lessons', list: true },
      { name: 'group_id', label: 'Топ (бос — барлығы)', type: 'ref', ref: 'groups', list: true },
      { name: 'due_at', label: 'Мерзімі', type: 'datetime', list: true },
    ],
  },
  surahs: {
    table: 'surahs', label: 'Тәпсір (сүрелер)', perm: 'content.edit', order: 'id', workflow: true, search: ['name_kk'], manualId: true,
    fields: [
      { name: 'id', label: 'Сүре нөмірі', type: 'number', required: true, list: true, createOnly: true },
      { name: 'name_kk', label: 'Атауы (қазақша)', type: 'text', required: true, list: true },
      { name: 'name_ar', label: 'Атауы (арабша)', type: 'arabic', required: true },
      { name: 'ayah_count', label: 'Аят саны', type: 'number', required: true, list: true },
      { name: 'revelation', label: 'Түскен жері', type: 'select', options: [{ value: 'mecca', label: 'Меккелік' }, { value: 'medina', label: 'Мединелік' }] },
      { name: 'description', label: 'Қысқаша сипаттама', type: 'textarea' },
      { name: 'youtube_url', label: 'Тәпсір сабағы (YouTube)', type: 'youtube' },
      { name: 'duration_min', label: 'Ұзақтығы (мин)', type: 'number' },
      { name: 'teacher_name', label: 'Ұстаз', type: 'text', list: true },
      { name: 'audio_url', label: 'Сүрені тыңдау (аудио)', type: 'file', accept: 'audio/*' },
      { name: 'takeaways', label: 'Сабақтан не үйренеміз? (әр жол — бір тұжырым)', type: 'lines' },
      { name: 'reflection', label: 'Ойлануға сұрақ', type: 'textarea' },
      ...source,
    ],
  },
  ayahs: {
    table: 'ayahs', label: 'Аяттар', perm: 'content.edit', order: 'number', parent: 'surah_id', parentWorkflow: 'surahs',
    fields: [
      { name: 'surah_id', label: 'Сүре', type: 'ref', ref: 'surahs', required: true },
      { name: 'number', label: 'Аят нөмірі', type: 'number', required: true, list: true },
      { name: 'arabic', label: 'Арабша мәтін (бекітілген мұсхафтан)', type: 'arabic', required: true, list: true },
      { name: 'translation', label: 'Мағынасы (бекітілген аударма)', type: 'textarea' },
      { name: 'explanation', label: 'Қысқаша түсіндірме', type: 'textarea' },
      { name: 'key_meaning', label: 'Негізгі мағына', type: 'text' },
    ],
  },
  kb_topics: {
    table: 'kb_topics', label: 'Білім базасы', perm: 'content.edit', order: 'category, sort, id', workflow: true, search: ['title', 'slug'],
    fields: [
      { name: 'title', label: 'Тақырып', type: 'text', required: true, list: true },
      { name: 'slug', label: 'URL (латынша)', type: 'text', required: true, help: 'мысалы: gunna' },
      { name: 'category', label: 'Санат', type: 'select', options: opts(KB_CATEGORIES), list: true, required: true },
      { name: 'section', label: 'Бөлім', type: 'text', list: true },
      { name: 'summary', label: 'Бір сөйлеммен', type: 'text' },
      { name: 'simple', label: 'Қарапайым түсіндірме', type: 'textarea' },
      { name: 'rule', label: 'Ереже', type: 'textarea' },
      { name: 'examples', label: 'Мысалдар (әр жол: арабша | түсініктеме)', type: 'examples' },
      { name: 'arabic', label: 'Негізгі арабша мәтін', type: 'arabic' },
      { name: 'audio_url', label: 'Аудио мысал', type: 'file', accept: 'audio/*' },
      { name: 'youtube_url', label: 'Видео (YouTube)', type: 'youtube' },
      { name: 'mistakes', label: 'Жиі кездесетін қателер', type: 'textarea' },
      { name: 'lesson_id', label: 'Байланысты сабақ', type: 'ref', ref: 'lessons' },
      { name: 'rule_tag', label: 'Ереже тегі', type: 'select', options: RULES },
      { name: 'sort', label: 'Реті', type: 'number', default: 0 },
      ...source,
    ],
  },
  words: {
    table: 'words', label: 'Сөздік', perm: 'content.edit', search: ['arabic', 'translit', 'meaning'],
    fields: [
      { name: 'arabic', label: 'Арабша', type: 'arabic', required: true, list: true },
      { name: 'translit', label: 'Транскрипция', type: 'text', list: true },
      { name: 'meaning', label: 'Мағынасы', type: 'text', required: true, list: true },
      { name: 'level', label: 'Деңгей', type: 'select', options: LEVELS, list: true },
      { name: 'audio_url', label: 'Айтылуы (аудио)', type: 'file', accept: 'audio/*' },
      { name: 'example_ar', label: 'Мысал (арабша)', type: 'arabic' },
      { name: 'example_kk', label: 'Мысал (аудармасы)', type: 'text' },
      { name: 'in_quran', label: 'Құранда кездеседі', type: 'bool' },
      { name: 'quran_ref', label: 'Құрандағы мысал (сүре:аят)', type: 'text' },
    ],
  },
  materials: {
    table: 'materials', label: 'Материалдар', perm: 'content.edit', order: 'id DESC', search: ['title'],
    fields: [
      { name: 'title', label: 'Атауы', type: 'text', required: true, list: true },
      { name: 'description', label: 'Сипаттама', type: 'textarea' },
      { name: 'kind', label: 'Түрі', type: 'select', list: true, options: [{ value: 'pdf', label: 'PDF' }, { value: 'audio', label: 'Аудио' }, { value: 'video', label: 'Видео' }, { value: 'recording', label: 'Эфир жазбасы' }, { value: 'link', label: 'Сілтеме' }] },
      { name: 'category', label: 'Санат', type: 'text', list: true },
      { name: 'url', label: 'Сілтеме / YouTube', type: 'text' },
      { name: 'file_path', label: 'Файл (PDF / аудио)', type: 'file' },
      { name: 'course_id', label: 'Курс (бос — барлығына)', type: 'ref', ref: 'courses' },
      { name: 'status', label: 'Күйі', type: 'select', options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }], default: 'published', list: true },
    ],
  },
  events: {
    table: 'events', label: 'Күнтізбе', perm: 'events.manage', order: 'weekday, time, starts_at',
    fields: [
      { name: 'title', label: 'Атауы', type: 'text', required: true, list: true },
      { name: 'kind', label: 'Түрі', type: 'select', options: opts(EVENT_KINDS), list: true },
      { name: 'weekday', label: 'Апта күні (тұрақты сабақ)', type: 'select', options: [{ value: '', label: '— бір реттік —' }, ...WEEKDAYS.map((l, i) => ({ value: i, label: l }))], list: true },
      { name: 'time', label: 'Уақыты (СС:ММ)', type: 'time', list: true },
      { name: 'starts_at', label: 'Бір реттік күні мен уақыты', type: 'datetime' },
      { name: 'duration_min', label: 'Ұзақтығы (мин)', type: 'number', default: 60 },
      { name: 'teacher_name', label: 'Ұстаз', type: 'text', list: true },
      { name: 'format', label: 'Формат', type: 'select', options: [{ value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }] },
      { name: 'link', label: 'Қосылу сілтемесі (Zoom / YouTube Live)', type: 'text' },
      { name: 'location', label: 'Мекенжай (офлайн)', type: 'text' },
      { name: 'group_id', label: 'Топ (бос — барлығы)', type: 'ref', ref: 'groups' },
      { name: 'recording_url', label: 'Эфир жазбасы', type: 'youtube' },
    ],
  },
  sources: {
    table: 'sources', label: 'Дереккөздер', perm: 'content.edit', search: ['title'],
    fields: [
      { name: 'title', label: 'Атауы', type: 'text', required: true, list: true },
      { name: 'author', label: 'Автор / Ғалым', type: 'text', list: true },
      { name: 'book', label: 'Кітап', type: 'text', list: true },
      { name: 'url', label: 'Сілтеме', type: 'text' },
      { name: 'note', label: 'Ескерту', type: 'textarea' },
    ],
  },
  certificates: {
    table: 'certificates', label: 'Сертификаттар', perm: 'access.grant', order: 'id DESC',
    fields: [
      { name: 'user_id', label: 'Оқушы', type: 'ref', ref: 'users', refFilter: { role: 'student' }, list: true, required: true },
      { name: 'course_id', label: 'Бағдарлама', type: 'ref', ref: 'courses', list: true, required: true },
      { name: 'percent', label: 'Пайыз', type: 'number', list: true, default: 100 },
      { name: 'downloadable', label: 'Жүктеуге рұқсат', type: 'bool', list: true },
    ],
  },
};

/** Label column used when another resource references this one in a dropdown. */
export const REF_LABEL = {
  users: "name || ' (' || role || ')'", groups: 'name', courses: 'title', sources: 'title', tests: 'title',
  modules: "(SELECT title FROM courses c WHERE c.id = course_id) || ' → ' || title",
  lessons: "(SELECT title FROM modules m WHERE m.id = module_id) || ' → ' || title",
  surahs: "id || '. ' || name_kk", kb_topics: 'title',
};
