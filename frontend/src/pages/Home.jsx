import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const [recent, setRecent] = useState([]);
  const nav = useNavigate();

  useEffect(() => {
    const h = JSON.parse(localStorage.getItem('recentPlays') || '[]');
    setRecent(h);
  }, []);

  function clearRecent() {
    localStorage.removeItem('recentPlays');
    setRecent([]);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <section className="bg-slate-900 p-4 rounded">
        <h3 className="text-lg font-semibold">Recommendations</h3>
        <p className="text-sm text-gray-300">Suggesting country-aware picks (placeholder)</p>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="p-3 bg-slate-800 rounded">Top Track 1</div>
          <div className="p-3 bg-slate-800 rounded">Top Track 2</div>
          <div className="p-3 bg-slate-800 rounded">Top Track 3</div>
        </div>
      </section>

      <section className="bg-slate-900 p-4 rounded">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent Plays</h3>
          <button onClick={clearRecent} className="text-sm px-2 py-1 border rounded">Clear</button>
        </div>

        <ul className="mt-3 space-y-2">
          {recent.length === 0 && <li className="text-sm text-gray-400">No recent plays</li>}
          {recent.map((r, i) => (
            <li key={i} className="flex items-center justify-between bg-slate-800 p-2 rounded">
              <div>
                <div className="font-medium">{r.title}</div>
                <div className="text-sm text-gray-400">{r.artist}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { localStorage.setItem('lastPlay', JSON.stringify(r)); nav('/player'); }} className="px-3 py-1 border rounded">Play</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
