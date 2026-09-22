import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Volume2, ArrowRight, BookMarked, CheckCircle2 } from 'lucide-react';
import { useApi, Loader, PageHead, Ar, Progress, Ring } from '../components/ui.jsx';
import { HifzButtons } from './tafsir.jsx';

const speak = (text) => {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'ar-SA'; u.rate = 0.7; speechSynthesis.speak(u);
};

export function AlphabetPage() {
  const q = useApi('/api/letters');
  const [sel, setSel] = useState(0);
  return (
    <>
      <PageHead title="Араб әліпбиі" sub="28 әріп: атауы, дыбысы, махражы, сөздегі төрт пішіні және мысал сөз. Әріпті басыңыз."
        crumbs={[{ label: 'Құран оқу', to: '/quran' }, { label: 'Әліпби' }]}>
        <Link to="/kb/makharij-bolimder" className="btn ghost">Махраж туралы</Link>
      </PageHead>
      <Loader q={q}>{(letters) => {
        const l = letters[sel];
        return (
          <div className="lesson-grid">
            <div>
              <div className="letters">
                {letters.map((x, i) => (
                  <button key={x.ch} className={`letter ${i === sel ? 'on' : ''} ${x.heavy ? 'heavy' : ''}`} onClick={() => { setSel(i); speak(x.ch); if (window.innerWidth < 860) setTimeout(() => document.getElementById('letter-detail')?.scrollIntoView({ behavior: 'smooth' }), 50); }}>
                    <div className="ar" lang="ar">{x.ch}</div>
                    <div className="tiny bold">{x.name}</div>
                  </button>
                ))}
              </div>
              <div className="row small muted mt"><span className="badge primary">көк</span> — әрдайым жуан оқылатын әріптер (خ ص ض ط ظ غ ق)</div>
            </div>
            <aside className="lesson-side">
              <div className="card" id="letter-detail" style={{ scrollMarginTop: 80 }}>
                <div className="row between">
                  <div><h2>{l.name}</h2><div className="small muted">{sel + 1} / 28 · {l.heavy ? 'жуан әріп' : 'жіңішке әріп'}{!l.joins && ' · келесі әріпке жалғанбайды'}</div></div>
                  <Ar size="xl">{l.ch}</Ar>
                </div>
                <div className="note mt-sm"><b className="small">Дыбысы:</b> <span className="small">{l.sound}</span></div>
                <div className="note key mt-sm"><h4>Махражы</h4><p className="small">{l.makhraj}</p></div>
                <div className="card-title mt">Сөздегі пішіндері</div>
                <div className="forms mt-sm">
                  {[['isolated', 'жеке'], ['initial', 'басы'], ['medial', 'ортасы'], ['final', 'соңы']].map(([k, lab]) => (
                    <div key={k}><div className="ar" lang="ar">{l.forms[k]}</div><div className="tiny muted">{lab}</div></div>
                  ))}
                </div>
                <div className="card-title mt">Харакаттармен</div>
                <div className="forms mt-sm" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                  {[['َ', 'фатха'], ['ِ', 'кясра'], ['ُ', 'дамма']].map(([h, lab]) => (
                    <button key={lab} className="note" onClick={() => speak(l.ch + h)} style={{ cursor: 'pointer' }}><div className="ar" lang="ar" style={{ textAlign: 'center' }}>{l.ch === 'ا' ? 'أ' + h : l.ch + h}</div><div className="tiny muted">{lab}</div></button>
                  ))}
                </div>
                <div className="note mt">
                  <div className="row between"><Ar size="lg">{l.example}</Ar><button className="icon-btn" onClick={() => speak(l.example)} aria-label="Тыңдау"><Volume2 /></button></div>
                  <div className="small muted">Мысал: {l.meaning}</div>
                </div>
                <div className="row mt">
                  <button className="btn ghost sm" disabled={sel === 0} onClick={() => setSel(sel - 1)}>← Алдыңғы</button>
                  <button className="btn sm" disabled={sel === 27} onClick={() => { setSel(sel + 1); speak(letters[sel + 1].ch); }}>Келесі →</button>
                </div>
                <p className="tiny muted mt">Дыбыс браузердің сөйлеу синтезаторымен беріледі — дұрыс айтылуын ұстаздан және Хусари оқылымынан тыңдаңыз.</p>
              </div>
            </aside>
          </div>
        );
      }}</Loader>
    </>
  );
}

export function HifzPage() {
  const q = useApi('/api/hifz');
  const [, force] = useState(0);
  return (
    <>
      <PageHead title="Жаттау (хифз)" sub="Әмма парасының 37 сүресі. Жаттап жатқан және жаттаған сүрелеріңізді белгілеп, прогресті бақылаңыз."
        crumbs={[{ label: 'Құран оқу', to: '/quran' }, { label: 'Жаттау' }]}>
        <Link to="/kb/hifz-plan" className="btn ghost">Жаттау жоспары</Link>
      </PageHead>
      <Loader q={q}>{(d) => (
        <>
          <div className="grid dash mb">
            <div className="card row wrap" style={{ gap: 24 }}>
              <Ring value={d.total ? Math.round((d.memorized / d.total) * 100) : 0} />
              <div className="li-body">
                <div className="card-title">Әмма парасы</div>
                <h2 className="mt-sm">{d.memorized} / {d.total} сүре жатталды</h2>
                <div className="small muted mt-sm">Қазір жаттап жатырсыз: {d.learning}</div>
              </div>
            </div>
            <div className="card lav">
              <div className="card-title" style={{ color: 'var(--primary-700)' }}><BookMarked />Кеңес</div>
              <p className="small mt-sm">Нас сүресінен бастап жоғары қарай жаттаңыз. Сүре бетінде «Жаттау режимін» қосып, аятты 5× қайталап тыңдаңыз да, жатқа айтып тексеріңіз.</p>
            </div>
          </div>
          <div className="hifz-grid">
            {d.surahs.map((s) => (
              <div key={s.id} className={`hifz-item ${s.status || ''}`}>
                <Link to={`/tafsir/${s.id}`} className="row between">
                  <div><div className="bold">{s.id}. {s.name_kk}</div><div className="tiny muted">{s.ayah_count} аят · «{s.name_meaning}»</div></div>
                  <span className="ar ar-sm" lang="ar">{s.name_ar}</span>
                </Link>
                <HifzButtons id={s.id} initial={s.status} onChange={() => { q.reload(); force((x) => x + 1); }} />
              </div>
            ))}
          </div>
        </>
      )}</Loader>
    </>
  );
}
