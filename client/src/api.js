// Thin fetch wrapper with two modes:
//   • server mode  — a real backend is running (accounts, recordings, teacher review, admin);
//   • static mode  — no backend at all: the platform runs from /data in the browser,
//                    opens without login and keeps progress in localStorage.
// The mode is detected once, so the same build works both ways.
import * as staticApi from './staticApi.js';

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

let mode = null;
let detecting = null;
export const isStatic = () => mode === 'static';

async function detect() {
  detecting ||= (async () => {
    try {
      const res = await fetch('/api/health', { credentials: 'same-origin' });
      const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
      mode = res.ok && data?.ok ? 'server' : 'static';
    } catch { mode = 'static'; }
    return mode;
  })();
  return detecting;
}

async function request(method, url, body) {
  if (!mode) await detect();
  if (mode === 'static') {
    if (body instanceof FormData) throw new ApiError('Файл жіберу тек мұғалімі бар толық нұсқада жұмыс істейді', 501);
    try { return await staticApi.handle(method, url, body); }
    catch (e) { throw new ApiError(e.message, e.status || 400); }
  }
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(url, opts);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth')) window.dispatchEvent(new Event('hakk:unauthorized'));
    throw new ApiError(data?.error || 'Қате орын алды', res.status, data);
  }
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b = {}) => request('POST', u, b),
  put: (u, b = {}) => request('PUT', u, b),
  del: (u) => request('DELETE', u),
};
