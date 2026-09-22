// Shared vocabularies (sent to the client via /api/meta so labels live in one place)

export const RULE_TAGS = {
  letters: 'Араб әріптері',
  makharij: 'Махраж (дыбыс шығу орны)',
  harakat: 'Харакаттар',
  tanwin: 'Тануин',
  sukun: 'Сукун',
  shadda: 'Шадда',
  madd: 'Мәд',
  gunna: 'Ғунна',
  qalqala: 'Қалқала',
  nun_sakin: 'Нун сакина ережелері',
  mim_sakin: 'Мим сакина',
  waqf: 'Уақф',
};

export const KB_CATEGORIES = {
  quran_reading: 'Құран оқу',
  tajweed: 'Тәжуид',
  tafsir: 'Тәпсір',
  arabic: 'Араб тілі',
  surahs: 'Сүрелер',
  duas: 'Дұғалар',
  terms: 'Ислам терминдері',
  useful: 'Пайдалы материалдар',
  faq: 'FAQ',
};

export const QA_CATEGORIES = ['Құран оқу', 'Тәжуид', 'Тәпсір', 'Араб тілі', 'Ұйымдастыру мәселесі'];

export const ROLES = { student: 'Оқушы', teacher: 'Ұстаз', curator: 'Куратор', admin: 'Әкімші' };

export const CONTENT_STATUS = { draft: 'Draft', review: 'Review', approved: 'Approved', published: 'Published' };

export const SUBMISSION_STATUS = { pending: 'Тексерілуде', accepted: 'Қабылданды', reread: 'Қайта оқу керек', fix: 'Түзету қажет' };

export const WEEKDAYS = ['Дүйсенбі', 'Сейсенбі', 'Сәрсенбі', 'Бейсенбі', 'Жұма', 'Сенбі', 'Жексенбі'];

export const EVENT_KINDS = { regular: 'Тұрақты сабақ', live: 'Тікелей эфир', offline: 'Офлайн дәріс', exam: 'Емтихан', event: 'Іс-шара' };
