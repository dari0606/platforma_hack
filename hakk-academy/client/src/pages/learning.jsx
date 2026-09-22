import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Check, Play, Lock, ArrowRight, ArrowLeft, Target, Lightbulb, Brain, BookOpenCheck, AlertOctagon, Clock, ClipboardCheck, CheckCircle2, FileText, GraduationCap, PlayCircle } from 'lucide-react';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { useApi, Loader, Progress, PageHead, Empty, Ar, BookmarkBtn, Verification, useToast, Tabs, StatusBadge, fmtDate } from '../components/ui.jsx';
import { YouTube, VideoThumb } from '../components/media.jsx';
import { Exercise, FilePick, SubmissionStatus } from '../components/practice.jsx';
import { Recorder } from '../components/media.jsx';

const DIRECTION = { quran: 'Құран оқу', tajweed: 'Тәжуид', arabic: 'Араб тілі', tafsir: 'Тәпсір', hifz: 'Жаттау' };

export function Learning() {
  const q = useApi('/api/courses');
  return (
    <>
      <PageHead title={t('Менің оқуым')} sub="Сізге ашық бағдарламалар. Курс → Модуль → Сабақ → Практика → Тест." />
      <Loader q={q}>{(courses) => courses.length === 0 ? <Empty title="Әзірге курс ашылмаған">Куратор қолжетімділік бергенде курстар осында пайда болады.</Empty> : (
        <div className="stack" style={{ gap: 20 }}>
          {courses.map((c) => (
            <div key={c.id} className="card">
              <div className="row wrap between">
                <div>
                  <div className="row"><span className="badge primary">{DIRECTION[c.direction]}</span>{c.level && <span className="badge">{c.level}</span>}</div>
                  <h2 className="mt-sm">{c.title}</h2>
                  <div className="muted small mt-sm">{c.subtitle}</div>
                </div>
                <div style={{ textAlign: 'right' }}><div className="big-num">{c.percent}%</div><div className="small muted">{c.done}/{c.total} сабақ</div></div>
              </div>
              <div className="mt"><Progress value={c.percent} /></div>
              <div className="map mt" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
                {c.modules.map((m) => (
                  <div key={m.id} className={`map-item ${m.state}`}>
                    <span className={`li-icon ${m.state === 'completed' ? 'done' : m.state === 'locked' ? 'locked' : 'current'}`}>{m.state === 'completed' ? <Check /> : m.state === 'locked' ? <Lock /> : <Play />}</span>
                    <div className="li-body"><div className="small bold ellipsis">{m.title}</div><div className="tiny muted">{m.state === 'locked' ? 'Жабық' : `${m.percent}%`}</div></div>
                  </div>
                ))}
              </div>
              <div className="row wrap mt-lg">
                {c.next && <Link to={`/lessons/${c.next.id}`} className="btn">{t('Оқуды жалғастыру')}: {c.next.title}<ArrowRight /></Link>}
                <Link to={`/courses/${c.id}`} className="btn ghost">Бағдарламаны ашу</Link>
              </div>
            </div>
          ))}
        </div>
      )}</Loader>
    </>
  );
}

export const LessonIcon = ({ state }) => (
  <span className={`li-icon ${state === 'completed' ? 'done' : state === 'locked' ? 'locked' : 'current'}`}>
    {state === 'completed' ? <Check /> : state === 'locked' ? <Lock /> : <Play />}
  </span>
);
const STATE_LABEL = { completed: '✓ Аяқталды', in_progress: '▶ Жалғастыру', available: '▶ Бастау', locked: '🔒 Алдымен алдыңғы сабақты аяқтаңыз' };

export function CoursePage() {
  const { id } = useParams();
  const q = useApi(`/api/courses/${id}`);
  return (
    <Loader q={q}>{(d) => (
      <>
        <PageHead title={d.course.title} sub={d.course.description} crumbs={[{ label: t('Менің оқуым'), to: '/learning' }, { label: d.course.title }]}>
          {d.next && <Link to={`/lessons/${d.next.id}`} className="btn">{t('Оқуды жалғастыру')}<ArrowRight /></Link>}
        </PageHead>
        <div className="card mb">
          <div className="row"><div style={{ flex: 1 }}><Progress value={d.percent} size="lg" /></div><b>{d.percent}%</b></div>
          <div className="small muted mt-sm">{d.done} / {d.total} сабақ аяқталды</div>
          {d.certificate && <Link to={`/certificates/${d.certificate.id}`} className="btn soft mt"><GraduationCap />🎓 Сертификат</Link>}
        </div>
        <div className="stack" style={{ gap: 16 }}>
          {d.modules.map((m) => (
            <div key={m.id} className="card">
              <div className="row between wrap">
                <h3>{m.title}</h3>
                <div className="row small muted"><span>{m.done}/{m.total}</span><div style={{ width: 120 }}><Progress value={m.percent} size="sm" /></div></div>
              </div>
              <div className="list mt-sm">
                {m.lessons.map((l) => {
                  const Row = l.state === 'locked' ? 'div' : Link;
                  return (
                    <Row key={l.id} to={`/lessons/${l.id}`} className="list-item" style={l.state === 'locked' ? { opacity: .65 } : undefined}>
                      <LessonIcon state={l.state} />
                      <div className="li-body"><div className="li-title">{l.title}</div><div className="tiny muted">{STATE_LABEL[l.state]}</div></div>
                      {l.status !== 'published' && <StatusBadge status={l.status} />}
                      <span className="small muted nowrap"><Clock size={13} /> {l.duration_min} мин</span>
                    </Row>
                  );
                })}
                {m.lessons.length === 0 && <div className="small muted">Сабақтар дайындалуда</div>}
              </div>
            </div>
          ))}
        </div>
      </>
    )}</Loader>
  );
}

export function LessonsLibrary() {
  const q = useApi('/api/lessons');
  const [dir, setDir] = useState('all');
  return (
    <>
      <PageHead title={t('Сабақтар')} sub="Барлық видеосабақтар бір жерде. Жабық сабақтар алдыңғыларын аяқтағанда ашылады." />
      <Loader q={q}>{(rows) => {
        const dirs = [...new Set(rows.map((r) => r.direction))];
        const list = rows.filter((r) => dir === 'all' || r.direction === dir);
        return (
          <>
            <div className="chips mb">
              <button className={`chip ${dir === 'all' ? 'on' : ''}`} onClick={() => setDir('all')}>Барлығы · {rows.length}</button>
              {dirs.map((d) => <button key={d} className={`chip ${dir === d ? 'on' : ''}`} onClick={() => setDir(d)}>{DIRECTION[d]}</button>)}
            </div>
            <div className="grid auto-fill">
              {list.map((l) => {
                const Card = l.state === 'locked' ? 'div' : Link;
                return (
                  <Card key={l.id} to={`/lessons/${l.id}`} className="card card-link" style={{ padding: 14, opacity: l.state === 'locked' ? .6 : 1 }}>
                    {l.youtube_url ? <VideoThumb url={l.youtube_url} /> : <div className="video-thumb" style={{ display: 'grid', placeItems: 'center' }}><FileText color="var(--primary)" /></div>}
                    <div className="tiny muted mt">{l.course_title} · {l.module_title}</div>
                    <div className="bold mt-sm">{l.title}</div>
                    <div className="row between mt-sm"><span className="small muted"><Clock size={13} /> {l.duration_min} мин</span><span className="tiny">{STATE_LABEL[l.state]?.split(' ')[0]}</span></div>
                  </Card>
                );
              })}
            </div>
          </>
        );
      }}</Loader>
    </>
  );
}

export function LessonPage() {
  const { id } = useParams();
  const q = useApi(`/api/lessons/${id}`, [id]);
  if (q.error?.status === 423) {
    return (
      <div className="card mt-lg center" style={{ maxWidth: 560, margin: '40px auto' }}>
        <Lock size={36} color="var(--primary)" />
        <h2 className="mt">Алдымен алдыңғы сабақты аяқтаңыз</h2>
        <p className="muted mt-sm">Сабақтар ретімен ашылады — бұл білімді жүйелі меңгеруге көмектеседі.</p>
        {q.error.data?.next && <Link to={`/lessons/${q.error.data.next.id}`} className="btn mt-lg">{q.error.data.next.title}<ArrowRight /></Link>}
      </div>
    );
  }
  return <Loader q={q}>{(d) => <LessonView d={d} reload={q.reload} />}</Loader>;
}

function LessonView({ d, reload }) {
  const l = d.lesson;
  const nav = useNavigate();
  const toast = useToast();
  const [done, setDone] = useState(d.state === 'completed');
  const complete = async () => {
    try {
      const r = await api.post(`/api/lessons/${l.id}/complete`);
      setDone(true); toast(`Сабақ аяқталды ✓ Курс прогресі: ${r.percent}%`);
      if (d.next) nav(`/lessons/${d.next.id}`); else reload();
    } catch (e) { toast(e.message); }
  };
  const summary = [
    ['key', Lightbulb, t('Негізгі түсінік'), l.key_concept],
    ['remember', Brain, t('Есте сақтаңыз'), l.remember],
    ['example', BookOpenCheck, t('Мысал'), l.example, l.example_ar],
    ['mistake', AlertOctagon, t('Жиі жіберілетін қате'), l.common_mistake],
  ].filter((x) => x[3] || x[4]);

  return (
    <>
      <div className="crumbs mt-sm"><Link to="/learning">{t('Менің оқуым')}</Link> › <Link to={`/courses/${d.course.id}`}>{d.course.title}</Link> › <span>{d.modules.find((m) => m.id === d.module_id)?.title}</span></div>
      <div className="row between wrap mb" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1>{l.title}</h1>
          <div className="row wrap mt-sm"><span className="badge"><Clock />{l.duration_min} мин</span>{done && <span className="badge green"><Check />Аяқталды</span>}<Verification v={d.verification} compact /></div>
        </div>
        <BookmarkBtn type="lesson" id={l.id} title={l.title} subtitle={d.course.title} link={`/lessons/${l.id}`} saved={d.bookmarked} />
      </div>

      <div className="lesson-grid">
        <div className="stack" style={{ gap: 20 }}>
          {l.goal && (
            <div className="card lav">
              <div className="row" style={{ alignItems: 'flex-start' }}><span className="section-num" style={{ background: '#fff' }}>1</span>
                <div><div className="card-title" style={{ color: 'var(--primary-700)' }}><Target />{t('Сабақтың мақсаты')}</div><p className="mt-sm" style={{ fontSize: 16 }}>{l.goal}</p></div>
              </div>
            </div>
          )}
          <div>
            <div className="row mb"><span className="section-num">2</span><h2>{t('Видеосабақ')}</h2></div>
            <YouTube url={l.youtube_url} title={l.title} />
          </div>
          {summary.length > 0 && (
            <div className="card">
              <div className="row mb"><span className="section-num">3</span><h2>{t('Қысқаша конспект')}</h2></div>
              <div className="stack">
                {summary.map(([cls, Icon, title, text, ar]) => (
                  <div key={cls} className={`note ${cls}`}>
                    <h4><Icon />{title}</h4>
                    {text && <p className="pre">{text}</p>}
                    {ar && <Ar size="lg" center className="mt-sm">{ar}</Ar>}
                  </div>
                ))}
                {l.body && <p className="pre">{l.body}</p>}
              </div>
              <Verification v={d.verification} />
            </div>
          )}

          {d.exercises.length > 0 && (
            <div>
              <div className="row mb"><span className="section-num">4</span><h2>{t('Практика')}</h2></div>
              <div className="stack" style={{ gap: 14 }}>
                {d.exercises.map((ex, i) => <Exercise key={ex.id} ex={ex} index={i + 1} />)}
              </div>
            </div>
          )}

          {d.assignments.length > 0 && (
            <div className="card">
              <h2 className="mb">Үй тапсырмасы</h2>
              {d.assignments.map((a) => <Assignment key={a.id} a={a} />)}
            </div>
          )}

          {d.test && (
            <Link to={`/tests/${d.test.id}`} className="card card-link row">
              <span className="stat-icon"><ClipboardCheck /></span>
              <div className="li-body"><div className="card-title">5 · Өзіңізді тексеріңіз</div><div className="bold">{d.test.title}</div></div><ArrowRight />
            </Link>
          )}

          <div className="card row wrap between">
            {d.prev ? <Link className="btn ghost" to={`/lessons/${d.prev.id}`}><ArrowLeft />{t('Артқа')}</Link> : <span />}
            {!done ? <button className="btn lg green" onClick={complete}><CheckCircle2 />{t('Сабақты аяқтадым')}</button>
              : d.next && d.next.state !== 'locked' ? <Link className="btn lg" to={`/lessons/${d.next.id}`}>{t('Келесі')}: {d.next.title}<ArrowRight /></Link>
                : <span className="badge green"><Check />Аяқталды</span>}
          </div>
        </div>

        <aside className="lesson-side">
          <div className="card module-nav">
            <div className="small muted">Курс прогресі</div>
            <div className="row mt-sm"><div style={{ flex: 1 }}><Progress value={d.percent} size="sm" /></div><b className="small">{d.percent}%</b></div>
            <div className="mt">
              {d.modules.map((m) => (
                <details key={m.id} className="mod" open={m.id === d.module_id}>
                  <summary className="row between" style={{ cursor: 'pointer', listStyle: 'none' }}><span className="bold small">{m.title}</span><span className="tiny muted">{m.percent}%</span></summary>
                  <div className="mt-sm">
                    {m.lessons.map((x) => (
                      <Link key={x.id} to={`/lessons/${x.id}`} className={`lesson-link ${x.id === l.id ? 'here' : ''} ${x.state === 'locked' ? 'locked' : ''}`}>
                        {x.state === 'completed' ? <Check color="var(--green)" /> : x.state === 'locked' ? <Lock /> : <PlayCircle color="var(--primary)" />}
                        <span className="ellipsis">{x.title}</span>
                      </Link>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

export function Assignment({ a }) {
  const [sub, setSub] = useState(a.submission);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const send = async (payload) => {
    setBusy(true);
    const fd = new FormData(); fd.append('assignment_id', a.id);
    if (payload instanceof Blob) fd.append('file', payload, payload.name || 'recording.webm'); else fd.append('text', payload);
    try { setSub(await api.post('/api/submissions', fd)); setText(''); toast('Жіберілді ✓'); } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="note mb">
      <div className="row between wrap"><b>{a.title}</b>{a.due_at && <span className="badge amber">Мерзімі: {fmtDate(a.due_at, true)}</span>}</div>
      {a.lesson_title && <div className="tiny muted">{a.lesson_title}</div>}
      {a.description && <p className="small mt-sm pre">{a.description}</p>}
      <div className="mt">
        {a.kind === 'text' && <div className="stack"><textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Жауабыңыз…" /><div><button className="btn sm" disabled={busy || !text.trim()} onClick={() => send(text)}>Жіберу</button></div></div>}
        {a.kind === 'audio' && <Recorder busy={busy} onSubmit={send} />}
        {a.kind === 'upload' && <FilePick busy={busy} onPick={send} />}
      </div>
      {sub && <SubmissionStatus sub={sub} />}
    </div>
  );
}

export { Tabs };
