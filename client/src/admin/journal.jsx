// Teacher journal (lesson marks) and payroll screens. Rules live on the server (server/payroll.js);
// these pages only display the calculation and send marks.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Plus, Send, Check, Lock, Unlock, Banknote, Download, Trash2, Pencil, AlertTriangle, CalendarDays, Users, User, Trophy,
} from 'lucide-react';
import { api } from '../api.js';
import { useApi, Loader, PageHead, Modal, Tabs, Empty, useAuth, useToast, localISO, WD, WD_SHORT } from '../components/ui.jsx';

const MONTHS = ['Қаңтар', 'Ақпан', 'Наурыз', 'Сәуір', 'Мамыр', 'Маусым', 'Шілде', 'Тамыз', 'Қыркүйек', 'Қазан', 'Қараша', 'Желтоқсан'];
const money = (n) => `${Math.round(n || 0).toLocaleString('ru-RU')} ₸`;
const hrs = (n) => String(Math.round((n || 0) * 100) / 100).replace('.', ',');
const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); return `${MONTHS[mo - 1]} ${y}`; };
const shiftMonth = (m, k) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + k, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const thisMonth = () => localISO(new Date()).slice(0, 7);
const mondayOf = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayLabel = (iso) => { const d = new Date(`${iso}T12:00:00`); return `${WD[(d.getDay() + 6) % 7]}, ${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}`; };
const STATUS_TONE = { done: 'green', absent: 'amber', moved: 'blue', frozen: '', cancelled: 'red' };
const PAY_STATUS = { draft: ['Черновик', ''], approved: ['Бекітілді', 'blue'], paid: ['Төленді', 'green'] };

function useJournalMeta() { return useApi('/api/journal/meta'); }

function MonthPicker({ value, onChange }) {
  return (
    <div className="seg" role="group" aria-label="Ай">
      <button onClick={() => onChange(shiftMonth(value, -1))} aria-label="Алдыңғы ай"><ChevronLeft size={16} /></button>
      <span className="bold small" style={{ padding: '0 6px', color: 'var(--text)', minWidth: 110, textAlign: 'center' }}>{monthLabel(value)}</span>
      <button onClick={() => onChange(shiftMonth(value, 1))} aria-label="Келесі ай"><ChevronRight size={16} /></button>
    </div>
  );
}

function TeacherSelect({ teachers, value, onChange, allowAll }) {
  return (
    <select className="select" style={{ width: 'auto', minWidth: 200 }} value={value || ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} aria-label="Ұстаз">
      {allowAll ? <option value="">Барлық ұстаздар</option> : <option value="">Ұстазды таңдаңыз</option>}
      {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.active ? '' : ' (белсенді емес)'}</option>)}
    </select>
  );
}

// ================= journal =================
export function JournalPage() {
  const meta = useJournalMeta();
  return <Loader q={meta}>{(m) => <Journal meta={m} />}</Loader>;
}

function Journal({ meta }) {
  const { user } = useAuth();
  const manager = !!meta.teachers;
  const [params, setParams] = useSearchParams();
  const [week, setWeek] = useState(() => mondayOf(params.get('from') ? new Date(`${params.get('from')}T12:00:00`) : new Date()));
  const teacher = manager ? Number(params.get('teacher')) || null : user.id;
  const from = localISO(week); const to = localISO(addDays(week, 6));
  const q = useApi(`/api/journal/week?from=${from}&to=${to}${manager && teacher ? `&teacher=${teacher}` : ''}`);
  const [adding, setAdding] = useState(false);
  const setTeacher = (t) => { const p = new URLSearchParams(params); if (t) p.set('teacher', t); else p.delete('teacher'); setParams(p, { replace: true }); };

  const days = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < 7; i++) map.set(localISO(addDays(week, i)), []);
    for (const it of q.data?.items || []) map.get(it.date)?.push(it);
    return [...map.entries()];
  }, [q.data, week]);
  const items = q.data?.items || [];
  const summary = {
    planned: items.filter((i) => i.planned).length,
    done: items.filter((i) => i.log?.status === 'done').length,
    open: items.filter((i) => !i.log && i.date <= meta.today).length,
    noTg: items.filter((i) => i.log && ['done', 'absent'].includes(i.log.status) && !i.log.tg_ok).length,
  };

  return (
    <>
      <PageHead title="Сабақ журналы" sub="Әр сабақты белгілеңіз: өтті, кірмеді, перенос… Телеграмға отчет жібергенде «Телеграм ✓» басыңыз — жалақыға екеуі де белгіленген сабақ қана есептеледі.">
        {manager
          ? <><Link className="btn ghost" to="/admin/classes"><Users />Шәкірттер</Link><Link className="btn ghost" to="/admin/payroll"><Banknote />Жалақы</Link></>
          : <Link className="btn ghost" to="/teach/salary"><Banknote />Менің жалақым</Link>}
        <button className="btn" onClick={() => setAdding(true)}><Plus />Сабақ қосу</button>
      </PageHead>
      <div className="row wrap mb">
        <div className="seg" role="group" aria-label="Апта">
          <button onClick={() => setWeek(addDays(week, -7))} aria-label="Алдыңғы апта"><ChevronLeft size={16} /></button>
          <span className="bold small" style={{ padding: '0 6px', color: 'var(--text)' }}>{new Date(`${from}T12:00:00`).getDate()} {MONTHS[week.getMonth()].toLowerCase()} – {dayLabel(to).split(', ')[1]}</span>
          <button onClick={() => setWeek(addDays(week, 7))} aria-label="Келесі апта"><ChevronRight size={16} /></button>
        </div>
        <button className="btn ghost sm" onClick={() => setWeek(mondayOf(new Date()))}>Осы апта</button>
        {manager && <TeacherSelect teachers={meta.teachers} value={teacher} onChange={setTeacher} allowAll />}
        <div className="spacer" />
        <span className="badge">Жоспар: {summary.planned}</span>
        <span className="badge green">Өтті: {summary.done}</span>
        {summary.open > 0 && <span className="badge amber">Белгіленбеген: {summary.open}</span>}
        {summary.noTg > 0 && <span className="badge red">Телеграм жоқ: {summary.noTg}</span>}
      </div>
      {q.data?.locked?.length > 0 && <div className="alert info mb"><Lock />{q.data.locked.map(monthLabel).join(', ')} жалақысы бекітілген — бұл айдағы сабақтарды өзгерту мүмкін емес.</div>}
      <Loader q={q}>{() => (
        items.length === 0
          ? <div className="card"><Empty icon={CalendarDays} title="Бұл аптада сабақ жоқ">{manager ? 'Шәкірттер мен топтарға кесте қосыңыз немесе «Сабақ қосу» арқылы белгілеңіз.' : 'Кестеңіз бос. Икемді (гибкий) сабақты «Сабақ қосу» арқылы белгілеңіз.'}</Empty></div>
          : <div className="stack">{days.filter(([, list]) => list.length).map(([date, list]) => (
            <div key={date} className="card" style={{ padding: 0 }}>
              <div className="row between" style={{ padding: '12px 18px', borderBottom: '1px solid var(--line-2)' }}>
                <b>{dayLabel(date)}</b>{date === meta.today && <span className="badge primary">Бүгін</span>}
              </div>
              {list.map((it) => <LessonRow key={`${it.class_id}|${it.time}|${it.log?.id || ''}`} it={it} meta={meta} manager={manager} locked={q.data.locked.includes(it.date.slice(0, 7))} onSaved={q.reload} />)}
            </div>
          ))}</div>
      )}</Loader>
      {adding && <Modal title="Сабақ қосу" onClose={() => setAdding(false)}><AddLesson meta={meta} teacher={teacher} manager={manager} onDone={() => { setAdding(false); q.reload(); }} /></Modal>}
    </>
  );
}

function LessonRow({ it, meta, manager, locked, onSaved }) {
  const toast = useToast();
  const [pending, setBusy] = useState(false);
  const busy = pending || locked;
  const log = it.log;
  const future = it.date > meta.today;
  const save = async (patch) => {
    const next = { status: log?.status, hours: log?.hours ?? 1, tg_ok: !!log?.tg_ok, note: log?.note, ...patch };
    if (!next.status) return toast('Алдымен сабақ статусын таңдаңыз');
    setBusy(true);
    try { await api.post('/api/journal/log', { class_id: it.class_id, date: it.date, time: it.time, teacher_id: log?.teacher_id, ...next }); onSaved(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!confirm('Белгіні өшіру керек пе?')) return;
    try { await api.del(`/api/journal/log/${log.id}`); onSaved(); } catch (e) { toast(e.message); }
  };
  const paid = log && log.tg_ok && log.status === 'done';
  const sub = log && log.teacher_id !== it.teacher_id;
  return (
    <div className="jr-row" style={{ opacity: pending ? 0.6 : 1 }}>
      <div className="jr-main">
        <span className="jr-time">{it.time || '—'}</span>
        <div className="li-body">
          <div className="bold ellipsis">{it.class_name}</div>
          <div className="tiny muted">{meta.FORMATS[it.format]}{!it.planned && ' · кестеден тыс'}{manager && log?.teacher && ` · ${log.teacher}`}{sub && ' (ауыстыру)'}</div>
        </div>
        {log && <span className={`badge ${paid ? 'green' : log.status === 'done' || log.status === 'absent' ? 'amber' : ''}`}>{paid ? 'Есептеледі' : log.status === 'done' && !log.tg_ok ? 'Телеграм керек' : meta.LESSON_STATUS[log.status]}</span>}
      </div>
      <div className="jr-actions">
        <div className="chips">
          {Object.entries(meta.LESSON_STATUS).map(([k, label]) => (
            <button key={k} className={`chip ${log?.status === k ? `on tone-${STATUS_TONE[k] || 'grey'}` : ''}`} disabled={busy || (future && ['done', 'absent'].includes(k))} onClick={() => save({ status: k })}>{label}</button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <select className="select sm" value={log?.hours ?? 1} disabled={busy || !log} onChange={(e) => save({ hours: Number(e.target.value) })} aria-label="Сағат">
            {[0.5, 1, 1.5, 2].map((h) => <option key={h} value={h}>{hrs(h)} сағ</option>)}
          </select>
          <button className={`chip ${log?.tg_ok ? 'on tone-blue' : ''}`} disabled={busy || !log} onClick={() => save({ tg_ok: !log.tg_ok })} title={log ? 'Телеграм группаға отчет жіберілді' : 'Алдымен сабақ статусын таңдаңыз'}><Send size={13} style={{ verticalAlign: -2 }} /> Телеграм {log?.tg_ok ? '✓' : ''}</button>
          {log && <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={remove} aria-label="Өшіру" disabled={busy}><Trash2 size={15} /></button>}
        </div>
      </div>
    </div>
  );
}

function AddLesson({ meta, teacher, manager, onDone }) {
  const toast = useToast();
  const classes = useApi(`/api/journal/classes?status=active${manager && teacher ? `&teacher=${teacher}` : ''}`);
  const [f, setF] = useState({ class_id: '', date: meta.today, time: '', status: 'done', hours: 1, tg_ok: false, note: '', teacher_id: teacher || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try { await api.post('/api/journal/log', { ...f, hours: Number(f.hours), teacher_id: f.teacher_id || undefined }); toast('Сабақ белгіленді ✓'); onDone(); } catch (err) { toast(err.message); }
  };
  return (
    <Loader q={classes}>{(list) => (
      <form className="form-grid" onSubmit={submit}>
        <div className="field full"><label>Шәкірт / топ</label>
          <select className="select" required value={f.class_id} onChange={(e) => { const c = list.find((x) => String(x.id) === e.target.value); setF({ ...f, class_id: e.target.value, teacher_id: f.teacher_id || c?.teacher_id || '' }); }}>
            <option value="">Таңдаңыз</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.format_label}{manager && c.teacher ? ` · ${c.teacher}` : ''}</option>)}
          </select>
          {list.length === 0 && <span className="help">Белсенді шәкірт/топ жоқ{manager ? ' — «Шәкірттер мен топтар» бөлімінде қосыңыз' : ' — куратордан сұраңыз'}.</span>}
        </div>
        {manager && <div className="field full"><label>Сабақты берген ұстаз</label><TeacherSelect teachers={meta.teachers} value={Number(f.teacher_id) || null} onChange={(v) => setF({ ...f, teacher_id: v || '' })} /><span className="help">Ауыстыру болса — сабақ берген ұстазды таңдаңыз, сағат соған есептеледі.</span></div>}
        <div className="field"><label>Күні</label><input className="input" type="date" required value={f.date} onChange={set('date')} /></div>
        <div className="field"><label>Уақыты</label><input className="input" type="time" value={f.time} onChange={set('time')} /></div>
        <div className="field"><label>Статус</label><select className="select" value={f.status} onChange={set('status')}>{Object.entries(meta.LESSON_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label>Сағат</label><select className="select" value={f.hours} onChange={set('hours')}>{[0.5, 1, 1.5, 2].map((h) => <option key={h} value={h}>{hrs(h)}</option>)}</select></div>
        <label className="check full"><input type="checkbox" checked={f.tg_ok} onChange={set('tg_ok')} />Телеграмға отчет жіберілді</label>
        <div className="field full"><label>Ескерту</label><input className="input" value={f.note} onChange={set('note')} placeholder="Мысалы: перенос себебі" /></div>
        <div className="full"><button className="btn"><Check />Сақтау</button></div>
      </form>
    )}</Loader>
  );
}

// ================= salary (one teacher, one month) =================
export function SalaryPage() {
  const meta = useJournalMeta();
  return <Loader q={meta}>{(m) => <Salary meta={m} />}</Loader>;
}

function Salary({ meta }) {
  const manager = !!meta.teachers;
  const [params, setParams] = useSearchParams();
  const month = params.get('month') || thisMonth();
  const teacher = Number(params.get('teacher')) || null;
  const setP = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
  const url = manager && !teacher ? null : `/api/journal/salary?month=${month}${manager ? `&teacher=${teacher}` : ''}`;
  const q = useApi(url);
  return (
    <>
      <PageHead title={manager ? 'Ұстаз жалақысы' : 'Менің жалақым'} sub="Сағат × формат ставкасы + бонус − штраф. Сабақ «Өтті» және «Телеграм ✓» болса ғана есептеледі."
        crumbs={manager ? [{ label: 'Жалақы', to: `/admin/payroll?month=${month}` }, { label: q.data?.teacher || 'Ұстаз' }] : null}>
        <MonthPicker value={month} onChange={(m) => setP('month', m)} />
        {manager && <TeacherSelect teachers={meta.teachers} value={teacher} onChange={(v) => setP('teacher', v)} />}
      </PageHead>
      {!url ? <div className="card"><Empty icon={User} title="Ұстазды таңдаңыз" /></div>
        : <Loader q={q}>{(s) => <SalaryView s={s} meta={meta} manager={manager} month={month} onChange={(d) => q.setData({ ...q.data, ...d })} reload={q.reload} />}</Loader>}
    </>
  );
}

function SalaryView({ s, meta, manager, month, onChange, reload }) {
  const toast = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState('sum');
  const locked = s.status !== 'draft';
  const [st, tone] = PAY_STATUS[s.status];
  const act = async (what, body = {}) => {
    try { onChange(await api.post(`/api/journal/payroll/${s.teacher_id}/${month}/${what}`, body)); toast('Сақталды ✓'); }
    catch (e) {
      if (e.status === 422 && confirm(e.message)) return act(what, { force: true });
      toast(e.message);
    }
  };
  const delAdj = async (id) => { try { onChange(await api.del(`/api/journal/adjustments/${id}`)); } catch (e) { toast(e.message); } };
  return (
    <>
      <div className="grid g4">
        <div className="card"><div className="stat"><div className="l">Сағат</div><div className="v">{hrs(s.hours)}</div></div></div>
        <div className="card"><div className="stat"><div className="l">Сабақтар үшін</div><div className="v">{money(s.lessonsAmount)}</div></div></div>
        <div className="card"><div className="stat"><div className="l">Бонус / штраф</div><div className="v"><span style={{ color: 'var(--green)' }}>+{money(s.bonus)}</span> <span style={{ color: 'var(--red)' }}>−{money(s.fine)}</span></div></div></div>
        <div className="card" style={{ background: 'var(--lav)', borderColor: 'var(--lav-2)' }}><div className="stat"><div className="l">Жалпы · <span className={`badge ${tone}`}>{st}</span></div><div className="v" style={{ color: 'var(--primary-700)' }}>{money(s.total)}</div></div></div>
      </div>
      {s.warnings?.map((w) => <div key={w} className="alert warn mt"><AlertTriangle />{w}</div>)}
      {manager && (
        <div className="row wrap mt">
          {s.status === 'draft' && <button className="btn" onClick={() => act('approve')}><Lock />Айды бекіту</button>}
          {s.status === 'approved' && <><button className="btn green" onClick={() => act('paid')}><Banknote />Төленді</button><button className="btn ghost" onClick={() => act('reopen')}><Unlock />Қайта ашу</button></>}
          {s.status === 'paid' && user.role === 'admin' && <button className="btn ghost" onClick={() => act('reopen')}><Unlock />Қайта ашу</button>}
          <span className="small muted">{locked ? 'Бекітілген айдағы сабақтар мен бонустар өзгермейді.' : 'Ай соңында тексеріп, бекітіңіз — содан кейін сандар өзгермейді.'}</span>
        </div>
      )}
      <div className="mt"><Tabs value={tab} onChange={setTab} items={[{ value: 'sum', label: 'Есеп' }, { value: 'lessons', label: 'Сабақтар', count: s.lessons.length }, { value: 'adj', label: 'Бонус / штраф', count: s.adjustments.length }]} /></div>
      {tab === 'sum' && (
        <div className="table-wrap mt">
          <table className="table">
            <thead><tr><th>Формат</th><th>Ставка</th><th>Сабақ</th><th>Сағат</th><th style={{ textAlign: 'right' }}>Сома</th></tr></thead>
            <tbody>
              {s.byFormat.length === 0 && <tr><td colSpan={5} className="muted center">Бұл айда есептелген сабақ жоқ</td></tr>}
              {s.byFormat.map((l) => <tr key={`${l.format}${l.rate}`}><td>{l.label}</td><td>{money(l.rate)}/сағ</td><td>{l.lessons}</td><td>{hrs(l.hours)}</td><td style={{ textAlign: 'right' }}>{money(l.amount)}</td></tr>)}
              {s.adjustments.map((a) => <tr key={`a${a.id}`}><td colSpan={4}>{a.kind === 'bonus' ? 'Бонус' : 'Штраф'}: {a.reason}</td><td style={{ textAlign: 'right', color: a.kind === 'bonus' ? 'var(--green)' : 'var(--red)' }}>{a.kind === 'bonus' ? '+' : '−'}{money(a.amount)}</td></tr>)}
              <tr><td colSpan={4} className="bold">Жалпы</td><td className="bold" style={{ textAlign: 'right' }}>{money(s.total)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      {tab === 'lessons' && (
        <div className="table-wrap mt">
          <table className="table">
            <thead><tr><th>Күні</th><th>Шәкірт / топ</th><th>Статус</th><th>Сағат</th><th>Телеграм</th><th style={{ textAlign: 'right' }}>Сома</th></tr></thead>
            <tbody>
              {s.lessons.length === 0 && <tr><td colSpan={6} className="muted center">Сабақ белгіленбеген</td></tr>}
              {s.lessons.map((l) => (
                <tr key={l.id}>
                  <td className="nowrap">{l.date.slice(8)}.{l.date.slice(5, 7)} {l.time}</td>
                  <td>{l.class_name}<div className="tiny muted">{meta.FORMATS[l.format]}</div></td>
                  <td><span className={`badge ${STATUS_TONE[l.status]}`}>{meta.LESSON_STATUS[l.status]}</span>{l.why && <div className="tiny muted">{l.why}</div>}</td>
                  <td>{hrs(l.hours)}</td><td>{l.tg_ok ? '✓' : '—'}</td>
                  <td style={{ textAlign: 'right' }}>{l.paid ? money(l.amount) : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'adj' && (
        <div className="card mt">
          {s.adjustments.length === 0 ? <div className="small muted">Бонус не штраф жоқ</div> : (
            <div className="list">{s.adjustments.map((a) => (
              <div key={a.id} className="list-item">
                <span className={`badge ${a.kind === 'bonus' ? 'green' : 'red'}`}>{a.kind === 'bonus' ? '+' : '−'}{money(a.amount)}</span>
                <div className="li-body"><div className="small">{a.reason}</div>{a.author && <div className="tiny muted">{a.author}</div>}</div>
                {manager && !locked && <button className="icon-btn" style={{ width: 34, height: 34 }} onClick={() => delAdj(a.id)} aria-label="Өшіру"><Trash2 size={15} /></button>}
              </div>
            ))}</div>
          )}
          {manager && !locked && <AddAdjustment meta={meta} teacherId={s.teacher_id} month={month} onDone={onChange} />}
        </div>
      )}
      {!manager && <p className="small muted mt">Ставкаларыңыз: {Object.entries(s.rates || {}).filter(([, v]) => v != null).map(([f, v]) => `${meta.FORMATS[f]} — ${money(v)}`).join(' · ') || 'әлі белгіленбеген'}</p>}
    </>
  );
}

function AddAdjustment({ meta, teacherId, month, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ kind: 'bonus', amount: '', reason: '' });
  const submit = async (e) => {
    e.preventDefault();
    try { onDone(await api.post('/api/journal/adjustments', { ...f, teacher_id: teacherId, month })); setF({ kind: 'bonus', amount: '', reason: '' }); toast('Қосылды ✓'); }
    catch (err) { toast(err.message); }
  };
  return (
    <form onSubmit={submit} className="stack mt" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 16 }}>
      <div className="small bold">Регламент бойынша:</div>
      <div className="chips">{meta.ADJ_PRESETS.map((p) => (
        <button type="button" key={p.reason} className="chip" style={{ textAlign: 'left' }} onClick={() => setF({ kind: p.kind, amount: p.amount, reason: p.reason })}>
          <span style={{ color: p.kind === 'bonus' ? 'var(--green)' : 'var(--red)' }}>{p.kind === 'bonus' ? '+' : '−'}{p.amount.toLocaleString('ru-RU')}</span> {p.reason}
        </button>
      ))}</div>
      <div className="row wrap">
        <select className="select" style={{ width: 'auto' }} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="bonus">Бонус</option><option value="fine">Штраф</option></select>
        <input className="input" style={{ width: 130 }} type="number" min="1" required placeholder="Сома ₸" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <input className="input" style={{ flex: 1, minWidth: 200 }} required placeholder="Себебі" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
        <button className="btn"><Plus />Қосу</button>
      </div>
    </form>
  );
}

// ================= payroll (all teachers) =================
export function PayrollPage() {
  const meta = useJournalMeta();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'sheet';
  const setTab = (t) => { const p = new URLSearchParams(params); p.set('tab', t); setParams(p, { replace: true }); };
  return (
    <>
      <PageHead title="Жалақы" sub="Айлық ведомость, ұстаздар ставкасы және апталық отчет" />
      <div className="mb"><Tabs value={tab} onChange={setTab} items={[{ value: 'sheet', label: 'Ведомость' }, { value: 'rates', label: 'Ставкалар' }, { value: 'report', label: 'Отчет' }]} /></div>
      <Loader q={meta}>{(m) => (tab === 'rates' ? <Rates meta={m} /> : tab === 'report' ? <Report meta={m} /> : <Sheet />)}</Loader>
    </>
  );
}

function Sheet() {
  const [params, setParams] = useSearchParams();
  const month = params.get('month') || thisMonth();
  const setMonth = (m) => { const p = new URLSearchParams(params); p.set('month', m); setParams(p, { replace: true }); };
  const q = useApi(`/api/journal/payroll?month=${month}`);
  return (
    <>
      <div className="row wrap mb">
        <MonthPicker value={month} onChange={setMonth} />
        <div className="spacer" />
        <a className="btn ghost" href={`/api/journal/payroll.csv?month=${month}`} download><Download />Excel-ге жүктеу</a>
      </div>
      <Loader q={q}>{(rows) => {
        const tot = rows.reduce((a, r) => ({ hours: a.hours + r.hours, sum: a.sum + r.total }), { hours: 0, sum: 0 });
        return (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ұстаз</th><th>Сағат</th><th>Сабақтар</th><th>Бонус</th><th>Штраф</th><th>Жалпы</th><th>Статус</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} className="muted center">Ұстаз жоқ</td></tr>}
                {rows.map((r) => {
                  const [st, tone] = PAY_STATUS[r.status];
                  return (
                    <tr key={r.teacher_id}>
                      <td><Link to={`/admin/salary?teacher=${r.teacher_id}&month=${month}`} className="bold" style={{ color: 'var(--primary-700)' }}>{r.name}</Link>{r.warnings.length > 0 && <div className="tiny" style={{ color: 'var(--amber)' }}><AlertTriangle size={12} style={{ verticalAlign: -2 }} /> {r.warnings[0]}</div>}</td>
                      <td>{hrs(r.hours)}</td><td className="nowrap">{money(r.lessonsAmount)}</td>
                      <td className="nowrap" style={{ color: r.bonus ? 'var(--green)' : undefined }}>{r.bonus ? `+${money(r.bonus)}` : '—'}</td>
                      <td className="nowrap" style={{ color: r.fine ? 'var(--red)' : undefined }}>{r.fine ? `−${money(r.fine)}` : '—'}</td>
                      <td className="nowrap bold">{money(r.total)}</td><td><span className={`badge ${tone}`}>{st}</span></td>
                    </tr>
                  );
                })}
                <tr><td className="bold">Барлығы</td><td className="bold">{hrs(tot.hours)}</td><td colSpan={3} /><td className="bold nowrap">{money(tot.sum)}</td><td /></tr>
              </tbody>
            </table>
          </div>
        );
      }}</Loader>
    </>
  );
}

function Rates({ meta }) {
  const toast = useToast();
  const [teacher, setTeacher] = useState(meta.teachers.find((t) => t.active)?.id || null);
  const q = useApi(teacher ? `/api/journal/rates/${teacher}` : null);
  const [mode, setMode] = useState('base');
  const [f, setF] = useState({ valid_from: `${thisMonth()}-01`, base: '', rates: {} });
  useEffect(() => { if (q.data) setF((x) => ({ ...x, rates: Object.fromEntries(Object.entries(q.data.current).map(([k, v]) => [k, v ?? ''])) })); }, [q.data]);
  const preview = useMemo(() => {
    if (mode !== 'base' || !(Number(f.base) > 0)) return null;
    const b = Number(f.base);
    return Object.fromEntries(Object.keys(meta.FORMATS).map((k) => { const [kind, lang, m] = k.split('_'); return [k, b + (lang === 'rus' ? 100 : 0) + (m === 'off' ? 200 : 0) + (kind === 'grp' ? 200 : 0)]; }));
  }, [mode, f.base, meta.FORMATS]);
  const submit = async (e) => {
    e.preventDefault();
    try { q.setData(await api.post(`/api/journal/rates/${teacher}`, mode === 'base' ? { valid_from: f.valid_from, base: Number(f.base) } : { valid_from: f.valid_from, rates: f.rates })); toast('Ставка сақталды ✓'); }
    catch (err) { toast(err.message); }
  };
  const del = async (from) => { if (!confirm(`${from} бастап енгізілген ставкаларды өшіру керек пе?`)) return; try { q.setData(await api.del(`/api/journal/rates/${teacher}/${from}`)); } catch (e) { toast(e.message); } };
  const history = useMemo(() => {
    const g = new Map(); for (const r of q.data?.history || []) { if (!g.has(r.valid_from)) g.set(r.valid_from, {}); g.get(r.valid_from)[r.format] = r.rate; }
    return [...g.entries()];
  }, [q.data]);
  return (
    <>
      <div className="row wrap mb"><TeacherSelect teachers={meta.teachers} value={teacher} onChange={setTeacher} /></div>
      {!teacher ? <div className="card"><Empty icon={User} title="Ұстазды таңдаңыз" /></div> : (
        <Loader q={q}>{(d) => (
          <div className="grid g2">
            <div className="card">
              <h3 className="mb">Қазіргі ставка (1 сағат)</h3>
              <div className="list">{Object.entries(meta.FORMATS).map(([k, label]) => <div key={k} className="list-item"><div className="li-body small">{label}</div><b>{d.current[k] != null ? money(d.current[k]) : <span className="muted">—</span>}</b></div>)}</div>
            </div>
            <form className="card stack" onSubmit={submit}>
              <h3>Жаңа ставка / повышение</h3>
              <div className="field"><label>Қай күннен бастап</label><input className="input" type="date" required value={f.valid_from} onChange={(e) => setF({ ...f, valid_from: e.target.value })} /><span className="help">Осы күнге дейінгі сабақтар ескі ставкамен есептеледі.</span></div>
              <div className="seg" style={{ alignSelf: 'flex-start' }}><button type="button" className={mode === 'base' ? 'on' : ''} onClick={() => setMode('base')}>Базалық ставкадан</button><button type="button" className={mode === 'custom' ? 'on' : ''} onClick={() => setMode('custom')}>Әр формат бөлек</button></div>
              {mode === 'base' ? (
                <div className="field"><label>Индив · каз · онлайн ставкасы</label><input className="input" type="number" min="0" step="100" required value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })} placeholder="мысалы 1200" />
                  <span className="help">Қалғаны автоматты: рус +100, оффлайн +200, топ +200.</span>
                  {preview && <div className="tiny muted">{Object.entries(preview).map(([k, v]) => `${meta.FORMATS[k]}: ${v}`).join(' · ')}</div>}
                </div>
              ) : (
                <div className="form-grid">{Object.entries(meta.FORMATS).map(([k, label]) => (
                  <div className="field" key={k}><label>{label}</label><input className="input" type="number" min="0" step="100" value={f.rates[k] ?? ''} onChange={(e) => setF({ ...f, rates: { ...f.rates, [k]: e.target.value } })} /></div>
                ))}</div>
              )}
              <div><button className="btn"><Check />Сақтау</button></div>
            </form>
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <h3 className="mb">Ставка тарихы</h3>
              {history.length === 0 ? <div className="small muted">Ставка әлі енгізілмеген</div> : (
                <div className="table-wrap" style={{ border: 0 }}>
                  <table className="table">
                    <thead><tr><th>Бастап</th>{Object.keys(meta.FORMATS).map((k) => <th key={k} title={meta.FORMATS[k]}>{k.replace('ind', 'инд').replace('grp', 'топ').replace('kaz', 'каз').replace('rus', 'рус').replace('onl', 'он').replace('off', 'офф').replaceAll('_', ' ')}</th>)}<th /></tr></thead>
                    <tbody>{history.map(([from, r]) => <tr key={from}><td className="nowrap">{from}</td>{Object.keys(meta.FORMATS).map((k) => <td key={k}>{r[k] ?? '—'}</td>)}<td><button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => del(from)} aria-label="Өшіру"><Trash2 size={14} /></button></td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}</Loader>
      )}
    </>
  );
}

function Report({ meta }) {
  const toast = useToast();
  const [week, setWeek] = useState(() => addDays(mondayOf(new Date()), -7));
  const from = localISO(week); const to = localISO(addDays(week, 6));
  const q = useApi(`/api/journal/report?from=${from}&to=${to}`);
  const award = async (r) => {
    const month = to.slice(0, 7);
    if (!confirm(`${r.name} — аптаның ең көп сағат берген ұстазы: +5 000 ₸ бонус (${monthLabel(month)}) қосу керек пе?`)) return;
    try { await api.post('/api/journal/adjustments', { teacher_id: r.teacher_id, month, kind: 'bonus', amount: 5000, reason: `Аптаның ең көп сағат берген ұстазы (${from} – ${to})` }); toast('Бонус қосылды ✓'); }
    catch (e) { toast(e.message); }
  };
  return (
    <>
      <div className="row wrap mb">
        <div className="seg">
          <button onClick={() => setWeek(addDays(week, -7))} aria-label="Алдыңғы апта"><ChevronLeft size={16} /></button>
          <span className="bold small" style={{ padding: '0 6px', color: 'var(--text)' }}>{from} – {to}</span>
          <button onClick={() => setWeek(addDays(week, 7))} aria-label="Келесі апта"><ChevronRight size={16} /></button>
        </div>
        <span className="small muted">Жоспар — кестедегі сабақтар; өтті — «Өтті» белгіленгендер; сағат — Телеграм ✓ бар өткен сабақтар.</span>
      </div>
      <Loader q={q}>{(rows) => {
        const top = [...rows].sort((a, b) => b.hours - a.hours)[0];
        return (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Ұстаз</th><th>Жоспар</th><th>Өтті</th><th>Өтпеді</th><th>Конверсия</th><th>Сағат</th><th /></tr></thead>
              <tbody>{[...rows].sort((a, b) => b.hours - a.hours).map((r) => (
                <tr key={r.teacher_id}>
                  <td><Link to={`/admin/journal?teacher=${r.teacher_id}&from=${from}`} className="bold" style={{ color: 'var(--primary-700)' }}>{r.name}</Link></td>
                  <td>{r.planned}</td><td>{r.done}</td><td>{r.missed}</td>
                  <td>{r.conversion == null ? '—' : <span className={`badge ${r.conversion >= 90 ? 'green' : r.conversion >= 70 ? 'amber' : 'red'}`}>{r.conversion}%</span>}</td>
                  <td className="bold">{hrs(r.hours)}</td>
                  <td>{top && r === top && r.hours > 0 && <button className="btn soft sm" onClick={() => award(r)}><Trophy size={14} />+5 000 ₸</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        );
      }}</Loader>
    </>
  );
}

// ================= classes (шәкірттер мен топтар) =================
export function ClassesPage() {
  const meta = useJournalMeta();
  return <Loader q={meta}>{(m) => <Classes meta={m} />}</Loader>;
}

function Classes({ meta }) {
  const [status, setStatus] = useState('active');
  const [teacher, setTeacher] = useState(null);
  const [edit, setEdit] = useState(null);
  const q = useApi(`/api/journal/classes?status=${status}${teacher ? `&teacher=${teacher}` : ''}`);
  return (
    <>
      <PageHead title="Шәкірттер мен топтар" sub="Индив шәкірттер мен топтар, ұстазы, форматы және апталық кестесі. Кесте журналда жоспар ретінде шығады.">
        <button className="btn" onClick={() => setEdit({})}><Plus />Қосу</button>
      </PageHead>
      <div className="row wrap mb">
        <Tabs value={status} onChange={setStatus} items={Object.entries(meta.CLASS_STATUS).map(([value, label]) => ({ value, label }))} />
        <TeacherSelect teachers={meta.teachers} value={teacher} onChange={setTeacher} allowAll />
      </div>
      <Loader q={q}>{(rows) => (rows.length === 0 ? <div className="card"><Empty icon={Users} title="Тізім бос" /></div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Шәкірт / топ</th><th>Ұстаз</th><th>Формат</th><th>Кесте</th><th>Өтті</th><th /></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id} className="click" onClick={() => setEdit(c)}>
                <td><div className="bold">{c.kind === 'grp' ? <Users size={14} style={{ verticalAlign: -2 }} /> : <User size={14} style={{ verticalAlign: -2 }} />} {c.name}</div><div className="tiny muted">{c.subject}{c.kind === 'grp' && c.members.length ? ` · ${c.members.length} шәкірт` : ''}{c.phone ? ` · ${c.phone}` : ''}</div></td>
                <td>{c.teacher || <span className="muted">—</span>}</td>
                <td className="small">{c.format_label}</td>
                <td className="small">{c.slots.length ? c.slots.map((s) => `${WD_SHORT[s.weekday]} ${s.time}`).join(', ') : <span className="muted">гибкий</span>}</td>
                <td className="nowrap">{c.held}{c.package_lessons ? ` / ${c.package_lessons}` : ''}</td>
                <td><Pencil size={15} color="var(--muted)" /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}</Loader>
      {edit && <Modal wide title={edit.id ? edit.name : 'Жаңа шәкірт / топ'} onClose={() => setEdit(null)}><ClassForm meta={meta} c={edit} onDone={() => { setEdit(null); q.reload(); }} /></Modal>}
    </>
  );
}

function ClassForm({ meta, c, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({
    kind: c.kind || 'ind', name: c.name || '', phone: c.phone || '', teacher_id: c.teacher_id || '', subject: c.subject || 'Құран', lang: c.lang || 'kaz', mode: c.mode || 'onl',
    package_lessons: c.package_lessons || '', start_date: c.start_date || '', status: c.status || 'active', note: c.note || '', slots: c.slots || [], members: c.members || [],
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try { await (c.id ? api.put(`/api/journal/classes/${c.id}`, f) : api.post('/api/journal/classes', f)); toast('Сақталды ✓'); onDone(); } catch (err) { toast(err.message); }
  };
  const remove = async () => {
    if (!confirm('Өшіру керек пе? Сабақтары бар болса, архивке жіберіледі.')) return;
    try { const r = await api.del(`/api/journal/classes/${c.id}`); toast(r.archived ? 'Архивке жіберілді' : 'Өшірілді'); onDone(); } catch (err) { toast(err.message); }
  };
  const setSlot = (i, k, v) => setF({ ...f, slots: f.slots.map((s, j) => (j === i ? { ...s, [k]: k === 'weekday' ? Number(v) : v } : s)) });
  const setMember = (i, k, v) => setF({ ...f, members: f.members.map((m, j) => (j === i ? { ...m, [k]: v } : m)) });
  return (
    <form className="form-grid" onSubmit={submit}>
      <div className="field"><label>Түрі</label><div className="seg" style={{ alignSelf: 'flex-start' }}><button type="button" className={f.kind === 'ind' ? 'on' : ''} onClick={() => setF({ ...f, kind: 'ind' })}>Индив</button><button type="button" className={f.kind === 'grp' ? 'on' : ''} onClick={() => setF({ ...f, kind: 'grp' })}>Топ</button></div></div>
      <div className="field"><label>{f.kind === 'grp' ? 'Топ атауы' : 'Аты-жөні'}</label><input className="input" required value={f.name} onChange={set('name')} placeholder={f.kind === 'grp' ? 'гр 150' : 'Райхан Керимкулова'} /></div>
      <div className="field"><label>Ұстаз</label><TeacherSelect teachers={meta.teachers} value={Number(f.teacher_id) || null} onChange={(v) => setF({ ...f, teacher_id: v || '' })} /></div>
      <div className="field"><label>Пән</label><select className="select" value={f.subject} onChange={set('subject')}>{['Құран', 'Таджуид', 'Араб тілі', 'Хатым', 'Жаттау'].map((s) => <option key={s}>{s}</option>)}</select></div>
      <div className="field"><label>Тілі</label><select className="select" value={f.lang} onChange={set('lang')}><option value="kaz">Қазақша</option><option value="rus">Орысша</option></select></div>
      <div className="field"><label>Формат</label><select className="select" value={f.mode} onChange={set('mode')}><option value="onl">Онлайн</option><option value="off">Оффлайн</option></select></div>
      {f.kind === 'ind' && <div className="field"><label>Телефон</label><input className="input" value={f.phone} onChange={set('phone')} placeholder="8 7xx xxx xx xx" /></div>}
      <div className="field"><label>Пакет (сабақ саны)</label><input className="input" type="number" min="1" value={f.package_lessons} onChange={set('package_lessons')} placeholder="мысалы 24" /></div>
      <div className="field"><label>Старт обучения</label><input className="input" type="date" value={f.start_date} onChange={set('start_date')} /></div>
      <div className="field"><label>Статус</label><select className="select" value={f.status} onChange={set('status')}>{Object.entries(meta.CLASS_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="field full"><label>Апталық кесте</label>
        <div className="stack" style={{ gap: 8 }}>
          {f.slots.map((s, i) => (
            <div key={i} className="row" style={{ gap: 8 }}>
              <select className="select" style={{ width: 'auto' }} value={s.weekday} onChange={(e) => setSlot(i, 'weekday', e.target.value)}>{WD.map((d, k) => <option key={k} value={k}>{d}</option>)}</select>
              <input className="input" style={{ width: 130 }} type="time" required value={s.time} onChange={(e) => setSlot(i, 'time', e.target.value)} />
              <button type="button" className="icon-btn" style={{ width: 38, height: 38 }} onClick={() => setF({ ...f, slots: f.slots.filter((_, j) => j !== i) })} aria-label="Өшіру"><Trash2 size={15} /></button>
            </div>
          ))}
          <div><button type="button" className="btn ghost sm" onClick={() => setF({ ...f, slots: [...f.slots, { weekday: 0, time: f.slots.at(-1)?.time || '' }] })}><Plus size={14} />Күн қосу</button></div>
          <span className="help">Кесте жоқ болса — «гибкий»: ұстаз сабақты журналда өзі қосады.</span>
        </div>
      </div>
      {f.kind === 'grp' && (
        <div className="field full"><label>Топ шәкірттері</label>
          <div className="stack" style={{ gap: 8 }}>
            {f.members.map((m, i) => (
              <div key={i} className="row" style={{ gap: 8 }}>
                <input className="input" placeholder="Аты" value={m.name} onChange={(e) => setMember(i, 'name', e.target.value)} />
                <input className="input" placeholder="Телефон" value={m.phone || ''} onChange={(e) => setMember(i, 'phone', e.target.value)} />
                <button type="button" className="icon-btn" style={{ width: 38, height: 38, flex: 'none' }} onClick={() => setF({ ...f, members: f.members.filter((_, j) => j !== i) })} aria-label="Өшіру"><Trash2 size={15} /></button>
              </div>
            ))}
            <div><button type="button" className="btn ghost sm" onClick={() => setF({ ...f, members: [...f.members, { name: '', phone: '' }] })}><Plus size={14} />Шәкірт қосу</button></div>
          </div>
        </div>
      )}
      <div className="field full"><label>Ескерту</label><textarea className="textarea" style={{ minHeight: 60 }} value={f.note} onChange={set('note')} /></div>
      <div className="full row between"><button className="btn"><Check />Сақтау</button>{c.id && <button type="button" className="btn danger" onClick={remove}><Trash2 />Өшіру</button>}</div>
    </form>
  );
}
