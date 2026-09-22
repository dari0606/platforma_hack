import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Send, RotateCcw, PlayCircle, Video } from 'lucide-react';
import { t } from '../i18n.js';

/** Extracts the 11-char id from any YouTube URL form (mirror of server/youtube.js). */
export function youtubeId(url) {
  const s = String(url || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function YouTube({ url, title }) {
  const id = youtubeId(url);
  if (!id) {
    return <div className="video-empty"><div><Video size={36} /><div className="bold mt-sm">Видео жақында қосылады</div><div className="small muted">Әкімші YouTube сілтемесін қосқанда осында көрінеді</div></div></div>;
  }
  return (
    <div className="video">
      <iframe src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`} title={title || 'Hakk Academy видеосабақ'} loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
    </div>
  );
}

export function VideoThumb({ url }) {
  const id = youtubeId(url);
  return (
    <div className="video-thumb" style={id ? { backgroundImage: `url(https://i.ytimg.com/vi/${id}/mqdefault.jpg)` } : undefined}>
      <span className="play"><PlayCircle size={26} /></span>
    </div>
  );
}

/** Voice recorder using MediaRecorder; hands a Blob to onSubmit. */
export function Recorder({ onSubmit, busy }) {
  const [state, setState] = useState('idle'); // idle | recording | recorded | error
  const [url, setUrl] = useState(null);
  const [secs, setSecs] = useState(0);
  const rec = useRef(null); const chunks = useRef([]); const blob = useRef(null); const timer = useRef(null);

  useEffect(() => () => { clearInterval(timer.current); rec.current?.stream?.getTracks().forEach((tr) => tr.stop()); }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        blob.current = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
        setUrl(URL.createObjectURL(blob.current)); setState('recorded');
      };
      rec.current = r; r.start(); setState('recording'); setSecs(0);
      timer.current = setInterval(() => setSecs((s) => s + 1), 1000);
    } catch { setState('error'); }
  };
  const stop = () => { clearInterval(timer.current); rec.current?.stop(); };
  const reset = () => { setUrl(null); blob.current = null; setState('idle'); };
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <div className="recorder">
      {state === 'idle' && <button className="btn" onClick={start}><Mic />{t('Дауысыңызды жазу')}</button>}
      {state === 'error' && <><span className="small" style={{ color: 'var(--red)' }}>Микрофонға рұқсат берілмеді. Браузер баптауларын тексеріңіз.</span><button className="btn ghost sm" onClick={start}>Қайталау</button></>}
      {state === 'recording' && <><span className="rec-dot" /><span className="bold">Жазылуда… {mmss}</span><button className="btn danger" onClick={stop}><Square />Тоқтату</button></>}
      {state === 'recorded' && (
        <>
          <audio controls src={url} />
          <button className="btn ghost sm" onClick={reset}><RotateCcw />Қайта жазу</button>
          <button className="btn sm" disabled={busy} onClick={() => onSubmit(blob.current).then(reset)}><Send />{t('Ұстазға жіберу')}</button>
        </>
      )}
    </div>
  );
}
