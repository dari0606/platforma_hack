// Database layer with two backends:
//   • SQLite  — local development (default, zero setup)
//   • Postgres — cloud hosting, when DATABASE_URL is set (free tiers have no persistent disk)
// All queries use `?` placeholders and ISO-like UTC timestamp strings, so the same SQL runs on both.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(here, '..', 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* read-only filesystem (serverless) */ }
export const DB_PATH = path.join(DATA_DIR, 'hakk.db');

// Vercel/Neon hand the connection string under different names
const URL_ = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || '';
if (!URL_ && (process.env.VERCEL || process.env.SERVERLESS)) {
  throw new Error('DATABASE_URL is not set. Serverless hosting has no disk for SQLite — connect a Postgres database (Vercel → Storage → Neon) and redeploy.');
}
export const DIALECT = URL_ ? 'pg' : 'sqlite';
const txStore = new AsyncLocalStorage();

/** '2026-09-23 08:15:00' in UTC — the format SQLite's datetime('now') produces. */
export const sqlNow = (d = new Date()) => d.toISOString().slice(0, 19).replace('T', ' ');
export const sqlAgo = (ms) => sqlNow(new Date(Date.now() - ms));
export const DAY = 86400000;
export const startOfToday = () => sqlNow(new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'));

// `?` → `$1, $2 …` for Postgres
const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
// undefined cannot be bound; booleans are stored as 0/1
const clean = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));

let backend;

if (DIALECT === 'pg') {
  if (URL_.startsWith('pglite:')) {
    // embedded Postgres used to test the Postgres dialect locally
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = URL_.replace(/^pglite:(\/\/)?/, '') || undefined;
    const lite = new PGlite(dir);
    await lite.waitReady;
    backend = {
      query: async (sql, params) => (await lite.query(toPg(sql), clean(params))).rows,
      exec: (sql) => lite.exec(sql),
      tx: async (fn) => { await lite.exec('BEGIN'); try { const r = await fn(); await lite.exec('COMMIT'); return r; } catch (e) { await lite.exec('ROLLBACK'); throw e; } },
    };
  } else {
    const pg = await import('pg');
    // timestamps are plain strings for us; keep numeric types as numbers
    pg.default.types.setTypeParser(20, Number); // int8
    pg.default.types.setTypeParser(1700, Number); // numeric
    const pool = new pg.default.Pool({
      connectionString: URL_,
      ssl: /localhost|127\.0\.0\.1/.test(URL_) ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL || 8),
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (e) => console.error('pg pool error', e.message));
    backend = {
      query: async (sql, params) => {
        const client = txStore.getStore();
        const r = await (client || pool).query(toPg(sql), clean(params));
        return r.rows;
      },
      exec: async (sql) => { await (txStore.getStore() || pool).query(sql); },
      tx: async (fn) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const r = await txStore.run(client, fn);
          await client.query('COMMIT');
          return r;
        } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
      },
    };
  }
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const cache = new Map();
  const stmt = (sql) => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
  const plain = (r) => ({ ...r }); // node:sqlite returns null-prototype objects
  backend = {
    query: async (sql, params) => {
      const s = stmt(sql);
      if (/^\s*(select|with|pragma)/i.test(sql) || /returning/i.test(sql)) return s.all(...clean(params)).map(plain);
      s.run(...clean(params));
      return [];
    },
    exec: async (sql) => { db.exec(sql); },
    tx: async (fn) => { db.exec('BEGIN'); try { const r = await fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    raw: db,
  };
}

export const query = (sql, ...params) => backend.query(sql, params);
export const all = (sql, ...params) => backend.query(sql, params);
export const get = async (sql, ...params) => (await backend.query(sql, params))[0] || undefined;
export const run = (sql, ...params) => backend.query(sql, params);
export const exec = (sql) => backend.exec(sql);
export const tx = (fn) => backend.tx(fn);
export const sqliteHandle = () => backend.raw;

export const parse = (v, fallback = null) => {
  if (v == null || v === '') return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

const NO_ID = new Set(['group_members', 'student_progress', 'memorization']);

/** Insert a row from an object; returns the new id (or undefined for tables without one). */
export async function insert(table, obj) {
  const keys = Object.keys(obj);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
    + (NO_ID.has(table) ? '' : ' RETURNING id');
  const rows = await backend.query(sql, keys.map((k) => obj[k]));
  return rows[0]?.id;
}

export async function update(table, id, obj) {
  const keys = Object.keys(obj);
  if (!keys.length) return;
  await backend.query(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => obj[k]), id]);
}

// ---------- schema ----------
export async function migrate() {
  const file = DIALECT === 'pg' ? 'schema.pg.sql' : 'schema.sql';
  await backend.exec(fs.readFileSync(path.join(here, file), 'utf8'));
  if (DIALECT === 'sqlite') {
    const has = (t, c) => backend.raw.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);
    const add = (t, c, d) => { if (!has(t, c)) backend.raw.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`); };
    add('ayahs', 'global_number', 'INTEGER');
    add('ayahs', 'translation_source', 'TEXT');
    add('surahs', 'name_meaning', 'TEXT');
    add('words', 'topic', 'TEXT');
  }
}
await migrate();

/** One-time move of previously uploaded files from disk into the `files` table. */
export async function importDiskUploads() {
  for (const bucket of ['private', 'content']) {
    const dir = path.join(UPLOAD_DIR, bucket);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const id = name.replace(/\.[a-z0-9]+$/i, '');
      if (await get('SELECT 1 FROM files WHERE id = ?', id)) continue;
      const data = fs.readFileSync(path.join(dir, name));
      const ext = (name.split('.').pop() || '').toLowerCase();
      const mime = { wav: 'audio/wav', webm: 'audio/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[ext] || 'application/octet-stream';
      await insert('files', { id, bucket, name, mime, size: data.length, data, user_id: null, created_at: sqlNow() });
    }
  }
}
