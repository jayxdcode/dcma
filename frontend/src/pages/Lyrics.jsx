// src/pages/Lyrics.jsx
import React, { useState, useCallback } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { Link } from 'react-router-dom';
import LyricsDisplay from '../components/LyricsDisplay';

const ProgressLog = ({ logs }) => (
  <div style={{ 
    maxHeight: '200px', 
    overflowY: 'auto', 
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    backgroundColor: '#1a1a1a',
    borderRadius: '6px',
    padding: '8px',
    marginTop: '12px'
  }}>
    {logs.length === 0 ? (
      <div style={{ color: 'rgba(255,255,255,0.5)' }}>No progress logged yet...</div>
    ) : (
      logs.map((log, i) => (
        <div key={i} style={{ color: log.type === 'error' ? '#ff6b6b' : log.type === 'success' ? '#51cf66' : 'rgba(255,255,255,0.7)', marginBottom: '4px' }}>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>[{new Date(log.time).toLocaleTimeString()}]</span> {log.message}
        </div>
      ))
    )}
  </div>
);

const AdvancedMenu = ({ track, onSearch, searching }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [title, setTitle] = useState(track?.title || '');
  const [artist, setArtist] = useState(track?.artist || '');
  const [album, setAlbum] = useState(track?.album || '');
  const [duration, setDuration] = useState(track?.duration || '');
  const [customQuery, setCustomQuery] = useState('');

  const handleSearch = () => {
    onSearch({ 
      title: title || track?.title, 
      artist: artist || track?.artist,
      album,
      duration: parseFloat(duration) || 0,
      customQuery: customQuery.trim() || ''
    });
  };

  return (
    <div>
      <button 
        onClick={() => setShowAdvanced(!showAdvanced)}
        style={{
          background: showAdvanced ? '#365cf7' : 'rgba(54, 92, 247, 0.5)',
          color: '#fff',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '0.9rem',
          marginTop: '12px'
        }}
      >
        {showAdvanced ? '▼' : '▶'} Advanced Menu
      </button>

      {showAdvanced && (
        <div style={{
          marginTop: '12px',
          padding: '16px',
          backgroundColor: 'rgba(54, 92, 247, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(54, 92, 247, 0.3)'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px', color: 'rgba(255,255,255,0.7)' }}>Title</label>
            <input 
              type="text" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(54, 92, 247, 0.5)', backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px', color: 'rgba(255,255,255,0.7)' }}>Artist</label>
            <input 
              type="text" 
              value={artist} 
              onChange={(e) => setArtist(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(54, 92, 247, 0.5)', backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px', color: 'rgba(255,255,255,0.7)' }}>Album</label>
            <input 
              type="text" 
              value={album} 
              onChange={(e) => setAlbum(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(54, 92, 247, 0.5)', backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px', color: 'rgba(255,255,255,0.7)' }}>Duration (seconds)</label>
            <input 
              type="number" 
              value={duration} 
              onChange={(e) => setDuration(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(54, 92, 247, 0.5)', backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px', color: 'rgba(255,255,255,0.7)' }}>Custom Query (overrides metadata)</label>
            <input 
              type="text" 
              value={customQuery} 
              onChange={(e) => setCustomQuery(e.target.value)}
              placeholder="Leave empty to use metadata above"
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid rgba(54, 92, 247, 0.5)', backgroundColor: 'rgba(0,0,0,0.3)', color: '#fff', boxSizing: 'border-box' }}
            />
          </div>
          <button 
            onClick={handleSearch}
            disabled={searching}
            style={{
              background: searching ? 'rgba(54, 92, 247, 0.3)' : '#365cf7',
              color: '#fff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: searching ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              width: '100%',
              fontWeight: 600
            }}
          >
            {searching ? 'Searching...' : 'Search Lyrics'}
          </button>
        </div>
      )}
    </div>
  );
};

export default function LyricsPage(){
  const player = usePlayer();
  const track = player?.track || JSON.parse(localStorage.getItem('lastPlay') || 'null');
  const [fullScreen, setFullScreen] = useState(false);
  const [progressLogs, setProgressLogs] = useState([]);
  const [searching, setSearching] = useState(false);
  const [manualMetadata, setManualMetadata] = useState(null);

  const addLog = useCallback((message, type = 'info') => {
    setProgressLogs(prev => [...prev, { message, type, time: Date.now() }]);
  }, []);

  const handleAdvancedSearch = useCallback((metadata) => {
    setSearching(true);
    setManualMetadata(metadata);
    setProgressLogs([]);
    addLog(`Starting search for: ${metadata.customQuery || `${metadata.title} - ${metadata.artist}`}`, 'info');
  }, [addLog]);

  if (!track) {
    return (
      <div>
        <h2 className="page-title">Lyrics</h2>
        <div className="card">
          <div style={{ color: 'rgba(255,255,255,0.5)' }}>No track loaded. Open a track in the player first.</div>
        </div>
      </div>
    );
  }

  if (fullScreen) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#0a0a0a',
        zIndex: 9999,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: '16px',
          backgroundColor: 'rgba(0,0,0,0.5)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.3rem' }}>{track?.title || 'No Title'}</div>
            <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)' }}>{track?.artist || 'Unknown Artist'}</div>
          </div>
          <button
            onClick={() => setFullScreen(false)}
            style={{
              background: '#365cf7',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Exit Full Screen
          </button>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <LyricsDisplay track={track} player={player} onProgressUpdate={addLog} manualMetadata={manualMetadata} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="page-title">Lyrics</h2>
      <div className="card">
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <div style={{ width:72, height:72, borderRadius:8, overflow:'hidden' }}>
            <img src={track?.cover || 'https://placecats.com/neo/300/300'} alt="cover" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight:700 }}>{track?.title}</div>
            <div className="small">{track?.artist}</div>
            <div style={{ marginTop:8, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button 
                onClick={() => setFullScreen(true)}
                className="btn-accent"
                style={{ cursor: 'pointer' }}
              >
                Full Screen Lyrics
              </button>
              <Link to="/player"><button className="btn-accent">Open Full Player</button></Link>
            </div>
          </div>
        </div>
      </div>

      <AdvancedMenu track={track} onSearch={handleAdvancedSearch} searching={searching} />

      <div className="card" style={{ marginTop: '16px' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '1rem' }}>Lyrics Viewer</h3>
        <LyricsDisplay 
          track={track} 
          player={player}
          onProgressUpdate={addLog}
          onSearchComplete={() => setSearching(false)}
          manualMetadata={manualMetadata}
        />
      </div>

      {progressLogs.length > 0 && (
        <div className="card" style={{ marginTop: '16px' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '1rem' }}>Debug Progress Log</h3>
          <ProgressLog logs={progressLogs} />
          <button 
            onClick={() => setProgressLogs([])}
            style={{
              marginTop: '12px',
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.2)',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            Clear Log
          </button>
        </div>
      )}
    </div>
  );
}
