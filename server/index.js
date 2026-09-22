process.env.TZ ||= 'Asia/Almaty';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { get } from './db.js';
import { sessionMiddleware } from './auth.js';
import authRoutes from './routes/auth.js';
import appRoutes from './routes/app.js';
import { admin, teach } from './routes/admin.js';
import { serveFile } from './uploads.js';
import { rebuildSearchIndex, runReminders } from './services.js';
import { seed } from './seed.js';
import { importContent } from './content.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      frameSrc: ['https://www.youtube-nocookie.com', 'https://www.youtube.com'],
      imgSrc: ["'self'", 'data:', 'https://i.ytimg.com'],
      mediaSrc: ["'self'", 'blob:', 'data:', 'https://cdn.islamic.network'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(sessionMiddleware);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', admin);
app.use('/api/teach', teach);
app.use('/api', appRoutes);
app.get('/files/:bucket/:name', serveFile);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Табылмады' }));

// production: serve the built SPA
const dist = path.join(here, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '7d' }));
  app.get(/^\/(?!api|files).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Файл тым үлкен (50 МБ-тан аспауы керек)' : err.message || 'Сервер қатесі' });
});

if (!get('SELECT 1 FROM users LIMIT 1')) { console.log('Empty database → seeding demo content…'); seed(); }
try { importContent({ log: false }); } catch (e) { console.error('content import failed', e); }
rebuildSearchIndex();
setInterval(() => { try { runReminders(); } catch (e) { console.error('reminders', e); } }, 60 * 60 * 1000);
setTimeout(() => { try { runReminders(); } catch (e) { console.error(e); } }, 5000);

const PORT = Number(process.env.API_PORT || process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`Hakk Academy API → http://localhost:${PORT}`));
