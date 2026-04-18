// src/lib/lyrics.js
import { useModals } from '../components/ModalProvider';

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

export function addTimestamps(lyrics) {
  if (!lyrics) return '';
  if (/^\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/m.test(lyrics)) return lyrics;
  return lyrics
    .split('\n')
    .map((l, i) => `[00:00.${String(100 + i).padStart(3, '0')}] ${l}`)
    .join('\n');
}

export async function promptForManualLyrics(reload) {
  const { showPrompt } = useModals();

  const q = await showPrompt('Search manually for lyrics:');
  if (q?.trim()) reload({ flag: true, query: q.trim() });
}
