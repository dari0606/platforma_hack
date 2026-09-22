import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock, Flame, BookOpen, ClipboardCheck, PenLine, Repeat, Sparkles, Video, MapPin, AlertCircle, Trophy, GraduationCap } from 'lucide-react';
import { t } from '../i18n.js';
import { CaseSensitive, Sprout, Languages as LangIcon, Type, Volume2 } from 'lucide-react';
import { useApi, Loader, Progress, WD, WD_SHORT, fmtDate, Ar } from '../components/ui.jsx';

export default function Dashboard() {
  const q = useApi('/api/dashboard');
  return <Loader q={q}>{(d) => <DashboardView d={d} />}</Loader>;
}

function DashboardView({ d }) {
  const cur = d.current;
  return (
    <>
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <h1>Ассаламу алейкум, {d.user.name} 👋</h1>
          <p>{t('Бүгін біліміңізге тағы бір қадам қосайық.')}</p>
        </div>
      </div>

      {d.live.map((l) => (
        <div key={l.id} className="card mb" style={{ borderColor: '#f6c9cf', background: 'linear-gradient(90deg,#fff5f6,#fff)' }}>
          <div className="row wrap">
            <span className="badge live"><span className="live-dot" />LIVE</span>
            <div className="li-body"><div className="bold">Қазір эфирде · {l.title}</div><div className="small muted">{l.teacher_name}</div></div>
            {l.link && <a className="btn" href={l.link} target="_blank" rel="noreferrer">Эфирге қосылу <ArrowRight /></a>}
          </div>
        </div>
      ))}

      {d.certificateReady.length > 0 && (
        <Link to={`/certificates/${d.certificateReady[0].id}`} className="card lav mb row card-link">
          <GraduationCap size={28} color="var(--primary)" /><div className="li-body"><div className="bold">🎓 Сертификат алуға дайынсыз</div><div className="small muted">{d.certificateReady[0].title}</div></div><ArrowRight />
        </Link>
      )}

      <div className="grid dash">
        {/* 1. Қазір мен қай жердемін? 2. Келесі не оқуым керек? */}
        {cur ? (
          <div className="card hero">
            <div className="card-title" style={{ color: 'rgba(255,255,255,.8)' }}><BookOpen />{t('Менің оқуым')}</div>
            <h2 className="mt-sm" style={{ fontSize: 26 }}>{cur.course.title}</h2>
            <div className="row mt">
              <div style={{ flex: 1 }}><Progress value={cur.percent} size="lg" /></div>
              <div className="bold" style={{ fontSize: 22 }}>{cur.percent}%</div>
            </div>
            <div className="small muted mt-sm">{cur.done} / {cur.total} сабақ аяқталды</div>
            {cur.next ? (
              <div className="row wrap mt-lg" style={{ background: 'rgba(255,255,255,.12)', borderRadius: 16, padding: 16 }}>
                <div className="li-body">
                  <div className="tiny" style={{ opacity: .8, textTransform: 'uppercase', letterSpacing: '.06em' }}>Келесі сабақ · {cur.next.module}</div>
                  <div className="bold" style={{ fontSize: 18 }}>{cur.next.title}</div>
                </div>
                <Link to={`/lessons/${cur.next.id}`} className="btn white lg">{t('Оқуды жалғастыру')}<ArrowRight /></Link>
              </div>
            ) : <div className="mt-lg bold">Бағдарлама толық аяқталды 🎉</div>}
          </div>
        ) : (
          <div className="card"><div className="empty"><BookOpen /><div className="bold">Сізге әлі курс ашылмаған</div><div className="small">Куратор курсқа қолжетімділік бергенде осында көрінеді.</div></div></div>
        )}

        <TodayCard ev={d.event} />
      </div>

      <div className="tiles mt">
        {[['/alphabet', CaseSensitive, 'Әліпби', '28 әріп, махраж'], ['/quran', Type, 'Тәжуид', 'ережелер мен мысалдар'],
          ['/hifz', Sprout, 'Жаттау', `${d.hifz.memorized}/${d.hifz.total} сүре жатталды`], ['/dictionary', LangIcon, 'Сөздік', 'Құран сөздері']].map(([to, Icon, l, sub]) => (
          <Link key={to} to={to} className="tile"><span className="stat-icon"><Icon /></span><b>{l}</b><span className="tiny muted">{sub}</span></Link>
        ))}
      </div>

      <div className="grid dash mt">
        <WeekCard w={d.week} />
        <ReviewCard r={d.review} />
      </div>

      <div className="grid g3 mt">
        {d.recommended && (
          <div className="card">
            <div className="card-title"><Sparkles />{t('Ұсынылатын сабақ')}</div>
            {d.recommended.arabic && <Ar size="sm" className="mt-sm" center={false}>{d.recommended.arabic}</Ar>}
            <h3 className="mt-sm">{d.recommended.title}</h3>
            <div className="small muted mt-sm">{d.recommended.subtitle}</div>
            <div className="row between mt">
              <span className="badge"><Clock />{d.recommended.minutes} минут</span>
              <Link to={d.recommended.link} className="btn soft sm">{t('Көру')}<ArrowRight /></Link>
            </div>
          </div>
        )}
        <div className="card">
          <div className="card-title"><AlertCircle />{t('Менің қателерім')}</div>
          {d.mistakes.length === 0 ? <div className="small muted mt">Ашық қате жоқ. Жарайсыз! ✨</div> : (
            <div className="list mt-sm">
              {d.mistakes.map((m) => (
                <div key={m.rule_tag} className="list-item">
                  <div className="li-body"><div className="li-title">{m.label}</div><div className="tiny muted">{m.open} рет қате</div></div>
                  {m.topic && <Link to={`/kb/${m.topic.slug}`} className="btn ghost sm">Қайталау</Link>}
                </div>
              ))}
            </div>
          )}
          <Link to="/mistakes" className="small bold mt-sm" style={{ color: 'var(--primary)', display: 'inline-block' }}>Барлығы →</Link>
        </div>
        {d.word && (
          <Link to={`/dictionary?w=${d.word.id}`} className="card card-link">
            <div className="card-title"><LangIcon />Күннің сөзі</div>
            <Ar size="xl" className="mt-sm">{d.word.arabic}</Ar>
            <div className="bold" style={{ fontSize: 17 }}>{d.word.meaning}</div>
            <div className="small muted">{d.word.translit}{d.word.quran_ref && ` · Құран, ${d.word.quran_ref}`}</div>
          </Link>
        )}
        <div className="card">
          <div className="card-title"><Trophy />Соңғы нәтиже</div>
          {d.lastTest ? (
            <>
              <div className="big-num mt">{d.lastTest.score}%</div>
              <div className="small muted">{d.lastTest.title} · {fmtDate(d.lastTest.created_at)}</div>
              <Progress value={d.lastTest.score} size="sm" />
            </>
          ) : <div className="small muted mt">Әлі тест тапсырмадыңыз.</div>}
          <Link to="/tests" className="btn ghost sm mt"><ClipboardCheck />Тесттер</Link>
        </div>
      </div>
    </>
  );
}

function TodayCard({ ev }) {
  if (!ev) return <div className="card"><div className="card-title"><CalendarDays />{t('Бүгінгі сабақ')}</div><div className="empty">Жақын күндері сабақ жоқ</div></div>;
  const d = new Date(ev.at);
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title"><CalendarDays />{ev.isToday ? t('Бүгінгі сабақ') : 'Келесі сабақ'}</div>
        <span className={`badge ${ev.format === 'online' ? 'primary' : 'green'}`}>{ev.format === 'online' ? 'Online' : 'Offline'}</span>
      </div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div className="center" style={{ background: 'var(--lav)', borderRadius: 16, padding: '10px 14px', minWidth: 72 }}>
          <div className="tiny bold" style={{ color: 'var(--primary)' }}>{WD[(d.getDay() + 6) % 7].slice(0, 3).toUpperCase()}</div>
          <div style={{ fontSize: 26, fontWeight: 750 }}>{d.getDate()}</div>
        </div>
        <div className="li-body">
          <h3>{ev.title}</h3>
          <div className="small muted mt-sm">{ev.teacher_name}</div>
          <div className="row small mt-sm"><Clock size={15} />{ev.time} · {ev.duration_min} мин</div>
          {ev.location && <div className="row small mt-sm"><MapPin size={15} />{ev.location}</div>}
        </div>
      </div>
      {ev.format === 'online' && ev.link
        ? <a className="btn block mt-lg" href={ev.link} target="_blank" rel="noreferrer"><Video />{t('Сабаққа қосылу')}</a>
        : <Link className="btn ghost block mt-lg" to="/calendar"><CalendarDays />Күнтізбе</Link>}
    </div>
  );
}

function WeekCard({ w }) {
  const stats = [
    [BookOpen, w.lessons, 'өткен сабақ'], [PenLine, w.tasks, 'орындалған тапсырма'],
    [ClipboardCheck, w.testAvg != null ? `${w.testAvg}%` : '—', 'тест нәтижесі'], [Flame, `${w.streak} күн`, 'оқу сериясы'],
  ];
  return (
    <div className="card">
      <div className="card-head"><div className="card-title"><Flame />{t('Осы аптадағы прогресс')}</div><span className="badge primary">Жалпы {w.percent}%</span></div>
      <div className="grid g4" style={{ gap: 12 }}>
        {stats.map(([Icon, v, l]) => (
          <div key={l} className="stat"><div className="stat-icon"><Icon /></div><div className="v">{v}</div><div className="l">{l}</div></div>
        ))}
      </div>
      <div className="streak-days mt-lg">
        {w.days.map((d) => <span key={d.date}><i className={d.active ? 'on' : ''} />{WD_SHORT[d.wd]}</span>)}
      </div>
      <div className="mt"><Progress value={w.percent} /></div>
    </div>
  );
}

function ReviewCard({ r }) {
  const items = [[r.topics, 'тәжуид ережесі'], [r.words, 'араб сөзі'], [r.surah ? 1 : 0, 'сүре'], [r.questions, 'тест сұрағы']].filter(([n]) => n > 0);
  return (
    <div className="card lav">
      <div className="card-title" style={{ color: 'var(--primary-700)' }}><Repeat />{t('Бүгін қайталайық')}</div>
      <h2 className="mt-sm">{r.done ? 'Бүгінгі қайталау орындалды ✓' : `${r.minutes} минуттық қайталау`}</h2>
      <div className="stack mt" style={{ gap: 8 }}>
        {items.map(([n, l]) => <div key={l} className="row small"><span className="section-num" style={{ background: '#fff' }}>{n}</span>{l}</div>)}
      </div>
      <Link to="/review" className="btn block mt-lg">{r.done ? 'Қайта өту' : 'Бастау'}<ArrowRight /></Link>
    </div>
  );
}
