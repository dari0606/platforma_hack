import { StrictMode, Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import '@fontsource-variable/inter';
import '@fontsource/amiri-quran/arabic-400.css';
import '@fontsource/noto-naskh-arabic/arabic-400.css';
import '@fontsource/noto-naskh-arabic/arabic-600.css';
import './styles.css';
import { api, isStatic } from './api.js';
import { setLocale } from './i18n.js';
import { AuthCtx, MetaCtx, ToastProvider, Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import { Login, Forgot, Reset } from './pages/auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { Learning, CoursePage, LessonsLibrary, LessonPage } from './pages/learning.jsx';
import { TafsirCatalog, SurahPage } from './pages/tafsir.jsx';
import { QuranKB, KnowledgeBase, TopicPage, Arabic, Dictionary, SearchPage } from './pages/knowledge.jsx';
import { PracticePage, TestsPage, TestRun, DailyReview } from './pages/practice.jsx';
import { AlphabetPage, HifzPage } from './pages/tools.jsx';
import { applyArScale, getArScale } from './components/quran.jsx';
import { ProgressPage, MistakesPage, SavedPage, QuestionsPage, ProfilePage, CalendarPage, MaterialsPage, CertificatePage } from './pages/personal.jsx';

applyArScale(getArScale());

const Admin = lazy(() => import('./admin/index.jsx'));

function Protected({ user, children }) {
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

function App() {
  const [user, setUser] = useState(undefined);
  const [meta, setMeta] = useState({});
  const [serverDown, setServerDown] = useState(false);

  useEffect(() => {
    api.get('/api/auth/me')
      .then((r) => { setUser(r.user); setServerDown(false); })
      .catch((e) => { setUser(null); setServerDown(e.status !== 401); });
  }, []);
  useEffect(() => {
    if (!user) return;
    setLocale(user.locale || 'kk');
    api.get('/api/meta').then(setMeta).catch(() => {});
  }, [user]);
  useEffect(() => {
    const h = () => setUser(null);
    window.addEventListener('hakk:unauthorized', h); return () => window.removeEventListener('hakk:unauthorized', h);
  }, []);
  const logout = useCallback(async () => { await api.post('/api/auth/logout'); setUser(null); }, []);

  if (user === undefined) return <Spinner />;
  if (serverDown) {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', padding: 24 }}>
        <div className="card">
          <h1>Сервер қосылмаған</h1>
          <p className="muted mt">Платформаның сыртқы беті жұмыс істеп тұр, бірақ дерекқор мен сервер бөлігі әлі қосылмаған, сондықтан кіру де, қонақ режимі де мүмкін емес.</p>
          <p className="small muted mt">Әкімшіге: хостингте Postgres дерекқорын қосып (DATABASE_URL), жобаны қайта жайыңыз. Нұсқаулық — DEPLOY.md.</p>
        </div>
      </div>
    );
  }
  const staff = user && user.role !== 'student';

  return (
    <AuthCtx.Provider value={{ user, setUser, logout }}>
      <MetaCtx.Provider value={meta}>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={user || isStatic() ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/forgot" element={<Forgot />} />
            <Route path="/reset/:token" element={<Reset />} />
            <Route path="/*" element={
              <Protected user={user}>
                <Layout>
                  <Suspense fallback={<Spinner />}>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/learning" element={<Learning />} />
                      <Route path="/courses/:id" element={<CoursePage />} />
                      <Route path="/lessons" element={<LessonsLibrary />} />
                      <Route path="/lessons/:id" element={<LessonPage />} />
                      <Route path="/tafsir" element={<TafsirCatalog />} />
                      <Route path="/tafsir/:id" element={<SurahPage />} />
                      <Route path="/quran" element={<QuranKB />} />
                      <Route path="/kb" element={<KnowledgeBase />} />
                      <Route path="/kb/:slug" element={<TopicPage />} />
                      <Route path="/arabic" element={<Arabic />} />
                      <Route path="/alphabet" element={<AlphabetPage />} />
                      <Route path="/hifz" element={<HifzPage />} />
                      <Route path="/dictionary" element={<Dictionary />} />
                      <Route path="/search" element={<SearchPage />} />
                      <Route path="/practice" element={<PracticePage />} />
                      <Route path="/tests" element={<TestsPage />} />
                      <Route path="/tests/:id" element={<TestRun />} />
                      <Route path="/review" element={<DailyReview />} />
                      <Route path="/progress" element={<ProgressPage />} />
                      <Route path="/mistakes" element={<MistakesPage />} />
                      <Route path="/saved" element={<SavedPage />} />
                      <Route path="/questions" element={<QuestionsPage />} />
                      <Route path="/profile" element={<ProfilePage />} />
                      <Route path="/calendar" element={<CalendarPage />} />
                      <Route path="/materials" element={<MaterialsPage />} />
                      <Route path="/certificates/:id" element={<CertificatePage />} />
                      {staff && <Route path="/admin/*" element={<Admin />} />}
                      {staff && <Route path="/teach/*" element={<Admin />} />}
                      <Route path="*" element={<div className="empty mt-lg"><h2>Бет табылмады</h2></div>} />
                    </Routes>
                  </Suspense>
                </Layout>
              </Protected>
            } />
          </Routes>
        </ToastProvider>
      </MetaCtx.Provider>
    </AuthCtx.Provider>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>);
