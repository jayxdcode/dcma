// src/lib/lyrics.js
import hitori from '../../hitori.json' with { type: "json" };
import { useModals } from '../components/ModalProvider';

// Sorryyyyy, i cant use this as User-Agent :/
const APP_VERSION = hitori.versionName;
const APP_INFO = `Hitori v${APP_VERSION} (https://github.com/jayxdcode/dcma)`;

const isAbsolute = (url) => /^[a-z][a-z0-9+.-]*:/i.test(url);

function joinPaths(...parts) {
  const res = parts
    .map(part => part.replace(/(^\/+|\/+$)/g, '')) // Remove leading/trailing slashes
    .filter(x => x.length > 0) // Remove empty strings
    .join('/'); // Join with a single slash

  if (isAbsolute(parts[0])) {
     return res;
  } else {
     return `/${res}`;
  }
}

const rawBackend = import.meta.env.VITE_LRC_BACKEND_BASE || '';
const normalizedBackend = rawBackend && !/^[a-z][a-z0-9+.-]*:/i.test(rawBackend)
  ? `https://${rawBackend}`
  : rawBackend;
const BACKEND_URL = normalizedBackend ? new URL('/api', normalizedBackend).href : '';
console.debug("[lyrics] Backend:", BACKEND_URL);
const LRCLIB_API = 'https://lrclib.net/api';
  
// process.env may not be available in browser; attempt to read safely
const BACKEND_API_KEY =
  (typeof process !== 'undefined' && process.env && process.env.LRC_BACKEND_API_KEY)
    ? process.env.LRC_BACKEND_API_KEY
    : '';
    
/**
 * Utility types (JS version)
 *
 * LyricLine: { time: number, text: string, roman: string, trans: string }
 * TrackInfo: { title, artist, album, duration }
 * LrcLine: { time, text }
 */

export function parseLRCToArray(raw, rom = '', transl = '') {
    if (!raw) return [];
    const lines = [];
    
    // This regex is safe and won't cause infinite loops
    // It captures: [min:sec.ms] text
    const rx = /^\[(\d+):(\d+)(?:[:.](\d+))?\](.*)/gm;
    
    let m;
    while ((m = rx.exec(raw)) !== null) {
        const minutes = parseInt(m[1], 10);
        const seconds = parseInt(m[2], 10);
        const ms = m[3] ? parseInt(m[3].padEnd(3, '0').substring(0, 3), 10) : 0;
        
        const time = minutes * 60000 + seconds * 1000 + ms;
        const text = (m[4] || "").trim();

        lines.push({
            time,
            text,
            roman: "",
            trans: ""
        });
    }

    // Merge Romaji and Translation if they exist
    if (rom || transl) {
        const romLines = rom ? rom.split('\n') : [];
        const transLines = transl ? transl.split('\n') : [];
        return lines.map((l, i) => ({
            ...l,
            roman: romLines[i] || "",
            trans: transLines[i] || ""
        }));
    }

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
  if (/^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/m.test(lyrics)) return lyrics;
  return lyrics
    .split('\n')
    .map((l, i) => `[00:00.${String(100 + i).padStart(3, '0')}] ${l}`)
    .join('\n');
}

function normalizeTimedLines(source) {
  if (!source) return [];
  if (typeof source === 'string') {
    return parseLRCToArray(source);
  }

  if (Array.isArray(source)) {
    return source.flatMap((item) => {
      if (!item) return [];
      const time = item.time ?? item.t ?? item.start ?? item.timestamp;
      const text = item.text ?? item.lyric ?? item.l ?? item.line ?? '';
      if (time == null) return [];
      return [{ time: Math.round(Number(time) || 0), text: String(text || '').trim() }];
    });
  }

  if (typeof source === 'object' && source.time != null) {
    return [{ time: Math.round(Number(source.time) || 0), text: String(source.text ?? source.lyric ?? source.l ?? '').trim() }];
  }

  return [];
}

function normalizePlainLyrics(source) {
  if (!source) return '';
  if (Array.isArray(source)) {
    return source
      .map(item => (typeof item === 'string' ? item : item?.text ?? item?.lyric ?? ''))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof source === 'object') {
    return String(source.text ?? source.lyric ?? source?.lyrics ?? '');
  }
  return String(source);
}

function parseTranslationPayload(value, baseLines) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        const text = typeof item === 'string'
          ? item
          : item?.text ?? item?.lyric ?? item?.line ?? item?.trans ?? '';
        return {
          time: baseLines?.[index]?.time ?? 0,
          text: String(text || '').trim()
        };
      })
      .filter(line => line.text);
  }

  if (typeof value === 'string') {
    if (/^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/m.test(value)) {
      return parseLRCToArray(value);
    }
    return String(value)
      .split(/\r?\n/)
      .map((line, index) => ({ time: baseLines?.[index]?.time ?? 0, text: line.trim() }))
      .filter(line => line.text);
  }

  if (typeof value === 'object') {
    return parseTranslationPayload(value.text ?? value.lyric ?? value?.lyrics ?? value?.translation ?? '', baseLines);
  }

  return [];
}

function getTranslationBaseUrl() {
  return BACKEND_URL || LRCLIB_API;
}

async function fetchTranslationAndRomanization(track, lyrics, signal) {
  console.debug('[lyrics] fetchTranslationAndRomanization called for', track.title, '-', track.artist, 'lines:', lyrics.length);
  const baseUrl = getTranslationBaseUrl();
  if (!baseUrl) {
    console.warn('[lyrics] no translation endpoint configured');
    return { rom: '', transl: '' };
  }

  try {
    const u = joinPaths(baseUrl, 'translate');
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), 5000);
    const combinedController = new AbortController();

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onSignalAbort);
      }
    };

    const onSignalAbort = () => combinedController.abort();
    if (signal && typeof signal.addEventListener === 'function') {
      if (signal.aborted) {
        combinedController.abort();
      } else {
        signal.addEventListener('abort', onSignalAbort);
      }
    }
    timeoutController.signal.addEventListener('abort', () => combinedController.abort());

    const r = await fetch(u, {
      method: 'POST',
      headers: {
        'X-API-Key': BACKEND_API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lyrics: lyrics.map(l => ({ t: l.time, l: l.text })),
        ...track
      }),
      signal: combinedController.signal
    });
    cleanup();

    console.debug('[lyrics] translation response status:', r.status);
    if (!r.ok) {
      console.warn('[lyrics] translation request returned status:', r.status);
      return { rom: '', transl: '' };
    }

    const d = await r.json();
    return {
      rom: d.romanization ?? d.roman ?? d.rom ?? d.romanized ?? '',
      transl: d.translation ?? d.trans ?? d.transl ?? d.translated ?? ''
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      console.debug('[lyrics] translation fetch aborted or timed out');
      return { rom: '', transl: '' };
    }
    console.error('[lyrics] fetchTranslationAndRomanization error:', e);
    return { rom: '', transl: '' };
  }
}

export async function promptForManualLyrics(reload) {
  const { showPrompt } = useModals();

  const q = await showPrompt('Search manually for lyrics:');
  if (q?.trim()) reload({ flag: true, query: q.trim() });
}
