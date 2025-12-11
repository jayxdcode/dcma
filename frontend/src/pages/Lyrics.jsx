import React, { useEffect, useState } from 'react';
import { loadLyrics } from '../lib/lyrics';

export default function Lyrics() {
  const [lines, setLines] = useState([]);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');

  useEffect(() => {
    const last = JSON.parse(localStorage.getItem('lastPlay') || 'null');
    if (!last) {
      setLines([{ time: 0, text: 'No track selected', roman:'', trans:'' }]);
      return;
    }
    setTitle(last.title); setArtist(last.artist);

    const ac = new AbortController();
    loadLyrics(last.title, last.artist, last.album || '', last.duration || 180000, (parsed) => {
      setLines(parsed);
    }, { flag: false, query: '' }, ac.signal);

    return () => ac.abort();
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-slate-900 p-6 rounded min-h-[60vh]">
        <h2 className="text-xl font-bold mb-2">Lyrics — {title} — {artist}</h2>
        <div className="mt-4 space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="border-b border-slate-800 pb-2">
              <div className="text-sm text-gray-400">{new Date(l.time).toISOString().substr(14,5)}</div>
              <div className="text-lg">{l.text}</div>
              {l.roman && <div className="italic text-sm text-gray-300">{l.roman}</div>}
              {l.trans && <div className="text-sm text-gray-300">{l.trans}</div>}
            </div>
          ))}
        </div>
        <div className="mt-6">
          <button onClick={()=>window.location.reload()} className="px-3 py-1 border rounded">Reload</button>
        </div>
      </div>
    </div>
  );
}
