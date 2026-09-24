// Vercel serverless entry: the same Express app, without the local start-up tasks.
// Requires DATABASE_URL (Postgres) — serverless hosts have no persistent disk for SQLite.
process.env.TZ ||= 'Asia/Almaty';
export { default } from '../server/app.js';
