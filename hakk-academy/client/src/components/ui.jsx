import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, BookmarkCheck, ShieldCheck, AlertTriangle, Inbox, ChevronRight, X } from 'lucide-react';
import { api } from '../api.js';
import { t } from '../i18n.js';

// ---------- data hook ----------
export function useApi(url, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: !!url });
  const load = useCallback(() => {
    if (!url) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.get(url).then((data) => setState({ data, error: null, loading: false }))
      .catch((error) => setState({ data: null, error, loading: false }));
  }, [url]);
  useEffect(load, [load, ...deps]);
  return { ...state, reload: load, setData: (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })) };
}

// ---------- contexts ----------
export const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);
export const MetaCtx = createContext({});
export const useMeta = () => useContext(MetaCtx);

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const show = useCallback((m) => { setMsg(m); clearTimeout(window.__hakkToast); window.__hakkToast = setTimeout(() => setMsg(null), 3200); }, []);
  return <ToastCtx.Provider value={show}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>;
}

// ---------- primitives ----------
export const Spinner = () => <div className="spinner" aria-label="Жүктелуде" />;

export function Loader({ q, children }) {
  if (q.loading && !q.data) return <Spinner />;
  if (q.error) return <div className="alert error mt"><AlertTriangle />{q.error.message}</div>;
  if (!q.data) return null;
  return children(q.data);
}

export const Progress = ({ value = 0, size = '' }) => (
  <div className={`progress ${size}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
);

export const Ring = ({ value }) => <div className="ring" style={{ '--p': value }}><div>{value}%</div></div>;

export const Empty = ({ icon: Icon = Inbox, title, children }) => (
  <div className="empty"><Icon /><div className="bold" style={{ color: 'var(--text-2)' }}>{title}</div>{children && <div className="small mt-sm">{children}</div>}</div>
);

export const PageHead = ({ title, sub, crumbs, children }) => (
  <div className="page-head">
    <div>
      {crumbs && <div className="crumbs">{crumbs.map((c, i) => <span key={i} className="row" style={{ gap: 6 }}>{i > 0 && <ChevronRight size={13} />}{c.to ? <Link to={c.to}>{c.label}</Link> : c.label}</span>)}</div>}
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </div>
    {children && <div className="row wrap">{children}</div>}
  </div>
);

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="row between mb"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label={t('Жабу')}><X /></button></div>
        {children}
      </div>
    </div>
  );
}

export const Tabs = ({ value, onChange, items }) => (
  <div className="tabs" role="tablist">
    {items.map((it) => <button key={it.value} role="tab" aria-selected={value === it.value} className={value === it.value ? 'on' : ''} onClick={() => onChange(it.value)}>{it.label}{it.count != null && <span className="muted"> · {it.count}</span>}</button>)}
  </div>
);

/** Arabic text block — always RTL, isolated from surrounding LTR text. */
export const Ar = ({ children, size = '', center, className = '', as: Tag = 'div' }) => (
  <Tag className={`ar ${size ? 'ar-' + size : ''} ${center ? 'ar-center' : ''} ${className}`} lang="ar" dir="rtl">{children}</Tag>
);

export function BookmarkBtn({ type, id, title, subtitle, link, saved: initial, small }) {
  const [saved, setSaved] = useState(!!initial);
  const toast = useToast();
  useEffect(() => setSaved(!!initial), [initial]);
  const toggle = async () => {
    const r = await api.post('/api/bookmarks', { item_type: type, item_id: id, title, subtitle, link });
    setSaved(r.saved); toast(r.saved ? '🔖 Сақталғандарға қосылды' : 'Сақталғандардан алынды');
  };
  const Icon = saved ? BookmarkCheck : Bookmark;
  return <button className={`btn ${saved ? 'soft' : 'ghost'} ${small ? 'sm' : ''}`} onClick={toggle} aria-pressed={saved}><Icon />{saved ? t('Сақталды') : t('Сақтау')}</button>;
}

/** Religious content verification badge (Draft → Review → Approved → Published). */
export function Verification({ v, compact }) {
  if (!v) return null;
  if (v.verified) {
    return (
      <div>
        <span className="verified"><ShieldCheck />Hakk Academy тексерген</span>
        {!compact && <SourceBox v={v} />}
      </div>
    );
  }
  return (
    <div>
      <span className="badge amber"><AlertTriangle />{v.status !== 'published' ? `${v.status.toUpperCase()} · жарияланбаған` : v.is_demo ? 'Демо-мазмұн · ұстаз тексеруін күтуде' : 'Тексерілмеген'}</span>
      {!compact && <SourceBox v={v} />}
    </div>
  );
}
function SourceBox({ v }) {
  const rows = [
    v.source && ['Дереккөз', v.source.title + (v.source.url ? ` (${v.source.url})` : '')],
    v.scholar && ['Автор / Ғалым', v.scholar],
    (v.book || v.source?.book) && ['Кітап', v.book || v.source.book],
    v.reviewed_by && ['Ұстаз тексерген', v.reviewed_by],
    v.reviewed_at && ['Соңғы тексерілген күні', fmtDate(v.reviewed_at)],
  ].filter(Boolean);
  if (!rows.length) return null;
  return <div className="source-box">{rows.map(([k, val]) => <div key={k}><span className="muted">{k}:</span> {val}</div>)}</div>;
}

export const StatusBadge = ({ status }) => {
  const map = { draft: '', review: 'amber', approved: 'blue', published: 'green', pending: 'amber', accepted: 'green', reread: 'red', fix: 'amber', open: 'amber', answered: 'green' };
  const label = { draft: 'Draft', review: 'Review', approved: 'Approved', published: 'Published', pending: 'Тексерілуде', accepted: 'Қабылданды', reread: 'Қайта оқу керек', fix: 'Түзету қажет', open: 'Жауап күтуде', answered: 'Жауап берілді' };
  return <span className={`badge ${map[status] || ''}`}>{label[status] || status}</span>;
};

// ---------- formatting ----------
const MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
export const WD = ['Дүйсенбі', 'Сейсенбі', 'Сәрсенбі', 'Бейсенбі', 'Жұма', 'Сенбі', 'Жексенбі'];
export const WD_SHORT = ['Дс', 'Сс', 'Ср', 'Бс', 'Жм', 'Сн', 'Жс'];
export const parseDate = (s) => (s ? new Date(/Z|[+-]\d\d:?\d\d$/.test(s) || s.includes('T') ? s : s.replace(' ', 'T') + 'Z') : null);
export function fmtDate(s, withTime) {
  const d = parseDate(s); if (!d || isNaN(d)) return '';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withTime ? `${base}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : base;
}
export function ago(s) {
  const d = parseDate(s); if (!d) return '';
  const m = Math.round((Date.now() - d) / 60000);
  if (m < 1) return 'жаңа ғана'; if (m < 60) return `${m} мин бұрын`;
  const h = Math.round(m / 60); if (h < 24) return `${h} сағ бұрын`;
  const dd = Math.round(h / 24); return dd < 7 ? `${dd} күн бұрын` : fmtDate(s);
}
export const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const initials = (name = '') => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
