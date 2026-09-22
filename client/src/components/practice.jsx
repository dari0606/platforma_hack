import { useState } from 'react';
import { Check, X, ArrowRight, Upload, Send, Volume2, MessageSquare } from 'lucide-react';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { Recorder } from './media.jsx';
import { StatusBadge, ago, useToast } from './ui.jsx';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const isArabic = (s) => /[؀-ۿ]/.test(s || '');

/** Answer input for a question/exercise. Controlled: value + onChange. `result` locks it and colours options. */
export function AnswerInput({ q, value, onChange, result }) {
  const locked = !!result;
  if (['single', 'arabic_reading', 'audio_rule'].includes(q.type)) {
    return (
      <div className="stack">
        {(q.options || []).map((o, i) => {
          const cls = value === i ? (result ? (result.correct ? 'ok' : 'bad') : 'sel') : '';
          return <button key={i} className={`opt ${cls}`} disabled={locked} onClick={() => onChange(i)}><span className="key">{LETTERS[i]}</span>{isArabic(o) ? <span className="ar-ui">{o}</span> : o}</button>;
        })}
      </div>
    );
  }
  if (q.type === 'multi') {
    const v = value || [];
    return (
      <div className="stack">
        <div className="small muted">Бірнеше жауапты таңдауға болады</div>
        {(q.options || []).map((o, i) => (
          <button key={i} className={`opt ${v.includes(i) ? (result ? (result.correct ? 'ok' : 'bad') : 'sel') : ''}`} disabled={locked}
            onClick={() => onChange(v.includes(i) ? v.filter((x) => x !== i) : [...v, i])}>
            <span className="key">{v.includes(i) ? <Check size={15} /> : LETTERS[i]}</span>{isArabic(o) ? <span className="ar-ui">{o}</span> : o}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === 'tf') {
    return (
      <div className="grid g2">
        {[[true, '✓ Дұрыс'], [false, '✕ Қате']].map(([v, l]) => (
          <button key={l} className={`opt ${value === v ? (result ? (result.correct ? 'ok' : 'bad') : 'sel') : ''}`} disabled={locked} onClick={() => onChange(v)} style={{ justifyContent: 'center' }}>{l}</button>
        ))}
      </div>
    );
  }
  if (q.type === 'fill') {
    return <input className="input" placeholder="Жауабыңызды жазыңыз…" value={value || ''} disabled={locked} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.form?.requestSubmit?.()} />;
  }
  if (q.type === 'match') {
    const v = value || [];
    return (
      <div>
        {(q.left || []).map((l, i) => (
          <div className="match-row" key={i}>
            <div className="match-left">{isArabic(l) ? <span className="ar-ui">{l}</span> : l}</div>
            <ArrowRight size={18} className="muted" />
            <select className="select" disabled={locked} value={v[i] ?? ''} onChange={(e) => { const n = [...v]; n[i] = e.target.value; onChange(n); }}>
              <option value="">Таңдаңыз…</option>
              {(q.right || []).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export const answered = (q, v) => {
  if (v === undefined || v === null || v === '') return false;
  if (q.type === 'multi') return v.length > 0;
  if (q.type === 'match') return (q.left || []).every((_, i) => v[i]);
  return true;
};

export function Feedback({ result }) {
  if (!result) return null;
  return (
    <div className={`feedback ${result.correct ? 'ok' : 'bad'}`} role="status">
      <div className="fh">{result.correct ? <><Check size={18} />{t('Дұрыс')}</> : <><X size={18} />{t('Қате')}</>}</div>
      {!result.correct && result.answer && <div className="why"><b>Дұрыс жауап:</b> {result.answer}</div>}
      {result.explanation && <div className="why"><b>{t('Неге?')}</b> {result.explanation}</div>}
      {result.rule && <div className="why small muted">Ереже: {result.rule}</div>}
    </div>
  );
}

export function QuestionPrompt({ q }) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="bold" style={{ fontSize: 17 }}>{q.prompt}</div>
      {q.arabic && <div className="ex-lines">{q.arabic}</div>}
      {q.audio_url && <div className="row"><Volume2 size={18} className="muted" /><audio controls preload="none" src={q.audio_url} /></div>}
    </div>
  );
}

/** One practice item inside a lesson / KB topic. */
export function Exercise({ ex, index, onDone }) {
  const [value, setValue] = useState(undefined);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sub, setSub] = useState(ex.submission || null);
  const [text, setText] = useState('');
  const toast = useToast();

  const check = async () => {
    setBusy(true);
    try { const r = await api.post(`/api/exercises/${ex.id}/check`, { given: value }); setResult(r); onDone?.(r); } finally { setBusy(false); }
  };
  const submit = async (payload) => {
    setBusy(true);
    const fd = new FormData(); fd.append('exercise_id', ex.id);
    if (payload instanceof Blob) fd.append('file', payload, payload.type.includes('mp4') ? 'recording.m4a' : 'recording.webm');
    else if (payload instanceof File) fd.append('file', payload);
    else fd.append('text', payload);
    try { const s = await api.post('/api/submissions', fd); setSub(s); setText(''); toast('Ұстазға жіберілді ✓'); onDone?.(); } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const auto = ['single', 'tf', 'match', 'fill', 'multi'].includes(ex.type);
  const words = (ex.arabic || '').split('\n').filter(Boolean);
  const isAyahLines = words.some((w) => w.split(' ').length > 2);

  return (
    <div className="exercise">
      <div className="row mb" style={{ alignItems: 'flex-start' }}>
        <span className="section-num">{index}</span>
        <div className="li-body">
          <div className="tiny muted bold" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{TYPE_LABEL[ex.type]}</div>
          <div className="bold" style={{ fontSize: 16, marginTop: 2 }}>{ex.prompt}</div>
        </div>
      </div>
      {words.length > 0 && (isAyahLines ? <div className="ex-lines">{words.map((w, i) => <div key={i}>{w}</div>)}</div>
        : <div className="ex-words">{words.map((w, i) => <span className="w" key={i}>{w}</span>)}</div>)}

      {auto && (
        <>
          <AnswerInput q={ex} value={value} onChange={setValue} result={result} />
          {!result ? <button className="btn mt" disabled={busy || !answered(ex, value)} onClick={check}>{t('Тексеру')}</button>
            : <><Feedback result={result} />{!result.correct && <button className="btn ghost sm mt" onClick={() => { setResult(null); setValue(undefined); }}>Қайта көру</button>}</>}
        </>
      )}

      {ex.type === 'read_aloud' && <Recorder busy={busy} onSubmit={submit} />}
      {ex.type === 'text' && (
        <div className="stack">
          <textarea className="textarea" placeholder="Жауабыңызды жазыңыз…" value={text} onChange={(e) => setText(e.target.value)} />
          <div><button className="btn" disabled={busy || !text.trim()} onClick={() => submit(text)}><Send />{t('Ұстазға жіберу')}</button></div>
        </div>
      )}
      {ex.type === 'upload' && <FilePick busy={busy} onPick={submit} />}
      {sub && <SubmissionStatus sub={sub} />}
    </div>
  );
}

export function FilePick({ onPick, busy, accept = 'image/*,application/pdf,audio/*' }) {
  return (
    <label className="btn ghost" style={{ cursor: busy ? 'wait' : 'pointer' }}>
      <Upload />Файл жүктеу (сурет, PDF, аудио)
      <input type="file" accept={accept} hidden disabled={busy} onChange={(e) => e.target.files[0] && onPick(e.target.files[0])} />
    </label>
  );
}

export function SubmissionStatus({ sub }) {
  return (
    <div className="note mt">
      <div className="row between wrap"><span className="small muted">Соңғы жіберілгені · {ago(sub.created_at)}</span><StatusBadge status={sub.status} /></div>
      {sub.kind === 'audio' && sub.file_path && <audio className="mt-sm" controls preload="none" src={sub.file_path} />}
      {sub.text && <div className="small mt-sm pre">{sub.text}</div>}
      {sub.file_name && sub.kind === 'upload' && <a className="small mt-sm" href={sub.file_path} target="_blank" rel="noreferrer">📎 {sub.file_name}</a>}
      {(sub.feedback || []).map((f) => (
        <div key={f.id} className="row mt-sm" style={{ alignItems: 'flex-start' }}>
          <MessageSquare size={16} className="muted" style={{ marginTop: 3 }} />
          <div className="small"><b>{f.teacher || 'Ұстаз'}:</b> {f.comment || '—'}</div>
        </div>
      ))}
    </div>
  );
}

export const TYPE_LABEL = {
  read_aloud: '🎙 Дауыспен оқу', single: 'Бір дұрыс жауап', multi: 'Бірнеше жауап', tf: 'Дұрыс / Қате', match: 'Сәйкестендіру',
  fill: 'Бос орынды толтыру', text: 'Жазбаша жауап', upload: 'Файл жүктеу', arabic_reading: 'Дұрыс оқылуы', audio_rule: 'Аудио → ереже',
};
