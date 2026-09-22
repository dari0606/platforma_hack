import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Repeat, Eye, EyeOff, Minus, Plus, Languages, Headphones, SkipForward } from 'lucide-react';
import { BookmarkBtn } from './ui.jsx';

export const RECITERS = [
  { id: 'ar.husary', bitrate: 64, name: 'Махмуд Халил әл-Хусари', note: 'баяу, үйренуге ыңғайлы' },
  { id: 'ar.alafasy', bitrate: 64, name: 'Мишари Рашид әл-Афаси', note: '' },
  { id: 'ar.minshawi', bitrate: 128, name: 'Мұхаммед Сыддық әл-Миншауи', note: '' },
];
const ayahAudio = (reciter, g) => { const r = RECITERS.find((x) => x.id === reciter) || RECITERS[0]; return `https://cdn.islamic.network/quran/audio/${r.bitrate}/${r.id}/${g}.mp3`; };

const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

/** Global Arabic text scale (profile + reader), stored per device. */
export function applyArScale(v) { document.documentElement.style.setProperty('--ar-scale', String(v)); }
export const getArScale = () => load('hakk_ar_scale', 1);
export function setArScale(v) { const n = Math.min(1.8, Math.max(0.8, Math.round(v * 10) / 10)); save('hakk_ar_scale', n); applyArScale(n); return n; }

/** Quran reader: verse-by-verse audio, repeat for memorisation, hide-text mode, translation toggle. */
export function QuranReader({ surah, ayahs }) {
  const [reciter, setReciter] = useState(load('hakk_reciter', 'ar.husary'));
  const [repeat, setRepeat] = useState(load('hakk_repeat', 1));
  const [showTr, setShowTr] = useState(load('hakk_show_tr', true));
  const [hide, setHide] = useState(false);
  const [revealed, setRevealed] = useState({});
  const [scale, setScale] = useState(getArScale());
  const [cur, setCur] = useState(null); // index of playing ayah
  const [playing, setPlaying] = useState(false);
  const [auto, setAuto] = useState(true); // continue to next ayah
  const audio = useRef(null);
  const count = useRef(0);
  const refs = useRef([]);

  useEffect(() => save('hakk_reciter', reciter), [reciter]);
  useEffect(() => save('hakk_repeat', repeat), [repeat]);
  useEffect(() => save('hakk_show_tr', showTr), [showTr]);
  useEffect(() => () => audio.current?.pause(), []);

  const playAt = (i) => {
    const a = ayahs[i];
    if (!a?.global_number) return;
    if (!audio.current) audio.current = new Audio();
    const el = audio.current;
    el.src = ayahAudio(reciter, a.global_number);
    el.onended = () => {
      count.current += 1;
      if (count.current < repeat) { el.currentTime = 0; el.play(); return; }
      count.current = 0;
      if (auto && i + 1 < ayahs.length) playAt(i + 1); else { setPlaying(false); setCur(null); }
    };
    el.onerror = () => { setPlaying(false); };
    count.current = 0;
    setCur(i); setPlaying(true);
    el.play().catch(() => setPlaying(false));
    refs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const toggle = (i) => {
    if (cur === i && playing) { audio.current.pause(); setPlaying(false); return; }
    if (cur === i && !playing) { audio.current.play(); setPlaying(true); return; }
    playAt(i);
  };
  const playAll = () => (playing ? (audio.current.pause(), setPlaying(false)) : cur != null ? (audio.current.play(), setPlaying(true)) : playAt(0));
  const zoom = (d) => setScale(setArScale(scale + d));
  const hasAudio = ayahs.some((a) => a.global_number);
  const hasTr = ayahs.some((a) => a.translation);
  const trSource = ayahs.find((a) => a.translation_source)?.translation_source;

  return (
    <div>
      <div className="reader-bar">
        {hasAudio && <button className="btn" onClick={playAll}>{playing ? <Pause /> : <Play />}{playing ? 'Тоқтату' : cur != null ? 'Жалғастыру' : 'Барлығын тыңдау'}</button>}
        {hasAudio && (
          <select className="select sm" value={reciter} onChange={(e) => { setReciter(e.target.value); if (playing && cur != null) setTimeout(() => playAt(cur), 0); }} aria-label="Қари">
            {RECITERS.map((r) => <option key={r.id} value={r.id}>{r.name}{r.note ? ` — ${r.note}` : ''}</option>)}
          </select>
        )}
        {hasAudio && (
          <div className="seg" role="group" aria-label="Қайталау саны">
            <Repeat size={16} />
            {[1, 3, 5, 10].map((n) => <button key={n} className={repeat === n ? 'on' : ''} onClick={() => setRepeat(n)}>{n}×</button>)}
          </div>
        )}
        {hasAudio && <button className={`btn sm ${auto ? 'soft' : 'ghost'}`} onClick={() => setAuto(!auto)} title="Келесі аятқа автоматты өту"><SkipForward />{auto ? 'Ретімен' : 'Бір аят'}</button>}
        <button className={`btn sm ${hide ? 'soft' : 'ghost'}`} onClick={() => { setHide(!hide); setRevealed({}); }}>{hide ? <EyeOff /> : <Eye />}Жаттау режимі</button>
        {hasTr && <button className={`btn sm ${showTr ? 'soft' : 'ghost'}`} onClick={() => setShowTr(!showTr)}><Languages />Мағынасы</button>}
        <div className="seg" role="group" aria-label="Арабша мәтін өлшемі">
          <button onClick={() => zoom(-0.1)} aria-label="Кішірейту"><Minus size={15} /></button>
          <span className="tiny bold">{Math.round(scale * 100)}%</span>
          <button onClick={() => zoom(0.1)} aria-label="Үлкейту"><Plus size={15} /></button>
        </div>
      </div>
      {hide && <div className="alert info mt-sm"><EyeOff />Жаттау режимі: аятты жатқа айтып көріңіз, кейін тексеру үшін аятты басыңыз. Алғашқы сөз көмек ретінде көрсетіледі.</div>}

      {ayahs.map((a, i) => {
        const hidden = hide && !revealed[a.id];
        const firstWord = a.arabic.split(' ')[0];
        return (
          <div className={`ayah ${cur === i ? 'playing' : ''}`} key={a.id} id={`a${a.number}`} ref={(el) => { refs.current[i] = el; }}>
            <div className="row between">
              <div className="row" style={{ gap: 8 }}>
                <span className="ayah-num">{a.number}</span>
                {a.global_number && <button className="icon-btn" onClick={() => toggle(i)} aria-label={`${a.number}-аятты тыңдау`}>{cur === i && playing ? <Pause /> : <Headphones />}</button>}
              </div>
              <BookmarkBtn small type="ayah" id={a.id} title={`${surah.name_kk}, ${a.number}-аят`} subtitle={a.arabic} link={`/tafsir/${surah.id}#a${a.number}`} saved={a.bookmarked} />
            </div>
            {hidden ? (
              <button className="hifz-hidden" onClick={() => setRevealed((r) => ({ ...r, [a.id]: true }))}>
                <span className="ar" lang="ar" dir="rtl">{firstWord} …</span>
                <span className="tiny muted">Жатқа айтып, тексеру үшін басыңыз</span>
              </button>
            ) : <div className="ar ayah-text" lang="ar" dir="rtl">{a.arabic} <span className="ayah-end">﴿{toArabicDigits(a.number)}﴾</span></div>}
            {showTr && a.translation && !hidden && <p className="ayah-tr">{a.translation}</p>}
            {a.explanation && <p className="small mt-sm" style={{ color: 'var(--text-2)' }}>{a.explanation}</p>}
            {a.key_meaning && <div className="note key mt-sm"><h4>Негізгі мағына</h4><p className="small">{a.key_meaning}</p></div>}
          </div>
        );
      })}
      {hasTr && trSource && <p className="tiny muted mt">Мағына аудармасы: {trSource} — «Құран Кәрім қазақша мағына және түсінігі». Аударма — мағынаның жуық берілуі, Құранның өзі емес. Hakk Academy ұстаздарының тексеруін күтуде.</p>}
    </div>
  );
}

export const toArabicDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
