// src/pages/Lyrics.jsx
import React from 'react';
import { usePlayer } from '../lib/playerContext';
import { Link } from 'react-router-dom';

export default function LyricsPage(){
  const player = usePlayer();
  const track = player?.track || JSON.parse(localStorage.getItem('lastPlay') || 'null');

  return (
    <div>
      <h2 className="page-title">Lyrics (Quick)</h2>
      <div className="card">
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <div style={{ width:72, height:72, borderRadius:8, overflow:'hidden' }}>
            <img src={track?.cover || 'https://placecats.com/neo/300/300'} alt="cover" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          </div>
          <div>
            <div style={{ fontWeight:700 }}>{track?.title}</div>
            <div className="small">{track?.artist}</div>
            <div style={{ marginTop:8 }}>
              <Link to="/player"><button className="btn-accent">Open Full Player</button></Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
