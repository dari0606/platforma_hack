process.env.TZ ||= 'Asia/Almaty';

// Local / container start: prepare the database, then listen.
import app from './app.js';
import { get, importDiskUploads } from './db.js';
import { rebuildSearchIndex, runReminders } from './services.js';
import { seed } from './seed.js';
import { importContent } from './content.js';

if (!(await get('SELECT 1 FROM users LIMIT 1'))) { console.log('Empty database → seeding demo content…'); await seed(); }
try { await importContent({ log: false }); } catch (e) { console.error('content import failed', e.message); }
await importDiskUploads().catch((e) => console.error('upload migration', e.message));
await rebuildSearchIndex();
setInterval(() => { runReminders().catch((e) => console.error('reminders', e.message)); }, 60 * 60 * 1000);
setTimeout(() => { runReminders().catch((e) => console.error('reminders', e.message)); }, 5000);

const PORT = Number(process.env.API_PORT || process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`Hakk Academy API → http://localhost:${PORT}`));
