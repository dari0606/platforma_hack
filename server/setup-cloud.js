// One-time filling of a cloud database: `DATABASE_URL="postgresql://…" npm run setup:cloud`
import { get, DIALECT } from './db.js';
import { seed } from './seed.js';
import { importContent } from './content.js';
import { rebuildSearchIndex } from './services.js';

if (DIALECT !== 'pg') {
  console.error('DATABASE_URL не задан — это команда для облачной базы.\nПример: DATABASE_URL="postgresql://..." npm run setup:cloud');
  process.exit(1);
}
if (await get('SELECT 1 FROM users LIMIT 1')) {
  console.log('В базе уже есть данные — обновляю только учебные материалы…');
  await importContent();
} else {
  console.log('Пустая база — заполняю демо-данными и материалами…');
  await seed();
}
console.log('Поисковый индекс:', await rebuildSearchIndex(), 'записей');
console.log('Готово. Откройте сайт — он должен открыться сразу, без входа.');
process.exit(0);
