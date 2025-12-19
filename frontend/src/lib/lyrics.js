// src/lib/lyrics.js
const APP_VERSION = '1.3-a';
const APP_USER_AGENT = `Hitori v${APP_VERSION} (https://github.com/jayxdcode/dcma)`;
const LRCLIB_HEADERS = {
  'User-Agent': APP_USER_AGENT,
  'Accept': 'application/json'
};

const BACKEND_URL = 'https://src-backend.onrender.com/api/translate';
// process.env may not be available in browser; attempt to read safely
const BACKEND_API_KEY =
  (typeof process !== 'undefined' && process.env && process.env.BACKEND_API_KEY)
    ? process.env.BACKEND_API_KEY
    : '';

/**
 * Utility types (JS version)
 *
 * LyricLine: { time: number, text: string, roman: string, trans: string }
 * TrackInfo: { title, artist, album, duration }
 * LrcLine: { time, text }
 */

export function parseLRCToArray(lrc) {
  console.debug('[lyrics] parseLRCToArray called (len:', lrc ? lrc.length : 0, ')');
  if (!lrc) return [];
  const lines = [];
  const rx = /\[(\d+):(\d+)(?:\.(\d+))?\](.*)/g;

  for (const raw of lrc.split('\n')) {
    let m;
    // reset lastIndex to ensure global regex works per-line reliably
    rx.lastIndex = 0;
    while ((m = rx.exec(raw))) {
      const time =
        +m[1] * 60000 +
        +m[2] * 1000 +
        (m[3] ? +m[3].padEnd(3, '0') : 0);

      lines.push({
        time,
        text: raw.replace(rx, '').trim()
      });
    }
  }
  lines.sort((a, b) => a.time - b.time);
  if (lines.length && lines[0].time !== 0) lines.unshift({ time: 0, text: '' });
  console.debug('[lyrics] parseLRCToArray ->', lines.length, 'lines');
  return lines;
}

export function mergeLRC(base, rom, trans) {
  const r = new Map((rom ?? []).map(l => [l.time, l.text]));
  const t = new Map((trans ?? []).map(l => [l.time, l.text]));
  return base.map(b => ({
    time: b.time,
    text: b.text,
    roman: r.get(b.time) ?? '',
    trans: t.get(b.time) ?? ''
  }));
}

export function parseLRC(base, rom, trans) {
  return mergeLRC(
    parseLRCToArray(base ?? ''),
    parseLRCToArray(rom ?? ''),
    parseLRCToArray(trans ?? '')
  );
}

export function addTimestamps(lyrics) {
  if (!lyrics) return '';
  if (/^\[\d{2}:\d{2}\.\d{2,3}\]/m.test(lyrics)) return lyrics;
  return lyrics
    .split('\n')
    .map((l, i) => `[00:00.${String(100 + i).padStart(3, '0')}] ${l}`)
    .join('\n');
}

async function fetchTranslationAndRomanization(track, lyrics, signal) {
  console.debug('[lyrics] fetchTranslationAndRomanization called for', track.title, '-', track.artist, 'lines:', lyrics.length);
  if (!BACKEND_URL) {
    console.warn('[lyrics] BACKEND_URL is empty');
    return { rom: '', transl: '' };
  }
  try {
    const r = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': BACKEND_API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lyrics: lyrics.map(l => ({ t: l.time, l: l.text })),
        ...track
      }),
      signal: signal ?? undefined
    });

    console.debug('[lyrics] translation backend response status:', r.status);
    if (!r.ok) return { rom: '', transl: '' };
    const d = await r.json();
    console.debug('[lyrics] translation backend response payload keys:', Object.keys(d || {}));
    return {
      rom: d.romanization ?? '',
      transl: d.translation ?? ''
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      console.debug('[lyrics] translation fetch aborted');
      throw e;
    }
    console.error('[lyrics] fetchTranslationAndRomanization error:', e);
    return { rom: '', transl: '' };
  }
}

export async function loadLyrics(
  title,
  artist,
  album,
  duration,
  onTransReady,
  manual = { flag: false, query: '' },
  signal = null
) {
  console.debug('[lyrics] loadLyrics called for:', { title, artist, album, duration, manual });

  // initial interim state so UI can display something quickly
  onTransReady([{
    time: 0,
    text: manual.flag ? 'Manual search...' : 'Searching for lyrics...',
    roman: '',
    trans: manual.flag ? manual.query : `${title} — ${artist}`
  }]);

  try {
    const q = encodeURIComponent([title, artist, album].join(' '));
    const searchUrl = `https://lrclib.net/api/search?q=${q}`;
    console.debug('[lyrics] searching lrclib at:', searchUrl);

    const r = await fetch(searchUrl, {
      headers: LRCLIB_HEADERS,
      signal: signal ?? undefined
    });

    console.debug('[lyrics] lrclib response status:', r.status);
    if (!r.ok) {
      console.warn('[lyrics] lrclib search returned not-ok status');
      return;
    }

    const list = await r.json();
    console.debug('[lyrics] lrclib returned list length:', Array.isArray(list) ? list.length : 'not-array');

    const chosen = list?.[0];
    if (!chosen) {
      console.debug('[lyrics] lrclib returned empty list (no results)');
      return;
    }

    console.debug('[lyrics] chosen entry:', { title: chosen.title ?? chosen.name, artist: chosen.artist });

    const raw = chosen.syncedLyrics ?? addTimestamps(chosen.plainLyrics ?? '');
    console.debug('[lyrics] raw lyrics length:', raw.length);

    const base = parseLRCToArray(raw);
    console.debug('[lyrics] parsed base lines:', base.length);
    onTransReady(mergeLRC(base, null, null));

    // Try to fetch romanization & translation (optional)
    const { rom, transl } = await fetchTranslationAndRomanization(
      { title, artist, album, duration },
      base,
      signal
    );

    console.debug('[lyrics] translation fetched lengths:', { romLen: rom?.length ?? 0, translLen: transl?.length ?? 0 });
    onTransReady(parseLRC(raw, rom, transl));
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      console.debug('[lyrics] loadLyrics aborted');
      return;
    }
    console.error('[lyrics] loadLyrics error:', e);
  }
}

export function promptForManualLyrics(reload) {
  const q = prompt('Search manually for lyrics:');
  if (q?.trim()) reload({ flag: true, query: q.trim() });
}
