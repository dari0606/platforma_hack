// Uploads are kept in the database (table `files`), not on disk: free hosting wipes the filesystem
// on every restart, and student recordings must survive that.
import crypto from 'node:crypto';
import multer from 'multer';
import { get, insert, sqlNow } from './db.js';
import { isStaff } from './services.js';

const ALLOWED = /^(audio\/|image\/|video\/mp4|application\/pdf|application\/msword|application\/vnd\.openxmlformats|text\/plain)/;

const make = (bucket) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(ALLOWED.test(file.mimetype) ? null : new Error('Бұл файл түріне рұқсат жоқ'), ALLOWED.test(file.mimetype)),
}).single('file');

const wrap = (bucket) => ({
  single: () => (req, res, next) => make(bucket)(req, res, async (err) => {
    if (err) return next(err);
    if (req.file) {
      try { req.file.url = await storeFile(bucket, req.file, req.user?.id); } catch (e) { return next(e); }
    }
    next();
  }),
});

export const privateUpload = wrap('private');   // student submissions, question attachments
export const contentUpload = wrap('content');   // PDFs, audio examples uploaded by staff

/** Saves an uploaded buffer and returns its URL. */
export async function storeFile(bucket, file, userId) {
  const id = crypto.randomBytes(16).toString('hex');
  await insert('files', {
    id, bucket, name: file.originalname || 'file', mime: file.mimetype, size: file.size,
    data: file.buffer, user_id: userId || null, created_at: sqlNow(),
  });
  return `/files/${bucket}/${id}`;
}

export const fileUrl = (bucket, id) => `/files/${bucket}/${id}`;

const SAFE = /^[a-f0-9]{24,32}$/i;

/** Serves a stored file: signed-in users only; private files just to the owner or staff. */
export async function serveFile(req, res, next) {
  try {
    const { bucket, name } = req.params;
    if (!req.user) return res.status(401).end();
    if (!['private', 'content'].includes(bucket) || !SAFE.test(name.replace(/\.[a-z0-9]+$/i, ''))) return res.status(404).end();
    const id = name.replace(/\.[a-z0-9]+$/i, '');
    const f = await get('SELECT * FROM files WHERE id = ? AND bucket = ?', id, bucket);
    if (!f) return res.status(404).end();
    if (bucket === 'private' && !isStaff(req.user) && f.user_id !== req.user.id) {
      // older uploads are referenced with their file extension, newer ones without
      const urls = [fileUrl('private', id), fileUrl('private', name)];
      let owns = false;
      for (const url of urls) {
        owns = owns || !!(await get('SELECT 1 FROM submissions WHERE file_path = ? AND user_id = ?', url, req.user.id))
          || !!(await get('SELECT 1 FROM qa_threads WHERE file_path = ? AND user_id = ?', url, req.user.id));
      }
      if (!owns) return res.status(403).end();
    }
    res.setHeader('Content-Type', f.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Length', f.size || Buffer.byteLength(f.data));
    res.end(Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data));
  } catch (e) { next(e); }
}
