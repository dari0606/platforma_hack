import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Check, Lock, ArrowRight, BookOpen, PenLine, ClipboardCheck, BookMarked, Mic, Flame, AlertCircle, RotateCcw, GraduationCap, Trash2, Send, Paperclip,
  ChevronLeft, ChevronRight, Video, MapPin, Clock, FileText, Headphones, Link2, PlayCircle, Printer, LogOut, KeyRound, Bookmark,
} from 'lucide-react';
import { api } from '../api.js';
import { t, setLocale, getLocale } from '../i18n.js';
import { useApi, Loader, PageHead, Progress, Ring, Empty, Tabs, StatusBadge, ago, fmtDate, useAuth, useMeta, useToast, WD, localISO, initials, Ar } from '../components/ui.jsx';
import { YouTube, youtubeId } from '../components/media.jsx';
import { getArScale, setArScale } from '../components/quran.jsx';

export function ProgressPage() {
  const q = useApi('/api/progress');
  return (
    <>
      <PageHead title={t('Менің прогрессім')} sub="Қазір мен қай жердемін? Қанша прогресс жасадым?" />
      <Loader q={q}>{(d) => (
        <>
          <div className="grid dash">
            <div className="card row wrap" style={{ gap: 28 }}>
              <Ring value={d.percent} />
              <div className="li-body">
                <div className="card-title">Жалпы прогресс</div>
                <h2 className="mt-sm">{d.percent}% аяқталды</h2>
                <div className="row small muted mt-sm"><Flame size={16} color="var(--amber)" />Оқу сериясы: {d.streak} күн</div>
              </div>
            </div>
            <div className="grid g3" style={{ gap: 12 }}>
              {[[BookOpen, d.lessons, 'Аяқталған сабақ'], [PenLine, d.tasks, 'Орындалған тапсырма'], [ClipboardCheck, d.testAvg != null ? `${d.testAvg}%` : '—', 'Тест нәтижесі'],
                [BookMarked, d.tafsir, 'Тәпсір сабағы'], [Mic, d.quranPractice, 'Құран практикасы'], [GraduationCap, `${d.hifz.memorized}/${d.hifz.total}`, 'Жатталған сүре']].map(([Icon, v, l]) => (
                <div key={l} className="card" style={{ padding: 16 }}><div className="stat"><div className="stat-icon"><Icon /></div><div className="v">{v}</div><div className="l">{l}</div></div></div>
              ))}
            </div>
          </div>

          {d.courses.map((c) => (
            <div key={c.id} className="card mt">
              <div className="row between wrap"><h2>{c.title}</h2><span className="bold">{c.percent}% · {c.done}/{c.total}</span></div>
              <div className="mt-sm"><Progress value={c.percent} /></div>
              <div className="card-title mt-lg mb">Бағдарлама картасы</div>
              <div className="map">
                {c.modules.map((m) => (
                  <Link to={`/courses/${c.id}`} key={m.id} className={`map-item ${m.state}`}>
                    <span className={`li-icon ${m.state === 'completed' ? 'done' : m.state === 'locked' ? 'locked' : 'current'}`}>{m.state === 'completed' ? <Check /> : m.state === 'locked' ? <Lock /> : m.percent + '%'}</span>
                    <div className="li-body"><div className="bold small">{m.title}</div></div>
                    <span className="small bold">{m.state === 'completed' ? '✓' : m.state === 'locked' ? '🔒' : `${m.percent}%`}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <div className="grid g2 mt">
            <div className="card">
              <div className="card-head"><h2>{t('Менің қателерім')}</h2><Link to="/mistakes" className="small bold" style={{ color: 'var(--primary)' }}>Толығырақ</Link></div>
              {d.mistakes.length === 0 ? <div className="small muted">Ұстаз әзірге қате белгілемеген.</div> : d.mistakes.slice(0, 5).map((m) => (
                <div key={m.rule_tag} className="hbar"><span>{m.label}</span><Progress value={Math.min(100, m.count * 20)} size="sm" /><span className="small bold">{m.count}</span></div>
              ))}
            </div>
            <div className="card">
              <h2 className="mb">Тест тарихы</h2>
              {d.attempts.length === 0 ? <div className="small muted">Тест тапсырылмаған</div> : <div className="list">{d.attempts.map((a, i) => (
                <Link key={i} to={`/tests/${a.test_id}`} className="list-item"><div className="li-body"><div className="li-title small">{a.title}</div><div className="tiny muted">{fmtDate(a.created_at, true)}</div></div><span className={`badge ${a.score >= 70 ? 'green' : 'amber'}`}>{a.score}%</span></Link>
              ))}</div>}
            </div>
          </div>

          <div className="card mt">
            <h2 className="mb">🎓 Сертификаттар</h2>
            {d.certificates.length === 0 ? <div className="small muted">Бағдарламаны толық аяқтағанда сертификат осында пайда болады.</div> : d.certificates.map((c) => (
              <Link key={c.id} to={`/certificates/${c.id}`} className="list-item"><GraduationCap color="var(--primary)" /><div className="li-body"><div className="li-title">{c.title}</div><div className="tiny muted">{fmtDate(c.completed_at)} · {c.percent}%</div></div>{c.downloadable ? <span className="badge green">Жүктеуге болады</span> : <span className="badge">Әкімші рұқсатын күтуде</span>}</Link>
            ))}
          </div>
        </>
      )}</Loader>
    </>
  );
}

export function MistakesPage() {
  const q = useApi('/api/mistakes');
  const toast = useToast();
  return (
    <>
      <PageHead title={t('Менің қателерім')} sub="Ұстаз оқуыңызды тексергенде белгілеген нақты қателер. Платформа сізді тиісті сабақ пен жаттығуға бағыттайды." crumbs={[{ label: t('Менің прогрессім'), to: '/progress' }, { label: t('Менің қателерім') }]} />
      <Loader q={q}>{(rows) => rows.length === 0 ? <Empty icon={AlertCircle} title="Қате белгіленбеген">Дауысыңызды жазып жіберсеңіз, ұстаз тексеріп, қателерді осында белгілейді.</Empty> : (
        <div className="grid g2">
          {rows.map((m) => (
            <div key={m.rule_tag} className="card" style={m.open ? undefined : { opacity: .7 }}>
              <div className="row between"><h2>{m.label}</h2>{m.open ? <span className="badge red">{m.open} ашық</span> : <span className="badge green">Қайталанды</span>}</div>
              <p className="mt-sm">{m.open ? <>Сіз бұл ережеде <b>{m.open} рет</b> қате жібердіңіз.</> : `Барлығы ${m.count} рет белгіленген.`}</p>
              <div className="tiny muted mt-sm">Соңғысы: {ago(m.last)}</div>
              <div className="row wrap mt">
                {m.topic && <Link to={`/kb/${m.topic.slug}`} className="btn"><RotateCcw />{t('Ережені қайталау')}</Link>}
                {m.lesson && <Link to={`/lessons/${m.lesson.id}`} className="btn ghost">Сабаққа оралу</Link>}
                {m.open > 0 && <button className="btn ghost" onClick={async () => { await api.post(`/api/mistakes/${m.rule_tag}/resolve`); toast('Белгіленді ✓'); q.reload(); }}>Қайталадым</button>}
              </div>
            </div>
          ))}
        </div>
      )}</Loader>
    </>
  );
}

const TYPE = { lesson: 'Сабақ', video: 'Видео', ayah: 'Аят', topic: 'Ереже / мақала', word: 'Араб сөзі', surah: 'Тәпсір', exercise: 'Жаттығу', material: 'Материал' };
export function SavedPage() {
  const q = useApi('/api/bookmarks');
  const [f, setF] = useState('all');
  const remove = async (b) => { await api.post('/api/bookmarks', { item_type: b.item_type, item_id: b.item_id }); q.reload(); };
  return (
    <>
      <PageHead title={t('Сақталғандар')} sub="Кез келген материалдағы 🔖 Сақтау батырмасы арқылы жинаған дүниелеріңіз" />
      <Loader q={q}>{(rows) => {
        const types = [...new Set(rows.map((r) => r.item_type))];
        const list = rows.filter((r) => f === 'all' || r.item_type === f);
        return rows.length === 0 ? <Empty icon={Bookmark} title="Әзірге ештеңе сақталмаған">Сабақ, аят, ереже немесе сөздің жанындағы «Сақтау» батырмасын басыңыз.</Empty> : (
          <>
            <div className="chips mb"><button className={`chip ${f === 'all' ? 'on' : ''}`} onClick={() => setF('all')}>Барлығы · {rows.length}</button>{types.map((x) => <button key={x} className={`chip ${f === x ? 'on' : ''}`} onClick={() => setF(x)}>{TYPE[x]}</button>)}</div>
            <div className="card"><div className="list">{list.map((b) => (
              <div key={b.id} className="list-item">
                <Link to={b.link || '#'} className="li-body">
                  <div className="row" style={{ gap: 8 }}><span className="li-title">{b.title}</span><span className="badge">{TYPE[b.item_type]}</span></div>
                  {b.subtitle && (/[؀-ۿ]/.test(b.subtitle) ? <div className="ar ar-sm" lang="ar">{b.subtitle}</div> : <div className="tiny muted">{b.subtitle}</div>)}
                </Link>
                <button className="icon-btn" onClick={() => remove(b)} aria-label="Өшіру"><Trash2 /></button>
              </div>
            ))}</div></div>
          </>
        );
      }}</Loader>
    </>
  );
}

export function QuestionsPage() {
  const { user } = useAuth();
  const meta = useMeta();
  const q = useApi('/api/questions');
  const [cat, setCat] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const send = async (e) => {
    e.preventDefault(); setBusy(true);
    const fd = new FormData(); fd.append('category', cat); fd.append('text', text); if (file) fd.append('file', file);
    try { await api.post('/api/questions', fd); setText(''); setFile(null); toast('Сұрағыңыз жіберілді ✓'); q.reload(); } catch (e2) { toast(e2.message); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHead title={t('Ұстазға сұрақ')} sub="Сұрағыңызды жазыңыз — ұстаз немесе куратор платформа ішінде жауап береді" />
      <div className="lesson-grid">
        <div>
          <Loader q={q}>{(rows) => rows.length === 0 ? <Empty title="Әлі сұрақ қойылмаған" /> : <div className="stack">{rows.map((th) => <Thread key={th.id} th={th} me={user} onChange={q.reload} />)}</div>}</Loader>
        </div>
        <aside className="lesson-side">
          <form className="card stack" onSubmit={send}>
            <h3>Жаңа сұрақ</h3>
            <div className="field"><label>Санат</label>
              <div className="chips">{(meta.QA_CATEGORIES || []).map((c) => <button type="button" key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
            </div>
            <div className="field"><label>Сұрағыңыз</label><textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Мысалы: ихфа мен идғамның айырмашылығы неде?" required /></div>
            <label className="btn ghost sm" style={{ alignSelf: 'flex-start' }}><Paperclip />{file ? file.name : 'Аудио / сурет тіркеу'}<input type="file" hidden accept="audio/*,image/*" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
            <button className="btn" disabled={busy || !cat || !text.trim()}><Send />Жіберу</button>
          </form>
        </aside>
      </div>
    </>
  );
}

export function Thread({ th, me, onChange }) {
  const [reply, setReply] = useState('');
  const send = async () => { await api.post(`/api/questions/${th.id}/reply`, { text: reply }); setReply(''); onChange(); };
  return (
    <div className="card">
      <div className="row between wrap"><div className="row"><span className="badge primary">{th.category}</span>{me.role !== 'student' && <span className="small bold">{th.author}</span>}</div><StatusBadge status={th.status} /></div>
      <p className="mt pre" style={{ fontSize: 15.5 }}>{th.text}</p>
      {th.file_path && (/\.(webm|wav|mp3|m4a|ogg)$/i.test(th.file_path) ? <audio className="mt-sm" controls src={th.file_path} /> : <a href={th.file_path} target="_blank" rel="noreferrer" className="small mt-sm" style={{ display: 'inline-block' }}>📎 {th.file_name}</a>)}
      <div className="tiny muted mt-sm">{ago(th.created_at)}</div>
      {th.replies.map((r) => (
        <div key={r.id} className="note mt" style={r.role !== 'student' ? { background: 'var(--lav)', borderColor: 'var(--lav-2)' } : undefined}>
          <div className="row between"><b className="small">{r.name}{r.role !== 'student' && ' · ұстаз'}</b><span className="tiny muted">{ago(r.created_at)}</span></div>
          <p className="small mt-sm pre">{r.text}</p>
        </div>
      ))}
      <div className="row mt">
        <input className="input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={me.role === 'student' ? 'Нақтылау сұрағы…' : 'Жауап жазу…'} onKeyDown={(e) => e.key === 'Enter' && reply.trim() && send()} />
        <button className="btn" disabled={!reply.trim()} onClick={send}><Send /></button>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || '');
  const [pw, setPw] = useState({ current: '', password: '' });
  const [lang, setLang] = useState(getLocale());
  const [arScale, setArScaleState] = useState(getArScale());
  const toast = useToast();
  const save = async (e) => { e.preventDefault(); const r = await api.put('/api/auth/profile', { name, bio, locale: lang }); setUser(r.user); setLocale(lang); toast('Сақталды ✓'); };
  const changePw = async (e) => { e.preventDefault(); try { await api.post('/api/auth/password', pw); setPw({ current: '', password: '' }); toast('Құпиясөз өзгертілді ✓'); } catch (e2) { toast(e2.message); } };
  return (
    <>
      <PageHead title={t('Профиль')} />
      <div className="grid g2">
        <form className="card stack" onSubmit={save}>
          <div className="row"><div className="avatar" style={{ width: 64, height: 64, fontSize: 22, borderRadius: 18 }}>{initials(user.name)}</div><div><h2>{user.name}</h2><div className="small muted">{user.email} · {user.phone}</div><span className="badge primary mt-sm">{{ student: 'Оқушы', teacher: 'Ұстаз', curator: 'Куратор', admin: 'Әкімші' }[user.role]}</span></div></div>
          <div className="field"><label>Аты-жөні</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label>Өзім туралы</label><textarea className="textarea" value={bio} onChange={(e) => setBio(e.target.value)} /></div>
          <div className="field"><label>{t('Тіл')}</label><select className="select" value={lang} onChange={(e) => setLang(e.target.value)}><option value="kk">Қазақша</option><option value="ru">Русский (бета)</option></select></div>
          <div className="row"><button className="btn">Сақтау</button></div>
        </form>
        <div className="card stack">
          <h3>Арабша мәтін өлшемі</h3>
          <p className="small muted">Телефоннан оқығанда ыңғайлы болу үшін аяттар мен сөздердің өлшемін таңдаңыз (осы құрылғыда сақталады).</p>
          <input type="range" min="0.8" max="1.8" step="0.1" value={arScale} onChange={(e) => setArScaleState(setArScale(Number(e.target.value)))} aria-label="Арабша мәтін өлшемі" />
          <div className="ar ar-center" lang="ar">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>
          <div className="small muted center">{Math.round(arScale * 100)}%</div>
        </div>
        <div className="stack">
          <form className="card stack" onSubmit={changePw}>
            <h3><KeyRound size={18} /> Құпиясөзді өзгерту</h3>
            <div className="field"><label>Қазіргі құпиясөз</label><input type="password" className="input" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></div>
            <div className="field"><label>Жаңа құпиясөз</label><input type="password" minLength={6} className="input" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} required /></div>
            <div><button className="btn ghost">Өзгерту</button></div>
          </form>
          <div className="card stack">
            <Link to="/hifz" className="list-item"><BookMarked size={18} /><span className="li-body">Жаттау прогресі</span><ArrowRight size={16} /></Link>
            <Link to="/alphabet" className="list-item"><FileText size={18} /><span className="li-body">Араб әліпбиі</span><ArrowRight size={16} /></Link>
            <Link to="/mistakes" className="list-item"><AlertCircle size={18} /><span className="li-body">{t('Менің қателерім')}</span><ArrowRight size={16} /></Link>
            <Link to="/saved" className="list-item"><Bookmark size={18} /><span className="li-body">{t('Сақталғандар')}</span><ArrowRight size={16} /></Link>
            <Link to="/questions" className="list-item"><Send size={18} /><span className="li-body">{t('Сұрақтар')}</span><ArrowRight size={16} /></Link>
            <Link to="/materials" className="list-item"><FileText size={18} /><span className="li-body">{t('Материалдар')}</span><ArrowRight size={16} /></Link>
            <button className="btn danger" onClick={logout}><LogOut />{t('Шығу')}</button>
          </div>
        </div>
      </div>
    </>
  );
}

const KIND_CLS = { live: 'live', offline: 'offline', exam: 'exam' };
export function CalendarPage() {
  const [offset, setOffset] = useState(0);
  const start = useMemo(() => { const d = new Date(); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd + offset * 7); return d; }, [offset]);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  const q = useApi(`/api/calendar?from=${localISO(start)}&to=${localISO(end)}`, [offset]);
  const meta = useMeta();
  const today = localISO(new Date());
  const [sel, setSel] = useState(null);
  return (
    <>
      <PageHead title={t('Күнтізбе')} sub="Тұрақты сабақтар, тікелей эфирлер, офлайн дәрістер, емтихандар және іс-шаралар">
        <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label="Алдыңғы апта"><ChevronLeft /></button>
        <button className="btn ghost sm" onClick={() => setOffset(0)}>Осы апта</button>
        <button className="icon-btn" onClick={() => setOffset(offset + 1)} aria-label="Келесі апта"><ChevronRight /></button>
      </PageHead>
      <Loader q={q}>{(d) => (
        <>
          {d.live.map((l) => (
            <div key={l.id} className="card mb row wrap" style={{ borderColor: '#f6c9cf' }}>
              <span className="badge live"><span className="live-dot" />🔴 LIVE</span><div className="li-body"><b>Қазір эфирде · {l.title}</b><div className="small muted">{l.teacher_name}</div></div>
              {l.link && <a className="btn" href={l.link} target="_blank" rel="noreferrer">Эфирге қосылу</a>}
            </div>
          ))}
          <div className="week">
            {Array.from({ length: 7 }, (_, i) => { const dd = new Date(start); dd.setDate(dd.getDate() + i); return dd; }).map((dd, i) => {
              const iso = localISO(dd);
              const evs = d.events.filter((e) => e.date === iso);
              return (
                <div key={iso} className={`day ${iso === today ? 'today' : ''}`}>
                  <div className="day-h">{WD[i]}</div>
                  <div className="day-n">{dd.getDate()}</div>
                  {evs.map((e, n) => (
                    <button key={n} className={`ev ${KIND_CLS[e.kind] || ''}`} style={{ width: '100%', textAlign: 'left', border: 0, borderLeft: '3px solid' }} onClick={() => setSel(e)}>
                      <b>{e.time} — {e.title}</b>{e.teacher_name}
                    </button>
                  ))}
                  {evs.length === 0 && <div className="tiny muted">—</div>}
                </div>
              );
            })}
          </div>
          <div className="chips mt">{Object.entries(meta.EVENT_KINDS || {}).map(([k, l]) => <span key={k} className={`ev ${KIND_CLS[k] || ''}`} style={{ margin: 0 }}>{l}</span>)}</div>
          {sel && (
            <div className="card mt">
              <div className="row between wrap"><h2>{sel.title}</h2><span className="badge primary">{meta.EVENT_KINDS?.[sel.kind]}</span></div>
              <div className="stack mt small" style={{ gap: 6 }}>
                <div className="row"><Clock size={15} />{WD[(new Date(sel.at).getDay() + 6) % 7]}, {fmtDate(sel.at, true)} · {sel.duration_min} мин</div>
                {sel.teacher_name && <div className="row"><GraduationCap size={15} />{sel.teacher_name}</div>}
                <div className="row">{sel.format === 'online' ? <><Video size={15} />Online</> : <><MapPin size={15} />Offline · {sel.location}</>}</div>
              </div>
              {sel.link && <a href={sel.link} target="_blank" rel="noreferrer" className="btn mt"><Video />{t('Сабаққа қосылу')}</a>}
              {sel.recording_url && <div className="mt"><div className="card-title mb">Эфир жазбасы</div><YouTube url={sel.recording_url} /></div>}
            </div>
          )}
        </>
      )}</Loader>
    </>
  );
}

const MAT_ICON = { pdf: FileText, audio: Headphones, video: PlayCircle, recording: PlayCircle, link: Link2 };
export function MaterialsPage() {
  const q = useApi('/api/materials');
  const [sp] = useSearchParams();
  const [open, setOpen] = useState(Number(sp.get('m')) || null);
  const [cat, setCat] = useState('all');
  return (
    <>
      <PageHead title={t('Материалдар')} sub="PDF, аудио, эфир жазбалары және Hakk Academy пайдалы сілтемелері" />
      <Loader q={q}>{(rows) => {
        const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))];
        const list = rows.filter((r) => cat === 'all' || r.category === cat);
        return (
          <>
            <div className="chips mb"><button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>Барлығы</button>{cats.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
            <div className="card"><div className="list">{list.map((m) => {
              const Icon = MAT_ICON[m.kind] || FileText;
              const href = m.file_path || m.url;
              const isVideo = youtubeId(m.url);
              return (
                <div key={m.id}>
                  <div className="list-item">
                    <span className="li-icon"><Icon /></span>
                    <div className="li-body"><div className="li-title">{m.title}</div><div className="tiny muted">{[m.category, m.course_title, m.description].filter(Boolean).join(' · ')}</div></div>
                    {isVideo || m.kind === 'audio' ? <button className="btn ghost sm" onClick={() => setOpen(open === m.id ? null : m.id)}>{open === m.id ? t('Жабу') : t('Көру')}</button>
                      : href && <a className="btn ghost sm" href={href} target="_blank" rel="noreferrer">Ашу</a>}
                  </div>
                  {open === m.id && <div style={{ padding: '0 4px 16px' }}>{isVideo ? <YouTube url={m.url} title={m.title} /> : <audio controls src={href} />}</div>}
                </div>
              );
            })}</div></div>
          </>
        );
      }}</Loader>
    </>
  );
}

export function CertificatePage() {
  const { id } = useParams();
  const q = useApi(`/api/certificates/${id}`);
  return (
    <Loader q={q}>{(c) => (
      <div style={{ maxWidth: 820, margin: '20px auto' }}>
        <div className="certificate">
          <div className="brand-logo" style={{ margin: '0 auto', width: 56, height: 56, fontSize: 24 }}>H</div>
          <div className="small muted mt">Hakk Academy · Құран және араб тілі оқу орталығы</div>
          <h1 className="mt-lg" style={{ fontSize: 34 }}>Сертификат</h1>
          <p className="muted mt">Осы сертификат</p>
          <h2 className="mt-sm" style={{ fontSize: 30, color: 'var(--primary-700)' }}>{c.student}</h2>
          <p className="muted mt">келесі бағдарламаны сәтті аяқтағанын растайды:</p>
          <h2 className="mt-sm">«{c.course_title}»</h2>
          <div className="row mt-lg" style={{ justifyContent: 'center', gap: 40 }}>
            <div><div className="big-num">{c.percent}%</div><div className="small muted">өту пайызы</div></div>
            <div><div className="big-num" style={{ fontSize: 26 }}>{fmtDate(c.completed_at)}</div><div className="small muted">аяқталған күні</div></div>
          </div>
          <div className="tiny muted mt-lg">№ HA-{String(c.id).padStart(5, '0')}</div>
        </div>
        <div className="row mt no-print" style={{ justifyContent: 'center' }}>
          {c.downloadable ? <button className="btn" onClick={() => window.print()}><Printer />Жүктеу / басып шығару (PDF)</button>
            : <div className="alert info">🎓 Сертификат алуға дайынсыз. Жүктеу мүмкіндігін әкімші ашқанда белсенді болады.</div>}
        </div>
      </div>
    )}</Loader>
  );
}
