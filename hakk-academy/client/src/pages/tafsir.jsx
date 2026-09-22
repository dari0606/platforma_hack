import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Clock, ArrowRight, ArrowLeft, Search, Headphones, CheckCircle2, HelpCircle, ClipboardCheck, ShieldCheck, Eye, Info } from 'lucide-react';
import { t } from '../i18n.js';
import { useApi, Loader, PageHead, Ar, BookmarkBtn, Verification, Empty, useAuth } from '../components/ui.jsx';
import { YouTube } from '../components/media.jsx';

export function TafsirCatalog() {
  const q = useApi('/api/tafsir');
  const [s, setS] = useState('');
  const [filter, setFilter] = useState('all');
  return (
    <>
      <PageHead title={t('Тәпсір')} sub="Hakk Academy тәпсір сабақтарының құрылымды кітапханасы: сүре туралы, аяттар, видеосабақ, тұжырымдар және тест." />
      <Loader q={q}>{(rows) => {
        const list = rows.filter((r) => (filter === 'all' || (filter === 'video' ? r.youtube_url : filter === 'new' ? !r.viewed : r.viewed))
          && (!s || r.name_kk.toLowerCase().includes(s.toLowerCase()) || String(r.id) === s || r.name_ar.includes(s)));
        return (
          <>
            <div className="row wrap mb">
              <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
                <Search size={18} style={{ position: 'absolute', left: 13, top: 12, color: 'var(--muted)' }} />
                <input className="input" style={{ paddingLeft: 40 }} placeholder="Сүрені іздеу: атауы немесе нөмірі" value={s} onChange={(e) => setS(e.target.value)} />
              </div>
              <div className="chips">
                {[['all', 'Барлығы'], ['video', 'Видеосы бар'], ['new', 'Көрілмеген'], ['seen', 'Көрілген']].map(([v, l]) => <button key={v} className={`chip ${filter === v ? 'on' : ''}`} onClick={() => setFilter(v)}>{l}</button>)}
              </div>
            </div>
            {list.length === 0 ? <Empty title="Сүре табылмады" /> : (
              <div className="grid auto-fill">
                {list.map((r) => (
                  <Link to={`/tafsir/${r.id}`} key={r.id} className="card card-link surah-card">
                    <div className="row between">
                      <span className="surah-num">{r.id}</span>
                      <span className="ar-name" lang="ar">{r.name_ar}</span>
                    </div>
                    <div>
                      <h3>{r.name_kk} сүресі</h3>
                      <div className="small muted">{r.ayah_count} аят · {r.revelation === 'mecca' ? 'Меккелік' : 'Мединелік'}</div>
                    </div>
                    {r.description && <div className="small" style={{ color: 'var(--text-2)', minHeight: 42 }}>{r.description}</div>}
                    <div className="row between small muted" style={{ marginTop: 'auto' }}>
                      <span>{r.teacher_name}</span>
                      <span className="row" style={{ gap: 8 }}>{r.viewed && <Eye size={14} />}{r.duration_min ? <><Clock size={14} />{r.duration_min} мин</> : 'Жақында'}</span>
                    </div>
                    <span className="btn soft sm">Тәпсірді көру <ArrowRight /></span>
                  </Link>
                ))}
              </div>
            )}
          </>
        );
      }}</Loader>
    </>
  );
}

export function SurahPage() {
  const { id } = useParams();
  const q = useApi(`/api/tafsir/${id}`, [id]);
  const { user } = useAuth();
  return (
    <Loader q={q}>{(d) => {
      const s = d.surah;
      const hasMeanings = d.ayahs.some((a) => a.translation || a.explanation);
      return (
        <>
          <div className="crumbs mt-sm"><Link to="/tafsir">{t('Тәпсір')}</Link> › <span>{s.name_kk} сүресі</span></div>
          <div className="card mb" style={{ background: 'linear-gradient(135deg,#f6f3ff,#fff)' }}>
            <div className="row wrap between" style={{ alignItems: 'flex-start' }}>
              <div>
                <h1>{s.name_kk} сүресі</h1>
                <div className="row wrap mt-sm">
                  <span className="badge primary">{s.id}-сүре</span><span className="badge">{s.ayah_count} аят</span>
                  <span className="badge">{s.revelation === 'mecca' ? 'Меккелік' : 'Мединелік'}</span>
                  <Verification v={d.verification} compact />
                </div>
              </div>
              <Ar size="xl" className="" >سُورَةُ {s.name_ar}</Ar>
            </div>
            <div className="row wrap mt">
              <BookmarkBtn type="surah" id={s.id} title={`${s.name_kk} сүресінің тәпсірі`} subtitle={`${s.id}-сүре`} link={`/tafsir/${s.id}`} saved={d.bookmarked} />
              {d.test && <Link to={`/tests/${d.test.id}`} className="btn ghost"><ClipboardCheck />Өзіңізді тексеріңіз</Link>}
            </div>
          </div>

          <div className="lesson-grid">
            <div className="stack" style={{ gap: 20 }}>
              <div className="card">
                <h2 className="mb">Сүре туралы</h2>
                {s.description && <p style={{ fontSize: 16 }}>{s.description}</p>}
                <div className="grid g3 mt">
                  <div className="stat"><div className="l">Нөмірі</div><div className="v">{s.id}</div></div>
                  <div className="stat"><div className="l">Аят саны</div><div className="v">{s.ayah_count}</div></div>
                  <div className="stat"><div className="l">Түскен жері</div><div className="v" style={{ fontSize: 20 }}>{s.revelation === 'mecca' ? 'Меккелік' : 'Мединелік'}</div></div>
                </div>
              </div>

              {s.audio_url && (
                <div className="card">
                  <div className="card-title"><Headphones />Сүрені тыңдау</div>
                  <audio className="mt" controls preload="none" src={s.audio_url} style={{ maxWidth: '100%' }} />
                </div>
              )}

              <div className="card">
                <h2>Тәпсір сабағы</h2>
                <div className="mt"><YouTube url={s.youtube_url} title={`${s.name_kk} сүресінің тәпсірі`} /></div>
                {s.teacher_name && <div className="small muted mt-sm">Ұстаз: {s.teacher_name}</div>}
              </div>

              <div className="card">
                <div className="row between wrap mb"><h2>Аяттар</h2><span className="small muted">{d.ayahs.length} аят</span></div>
                {!hasMeanings && (
                  <div className="alert info mb"><Info />Аяттардың мағынасы мен қысқаша түсіндірмесін Hakk Academy ұстаздары дайындап, тексеруден өткізгеннен кейін жариялайды.</div>
                )}
                {d.ayahs.map((a) => (
                  <div className="ayah" key={a.id}>
                    <div className="row between">
                      <span className="ayah-num">{a.number}</span>
                      <BookmarkBtn small type="ayah" id={a.id} title={`${s.name_kk}, ${a.number}-аят`} subtitle={a.arabic} link={`/tafsir/${s.id}#a${a.number}`} saved={a.bookmarked} />
                    </div>
                    <Ar className="" >{a.arabic}</Ar>
                    {a.translation && <p style={{ fontSize: 16 }}>{a.translation}</p>}
                    {a.explanation && <p className="small mt-sm" style={{ color: 'var(--text-2)' }}>{a.explanation}</p>}
                    {a.key_meaning && <div className="note key mt-sm"><h4>Негізгі мағына</h4><p className="small">{a.key_meaning}</p></div>}
                  </div>
                ))}
                <Verification v={d.verification} />
              </div>

              {s.takeaways?.length > 0 ? (
                <div className="card">
                  <h2 className="mb">Сабақтан не үйренеміз?</h2>
                  <div className="stack">{s.takeaways.map((x, i) => <div key={i} className="row" style={{ alignItems: 'flex-start' }}><CheckCircle2 color="var(--green)" size={20} style={{ flex: 'none', marginTop: 2 }} /><span>{x}</span></div>)}</div>
                </div>
              ) : user.role !== 'student' && <div className="alert warn"><Info />«Сабақтан не үйренеміз?» бөлімі толтырылмаған — CMS арқылы ұстаз қоса алады.</div>}

              {s.reflection && (
                <div className="card lav">
                  <div className="card-title" style={{ color: 'var(--primary-700)' }}><HelpCircle />Ойлануға сұрақ</div>
                  <p className="mt-sm bold" style={{ fontSize: 19 }}>{s.reflection}</p>
                </div>
              )}

              {d.test && (
                <Link to={`/tests/${d.test.id}`} className="card card-link row">
                  <span className="stat-icon"><ClipboardCheck /></span><div className="li-body"><div className="card-title">Өзіңізді тексеріңіз</div><div className="bold">{d.test.title}</div></div><ArrowRight />
                </Link>
              )}

              <div className="row between">
                {d.nav.prev ? <Link className="btn ghost" to={`/tafsir/${d.nav.prev.id}`}><ArrowLeft />{d.nav.prev.name_kk}</Link> : <span />}
                {d.nav.next && <Link className="btn ghost" to={`/tafsir/${d.nav.next.id}`}>{d.nav.next.name_kk}<ArrowRight /></Link>}
              </div>
            </div>
            <aside className="lesson-side">
              <div className="card">
                <div className="card-title"><ShieldCheck />Дереккөз</div>
                <div className="mt-sm"><Verification v={d.verification} /></div>
                <p className="tiny muted mt">Құран мәтіні бекітілген мұсхаф дереккөзінен алынады. Аударма мен тәпсірді тек академияның жауапты ұстаздары қосады.</p>
              </div>
            </aside>
          </div>
        </>
      );
    }}</Loader>
  );
}
