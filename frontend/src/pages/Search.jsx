import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Search() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const nav = useNavigate();

  async function doSearch(e) {
    e.preventDefault();
    if (!q.trim()) return;
    const r = await fetch(`${import.meta.env.VITE_BACKEND_BASE || "http://127.0.0.1:8080"}/api/search?q=${encodeURIComponent(q)}&max=8`);
    const j = await r.json();
    setResults(j.results || []);
  }

  function playItem(item) {
    localStorage.setItem('lastPlay', JSON.stringify({ title: item.title, artist: item.uploader, url: item.webpage_url, thumbnail: item.thumbnails[0]?.url }));
    const recent = JSON.parse(localStorage.getItem('recentPlays') || '[]');
    recent.unshift({ title: item.title, artist: item.uploader, url: item.webpage_url, thumbnail: item.thumbnails[0]?.url });
    localStorage.setItem('recentPlays', JSON.stringify(recent.slice(0, 50)));
    nav('/player');
  }

  return (
    <div className="max-w-4xl mx-auto">
      <form onSubmit={doSearch} className="flex gap-2">
        <input value={q} onChange={(e)=>setQ(e.target.value)} className="flex-1 p-2 rounded bg-slate-800" placeholder="Search YouTube / tracks..." />
        <button className="px-4 py-2 bg-orange-500 rounded">Search</button>
      </form>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {results.map((r, idx) => (
          <div key={idx} className="bg-slate-900 p-3 rounded flex justify-between items-center">
            <div>
              <div className="font-semibold">{r.title}</div>
              <div className="text-sm text-gray-400">{r.uploader}</div>
            </div>
            <div>
              <button onClick={()=>playItem(r)} className="px-3 py-1 border rounded">Play</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
