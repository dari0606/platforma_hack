import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { UPLOAD_DIR, get } from './db.js';
import { isStaff } from './services.js';

const ALLOWED = /^(audio\/|image\/|video\/mp4|application\/pdf|application\/msword|application\/vnd\.openxmlformats|text\/plain)/;
const EXT = /^\.[a-z0-9]{1,5}$/i;

const storage = (bucket) => multer.diskStorage({
  destination: (_req, _file, cb) => { const d = path.join(UPLOAD_DIR, bucket); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
  filename: (_req, file, cb) => {
    let ext = path.extname(file.originalname || '').toLowerCase();
    if (!EXT.test(ext)) ext = file.mimetype.startsWith('audio/') ? '.webm' : '';
    cb(null, crypto.randomBytes(12).toString('hex') + ext);
  },
});
const make = (bucket) => multer({
  storage: storage(bucket),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(ALLOWED.test(file.mimetype) ? null : new Error('Бұл файл түріне рұқсат жоқ'), ALLOWED.test(file.mimetype)),
});

export const privateUpload = make('private');   // student submissions, question attachments
export const contentUpload = make('content');   // PDFs, audio examples uploaded by staff

export const fileUrl = (bucket, filename) => `/files/${bucket}/${filename}`;

const SAFE = /^[a-f0-9]{24}(\.[a-z0-9]{1,5})?$/i;

/** Serves uploaded files only to signed-in users; private files only to owner or staff. */
export function serveFile(req, res) {
  const { bucket, name } = req.params;
  if (!req.user) return res.status(401).end();
  if (!['private', 'content'].includes(bucket) || !SAFE.test(name)) return res.status(404).end();
  if (bucket === 'private' && !isStaff(req.user)) {
    const url = fileUrl('private', name);
    const owns = get('SELECT 1 FROM submissions WHERE file_path = ? AND user_id = ?', url, req.user.id)
      || get('SELECT 1 FROM qa_threads WHERE file_path = ? AND user_id = ?', url, req.user.id);
    if (!owns) return res.status(403).end();
  }
  const f = path.join(UPLOAD_DIR, bucket, name);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(f);
}
