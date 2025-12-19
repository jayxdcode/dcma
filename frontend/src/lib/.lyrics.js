// src/lib/lyrics.js
/**
 * Basic lyrics loader & parser.
 * - parseLRC: returns [{ time, text, roman, trans }]
 * - loadLyrics(trackOrId): returns Promise<lines[]>
 *
 * Behavior:
 * - tries to fetch /api/lyrics?trackId=<id> (assumes JSON { syncedLyrics, plainLyrics, roman, trans } )
 * - falls back to localStorage stored lyrics (key: lyrics_<id>)
 * - if syncedLyrics present, parse it.
 * - if plainLyrics present, returns single-line or attempt to add timestamps (best-effort: put single line at time 0).
 */
const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE || "";

export function parseLRC(lrcRaw) {
  if (!lrcRaw) return [];
  const lines = [];
  // match patterns like [mm:ss.xx] or [mm:ss] (multiple timestamps possible on same line)
  const regex = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;
  for (const rawLine of lrcRaw.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    // collect all timestamps
    let times = [];
    let m;
    while ((m = regex.exec(rawLine)) !== null) {
      const mm = parseInt(m[1], 10);
      const ss = parseInt(m[2], 10);
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
      const tMs = mm * 60 + ss + ms / 1000;
      times.push(tMs);
    }
    // extract text without timestamps
    const text = rawLine.replace(regex, '').trim();
    if (times.length === 0) {
      // no timestamp -> push as plain (time 0)
      lines.push({ time: 0, text, roman: '', trans: '' });
    } else {
      for (const t of times) {
        // optionally parse roman/trans using a separator (we support " || " or " | " after main text)
        let main = text;
        let roman = '';
        let trans = '';
        if (main.includes('||')) {
          const parts = main.split('||').map(s => s.trim());
          main = parts[0] || '';
          roman = parts[1] || '';
          trans = parts[2] || '';
        } else if (main.split('|').length >= 2) {
          const parts = main.split('|').map(s => s.trim());
          main = parts[0] || '';
          roman = parts[1] || '';
          trans = parts[2] || '';
        }
        lines.push({ time: Math.round(t), text: main, roman, trans });
      }
    }
    regex.lastIndex = 0;
  }

  // sort by time
  lines.sort((a,b) => a.time - b.time);
  // deduplicate empty lines
  return lines;
}

export async function loadLyrics(trackOrId, { signal } = {}) {
  // determine id
  const trackId = (typeof trackOrId === 'string') ? trackOrId : (trackOrId && trackOrId.id) || null;
  try {
    // try fetching from API (if backend serves lyrics)
    if (trackId) {
      const url = `${BACKEND_BASE}/api/lyrics?trackId=${encodeURIComponent(trackId)}`;
      try {
        const res = await fetch(url, { signal });
        if (res && res.ok) {
          const json = await res.json();
          // Expect: { syncedLyrics: "...", plainLyrics: "...", roman: "...", trans: "..." }
          const candidate = json;
          if (candidate?.syncedLyrics) {
            return parseLRC(candidate.syncedLyrics);
          }
          if (candidate?.plainLyrics) {
            // fallback: return each line as un-timestamped (time=0)
            const lines = candidate.plainLyrics.split(/\r?\n/).map(t => ({ time: 0, text: t.trim(), roman: '', trans: '' })).filter(l => l.text);
            if (lines.length) return lines;
          }
        }
      } catch (e) {
        // network error -> fallback to localStorage below
        // console.warn('lyrics fetch failed', e);
      }
    }

    // fallback: localStorage stored lyrics for offline dev
    if (trackId) {
      try {
        const key = 'lyrics_' + trackId;
        const stored = localStorage.getItem(key);
        if (stored) {
          // stored expected to be raw LRC or JSON { syncedLyrics }
          try {
            const parsed = JSON.parse(stored);
            if (parsed?.syncedLyrics) return parseLRC(parsed.syncedLyrics);
            if (parsed?.plainLyrics) return parsed.plainLyrics.split(/\r?\n/).map(t => ({ time:0, text:t.trim(), roman:'', trans:''}));
          } catch(e){
            // not JSON -> treat as raw LRC
            return parseLRC(stored);
          }
        }
      } catch(e){}
    }

    // last fallback: if localStorage.lastPlay has a 'lyrics' property
    try {
      const last = JSON.parse(localStorage.getItem('lastPlay') || 'null');
      if (last && last.lyrics) {
        return parseLRC(last.lyrics);
      }
    } catch(e){}

    // no lyrics -> return a message line
    return [{ time: 0, text: '× Failed to find any lyrics for this track.', roman:'', trans:'' }];
  } catch (err) {
    if (err.name === 'AbortError') return [{ time: 0, text: 'Aborted', roman:'', trans:'' }];
    return [{ time: 0, text: `× Error loading lyrics — ${String(err.message || err)}`, roman:'', trans:'' }];
  }
}
