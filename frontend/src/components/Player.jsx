// src/components/Player.jsx
import { useRef } from 'react';
import { IconButton, LinearProgress } from '@mui/material';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Pause from '@mui/icons-material/Pause';
import SkipNext from '@mui/icons-material/SkipNext';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { usePlayer } from '../lib/playerContext';

export default function Player({ onOpen }) {
  const player = usePlayer();
  const touchStartY = useRef(0);

  if (!player || !player.track) return null;
  const { track, playing, toggle, next, time, duration } = player;
  
  const progress = duration ? (time / duration) * 100 : 0;

  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (diff > 50) onOpen(); // Swipe Up > 50px
  };

  return (
    <div 
      className="card"
      style={{
        position: 'fixed', bottom: 76, left: 16, right: 16,
        padding: 0, zIndex: 1200,
        background: '#151e32',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', overflow:'hidden'
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress Line */}
      <LinearProgress variant="determinate" value={progress} sx={{ height: 2, bgcolor: 'transparent', '& .MuiLinearProgress-bar': { bgcolor: 'var(--accent)' } }} />

      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 12 }}>
        {/* Cover */}
        <div style={{ width: 42, height: 42, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
          <img src={track.cover || 'https://placecats.com/neo/800/800'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        {/* Info - Click to Open */}
        <div style={{ flex: 1, overflow: 'hidden', cursor: 'pointer' }} onClick={onOpen}>
          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.95rem' }}>
            {track.title}
          </div>
          <div className="small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {track.artist}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <IconButton onClick={toggle} sx={{ color: 'white' }}>
            {playing ? <Pause /> : <PlayArrow />}
          </IconButton>
          <IconButton onClick={next} sx={{ color: 'white' }}>
            <SkipNext />
          </IconButton>
          {/* Explicit Expand Button */}
          <IconButton onClick={onOpen} sx={{ color: 'var(--text-secondary)' }}>
            <KeyboardArrowUpIcon />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

