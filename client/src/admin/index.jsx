import { useEffect, useState } from 'react';
import { Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';
import {
  Users, Activity, CalendarCheck, TrendingUp, GraduationCap, UserX, Mic, MessageCircleQuestion, ShieldCheck, Plus, ArrowRight, BookOpen, BookMarked,
  Brain, ClipboardCheck, Languages, Library, PenLine, FileBadge, Layers, Radio, Megaphone, Check, KeyRound, Trash2, UserPlus, Eye, AlertTriangle,
} from 'lucide-react';
import { api } from '../api.js';
import { useApi, Loader, PageHead, Progress, Modal, StatusBadge, Tabs, Empty, useAuth, useMeta, useToast, ago, fmtDate, Ar } from '../components/ui.jsx';
import { Thread } from '../pages/personal.jsx';
import { ResourceTable, ResourceForm, RefSelect, useAdminMeta } from './forms.jsx';
import { JournalPage, SalaryPage, PayrollPage, ClassesPage } from './journal.jsx';

export default function Admin() {
  return (
    <Routes>
      <Route path="/" element={<Analytics />} />
      <Route path="/r/users" element={<UsersPage />} />
      <Route path="/r/groups" element={<GroupsPage />} />
      <Route path="/r/:res" element={<GenericPage />} />
      <Route path="/content" element={<ContentHub />} />
      <Route path="/courses/:id" element={<CourseBuilder />} />
      <Route path="/lessons/:id" element={<LessonEditor />} />
      <Route path="/surahs/:id" element={<SurahEditor />} />
      <Route path="/tests/:id" element={<TestEditor />} />
      <Route path="/review" element={<ReviewQueue />} />
      <Route path="/notify" element={<Notify />} />
      <Route path="/submissions" element={<Submissions />} />
      <Route path="/questions" element={<TeachQuestions />} />
      <Route path="/students" element={<Students />} />
      <Route path="/journal" element={<JournalPage />} />
      <Route path="/salary" element={<SalaryPage />} />
      <Route path="/payroll" element={<PayrollPage />} />
      <Route path="/classes" element={<ClassesPage />} />
    </Routes>
  );
}

// ---------------- analytics ----------------
function Analytics() {
  const q = useApi('/api/admin/analytics');
  return (
    <>
      <PageHead title="Академия аналитикасы" sub="Оқушылар белсенділігі, прогресс және оқудағы қиындықтар" />
      <Loader q={q}>{(d) => {
        const max = Math.max(1, ...d.days.map((x) => x.users));
        return (
          <>
            <div className="grid g3">
              {[[Users, d.totals.students, 'Барлық оқушы'], [Activity, d.totals.active, 'Белсенді оқушылар (7 күн)'], [CalendarCheck, d.totals.today, 'Бүгін сабақ оқығандар'],
                [TrendingUp, `${d.totals.avgProgress}%`, 'Орташа прогресс'], [GraduationCap, d.totals.completed, 'Курсты аяқтағандар'], [UserX, d.totals.inactive, 'Белсенді емес оқушылар (14 күн)']].map(([Icon, v, l]) => (
                <div key={l} className="card"><div className="row"><div className="stat-icon"><Icon /></div><div className="stat"><div className="v">{v}</div><div className="l">{l}</div></div></div></div>
              ))}
            </div>
            <div className="grid g3 mt">
              <Link to="/teach/submissions" className="card card-link row"><Mic color="var(--primary)" /><div className="li-body"><b>{d.pending.submissions}</b> жазба тексеруді күтуде</div><ArrowRight size={16} /></Link>
              <Link to="/teach/questions" className="card card-link row"><MessageCircleQuestion color="var(--primary)" /><div className="li-body"><b>{d.pending.questions}</b> сұраққа жауап қажет</div><ArrowRight size={16} /></Link>
              <Link to="/admin/review" className="card card-link row"><ShieldCheck color="var(--primary)" /><div className="li-body"><b>{d.pending.review}</b> материал Review күйінде</div><ArrowRight size={16} /></Link>
            </div>
            <div className="grid dash mt">
              <div className="card">
                <div className="card-head"><h2>Кірген оқушылар</h2><div className="row small"><span>Бүгін <b>{d.logins.today}</b></span><span>7 күн <b>{d.logins.d7}</b></span><span>30 күн <b>{d.logins.d30}</b></span></div></div>
                <div className="bars">{d.days.map((x) => <div key={x.date} title={`${x.date}: ${x.users}`} style={{ height: `${(x.users / max) * 100}%` }} />)}</div>
                <div className="row between tiny muted mt-sm"><span>{fmtDate(d.days[0].date)}</span><span>Бүгін</span></div>
              </div>
              <div className="card">
                <h2 className="mb">Тәжуидтің қиын ережелері</h2>
                {d.hardRules.length === 0 ? <div className="small muted">Дерек жоқ</div> : d.hardRules.map((r) => (
                  <div key={r.tag} className="hbar"><span>{r.label}</span><Progress value={(r.n / d.hardRules[0].n) * 100} size="sm" /><b className="small">{r.n}</b></div>
                ))}
              </div>
            </div>
            <div className="grid g3 mt">
              <div className="card"><h3 className="mb">Жиі қаралатын сабақтар</h3><div className="list">{d.topLessons.map((l) => <div key={l.id} className="list-item"><div className="li-body small">{l.title}</div><span className="badge">{l.views}</span></div>)}</div></div>
              <div className="card"><h3 className="mb">Оқушылар тоқтап қалатын сабақтар</h3>{d.dropoff.length ? <div className="list">{d.dropoff.map((l) => <div key={l.id} className="list-item"><div className="li-body small">{l.title}</div><span className="badge amber">{l.n}</span></div>)}</div> : <div className="small muted">Дерек жоқ</div>}</div>
              <div className="card"><h3 className="mb">Қате көп жіберілетін сұрақтар</h3><div className="list">{d.hardQuestions.map((x) => <div key={x.id} className="list-item"><div className="li-body"><div className="small">{x.prompt}</div><div className="tiny muted">{x.test}</div></div><span className="badge red">{x.rate}%</span></div>)}</div></div>
            </div>
          </>
        );
      }}</Loader>
    </>
  );
}

// ---------------- users & groups ----------------
function UsersPage() {
  const [role, setRole] = useState('student');
  const [access, setAccess] = useState(null);
  const { user } = useAuth();
  return (
    <>
      <PageHead title="Пайдаланушылар" sub="Оқушыларды қосу, деактивациялау, рөл беру. Жоюды тек әкімші жасай алады." />
      <div className="mb"><Tabs value={role} onChange={setRole} items={[{ value: 'student', label: 'Оқушылар' }, { value: 'teacher', label: 'Ұстаздар' }, { value: 'curator', label: 'Кураторлар' }, { value: 'admin', label: 'Әкімшілер' }]} /></div>
      <ResourceTable key={role} res="users" filter={{ role }} hideCols={['role']}
        extraCols={role === 'student' ? [
          { label: 'Прогресс', render: (r) => <div className="row" style={{ minWidth: 120 }}><div style={{ flex: 1 }}><Progress value={r.progress} size="sm" /></div><span className="tiny">{r.progress}%</span></div> },
          { label: 'Топ', render: (r) => <span className="small">{(r.groups || []).join(', ') || '—'}</span> },
          { label: 'Соңғы белсенділік', render: (r) => <span className="small muted">{r.last_active ? ago(r.last_active) : '—'}</span> },
        ] : []}
        actions={(r) => role === 'student' && user.permissions.includes('access.grant') ? <button className="btn ghost sm" onClick={() => setAccess(r)}><KeyRound size={14} />Курс</button> : null} />
      {access && <Modal title={`${access.name}: курсқа қолжетімділік`} onClose={() => setAccess(null)}><UserAccess user={access} /></Modal>}
    </>
  );
}

function UserAccess({ user }) {
  const courses = useApi('/api/admin/r/courses');
  const [course, setCourse] = useState(null);
  const toast = useToast();
  const grant = async () => { await api.post(`/api/admin/courses/${course}/access`, { user_id: user.id }); toast('Қолжетімділік берілді ✓'); };
  return (
    <div className="stack">
      <p className="small muted">Топ арқылы берілген курстар топ мүшелеріне автоматты түрде ашылады. Мұнда жеке қолжетімділік қосуға болады.</p>
      <Loader q={courses}>{(d) => <select className="select" value={course || ''} onChange={(e) => setCourse(e.target.value)}><option value="">Курсты таңдаңыз</option>{d.rows.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>}</Loader>
      <div><button className="btn" disabled={!course} onClick={grant}><KeyRound />Қолжетімділік беру</button></div>
    </div>
  );
}

function GroupsPage() {
  const [members, setMembers] = useState(null);
  return (
    <>
      <PageHead title="Топтар" sub="Топ құру, ұстаз бен куратор тағайындау, оқушыларды қосу" />
      <ResourceTable res="groups" actions={(r) => <button className="btn ghost sm" onClick={() => setMembers(r)}><Users size={14} />Мүшелер</button>} />
      {members && <Modal title={`${members.name}: мүшелер`} onClose={() => setMembers(null)} wide><GroupMembers group={members} /></Modal>}
    </>
  );
}

function GroupMembers({ group }) {
  const [sel, setSel] = useState(null);
  const [students, setStudents] = useState([]);
  const [q, setQ] = useState('');
  const toast = useToast();
  useEffect(() => {
    api.get(`/api/admin/groups/${group.id}/members`).then((m) => setSel(new Set(m.map((x) => x.id))));
    api.get('/api/admin/r/users?role=student&limit=500').then((r) => setStudents(r.rows));
  }, [group.id]);
  if (!sel) return null;
  const save = async () => { await api.put(`/api/admin/groups/${group.id}/members`, { user_ids: [...sel] }); toast(`Сақталды: ${sel.size} оқушы`); };
  const list = students.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <div className="row"><input className="input" placeholder="Оқушыны іздеу…" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn" onClick={save}><Check />Сақтау ({sel.size})</button></div>
      <div className="grid g2" style={{ gap: 8, maxHeight: 420, overflowY: 'auto' }}>
        {list.map((s) => (
          <label key={s.id} className="check note" style={{ padding: 10 }}>
            <input type="checkbox" checked={sel.has(s.id)} onChange={() => { const n = new Set(sel); n.has(s.id) ? n.delete(s.id) : n.add(s.id); setSel(n); }} />
            <span className="li-body"><span className="small bold">{s.name}</span><br /><span className="tiny muted">{s.phone || s.email}</span></span>
          </label>
        ))}
      </div>
      <CourseAccessForGroup group={group} />
    </div>
  );
}

function CourseAccessForGroup({ group }) {
  const courses = useApi('/api/admin/r/courses');
  const toast = useToast();
  return (
    <div className="card flat" style={{ padding: 16 }}>
      <h3 className="mb">Топқа курс ашу</h3>
      <Loader q={courses}>{(d) => <div className="chips">{d.rows.map((c) => <button key={c.id} className="chip" onClick={async () => { await api.post(`/api/admin/courses/${c.id}/access`, { group_id: group.id }); toast(`«${c.title}» топқа ашылды ✓`); }}>+ {c.title}</button>)}</div>}</Loader>
    </div>
  );
}

function GenericPage() {
  const { res } = useParams();
  const meta = useAdminMeta();
  const nav = useNavigate();
  const R = meta?.resources[res];
  const openers = { courses: (r) => nav(`/admin/courses/${r.id}`), surahs: (r) => nav(`/admin/surahs/${r.id}`), tests: (r) => nav(`/admin/tests/${r.id}`), lessons: (r) => nav(`/admin/lessons/${r.id}`) };
  return (
    <>
      <PageHead title={R?.label || '…'} crumbs={[{ label: 'Контент', to: '/admin/content' }, { label: R?.label }]} />
      {res === 'events' && <LiveControl />}
      <ResourceTable key={res} res={res} onOpen={openers[res]} />
    </>
  );
}

function LiveControl() {
  const q = useApi('/api/admin/r/events?kind=live');
  const toast = useToast();
  return (
    <Loader q={q}>{(d) => d.rows.length > 0 && (
      <div className="card mb">
        <h3 className="mb"><Radio size={18} /> LIVE басқару</h3>
        <div className="list">{d.rows.map((e) => (
          <div key={e.id} className="list-item">
            <div className="li-body"><b className="small">{e.title}</b><div className="tiny muted">{e.teacher_name} · {e.time}</div></div>
            {e.is_live ? <span className="badge live"><span className="live-dot" />Эфирде</span> : null}
            <button className={`btn sm ${e.is_live ? 'danger' : ''}`} onClick={async () => { await api.post(`/api/admin/events/${e.id}/live`, { live: !e.is_live }); toast(e.is_live ? 'Эфир аяқталды' : '🔴 Эфир басталды — оқушыларға хабарлама жіберілді'); q.reload(); }}>{e.is_live ? 'Эфирді аяқтау' : 'Эфирді бастау'}</button>
          </div>
        ))}</div>
        <p className="tiny muted mt-sm">Эфир аяқталған соң жазбасын «Эфир жазбасы» өрісіне немесе Материалдарға қосыңыз — ол кітапханаға түседі.</p>
      </div>
    )}</Loader>
  );
}

// ---------------- content hub & builders ----------------
function ContentHub() {
  const meta = useAdminMeta();
  const courses = useApi('/api/admin/r/courses');
  const [newCourse, setNewCourse] = useState(false);
  const nav = useNavigate();
  const items = [
    ['surahs', BookMarked, 'Тәпсір кітапханасы', 'Сүрелер, аяттар, видео, тұжырымдар'], ['kb_topics', Brain, 'Білім базасы', 'Құран оқу, тәжуид, терминдер, FAQ'],
    ['tests', ClipboardCheck, 'Тесттер', '7 түрлі сұрақ + «Неге?» түсіндірмесі'], ['exercises', PenLine, 'Практика', 'Дауыспен оқу, сәйкестендіру т.б.'],
    ['assignments', PenLine, 'Үй тапсырмалары', 'Мәтін, файл, аудио'], ['words', Languages, 'Сөздік', 'Араб сөздері'],
    ['materials', Library, 'Материалдар', 'PDF, аудио, эфир жазбалары'], ['events', CalendarCheck, 'Күнтізбе', 'Сабақтар, эфирлер, емтихандар'],
    ['sources', FileBadge, 'Дереккөздер', 'Бекітілген кітаптар мен ғалымдар'], ['certificates', GraduationCap, 'Сертификаттар', 'Жүктеуге рұқсат беру'],
  ].filter(([r]) => meta?.resources[r]);
  return (
    <>
      <PageHead title="Контент басқару (CMS)" sub="Жаңа сабақ қосу үшін бағдарламашы қажет емес: курс → модуль → сабақ → практика → тест.">
        <Link to="/admin/review" className="btn ghost"><ShieldCheck />Тексеру workflow</Link>
      </PageHead>
      <div className="card mb">
        <div className="row between mb"><h2>Курстар</h2><button className="btn sm" onClick={() => setNewCourse(true)}><Plus />Курс құру</button></div>
        <Loader q={courses}>{(d) => (
          <div className="grid auto-fill">{d.rows.map((c) => (
            <Link key={c.id} to={`/admin/courses/${c.id}`} className="note card-link">
              <div className="row between"><b>{c.title}</b><StatusBadge status={c.status} /></div>
              <div className="tiny muted mt-sm">{c.direction} · {c.level}</div>
            </Link>
          ))}</div>
        )}</Loader>
      </div>
      <div className="grid auto-fill">
        {items.map(([r, Icon, l, sub]) => (
          <Link key={r} to={`/admin/r/${r}`} className="card card-link row"><span className="stat-icon"><Icon /></span><div className="li-body"><b>{l}</b><div className="tiny muted">{sub}</div></div></Link>
        ))}
      </div>
      {newCourse && <Modal title="Жаңа курс" onClose={() => setNewCourse(false)} wide><ResourceForm res="courses" onSaved={(r) => nav(`/admin/courses/${r.id}`)} /></Modal>}
    </>
  );
}

function CourseBuilder() {
  const { id } = useParams();
  const tree = useApi(`/api/admin/courses/${id}/tree`);
  const access = useApi(`/api/admin/courses/${id}/access`);
  const [modal, setModal] = useState(null);
  const nav = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const close = () => { setModal(null); tree.reload(); };
  return (
    <Loader q={tree}>{(d) => (
      <>
        <PageHead title={d.course.title} sub="Курс құрылымы: модульдер мен сабақтар" crumbs={[{ label: 'Контент', to: '/admin/content' }, { label: d.course.title }]}>
          <button className="btn ghost" onClick={() => setModal({ t: 'course' })}>Курс баптаулары</button>
          <Link className="btn ghost" to={`/courses/${id}`}><Eye />Оқушы көрінісі</Link>
          <button className="btn" onClick={() => setModal({ t: 'module' })}><Plus />Модуль</button>
        </PageHead>
        <div className="lesson-grid">
          <div className="stack">
            {d.modules.map((m) => (
              <div key={m.id} className="card">
                <div className="row between wrap">
                  <h3>{m.title}</h3>
                  <div className="row"><button className="btn ghost sm" onClick={() => setModal({ t: 'module', id: m.id })}>Өңдеу</button><button className="btn soft sm" onClick={() => setModal({ t: 'lesson', module: m.id })}><Plus />Сабақ</button></div>
                </div>
                <div className="list mt-sm">
                  {m.lessons.map((l) => (
                    <Link key={l.id} to={`/admin/lessons/${l.id}`} className="list-item">
                      <span className="small muted" style={{ width: 22 }}>{l.sort}</span>
                      <div className="li-body"><div className="li-title small">{l.title}</div><div className="tiny muted">{l.youtube_url ? '▶ видео' : 'видео жоқ'} · {l.exercises} практика · {l.tests} тест · {l.duration_min} мин</div></div>
                      <StatusBadge status={l.status} />
                    </Link>
                  ))}
                  {m.lessons.length === 0 && <div className="small muted">Сабақ жоқ</div>}
                </div>
              </div>
            ))}
            {d.modules.length === 0 && <Empty title="Модуль жоқ">«Модуль» батырмасымен бастаңыз</Empty>}
          </div>
          <aside className="lesson-side">
            {user.permissions.includes('access.grant') && (
              <div className="card">
                <h3 className="mb">Қолжетімділік</h3>
                <Loader q={access}>{(rows) => (
                  <div className="list">{rows.map((a) => (
                    <div key={a.id} className="list-item"><div className="li-body small">{a.group_name ? `👥 ${a.group_name}` : `👤 ${a.user_name}`}</div>
                      <button className="icon-btn" onClick={async () => { await api.del(`/api/admin/courses/${id}/access/${a.id}`); access.reload(); }}><Trash2 /></button></div>
                  ))}{rows.length === 0 && <div className="small muted">Ешкімге ашылмаған</div>}</div>
                )}</Loader>
                <GrantAccess courseId={id} onDone={() => { access.reload(); toast('Қолжетімділік берілді ✓'); }} />
              </div>
            )}
          </aside>
        </div>
        {modal?.t === 'course' && <Modal title="Курс баптаулары" onClose={close} wide><ResourceForm res="courses" id={id} onSaved={close} onDeleted={() => nav('/admin/content')} /></Modal>}
        {modal?.t === 'module' && <Modal title={modal.id ? 'Модульді өңдеу' : 'Жаңа модуль'} onClose={close}><ResourceForm res="modules" id={modal.id} defaults={{ course_id: Number(id), sort: d.modules.length + 1 }} onSaved={close} onDeleted={close} /></Modal>}
        {modal?.t === 'lesson' && <Modal title="Жаңа сабақ" onClose={close} wide><ResourceForm res="lessons" defaults={{ module_id: modal.module, sort: (d.modules.find((m) => m.id === modal.module)?.lessons.length || 0) + 1, duration_min: 10 }} onSaved={(r) => nav(`/admin/lessons/${r.id}`)} /></Modal>}
      </>
    )}</Loader>
  );
}

function GrantAccess({ courseId, onDone }) {
  const [g, setG] = useState(null); const [u, setU] = useState(null);
  return (
    <div className="stack mt">
      <RefSelect refName="groups" value={g} onChange={setG} placeholder="Топты таңдаңыз" />
      <button className="btn sm" disabled={!g} onClick={async () => { await api.post(`/api/admin/courses/${courseId}/access`, { group_id: g }); setG(null); onDone(); }}><UserPlus />Топқа ашу</button>
      <RefSelect refName="users" filter={{ role: 'student' }} value={u} onChange={setU} placeholder="Немесе оқушыны таңдаңыз" />
      <button className="btn ghost sm" disabled={!u} onClick={async () => { await api.post(`/api/admin/courses/${courseId}/access`, { user_id: u }); setU(null); onDone(); }}><UserPlus />Оқушыға ашу</button>
    </div>
  );
}

function LessonEditor() {
  const { id } = useParams();
  const [tab, setTab] = useState('content');
  return (
    <>
      <PageHead title="Сабақты өңдеу" crumbs={[{ label: 'Контент', to: '/admin/content' }, { label: `Сабақ #${id}` }]}>
        <Link to={`/lessons/${id}`} className="btn ghost"><Eye />Оқушы көрінісі</Link>
      </PageHead>
      <div className="mb"><Tabs value={tab} onChange={setTab} items={[{ value: 'content', label: '1–3. Мақсат, видео, конспект' }, { value: 'practice', label: '4. Практика' }, { value: 'tests', label: '5. Тест' }, { value: 'hw', label: 'Үй тапсырмасы' }]} /></div>
      <div className="card">
        {tab === 'content' && <ResourceForm res="lessons" id={id} />}
        {tab === 'practice' && <ResourceTable res="exercises" filter={{ lesson_id: id }} hideCols={[]} title="Практика" />}
        {tab === 'tests' && <TestsForLesson lessonId={id} />}
        {tab === 'hw' && <ResourceTable res="assignments" filter={{ lesson_id: id }} title="Үй тапсырмалары" />}
      </div>
    </>
  );
}

function TestsForLesson({ lessonId }) {
  const nav = useNavigate();
  return <ResourceTable res="tests" filter={{ lesson_id: lessonId }} defaults={{ category: 'tajweed', pass_score: 70 }} onOpen={(r) => nav(`/admin/tests/${r.id}`)} title="Сабақ тесттері" />;
}

function TestEditor() {
  const { id } = useParams();
  return (
    <>
      <PageHead title="Тест" crumbs={[{ label: 'Тесттер', to: '/admin/r/tests' }, { label: `#${id}` }]}><Link to={`/tests/${id}`} className="btn ghost"><Eye />Тапсырып көру</Link></PageHead>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card"><ResourceForm res="tests" id={id} /></div>
        <div className="card"><ResourceTable res="questions" filter={{ test_id: id }} title="Сұрақтар" /></div>
      </div>
    </>
  );
}

function SurahEditor() {
  const { id } = useParams();
  return (
    <>
      <PageHead title="Тәпсір: сүре" crumbs={[{ label: 'Тәпсір', to: '/admin/r/surahs' }, { label: `${id}-сүре` }]}><Link to={`/tafsir/${id}`} className="btn ghost"><Eye />Оқушы көрінісі</Link></PageHead>
      <div className="alert warn mb"><AlertTriangle />Аят мәтіні тек бекітілген мұсхафтан, аударма мен түсіндірме тек академия бекіткен дереккөзден енгізіледі. Жарияланған материалды өзгерту оны қайта тексеруге (Review) жібереді.</div>
      <div className="card mb"><ResourceForm res="surahs" id={id} /></div>
      <div className="card"><ResourceTable res="ayahs" filter={{ surah_id: id }} title="Аяттар" /></div>
    </>
  );
}

// ---------------- workflow ----------------
function ReviewQueue() {
  const [status, setStatus] = useState('review');
  const q = useApi(`/api/admin/review?status=${status}`, [status]);
  const nav = useNavigate();
  const open = (it) => nav(it.resource === 'lessons' ? `/admin/lessons/${it.id}` : it.resource === 'surahs' ? `/admin/surahs/${it.id}` : `/admin/r/kb_topics`);
  return (
    <>
      <PageHead title="Діни мазмұнды тексеру" sub="Draft → Review → Approved → Published. Тек жауапты ұстаз бекіткен материал жариялана алады." />
      <Loader q={q}>{(d) => (
        <>
          <div className="mb"><Tabs value={status} onChange={setStatus} items={['draft', 'review', 'approved', 'published'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), count: d.counts[s] || 0 }))} /></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Түрі</th><th>Атауы</th><th>Дереккөз</th><th>Тексерген</th><th>Жаңартылды</th><th /></tr></thead>
              <tbody>{d.items.map((it) => (
                <tr key={it.resource + it.id} className="click" onClick={() => open(it)}>
                  <td><span className="badge">{it.type}</span></td>
                  <td>{it.title}{it.is_demo ? <span className="badge amber" style={{ marginLeft: 6 }}>демо</span> : null}</td>
                  <td>{it.has_source ? <span className="badge green">✓</span> : <span className="badge red">жоқ</span>}</td>
                  <td className="small">{it.reviewer || '—'}</td>
                  <td className="small muted">{ago(it.updated_at)}</td>
                  <td><ArrowRight size={16} /></td>
                </tr>
              ))}{d.items.length === 0 && <tr><td colSpan={6} className="center muted" style={{ padding: 30 }}>Бұл күйде материал жоқ</td></tr>}</tbody>
            </table>
          </div>
        </>
      )}</Loader>
    </>
  );
}

function Notify() {
  const [f, setF] = useState({ title: '', body: '', link: '', target: 'all' });
  const [gid, setGid] = useState(null);
  const toast = useToast();
  const send = async (e) => {
    e.preventDefault();
    const target = f.target === 'group' ? `group:${gid}` : 'all';
    const r = await api.post('/api/admin/notify', { ...f, target }); toast(`Жіберілді: ${r.sent} оқушы`); setF({ ...f, title: '', body: '' });
  };
  return (
    <>
      <PageHead title="Хабарлама жіберу" sub="Notification Center арқылы оқушыларға хабарлама" />
      <form className="card stack" style={{ maxWidth: 640 }} onSubmit={send}>
        <div className="field"><label>Кімге</label><div className="chips"><button type="button" className={`chip ${f.target === 'all' ? 'on' : ''}`} onClick={() => setF({ ...f, target: 'all' })}>Барлық оқушы</button><button type="button" className={`chip ${f.target === 'group' ? 'on' : ''}`} onClick={() => setF({ ...f, target: 'group' })}>Топ</button></div></div>
        {f.target === 'group' && <RefSelect refName="groups" value={gid} onChange={setGid} placeholder="Топты таңдаңыз" />}
        <div className="field"><label>Тақырып *</label><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="🔔 Жаңа тәпсір сабағы шықты" required /></div>
        <div className="field"><label>Мәтін</label><textarea className="textarea" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <div className="field"><label>Сілтеме (платформа ішінде)</label><input className="input" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="/tafsir/112" /></div>
        <div><button className="btn" disabled={f.target === 'group' && !gid}><Megaphone />Жіберу</button></div>
      </form>
    </>
  );
}

// ---------------- teacher tools ----------------
function Submissions() {
  const [status, setStatus] = useState('pending');
  const q = useApi(`/api/teach/submissions?status=${status}`, [status]);
  return (
    <>
      <PageHead title="Тапсырмаларды тексеру" sub="Оқушылардың дауыс жазбалары мен үй тапсырмалары. Нақты қатені белгілесеңіз, ол оқушының «Менің қателерім» бөліміне түседі." />
      <Loader q={q}>{(d) => (
        <>
          <div className="mb"><Tabs value={status} onChange={setStatus} items={[['pending', 'Тексерілуде'], ['reread', 'Қайта оқу керек'], ['fix', 'Түзету қажет'], ['accepted', 'Қабылданды'], ['all', 'Барлығы']].map(([v, l]) => ({ value: v, label: l, count: v === 'all' ? undefined : d.counts[v] || 0 }))} /></div>
          {d.rows.length === 0 ? <Empty icon={Check} title="Тексеретін жұмыс жоқ" /> : <div className="stack">{d.rows.map((s) => <ReviewCard key={s.id} s={s} onDone={q.reload} />)}</div>}
        </>
      )}</Loader>
    </>
  );
}

function ReviewCard({ s, onDone }) {
  const meta = useMeta();
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState(s.lesson_rule ? [] : []);
  const toast = useToast();
  const send = async (status) => {
    await api.post(`/api/teach/submissions/${s.id}/review`, { status, comment, mistakes: tags });
    toast('Жауап оқушыға жіберілді ✓'); onDone();
  };
  return (
    <div className="card">
      <div className="row between wrap"><div><b>{s.student}</b> <span className="small muted">· {ago(s.created_at)}</span></div><StatusBadge status={s.status} /></div>
      <div className="small muted mt-sm">{s.lesson_title && `${s.lesson_title} · `}{s.task}</div>
      {s.arabic && <div className="ex-lines" style={{ fontSize: 26 }}>{s.arabic.split('\n').map((l, i) => <div key={i}>{l}</div>)}</div>}
      {s.kind === 'audio' && <audio className="mt-sm" controls src={s.file_path} />}
      {s.kind === 'upload' && <a className="btn ghost sm mt-sm" href={s.file_path} target="_blank" rel="noreferrer">📎 {s.file_name}</a>}
      {s.text && <div className="note mt-sm pre small">{s.text}</div>}
      {s.feedback.map((f) => <div key={f.id} className="small mt-sm"><b>{f.teacher}:</b> <StatusBadge status={f.status} /> {f.comment}</div>)}
      <div className="field mt"><label>Қате жіберілген ереже (бірнешеуін таңдауға болады)</label>
        <div className="chips">{Object.entries(meta.RULE_TAGS || {}).map(([k, l]) => <button key={k} type="button" className={`chip ${tags.includes(k) ? 'on' : ''}`} onClick={() => setTags(tags.includes(k) ? tags.filter((x) => x !== k) : [...tags, k])}>{l}</button>)}</div>
      </div>
      <textarea className="textarea mt" placeholder="Пікір: не дұрыс, нені түзету керек…" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="row wrap mt">
        <button className="btn green" onClick={() => send('accepted')}><Check />Қабылданды</button>
        <button className="btn danger" onClick={() => send('reread')}>Қайта оқу керек</button>
        <button className="btn ghost" onClick={() => send('fix')}>Түзету қажет</button>
      </div>
    </div>
  );
}

function TeachQuestions() {
  const q = useApi('/api/questions?scope=all');
  const { user } = useAuth();
  const [f, setF] = useState('open');
  return (
    <>
      <PageHead title="Оқушы сұрақтары" sub="Ұстазға қойылған сұрақтарға платформа ішінде жауап беріңіз" />
      <div className="mb"><Tabs value={f} onChange={setF} items={[{ value: 'open', label: 'Жауап күтуде' }, { value: 'answered', label: 'Жауап берілген' }]} /></div>
      <Loader q={q}>{(rows) => { const list = rows.filter((x) => x.status === f); return list.length ? <div className="stack">{list.map((th) => <Thread key={th.id} th={th} me={user} onChange={q.reload} />)}</div> : <Empty title="Сұрақ жоқ" />; }}</Loader>
    </>
  );
}

function Students() {
  const q = useApi('/api/teach/students');
  const [s, setS] = useState('');
  return (
    <>
      <PageHead title="Оқушылар прогресі" sub="Топтарыңыздағы оқушылардың прогресі мен жиі кездесетін қателері" />
      <input className="input mb" style={{ maxWidth: 320 }} placeholder="Іздеу…" value={s} onChange={(e) => setS(e.target.value)} />
      <Loader q={q}>{(rows) => (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Оқушы</th><th>Топ</th><th>Прогресс</th><th>Ашық қателер</th><th>Соңғы белсенділік</th></tr></thead>
          <tbody>{rows.filter((r) => !s || r.name.toLowerCase().includes(s.toLowerCase())).map((r) => (
            <tr key={r.id}>
              <td><b className="small">{r.name}</b>{!r.active && <span className="badge red" style={{ marginLeft: 6 }}>бұғатталған</span>}<div className="tiny muted">{r.phone}</div></td>
              <td className="small">{r.groups.join(', ')}</td>
              <td style={{ minWidth: 140 }}><div className="row"><div style={{ flex: 1 }}><Progress value={r.progress} size="sm" /></div><span className="tiny">{r.progress}%</span></div></td>
              <td>{r.mistakes.length ? <div className="chips">{r.mistakes.slice(0, 3).map((m) => <span key={m.label} className="badge red">{m.label} · {m.n}</span>)}</div> : <span className="muted small">—</span>}</td>
              <td className="small muted">{r.last_active ? ago(r.last_active) : '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}</Loader>
    </>
  );
}
