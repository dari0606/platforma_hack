import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, Trophy, RotateCcw, Check, Repeat, Volume2, BookMarked, CheckCircle2, Mic } from 'lucide-react';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { useApi, Loader, PageHead, Tabs, Empty, StatusBadge, Progress, Ar, ago, fmtDate, useToast } from '../components/ui.jsx';
import { Exercise, AnswerInput, answered, Feedback, QuestionPrompt, SubmissionStatus } from '../components/practice.jsx';
import { Assignment } from './learning.jsx';

export function PracticePage() {
  const q = useApi('/api/practice');
  const [tab, setTab] = useState('tasks');
  return (
    <>
      <PageHead title={t('Практика')} sub="Үй тапсырмалары, дауыспен оқу жаттығулары және ұстаз тексерген жұмыстарыңыз" />
      <Loader q={q}>{(d) => (
        <>
          <Tabs value={tab} onChange={setTab} items={[
            { value: 'tasks', label: 'Үй тапсырмалары', count: d.assignments.length },
            { value: 'voice', label: '🎙 Дауыспен оқу', count: d.recordings.length },
            { value: 'history', label: 'Тексерілген жұмыстар', count: d.history.length },
          ]} />
          <div className="mt">
            {tab === 'tasks' && (d.assignments.length ? d.assignments.map((a) => <Assignment key={a.id} a={a} />) : <Empty title="Қазір тапсырма жоқ" />)}
            {tab === 'voice' && (
              <div className="stack" style={{ gap: 14 }}>
                <div className="alert info"><Mic />Батырманы басып, аятты немесе сөзді оқыңыз да, жазбаны ұстазға жіберіңіз. Ұстаз тыңдап, пікір қалдырады: «Қабылданды», «Қайта оқу керек» немесе «Түзету қажет».</div>
                {d.recordings.map((ex, i) => (
                  <div key={ex.id}>
                    <div className="small muted mb" style={{ marginBottom: 6 }}>{ex.lesson_title}</div>
                    <Exercise ex={ex} index={i + 1} />
                  </div>
                ))}
              </div>
            )}
            {tab === 'history' && (d.history.length ? (
              <div className="stack">{d.history.map((s) => (
                <div key={s.id} className="card" style={{ padding: 16 }}>
                  <div className="row between wrap"><b className="small">{s.title}</b><StatusBadge status={s.status} /></div>
                  <SubmissionStatus sub={s} />
                </div>
              ))}</div>
            ) : <Empty title="Әлі жұмыс жіберілмеген" />)}
          </div>
        </>
      )}</Loader>
    </>
  );
}

const CAT = { tajweed: 'Тәжуид', quran: 'Құран оқу', tafsir: 'Тәпсір', arabic: 'Араб тілі' };
export function TestsPage() {
  const q = useApi('/api/tests');
  return (
    <>
      <PageHead title={t('Тесттер')} sub="Тест тек бағаламайды — әр жауаптан кейін «Неге?» деген түсіндірме арқылы оқытуды жалғастырады." />
      <Loader q={q}>{(rows) => (
        <div className="grid auto-fill">
          {rows.map((x) => (
            <Link key={x.id} to={`/tests/${x.id}`} className="card card-link">
              <div className="row between"><span className="badge primary">{CAT[x.category] || x.category}</span>{x.best != null && <span className={`badge ${x.best >= x.pass_score ? 'green' : 'amber'}`}>Үздік: {x.best}%</span>}</div>
              <h3 className="mt">{x.title}</h3>
              <div className="small muted mt-sm">{x.count} сұрақ · өту шегі {x.pass_score}%</div>
              {x.best != null && <div className="mt"><Progress value={x.best} size="sm" /></div>}
              <span className="btn soft sm mt">{x.attempts ? 'Қайта тапсыру' : 'Бастау'}<ArrowRight /></span>
            </Link>
          ))}
        </div>
      )}</Loader>
    </>
  );
}

export function TestRun() {
  const { id } = useParams();
  const q = useApi(`/api/tests/${id}`, [id]);
  return <Loader q={q}>{(d) => <Runner key={id} test={d.test} questions={d.questions} history={d.history} />}</Loader>;
}

/** Runs a list of questions with instant feedback; submits the attempt at the end if `test` is set. */
function Runner({ test, questions, history = [], onFinish }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState({});
  const [final, setFinal] = useState(null);
  const [busy, setBusy] = useState(false);
  const q = questions[i];

  const check = async () => {
    setBusy(true);
    try { const r = await api.post(`/api/questions/${q.id}/check`, { given: answers[q.id] }); setResults((x) => ({ ...x, [q.id]: r })); } finally { setBusy(false); }
  };
  const next = async () => {
    if (i < questions.length - 1) return setI(i + 1);
    if (test) { setBusy(true); setFinal(await api.post(`/api/tests/${test.id}/submit`, { answers })); setBusy(false); }
    else { const c = Object.values(results).filter((r) => r.correct).length; setFinal({ correct: c, total: questions.length, score: Math.round((c / questions.length) * 100) }); }
    onFinish?.();
  };
  const restart = () => { setI(0); setAnswers({}); setResults({}); setFinal(null); };

  if (!questions.length) return <Empty title="Бұл тестте әлі сұрақ жоқ" />;
  if (final) {
    return (
      <div className="card center" style={{ maxWidth: 620, margin: '24px auto' }}>
        <Trophy size={40} color="var(--primary)" />
        <div className="big-num mt">{final.score}%</div>
        <div className="muted">{final.correct} / {final.total} дұрыс жауап</div>
        {test && <div className={`badge mt ${final.passed ? 'green' : 'amber'}`}>{final.passed ? 'Тест сәтті тапсырылды' : `Өту шегі — ${test.pass_score}%. Тағы бір рет көріңіз`}</div>}
        <div className="stack mt-lg" style={{ textAlign: 'left' }}>
          {questions.map((qq, n) => <div key={qq.id} className="row small"><span className={`li-icon ${results[qq.id]?.correct ? 'done' : ''}`} style={{ width: 28, height: 28, color: results[qq.id]?.correct ? undefined : 'var(--red)' }}>{results[qq.id]?.correct ? <Check size={15} /> : '✕'}</span>{n + 1}. {qq.prompt}</div>)}
        </div>
        <div className="row wrap mt-lg" style={{ justifyContent: 'center' }}>
          <button className="btn ghost" onClick={restart}><RotateCcw />Қайта тапсыру</button>
          <Link to="/progress" className="btn">Прогресті көру</Link>
        </div>
      </div>
    );
  }
  const res = results[q.id];
  return (
    <div style={{ maxWidth: 760 }}>
      {test && <PageHead title={test.title} sub={test.description} crumbs={[{ label: t('Тесттер'), to: '/tests' }, { label: test.title }]} />}
      <div className="test-top">
        <span className="small bold">{i + 1} / {questions.length}</span>
        <div className="q-dots">{questions.map((qq, n) => <i key={qq.id} className={results[qq.id] ? (results[qq.id].correct ? 'ok' : 'bad') : n === i ? 'cur' : ''} />)}</div>
      </div>
      <div className="card">
        <QuestionPrompt q={q} />
        <div className="mt"><AnswerInput q={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} result={res} /></div>
        <Feedback result={res} />
        <div className="row mt-lg">
          {!res ? <button className="btn" disabled={busy || !answered(q, answers[q.id])} onClick={check}>{t('Тексеру')}</button>
            : <button className="btn" disabled={busy} onClick={next}>{i < questions.length - 1 ? t('Келесі') : 'Аяқтау'}<ArrowRight /></button>}
        </div>
      </div>
      {history.length > 0 && <div className="small muted mt">Алдыңғы нәтижелер: {history.map((h) => `${h.score}% (${fmtDate(h.created_at)})`).join(' · ')}</div>}
    </div>
  );
}

export function DailyReview() {
  const q = useApi('/api/review/today');
  const [step, setStep] = useState(0);
  const [finished, setFinished] = useState(false);
  const toast = useToast();
  const finish = async () => { const r = await api.post('/api/review/complete'); setFinished(true); toast(`Қайталау аяқталды ✓ Оқу сериясы: ${r.streak} күн`); };
  return (
    <>
      <PageHead title={t('Бүгін қайталайық')} sub="Күнделікті 5–10 минуттық қайталау білімді бекітеді." />
      <Loader q={q}>{(d) => {
        const steps = [
          d.topics.length && { key: 'rules', title: `${d.topics.length} тәжуид ережесі` },
          d.words.length && { key: 'words', title: `${d.words.length} араб сөзі` },
          d.surah && { key: 'surah', title: '1 сүре' },
          d.questions.length && { key: 'quiz', title: `${d.questions.length} тест сұрағы` },
        ].filter(Boolean);
        const cur = steps[step];
        if (finished) return <div className="card center" style={{ maxWidth: 560, margin: '24px auto' }}><CheckCircle2 size={44} color="var(--green)" /><h2 className="mt">Бүгінгі қайталау аяқталды!</h2><p className="muted mt-sm">Ертең жаңа қайталау жинағы дайын болады.</p><Link to="/" className="btn mt-lg">{t('Басты бет')}</Link></div>;
        return (
          <div style={{ maxWidth: 820 }}>
            {d.weakTags.length > 0 && <div className="alert info mb"><Repeat />Бүгінгі жинақ сіздің қателеріңізге бейімделген: {d.weakTags.join(', ')}</div>}
            <div className="chips mb">{steps.map((s, n) => <button key={s.key} className={`chip ${n === step ? 'on' : ''}`} onClick={() => setStep(n)}>{n < step ? '✓ ' : ''}{s.title}</button>)}</div>
            {cur?.key === 'rules' && (
              <div className="stack">
                {d.topics.map((tp) => (
                  <div key={tp.id} className="card">
                    <div className="row between"><h3>{tp.title}</h3><Link to={`/kb/${tp.slug}`} className="btn ghost sm">Толығырақ</Link></div>
                    {tp.arabic && <Ar size="md" className="mt-sm">{tp.arabic}</Ar>}
                    <p className="muted">{tp.summary}</p>
                  </div>
                ))}
              </div>
            )}
            {cur?.key === 'words' && <WordCards words={d.words} />}
            {cur?.key === 'surah' && (
              <Link to={`/tafsir/${d.surah.id}`} className="card card-link center">
                <BookMarked color="var(--primary)" />
                <Ar size="xl" center>{d.surah.name_ar}</Ar>
                <h2>{d.surah.name_kk} сүресі</h2>
                <p className="muted mt-sm">{d.surah.ayah_count} аят · сүрені тыңдап, бір рет оқып шығыңыз</p>
              </Link>
            )}
            {cur?.key === 'quiz' && <Runner questions={d.questions} onFinish={() => {}} />}
            <div className="row mt-lg">
              {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}>{t('Артқа')}</button>}
              {step < steps.length - 1 ? <button className="btn" onClick={() => setStep(step + 1)}>{t('Келесі')}<ArrowRight /></button>
                : <button className="btn green" onClick={finish}><Check />Қайталауды аяқтау</button>}
            </div>
          </div>
        );
      }}</Loader>
    </>
  );
}

function WordCards({ words }) {
  const [flip, setFlip] = useState({});
  return (
    <div className="grid g3">
      {words.map((w) => (
        <button key={w.id} className="card center" style={{ minHeight: 180, cursor: 'pointer' }} onClick={() => setFlip((f) => ({ ...f, [w.id]: !f[w.id] }))}>
          <Ar size="lg" center>{w.arabic}</Ar>
          {flip[w.id] ? <><div className="bold" style={{ fontSize: 18 }}>{w.meaning}</div><div className="small muted">{w.translit}</div></> : <div className="small muted">Мағынасын еске түсіріп, картаны басыңыз</div>}
        </button>
      ))}
    </div>
  );
}
