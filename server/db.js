import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(here, '..', 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'hakk.db');
export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));

const cache = new Map();
const stmt = (sql) => {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
};

// node:sqlite returns null-prototype objects; spread them into plain ones for JSON
const plain = (r) => (r ? { ...r } : r);
// undefined cannot be bound by node:sqlite → treat as NULL; booleans → 0/1
const b = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
export const all = (sql, ...p) => stmt(sql).all(...b(p)).map(plain);
export const get = (sql, ...p) => plain(stmt(sql).get(...b(p)));
export const run = (sql, ...p) => stmt(sql).run(...b(p));

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const parse = (v, fallback = null) => {
  if (v == null || v === '') return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
};

/** Insert a row from an object; returns new id. Column names come from server code only. */
export function insert(table, obj) {
  const keys = Object.keys(obj);
  const r = run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => obj[k]));
  return Number(r.lastInsertRowid);
}

export function update(table, id, obj) {
  const keys = Object.keys(obj);
  if (!keys.length) return;
  run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => obj[k]), id);
}

// ---------- lightweight migrations (idempotent) ----------
const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
const addColumn = (table, col, def) => { if (!hasColumn(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); };
addColumn('ayahs', 'global_number', 'INTEGER');
addColumn('ayahs', 'translation_source', 'TEXT');
addColumn('surahs', 'name_meaning', 'TEXT');
addColumn('words', 'topic', 'TEXT');
db.exec(`CREATE TABLE IF NOT EXISTS memorization (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  surah_id INTEGER NOT NULL REFERENCES surahs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('learning','memorized')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, surah_id)
)`);
