import { useEffect, useState } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Home, BookOpen, PlayCircle, BookMarked, Type, Languages, Brain, PenLine, ClipboardCheck, Library, CalendarDays, BarChart3,
  Bookmark, MessageCircleQuestion, User, Search, Bell, LogOut, LayoutDashboard, Users, Layers, ShieldCheck, Megaphone, Mic, GraduationCap, X, CheckCheck,
} from 'lucide-react';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { useAuth, ago, initials } from './ui.jsx';

const STUDENT_NAV = [
  ['/', Home, 'Басты бет'], ['/learning', BookOpen, 'Менің оқуым'], ['/lessons', PlayCircle, 'Сабақтар'], ['/tafsir', BookMarked, 'Тәпсір'],
  ['/quran', Type, 'Құран оқу'], ['/arabic', Languages, 'Араб тілі'], ['/kb', Brain, 'Білім базасы'], ['/practice', PenLine, 'Практика'],
  ['/tests', ClipboardCheck, 'Тесттер'], ['/materials', Library, 'Материалдар'], ['/calendar', CalendarDays, 'Күнтізбе'],
  ['/progress', BarChart3, 'Менің прогрессім'], ['/saved', Bookmark, 'Сақталғандар'], ['/questions', MessageCircleQuestion, 'Сұрақтар'], ['/profile', User, 'Профиль'],
];

function staffNav(perms) {
  const has = (p) => perms.includes(p);
  return [
    has('analytics.view') && ['/admin', LayoutDashboard, 'Аналитика'],
    has('submissions.review') && ['/teach/submissions', Mic, 'Тапсырмаларды тексеру'],
    has('questions.answer') && ['/teach/questions', MessageCircleQuestion, 'Оқушы сұрақтары'],
    has('analytics.view') && ['/teach/students', GraduationCap, 'Оқушылар прогресі'],
    has('users.manage') && ['/admin/r/users', Users, 'Пайдаланушылар'],
    has('groups.manage') && ['/admin/r/groups', Users, 'Топтар'],
    has('content.edit') && ['/admin/content', Layers, 'Контент (CMS)'],
    has('content.edit') && ['/admin/review', ShieldCheck, 'Тексеру workflow'],
    has('events.manage') && ['/admin/r/events', CalendarDays, 'Күнтізбе басқару'],
    has('notify.send') && ['/admin/notify', Megaphone, 'Хабарлама жіберу'],
  ].filter(Boolean);
}

const BOTTOM = [['/', Home, 'Басты бет'], ['/learning', BookOpen, 'Оқу'], ['/tafsir', BookMarked, 'Тәпсір'], ['/search', Search, 'Іздеу'], ['/profile', User, 'Профиль']];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [q, setQ] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const nav = useNavigate();
  const loc = useLocation();
  const staff = user.role !== 'student';

  useEffect(() => {
    const load = () => api.get('/api/notifications').then((n) => setUnread(n.filter((x) => !x.read).length)).catch(() => {});
    load(); const id = setInterval(load, 60000); return () => clearInterval(id);
  }, [loc.pathname]);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  const submit = (e) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`); };
  const link = ([to, Icon, label]) => <NavLink key={to} to={to} end={to === '/' || to === '/admin'}><Icon />{t(label)}</NavLink>;

  return (
    <div className="app">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <div className="brand-logo">H</div>
          <div><div className="brand-name">Hakk Academy</div><div className="brand-sub">Құран және араб тілі оқу орталығы</div></div>
        </Link>
        <nav className="nav" aria-label="Негізгі мәзір">
          {staff && <><div className="nav-label">{user.role === 'teacher' ? t('Ұстаз панелі') : t('Әкімші панелі')}</div>{staffNav(user.permissions).map(link)}<div className="nav-label">Оқу кеңістігі</div></>}
          {STUDENT_NAV.map(link)}
        </nav>
        <div className="sidebar-foot">
          <div className="row">
            <div className="avatar">{initials(user.name)}</div>
            <div className="li-body"><div className="bold small ellipsis">{user.name}</div><div className="tiny muted">{{ student: 'Оқушы', teacher: 'Ұстаз', curator: 'Куратор', admin: 'Әкімші' }[user.role]}</div></div>
            <button className="icon-btn" onClick={logout} title={t('Шығу')} aria-label={t('Шығу')}><LogOut /></button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <form className="search" onSubmit={submit} role="search">
            <Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Не білгіңіз келеді? Мысалы: ғунна, мәд, Ықылас…" aria-label={t('Іздеу')} />
          </form>
          <div className="topbar-right">
            <button className="icon-btn" onClick={() => setNotifOpen(true)} aria-label={t('Хабарламалар')}><Bell />{unread > 0 && <span className="dot">{unread}</span>}</button>
            <Link to="/profile" className="avatar" title={user.name}>{initials(user.name)}</Link>
          </div>
        </header>
        <header className="mobile-head">
          <Link to="/" className="brand-logo" style={{ width: 36, height: 36, fontSize: 16 }}>H</Link>
          <div className="li-body"><div className="bold">Hakk Academy</div></div>
          {staff && <Link to={user.permissions.includes('analytics.view') ? '/admin' : '/teach/submissions'} className="icon-btn" aria-label="Панель"><LayoutDashboard /></Link>}
          <Link to="/calendar" className="icon-btn" aria-label={t('Күнтізбе')}><CalendarDays /></Link>
          <button className="icon-btn" onClick={() => setNotifOpen(true)} aria-label={t('Хабарламалар')}><Bell />{unread > 0 && <span className="dot">{unread}</span>}</button>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="Мобильді мәзір">
        {BOTTOM.map(([to, Icon, label]) => <NavLink key={to} to={to} end={to === '/'}><Icon />{t(label)}</NavLink>)}
      </nav>
      {notifOpen && <Notifications onClose={() => setNotifOpen(false)} onRead={() => setUnread(0)} />}
    </div>
  );
}

function Notifications({ onClose, onRead }) {
  const [items, setItems] = useState(null);
  const nav = useNavigate();
  useEffect(() => { api.get('/api/notifications').then(setItems); }, []);
  const readAll = async () => { await api.post('/api/notifications/read'); setItems((x) => x.map((n) => ({ ...n, read: 1 }))); onRead(); };
  const open = async (n) => { if (!n.read) api.post('/api/notifications/read', { id: n.id }); onClose(); if (n.link) nav(n.link); };
  return (
    <>
      <div className="modal-bg" style={{ background: 'rgba(28,24,48,.2)' }} onClick={onClose} />
      <aside className="drawer" aria-label={t('Хабарламалар')}>
        <div className="row between" style={{ padding: '20px 20px 12px' }}>
          <h2>🔔 {t('Хабарламалар')}</h2>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn ghost sm" onClick={readAll}><CheckCheck />Барлығын оқыдым</button>
            <button className="icon-btn" onClick={onClose} aria-label={t('Жабу')}><X /></button>
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 12px 20px' }}>
          {!items ? <div className="spinner" /> : items.length === 0 ? <div className="empty">Жаңа хабарлама жоқ</div> : items.map((n) => (
            <button key={n.id} onClick={() => open(n)} className="list-item" style={{ width: '100%', textAlign: 'left', background: n.read ? 'transparent' : 'var(--lav)', border: 0, borderRadius: 12, padding: 12, marginBottom: 4 }}>
              <div className="li-body">
                <div className="bold small">{n.title}</div>
                {n.body && <div className="small muted">{n.body}</div>}
                <div className="tiny muted mt-sm">{ago(n.created_at)}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
