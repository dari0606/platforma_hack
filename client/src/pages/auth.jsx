import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, LogIn } from 'lucide-react';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { useAuth } from '../components/ui.jsx';

function AuthShell({ children }) {
  return (
    <div className="auth">
      <div className="auth-art">
        <span className="circle" style={{ width: 520, height: 520, right: -180, top: -160 }} />
        <span className="circle" style={{ width: 320, height: 320, right: -60, top: -40 }} />
        <div className="row" style={{ position: 'relative' }}>
          <div className="brand-logo" style={{ background: '#fff', color: 'var(--primary)' }}>H</div>
          <div><div className="brand-name">Hakk Academy</div><div className="small" style={{ opacity: .8 }}>Құран және араб тілі оқу орталығы</div></div>
        </div>
        <div className="hide-m" style={{ position: 'relative', maxWidth: 480 }}>
          <h1 style={{ fontSize: 38, lineHeight: 1.15 }}>Жеке оқу кеңістігіңізге қош келдіңіз</h1>
          <p className="mt" style={{ opacity: .85, fontSize: 16 }}>Жанды сабақ + цифрлық білім базасы + практика + ұстаздың тексеруі + қайталау.</p>
          <div className="principle mt-lg">
            {['Білім', 'Түсіну', 'Практика', 'Тексеру', 'Прогресс'].map((s, i) => <span key={s} className="row" style={{ gap: 8 }}>{i > 0 && '→'}<span className="step">{s}</span></span>)}
          </div>
        </div>
        <div className="small hide-m" style={{ opacity: .7, position: 'relative' }}>Жабық платформа · тек Hakk Academy оқушылары мен ұстаздары үшін</div>
      </div>
      <div className="auth-form"><div className="auth-box">{children}</div></div>
    </div>
  );
}

export function Login() {
  const { setUser } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await api.post('/api/auth/login', { login, password }); setUser(r.user); nav(loc.state?.from || '/', { replace: true }); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const demo = (email) => { setLogin(email); setPassword('hakk2026'); };
  const [showDemo, setShowDemo] = useState(false);
  useEffect(() => { api.get('/api/auth/me').then((r) => setShowDemo(!!r.demo)).catch(() => {}); }, []);
  return (
    <AuthShell>
      <h1>{t('Кіру')}</h1>
      <p className="muted mt-sm">Академия берген телефон нөміріңізді немесе email-іңізді енгізіңіз.</p>
      <form onSubmit={submit} className="stack mt-lg" style={{ gap: 16 }}>
        {err && <div className="alert error"><AlertTriangle />{err}</div>}
        <div className="field"><label htmlFor="login">{t('Телефон немесе email')}</label><input id="login" className="input" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="+7 701 123 45 67 немесе name@mail.kz" required /></div>
        <div className="field">
          <div className="row between"><label htmlFor="pw">{t('Құпиясөз')}</label><Link to="/forgot" className="small" style={{ color: 'var(--primary)' }}>{t('Құпиясөзді ұмыттыңыз ба?')}</Link></div>
          <input id="pw" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn lg block" disabled={busy}><LogIn />{busy ? 'Кіруде…' : t('Кіру')}</button>
      </form>
      {showDemo && <div className="card flat mt-lg" style={{ padding: 16 }}>
        <div className="small bold">Демо аккаунттар <span className="muted">(құпиясөз: hakk2026)</span></div>
        <div className="chips mt-sm">
          {[['student@hakk.kz', 'Оқушы'], ['adilet@hakk.kz', 'Ұстаз'], ['curator@hakk.kz', 'Куратор'], ['admin@hakk.kz', 'Әкімші']].map(([e, l]) => <button key={e} type="button" className="chip" onClick={() => demo(e)}>{l}</button>)}
        </div>
      </div>}
    </AuthShell>
  );
}

export function Forgot() {
  const [login, setLogin] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const submit = async (e) => { e.preventDefault(); setErr(null); try { setRes(await api.post('/api/auth/forgot', { login })); } catch (e2) { setErr(e2.message); } };
  return (
    <AuthShell>
      <h1>Құпиясөзді қалпына келтіру</h1>
      <p className="muted mt-sm">Аккаунтқа тіркелген телефон немесе email енгізіңіз — қалпына келтіру сілтемесін жібереміз.</p>
      <form onSubmit={submit} className="stack mt-lg" style={{ gap: 16 }}>
        {err && <div className="alert error"><AlertTriangle />{err}</div>}
        {res && <div className="alert ok"><CheckCircle2 /><div>{res.message}{res.devLink && <div className="mt-sm">Демо режим: <Link to={res.devLink} style={{ textDecoration: 'underline' }}>сілтемені ашу</Link></div>}</div></div>}
        <div className="field"><label>{t('Телефон немесе email')}</label><input className="input" value={login} onChange={(e) => setLogin(e.target.value)} required /></div>
        <button className="btn lg block">Сілтеме жіберу</button>
        <Link to="/login" className="center small muted">← Кіру бетіне оралу</Link>
      </form>
    </AuthShell>
  );
}

export function Reset() {
  const { token } = useParams();
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [err, setErr] = useState(null); const [ok, setOk] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(null);
    if (pw !== pw2) return setErr('Құпиясөздер сәйкес келмейді');
    try { await api.post('/api/auth/reset', { token, password: pw }); setOk(true); } catch (e2) { setErr(e2.message); }
  };
  return (
    <AuthShell>
      <h1>Жаңа құпиясөз</h1>
      {ok ? <div className="alert ok mt-lg"><CheckCircle2 /><div>Құпиясөз жаңартылды. <Link to="/login" style={{ textDecoration: 'underline' }}>Кіру</Link></div></div> : (
        <form onSubmit={submit} className="stack mt-lg" style={{ gap: 16 }}>
          {err && <div className="alert error"><AlertTriangle />{err}</div>}
          <div className="field"><label>Жаңа құпиясөз</label><input type="password" className="input" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
          <div className="field"><label>Қайталаңыз</label><input type="password" className="input" minLength={6} value={pw2} onChange={(e) => setPw2(e.target.value)} required /></div>
          <button className="btn lg block">Сақтау</button>
        </form>
      )}
    </AuthShell>
  );
}
