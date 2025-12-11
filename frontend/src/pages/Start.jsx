import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Start() {
  const nav = useNavigate();
  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-8 rounded-2xl shadow">
        <h2 className="text-3xl font-bold mb-2">Start activity</h2>
        <p className="text-muted-foreground mb-4">Welcome to YTPlayer. Click Start to continue to Home.</p>
        <div className="flex gap-3">
          <button onClick={() => nav('/home')} className="px-4 py-2 bg-orange-500 rounded">Start</button>
          <a target="_blank" rel="noreferrer" href="/player" className="px-4 py-2 border rounded">Open Player</a>
        </div>
      </div>
    </div>
  );
}
