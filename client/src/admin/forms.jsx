// Generic CMS form engine: renders forms from the server's resource metadata (/api/admin/meta).
import { useEffect, useState } from 'react';
import { Plus, Trash2, Upload, Check, AlertTriangle, ShieldCheck, Send, Undo2, Globe, Search, Pencil } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useToast, StatusBadge, Modal, Spinner } from '../components/ui.jsx';
import { YouTube, youtubeId } from '../components/media.jsx';

let metaCache = null;
export function useAdminMeta() {
  const [m, setM] = useState(metaCache);
  useEffect(() => { if (!metaCache) api.get('/api/admin/meta').then((r) => { metaCache = r; setM(r); }); }, []);
  return m;
}

const optCache = new Map();
export function RefSelect({ refName, filter, value, onChange, placeholder = '—' }) {
  const key = refName + JSON.stringify(filter || {});
  const [opts, setOpts] = useState(optCache.get(key) || null);
  useEffect(() => {
    if (optCache.has(key)) return;
    const qs = new URLSearchParams(filter || {}).toString();
    api.get(`/api/admin/options/${refName}${qs ? '?' + qs : ''}`).then((o) => { optCache.set(key, o); setOpts(o); });
  }, [key]);
  return (
    <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">{placeholder}</option>
      {(opts || []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}
export const invalidateOptions = () => optCache.clear();

function FileField({ value, onChange, accept }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const up = async (f) => {
    setBusy(true);
    const fd = new FormData(); fd.append('file', f);
    try { const r = await api.post('/api/admin/upload', fd); onChange(r.url); toast('Файл жүктелді ✓'); } catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        <input className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="Сілтеме немесе файл жүктеңіз" />
        <label className="btn ghost" style={{ cursor: 'pointer' }}><Upload />{busy ? '…' : 'Жүктеу'}<input type="file" hidden accept={accept} onChange={(e) => e.target.files[0] && up(e.target.files[0])} /></label>
      </div>
      {value && /\.(mp3|wav|webm|m4a|ogg)$/i.test(value) && <audio controls src={value} />}
    </div>
  );
}

/** Editor for options/answers of questions & exercises, depending on type. value = {options, answer, pairs} */
export function AnswersEditor({ type, value, onChange }) {
  const v = value || {};
  const set = (patch) => onChange({ ...v, ...patch });
  if (['read_aloud', 'text', 'upload'].includes(type)) return <div className="small muted">Бұл түрге жауап қажет емес — оқушы жұмысын ұстаз тексереді.</div>;
  if (type === 'tf') {
    return <div className="chips">{[[true, '✓ Дұрыс'], [false, '✕ Қате']].map(([b, l]) => <button type="button" key={l} className={`chip ${v.answer === b ? 'on' : ''}`} onClick={() => set({ answer: b })}>{l}</button>)}</div>;
  }
  if (type === 'fill') {
    const arr = Array.isArray(v.answer) ? v.answer : v.answer ? [v.answer] : [];
    return (
      <div className="field">
        <input className="input" value={arr.join(', ')} onChange={(e) => set({ answer: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="Дұрыс жауап(тар), үтір арқылы" />
        <span className="help">Сұрақ мәтінінде бос орынды ___ деп белгілеңіз. Бірнеше дұрыс нұсқаны үтірмен бөліңіз.</span>
      </div>
    );
  }
  if (type === 'match') {
    const pairs = v.pairs || [['', '']];
    const upd = (i, j, s) => set({ pairs: pairs.map((p, n) => (n === i ? (j ? [p[0], s] : [s, p[1]]) : p)) });
    return (
      <div className="stack" style={{ gap: 8 }}>
        {pairs.map((p, i) => (
          <div key={i} className="row">
            <input className="input" value={p[0]} onChange={(e) => upd(i, 0, e.target.value)} placeholder="Сол жақ" />
            <span>→</span>
            <input className="input" value={p[1]} onChange={(e) => upd(i, 1, e.target.value)} placeholder="Сәйкес жауап" />
            <button type="button" className="icon-btn" onClick={() => set({ pairs: pairs.filter((_, n) => n !== i) })}><Trash2 /></button>
          </div>
        ))}
        <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ pairs: [...pairs, ['', '']] })}><Plus />Жұп қосу</button>
      </div>
    );
  }
  // single / multi / arabic_reading / audio_rule
  const options = v.options || ['', ''];
  const multi = type === 'multi';
  const isCorrect = (i) => (multi ? (v.answer || []).includes(i) : v.answer === i);
  const toggle = (i) => set({ answer: multi ? (isCorrect(i) ? (v.answer || []).filter((x) => x !== i) : [...(v.answer || []), i]) : i });
  return (
    <div className="stack" style={{ gap: 8 }}>
      {options.map((o, i) => (
        <div key={i} className="row">
          <button type="button" className={`icon-btn`} style={isCorrect(i) ? { background: 'var(--green)', color: '#fff', borderColor: 'var(--green)' } : undefined} onClick={() => toggle(i)} title="Дұрыс жауап"><Check /></button>
          <input className="input" dir="auto" value={o} onChange={(e) => set({ options: options.map((x, n) => (n === i ? e.target.value : x)) })} placeholder={`Нұсқа ${i + 1}`} />
          <button type="button" className="icon-btn" onClick={() => set({ options: options.filter((_, n) => n !== i), answer: multi ? (v.answer || []).filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)) : v.answer === i ? null : v.answer > i ? v.answer - 1 : v.answer })}><Trash2 /></button>
        </div>
      ))}
      <div className="row"><button type="button" className="btn ghost sm" onClick={() => set({ options: [...options, ''] })}><Plus />Нұсқа қосу</button><span className="help small muted">✓ — дұрыс жауапты белгілеңіз{multi ? ' (бірнешеу болуы мүмкін)' : ''}</span></div>
    </div>
  );
}

export function FieldInput({ f, value, onChange, item }) {
  switch (f.type) {
    case 'textarea': return <textarea className="textarea" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'arabic': return <textarea className="textarea ar" dir="rtl" lang="ar" style={{ minHeight: 80 }} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number': return <input type="number" className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'bool': return <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? 1 : 0)} />Иә</label>;
    case 'select': return <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>{!f.options.some((o) => o.value === '') && <option value="">—</option>}{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    case 'ref': return <RefSelect refName={f.ref} filter={f.refFilter} value={value} onChange={onChange} />;
    case 'color': return <input type="color" className="input" style={{ height: 44, padding: 4 }} value={value || '#6D4AFF'} onChange={(e) => onChange(e.target.value)} />;
    case 'datetime': return <input type="datetime-local" className="input" value={value ? String(value).slice(0, 16) : ''} onChange={(e) => onChange(e.target.value)} />;
    case 'time': return <input type="time" className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'password': return <input type="password" className="input" autoComplete="new-password" value={value || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'lines': return <textarea className="textarea" value={Array.isArray(value) ? value.join('\n') : value || ''} onChange={(e) => onChange(e.target.value.split('\n'))} />;
    case 'examples': return <textarea className="textarea" dir="auto" style={{ fontSize: 18 }} value={Array.isArray(value) ? value.map((x) => `${x.ar} | ${x.note || ''}`).join('\n') : value || ''} onChange={(e) => onChange(e.target.value)} placeholder="قَالَ | табиғи мәд" />;
    case 'file': return <FileField value={value} onChange={onChange} accept={f.accept} />;
    case 'youtube': return (
      <div className="stack" style={{ gap: 8 }}>
        <input className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
        {value && (youtubeId(value) ? <div style={{ maxWidth: 360 }}><YouTube url={value} /></div> : <span className="small" style={{ color: 'var(--red)' }}>YouTube сілтемесі танылмады</span>)}
      </div>
    );
    case 'answers': return <AnswersEditor type={item?.type} value={value} onChange={onChange} />;
    default: return <input className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} dir="auto" />;
  }
}

const WIDE = new Set(['textarea', 'arabic', 'lines', 'examples', 'answers', 'youtube', 'file']);

/** Create/edit form for any resource. */
export function ResourceForm({ res, id, defaults = {}, onSaved, onDeleted, hide = [] }) {
  const meta = useAdminMeta();
  const [item, setItem] = useState(id ? null : { ...defaults });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { user } = useAuth();
  useEffect(() => { if (id) api.get(`/api/admin/r/${res}/${id}`).then(setItem).catch((e) => setErr(e.message)); }, [res, id]);
  if (!meta || !item) return err ? <div className="alert error">{err}</div> : <Spinner />;
  const R = meta.resources[res];
  if (!R) return <div className="alert error">Рұқсат жоқ</div>;
  const fields = R.fields.filter((f) => !hide.includes(f.name) && !(f.createOnly && id));
  const set = (k, v) => setItem((x) => ({ ...x, [k]: v }));
  const sections = [...new Set(fields.map((f) => f.section || ''))];

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const body = {}; R.fields.forEach((f) => { if (f.name in item) body[f.name] = item[f.name]; });
    try {
      const r = id ? await api.put(`/api/admin/r/${res}/${id}`, body) : await api.post(`/api/admin/r/${res}`, body);
      invalidateOptions();
      toast(r._notice || 'Сақталды ✓'); setItem(r); onSaved?.(r);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!confirm('Жоюды растайсыз ба? Бұл әрекетті қайтару мүмкін емес.')) return;
    try { await api.del(`/api/admin/r/${res}/${id}`); invalidateOptions(); toast('Жойылды'); onDeleted?.(); } catch (e2) { setErr(e2.message); }
  };

  return (
    <form onSubmit={save} className="stack" style={{ gap: 18 }}>
      {R.workflow && id && <WorkflowBar res={res} item={item} onChange={setItem} user={user} />}
      {err && <div className="alert error"><AlertTriangle />{err}</div>}
      {sections.map((sec) => (
        <div key={sec || 'main'} className={sec ? 'card flat' : ''} style={sec ? { padding: 18, background: 'var(--milk)' } : undefined}>
          {sec && <h3 className="mb">{sec}</h3>}
          <div className="form-grid">
            {fields.filter((f) => (f.section || '') === sec).map((f) => (
              <div key={f.name} className={`field ${WIDE.has(f.type) ? 'full' : ''}`}>
                <label>{f.label}{f.required && ' *'}</label>
                <FieldInput f={f} value={item[f.name]} onChange={(v) => set(f.name, v)} item={item} />
                {f.help && <span className="help">{f.help}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="row wrap">
        <button className="btn" disabled={busy}><Check />{id ? 'Сақтау' : 'Қосу'}</button>
        {id && onDeleted && <button type="button" className="btn danger" onClick={del}><Trash2 />Жою</button>}
        {R.workflow && !id && <span className="small muted">Жаңа материал Draft күйінде сақталады.</span>}
      </div>
    </form>
  );
}

const STEPS = ['draft', 'review', 'approved', 'published'];
/** Draft → Review → Approved → Published with role checks enforced on the server. */
export function WorkflowBar({ res, item, onChange, user }) {
  const toast = useToast();
  const [err, setErr] = useState(null);
  const go = async (status) => {
    setErr(null);
    try { const r = await api.post(`/api/admin/r/${res}/${item.id}/status`, { status }); onChange(r); toast(`Күйі: ${status}`); } catch (e) { setErr(e.message); }
  };
  const idx = STEPS.indexOf(item.status);
  const hasSource = item.source_id || item.scholar || item.book;
  return (
    <div className="card lav" style={{ padding: 16 }}>
      <div className="row wrap between">
        <div className="row wrap" style={{ gap: 6 }}>
          {STEPS.map((s, i) => <span key={s} className="row" style={{ gap: 6 }}>{i > 0 && <span className="muted">→</span>}<span className={`badge ${i <= idx ? (s === 'published' ? 'green' : 'primary') : ''}`}>{i < idx ? '✓ ' : ''}{s[0].toUpperCase() + s.slice(1)}</span></span>)}
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {item.status === 'draft' && <button type="button" className="btn sm" onClick={() => go('review')}><Send />Тексеруге жіберу</button>}
          {item.status === 'review' && ['teacher', 'admin'].includes(user.role) && <button type="button" className="btn sm" onClick={() => go('approved')}><ShieldCheck />Бекіту (ұстаз)</button>}
          {item.status === 'approved' && user.role === 'admin' && <button type="button" className="btn sm green" onClick={() => go('published')}><Globe />Жариялау</button>}
          {item.status !== 'draft' && <button type="button" className="btn ghost sm" onClick={() => go('draft')}><Undo2 />Draft-қа қайтару</button>}
        </div>
      </div>
      <div className="small mt-sm" style={{ color: 'var(--primary-700)' }}>
        {item.reviewed_at ? <>✓ Тексерген: <b>{item.reviewer || '—'}</b> · {new Date(item.reviewed_at).toLocaleDateString('kk-KZ')}</> : 'Діни материал тек жауапты ұстаз бекіткеннен кейін ғана жариялана алады.'}
        {!hasSource && item.status === 'review' && <div style={{ color: 'var(--amber)' }}>⚠ Бекіту үшін «Дереккөз / Автор / Кітап» өрістерін толтырыңыз.</div>}
        {item.is_demo ? <div>Бұл — демо-мазмұн. Ұстаз тексеріп, қажет болса түзетіңіз.</div> : null}
      </div>
      {err && <div className="alert error mt-sm"><AlertTriangle />{err}</div>}
    </div>
  );
}

/** Generic list table with search + create/edit modal. */
export function ResourceTable({ res, filter = {}, defaults = {}, onOpen, title, extraCols = [], actions, hideCols = [] }) {
  const meta = useAdminMeta();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null); // null | 'new' | id
  const [labels, setLabels] = useState({});
  const qs = new URLSearchParams({ ...filter, ...(q ? { q } : {}) }).toString();
  const load = () => api.get(`/api/admin/r/${res}?${qs}`).then((r) => { setRows(r.rows); setTotal(r.total); });
  useEffect(() => { load(); }, [res, qs]);
  const R = meta?.resources[res];
  const cols = R ? R.fields.filter((f) => f.list && !hideCols.includes(f.name)) : [];
  useEffect(() => {
    cols.filter((c) => c.type === 'ref').forEach((c) => {
      if (labels[c.ref]) return;
      api.get(`/api/admin/options/${c.ref}`).then((o) => setLabels((l) => ({ ...l, [c.ref]: Object.fromEntries(o.map((x) => [x.id, x.label])) })));
    });
  }, [R]);
  if (!R) return meta ? <div className="alert error">Рұқсат жоқ</div> : <Spinner />;
  const show = (c, r) => {
    const v = r[c.name];
    if (c.type === 'bool') return v ? '✓' : '—';
    if (c.type === 'ref') return labels[c.ref]?.[v] || (v ? `#${v}` : '—');
    if (c.type === 'select') { const o = c.options.find((x) => String(x.value) === String(v)); return c.name === 'status' ? <StatusBadge status={v} /> : o?.label || v || '—'; }
    if (c.type === 'arabic') return <span className="ar-ui" lang="ar">{String(v || '').slice(0, 60)}</span>;
    if (c.type === 'datetime') return v ? String(v).replace('T', ' ') : '—';
    return String(v ?? '—').slice(0, 90);
  };
  return (
    <div>
      <div className="row wrap mb">
        {title && <h2 className="spacer">{title} <span className="muted small">· {total}</span></h2>}
        <div style={{ position: 'relative' }}><Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--muted)' }} /><input className="input" style={{ paddingLeft: 36, width: 240 }} placeholder="Іздеу…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn" onClick={() => setEdit('new')}><Plus />Қосу</button>
      </div>
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th>{cols.map((c) => <th key={c.name}>{c.label}</th>)}{R.workflow && <th>Күйі</th>}{extraCols.map((c) => <th key={c.label}>{c.label}</th>)}<th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="click" onClick={() => (onOpen ? onOpen(r) : setEdit(r.id))}>
                  <td className="muted">{r.id}</td>
                  {cols.map((c) => <td key={c.name}>{show(c, r)}</td>)}
                  {R.workflow && <td><StatusBadge status={r.status} /></td>}
                  {extraCols.map((c) => <td key={c.label}>{c.render(r)}</td>)}
                  <td onClick={(e) => e.stopPropagation()} className="nowrap">{actions?.(r, load)}<button className="btn ghost sm" onClick={() => setEdit(r.id)}><Pencil size={14} /></button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={cols.length + 3} className="center muted" style={{ padding: 30 }}>Жазба жоқ</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {edit && (
        <Modal title={edit === 'new' ? `${R.label}: қосу` : `${R.label}: өңдеу`} onClose={() => setEdit(null)} wide>
          <ResourceForm res={res} id={edit === 'new' ? null : edit} defaults={{ ...defaults, ...Object.fromEntries(R.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default])), ...filter }}
            onSaved={() => { load(); if (edit === 'new') setEdit(null); }} onDeleted={() => { setEdit(null); load(); }} />
        </Modal>
      )}
    </div>
  );
}
