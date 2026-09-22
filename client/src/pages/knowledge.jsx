import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Search, ArrowRight, BookOpen, PlayCircle, FileText, BookMarked, Type, Library, Lightbulb, ScrollText, ListChecks, AlertOctagon, Volume2, ClipboardCheck, Lock, Languages, Star, AlertCircle, RotateCcw } from 'lucide-react';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { useApi, Loader, PageHead, Ar, BookmarkBtn, Verification, Empty, Progress, useMeta, useToast } from '../components/ui.jsx';
import { YouTube } from '../components/media.jsx';
import { Exercise } from '../components/practice.jsx';

const KIND = {
  lesson: ['Сабақ', BookOpen], article: ['Мақала', FileText], video: ['Видео', PlayCircle], tafsir: ['Тәпсір сабағы', BookMarked], word: ['Сөз', Type], material: ['Материал', Library],
};
const SUGGEST = ['Ғунна деген не?', 'Мәд', 'Қалқала', 'Ықылас', 'Нун сакина', 'тәжуид'];

function BigSearch({ initial = '', autoFocus }) {
  const [q, setQ] = useState(initial);
  const nav = useNavigate();
  useEffect(() => setQ(initial), [initial]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); q.trim() && nav(`/search?q=${encodeURIComponent(q.trim())}`); }} role="search">
      <div style={{ position: 'relative' }}>
        <Search size={22} style={{ position: 'absolute', left: 18, top: 17, color: 'var(--muted)' }} />
        <input autoFocus={autoFocus} className="input" style={{ height: 58, paddingLeft: 52, fontSize: 17, borderRadius: 16 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Не білгіңіз келеді?" aria-label="Іздеу" />
      </div>
      <div className="chips mt">{SUGGEST.map((s) => <button type="button" key={s} className="chip" onClick={() => nav(`/search?q=${encodeURIComponent(s)}`)}>{s}</button>)}</div>
    </form>
  );
}

export function SearchPage() {
  const [sp] = useSearchParams();
  const q = sp.get('q') || '';
  const res = useApi(q ? `/api/search?q=${encodeURIComponent(q)}` : null, [q]);
  const [kind, setKind] = useState('all');
  useEffect(() => setKind('all'), [q]);
  return (
    <>
      <PageHead title={t('Іздеу')} sub="Сабақтар, мақалалар, тәпсірлер, сөздік және материалдар бойынша бірыңғай іздеу" />
      <div className="card mb"><BigSearch initial={q} autoFocus={!q} /></div>
      {q && <Loader q={res}>{(d) => d.results.length === 0 ? <Empty icon={Search} title={`«${q}» бойынша ештеңе табылмады`}>Басқа сөзбен іздеп көріңіз немесе ұстазға сұрақ қойыңыз.</Empty> : (
        <>
          <div className="small muted mb">Нәтиже: {Object.entries(d.counts).map(([k, n]) => `${n} ${KIND[k]?.[0].toLowerCase()}`).join(' · ')}</div>
          <div className="chips mb">
            <button className={`chip ${kind === 'all' ? 'on' : ''}`} onClick={() => setKind('all')}>Барлығы · {d.results.length}</button>
            {Object.entries(d.counts).map(([k, n]) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{KIND[k]?.[0]} · {n}</button>)}
          </div>
          <div className="card"><div className="list">
            {d.results.filter((r) => kind === 'all' || r.kind === kind).map((r, i) => {
              const [label, Icon] = KIND[r.kind] || ['', FileText];
              return (
                <Link key={i} to={r.link} className="list-item">
                  <span className="li-icon"><Icon /></span>
                  <div className="li-body">
                    <div className="row" style={{ gap: 8 }}><span className="li-title">{r.title}</span><span className="badge">{label}</span></div>
                    {r.subtitle && <div className="tiny muted">{r.subtitle}</div>}
                    {r.snippet && <div className="small mt-sm" style={{ color: 'var(--text-2)' }} dangerouslySetInnerHTML={{ __html: sanitizeSnippet(r.snippet) }} />}
                  </div>
                  <ArrowRight size={18} className="muted" />
                </Link>
              );
            })}
          </div></div>
        </>
      )}</Loader>}
    </>
  );
}
// Only allow the <mark> tags produced by FTS snippet(); escape everything else.
const sanitizeSnippet = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;(\/?)mark&gt;/g, '<$1mark>');

function TopicGrid({ topics }) {
  const sections = [...new Set(topics.map((x) => x.section || 'Жалпы'))];
  return sections.map((sec) => (
    <div key={sec} className="mb">
      <div className="card-title mb">{sec}</div>
      <div className="grid auto-fill">
        {topics.filter((x) => (x.section || 'Жалпы') === sec).map((x) => (
          <Link key={x.id} to={`/kb/${x.slug}`} className="card card-link" style={{ padding: 18 }}>
            <div className="row between"><h3>{x.title}</h3>{x.youtube_url && <PlayCircle size={18} color="var(--primary)" />}</div>
            {x.arabic && <div className="ar ar-sm mt-sm ellipsis" lang="ar">{x.arabic}</div>}
            {x.summary && <div className="small muted mt-sm">{x.summary}</div>}
            {x.status !== 'published' && <span className="badge amber mt-sm">{x.status}</span>}
          </Link>
        ))}
      </div>
    </div>
  ));
}

export function QuranKB() {
  const a = useApi('/api/kb?category=quran_reading');
  const b = useApi('/api/kb?category=tajweed');
  const m = useApi('/api/mistakes');
  return (
    <>
      <PageHead title={t('Құран оқу')} sub="Құран оқу бойынша энциклопедиялық бөлім: қарапайым түсіндірме, ереже, мысалдар, аудио, видео, жаттығу және мини-тест." />
      <div className="tiles mb">
        <Link to="/alphabet" className="tile"><b>🔤 Әліпби</b><span className="tiny muted">28 әріп, пішіндері, махраж</span></Link>
        <Link to="/kb/tajweed-roadmap" className="tile"><b>🗺 Үйрену реті</b><span className="tiny muted">қай ережеден бастау керек</span></Link>
        <Link to="/hifz" className="tile"><b>📖 Жаттау</b><span className="tiny muted">Әмма парасы</span></Link>
        <Link to="/tests" className="tile"><b>📝 Тесттер</b><span className="tiny muted">ережелер бойынша</span></Link>
      </div>
      {m.data?.some((x) => x.open > 0) && (
        <div className="card lav mb row wrap">
          <AlertCircle color="var(--primary)" /><div className="li-body"><b>Сізге қайталау ұсынылады:</b> {m.data.filter((x) => x.open > 0).map((x) => x.label).join(', ')}</div>
          <Link to="/mistakes" className="btn sm">{t('Менің қателерім')}</Link>
        </div>
      )}
      <Loader q={a}>{(d) => <><h2 className="mb">Оқу негіздері</h2><TopicGrid topics={d.topics} /></>}</Loader>
      <Loader q={b}>{(d) => <><h2 className="mb mt">Тәжуид</h2><TopicGrid topics={d.topics} /></>}</Loader>
    </>
  );
}

export function KnowledgeBase() {
  const meta = useMeta();
  const [cat, setCat] = useState('tajweed');
  const all = useApi('/api/kb');
  return (
    <>
      <PageHead title={t('Білім базасы')} sub="Hakk Academy материалдарының құрылымды кітапханасы" />
      <div className="card hero mb">
        <h2 style={{ color: '#fff' }}>Не білгіңіз келеді?</h2>
        <p className="muted mt-sm mb">Мысалы: «Ғунна деген не?» — жүйе Hakk Academy материалдарынан тиісті сабақтар мен мақалаларды көрсетеді.</p>
        <div style={{ color: 'var(--text)' }}><BigSearch /></div>
      </div>
      <Loader q={all}>{(d) => {
        const cats = Object.entries(meta.KB_CATEGORIES || {});
        const list = d.topics.filter((x) => x.category === cat);
        return (
          <>
            <div className="chips mb">
              {cats.map(([k, l]) => <button key={k} className={`chip ${cat === k ? 'on' : ''}`} onClick={() => setCat(k)}>{l}{d.counts[k] ? ` · ${d.counts[k]}` : ''}</button>)}
              <Link to="/tafsir" className="chip">Тәпсір кітапханасы →</Link>
              <Link to="/dictionary" className="chip">Сөздік →</Link>
            </div>
            {list.length ? <TopicGrid topics={list} /> : <Empty title="Бұл санат толықтырылуда">Материалдарды Hakk Academy ұстаздары дайындап, тексеруден өткізгеннен кейін жариялайды.</Empty>}
          </>
        );
      }}</Loader>
    </>
  );
}

export function TopicPage() {
  const { slug } = useParams();
  const q = useApi(`/api/kb/${slug}`, [slug]);
  const meta = useMeta();
  return (
    <Loader q={q}>{(d) => {
      const tp = d.topic;
      return (
        <>
          <div className="crumbs mt-sm"><Link to="/kb">{t('Білім базасы')}</Link> › <span>{meta.KB_CATEGORIES?.[tp.category]}</span>{tp.section && <> › <span>{tp.section}</span></>}</div>
          <div className="row between wrap mb" style={{ alignItems: 'flex-start' }}>
            <div><h1>{tp.title}</h1>{tp.summary && <p className="muted mt-sm" style={{ fontSize: 16 }}>{tp.summary}</p>}<div className="mt-sm"><Verification v={d.verification} compact /></div></div>
            <BookmarkBtn type="topic" id={tp.id} title={tp.title} subtitle={tp.summary} link={`/kb/${tp.slug}`} saved={d.bookmarked} />
          </div>
          {d.myMistakes > 0 && <div className="alert warn mb"><AlertCircle />Сіз бұл ережеде {d.myMistakes} рет қате жібердіңіз. Төмендегі түсіндірме мен жаттығулар көмектеседі.</div>}
          <div className="lesson-grid">
            <div className="stack" style={{ gap: 18 }}>
              {tp.arabic && <div className="card center"><Ar size="xl" center>{tp.arabic}</Ar></div>}
              {tp.simple && <div className="note key"><h4><Lightbulb />Қарапайым түсіндірме</h4><p className="pre" style={{ fontSize: 16 }}>{tp.simple}</p></div>}
              {tp.rule && <div className="note remember"><h4><ScrollText />Ереже</h4><p className="pre">{tp.rule}</p></div>}
              {tp.examples?.length > 0 && (
                <div className="card">
                  <h3 className="mb"><ListChecks size={18} /> Мысалдар</h3>
                  <div className="grid auto-fill" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
                    {tp.examples.map((ex, i) => (
                      <div key={i} className="note center"><Ar size="lg" center>{ex.ar}</Ar><div className="small muted">{ex.note}</div></div>
                    ))}
                  </div>
                </div>
              )}
              {tp.audio_url && <div className="card"><div className="card-title"><Volume2 />Аудио мысал</div><audio className="mt" controls src={tp.audio_url} /></div>}
              {tp.youtube_url && <div><h3 className="mb">Видео</h3><YouTube url={tp.youtube_url} title={tp.title} /></div>}
              {tp.mistakes && <div className="note mistake"><h4><AlertOctagon />Жиі кездесетін қателер</h4><p className="pre">{tp.mistakes}</p></div>}
              {d.exercises.length > 0 && (
                <div><h2 className="mb">Практикалық жаттығу</h2><div className="stack">{d.exercises.map((ex, i) => <Exercise key={ex.id} ex={ex} index={i + 1} />)}</div></div>
              )}
              {d.test && <Link to={`/tests/${d.test.id}`} className="card card-link row"><span className="stat-icon"><ClipboardCheck /></span><div className="li-body"><div className="card-title">Мини-тест</div><div className="bold">{d.test.title}</div></div><ArrowRight /></Link>}
              <Verification v={d.verification} />
            </div>
            <aside className="lesson-side stack">
              {d.lesson && <Link to={`/lessons/${d.lesson.id}`} className="card card-link"><div className="card-title"><BookOpen />Сабақ</div><div className="bold mt-sm">{d.lesson.title}</div><div className="small muted">Толық видеосабақ пен конспект</div></Link>}
              {d.myMistakes > 0 && tp.rule_tag && <ResolveBtn tag={tp.rule_tag} />}
              {d.related.length > 0 && (
                <div className="card"><div className="card-title">Ұқсас тақырыптар</div>
                  <div className="list mt-sm">{d.related.map((r) => <Link key={r.slug} to={`/kb/${r.slug}`} className="list-item"><div className="li-body li-title small">{r.title}</div><ArrowRight size={16} /></Link>)}</div>
                </div>
              )}
            </aside>
          </div>
        </>
      );
    }}</Loader>
  );
}

function ResolveBtn({ tag }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  return <button className="btn soft block" disabled={done} onClick={async () => { await api.post(`/api/mistakes/${tag}/resolve`); setDone(true); toast('Жарайсыз! Ереже қайталанды деп белгіленді.'); }}><RotateCcw />{done ? 'Қайталандым ✓' : 'Ережені қайталадым'}</button>;
}

export function Arabic() {
  const q = useApi('/api/arabic');
  const LEVELS = [['beginner', 'Beginner', 'Әліпби · Сөздер · Сөйлемдер · Грамматика негіздері'], ['intermediate', 'Intermediate', 'Сарф · Наху · Сөздік қор · Мәтін оқу'], ['advanced', 'Advanced', 'Жетілдірілген материалдар']];
  return (
    <>
      <PageHead title={t('Араб тілі')} sub="Әр сабақ: теория → мысалдар → аудио → сөздік → практика → тест">
        <Link to="/dictionary" className="btn ghost"><Languages />{t('Сөздік')}</Link>
      </PageHead>
      <Loader q={q}>{(d) => (
        <div className="stack" style={{ gap: 20 }}>
          {LEVELS.map(([lv, name, desc]) => {
            const cs = d.courses.filter((c) => c.level === lv);
            return (
              <div key={lv} className="card">
                <div className="row between wrap"><div><span className="badge primary">{name}</span><div className="small muted mt-sm">{desc}</div></div></div>
                {cs.length === 0 ? <div className="small muted mt">Материалдар дайындалуда</div> : cs.map((c) => (
                  <div key={c.id} className="note mt">
                    <div className="row between wrap">
                      <h3>{c.title}</h3>
                      {c.hasAccess ? <span className="bold">{c.percent}%</span> : <span className="badge"><Lock />Қолжетімділік ашылмаған</span>}
                    </div>
                    {c.hasAccess && <>
                      <div className="mt-sm"><Progress value={c.percent} size="sm" /></div>
                      <div className="chips mt">{c.modules.map((m) => <span key={m.id} className="chip">{m.title} · {m.percent}%</span>)}</div>
                      <div className="row wrap mt">
                        {c.next && <Link className="btn sm" to={`/lessons/${c.next.id}`}>{c.next.title}<ArrowRight /></Link>}
                        <Link className="btn ghost sm" to={`/courses/${c.id}`}>Бағдарлама</Link>
                      </div>
                    </>}
                  </div>
                ))}
              </div>
            );
          })}
          <Link to="/dictionary" className="card card-link row"><span className="stat-icon"><Languages /></span><div className="li-body"><div className="bold">Сөздік</div><div className="small muted">{d.words} сөз · транскрипция, мағына, мысал, Құрандағы қолданысы</div></div><ArrowRight /></Link>
        </div>
      )}</Loader>
    </>
  );
}

export function Dictionary() {
  const [sp] = useSearchParams();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('');
  const [topic, setTopic] = useState('');
  const topics = useApi('/api/words/topics');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const id = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(id); }, [q]);
  const res = useApi(`/api/words?q=${encodeURIComponent(debounced)}&level=${level}&topic=${encodeURIComponent(topic)}`, [debounced, level, topic]);
  const focus = Number(sp.get('w'));
  const speak = (w) => {
    if (w.audio_url) return new Audio(w.audio_url).play();
    if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(w.arabic); u.lang = 'ar-SA'; u.rate = 0.8; speechSynthesis.speak(u); }
  };
  return (
    <>
      <PageHead title={t('Сөздік')} sub="Араб сөздері: жазылуы, транскрипциясы, мағынасы, айтылуы және Құрандағы қолданысы" crumbs={[{ label: t('Араб тілі'), to: '/arabic' }, { label: t('Сөздік') }]} />
      <div className="row wrap mb">
        <div style={{ position: 'relative', flex: '1 1 280px' }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: 13, color: 'var(--muted)' }} />
          <input className="input" style={{ paddingLeft: 42, height: 46 }} placeholder="Сөзді іздеу..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chips">{[['', 'Барлығы'], ['beginner', 'Beginner'], ['intermediate', 'Intermediate']].map(([v, l]) => <button key={v} className={`chip ${level === v ? 'on' : ''}`} onClick={() => setLevel(v)}>{l}</button>)}</div>
      </div>
      <div className="chips mb">
        <button className={`chip ${!topic ? 'on' : ''}`} onClick={() => setTopic('')}>Барлық тақырып</button>
        {(topics.data || []).filter((x) => x.topic).map((x) => <button key={x.topic} className={`chip ${topic === x.topic ? 'on' : ''}`} onClick={() => setTopic(x.topic)}>{x.topic} · {x.n}</button>)}
      </div>
      <Loader q={res}>{(words) => words.length === 0 ? <Empty title="Сөз табылмады" /> : (
        <div className="grid auto-fill">
          {words.map((w) => (
            <div key={w.id} className="card" style={focus === w.id ? { borderColor: 'var(--primary)', boxShadow: '0 0 0 3px var(--lav)' } : undefined}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <button className="icon-btn" onClick={() => speak(w)} aria-label="Айтылуын тыңдау"><Volume2 /></button>
                <Ar size="lg">{w.arabic}</Ar>
              </div>
              <div className="small muted">{w.translit}</div>
              <div className="bold" style={{ fontSize: 17 }}>{w.meaning}</div>
              {w.example_ar && <div className="note mt-sm" style={{ padding: 12 }}><Ar size="sm">{w.example_ar}</Ar><div className="small muted">{w.example_kk}</div></div>}
              {w.in_quran ? <div className="row small mt-sm" style={{ color: 'var(--primary-700)' }}><Star size={14} />Құранда кездеседі{w.quran_ref && (Number(w.quran_ref.split(':')[0]) >= 89 ? <Link to={`/tafsir/${w.quran_ref.split(':')[0]}`} className="bold">· {w.quran_ref}</Link> : <span className="bold">· {w.quran_ref}</span>)}</div> : null}
              <div className="mt"><BookmarkBtn small type="word" id={w.id} title={`${w.arabic} — ${w.meaning}`} subtitle={w.translit} link={`/dictionary?w=${w.id}`} saved={w.saved} /></div>
            </div>
          ))}
        </div>
      )}</Loader>
    </>
  );
}
