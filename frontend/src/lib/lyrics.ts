// frontend/src/lib/lyrics.ts
export function parseLRCToArray(lrc) {
  if (!lrc) return [];
  const lines = [];
  const regex = /\[(\d+):(\d+)(?:\.(\d+))?\](.*)/g;
  for (const raw of lrc.split('\n')) {
    let matches;
    while ((matches = regex.exec(raw)) !== null) {
      const time = parseInt(matches[1], 10) * 60000 + parseInt(matches[2], 10) * 1000 + (matches[3] ? parseInt(matches[3].padEnd(3, '0'), 10) : 0);
      lines.push({
        time,
        text: raw.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim()
      });
    }
    regex.lastIndex = 0;
  }
  lines.sort((a, b) => a.time - b.time);
  if (lines.length && lines[0].time !== 0) lines.unshift({ time: 0, text: '' });
  return lines;
}

export function mergeLRC(origArr, romArr, transArr) {
  const romMap = new Map((romArr||[]).map(r => [r.time, r.text]));
  const transMap = new Map((transArr||[]).map(t => [t.time, t.text]));
  return (origArr||[]).map(o => ({
    time: o.time,
    text: o.text,
    roman: romMap.get(o.time) || '',
    trans: transMap.get(o.time) || ''
  }));
}

export function parseLRC(lrc, romLrc, translLrc) {
  return mergeLRC(parseLRCToArray(lrc), parseLRCToArray(romLrc), parseLRCToArray(translLrc));
}

export function addTimestamps(lyrics) {
  if (!lyrics || typeof lyrics !== 'string') return "";
  try {
    const timestampRegex = /^\[\d{2}:\d{2}\.\d{2,3}\]/m;
    if (timestampRegex.test(lyrics)) return lyrics;

    const lines = lyrics.split('\n');
    const header = ["PLAIN LRC MODE", ""];
    const linesWithHeader = [...header, ...lines];
    const startMs = 100;
    const result = linesWithHeader.map((line, index) => {
      const ms = startMs + index;
      const timestamp = `[00:00.${String(ms).padStart(3, '0')}]`;
      return `${timestamp} ${line}`;
    });
    return result.join('\n').trim();
  } catch (e) {
    console.error('addTimestamps error', e);
    return lyrics;
  }
}

export async function loadLyrics(title, artist, album, duration, onTransReady, manual = { flag: false, query: '' }, signal = null) {
  if (!manual.flag) {
    onTransReady([ { time: 0, text: 'Searching for lyrics...', roman: '', trans: `${title} — ${artist}` } ]);
  } else {
    onTransReady([ { time: 0, text: 'Manual search...', roman: '', trans: manual.query } ]);
  }

  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const q = encodeURIComponent([title, artist, album].join(' '));
    const url = `https://lrclib.net/api/search?q=${q}`;
    const resp = await fetch(url, { signal });
    if (!resp.ok) {
      onTransReady([ { time: 0, text: '× Failed to fetch lyrics index', roman:'', trans:'' } ]);
      return;
    }
    const candidates = await resp.json();

    let candidate = null;
    let minDelta = Infinity;
    (candidates || []).filter(c => c.syncedLyrics).forEach(c => {
      const delta = Math.abs(Number(c.duration) - duration);
      if (delta < minDelta && delta < 8000) { candidate = c; minDelta = delta; }
    });
    if (!candidate && candidates && candidates.length > 0) candidate = candidates[0];

    if (!candidate || (!candidate.syncedLyrics && !candidate.plainLyrics)) {
      onTransReady([ { time: 0, text: '× Failed to find any lyrics for this track.', roman:'', trans:'' } ]);
      return;
    }

    const rawLrc = candidate.syncedLyrics || addTimestamps(candidate.plainLyrics);
    onTransReady(parseLRC(rawLrc, '', ''));

  } catch (e) {
    console.error('loadLyrics error', e);
    if (e.name === 'AbortError') onTransReady([ { time: 0, text: 'Aborted', roman:'', trans:'' } ]);
    else onTransReady([ { time: 0, text: '× An error occurred while loading lyrics.', roman:'', trans: e.message } ]);
  }
}
