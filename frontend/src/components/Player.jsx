// src/components/Player.jsx
import { useRef, useState, Suspense, lazy, useEffect } from 'react';
import { IconButton, LinearProgress } from '@mui/material';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Pause from '@mui/icons-material/Pause';
import SkipNext from '@mui/icons-material/SkipNext';
import SkipPrevious from '@mui/icons-material/SkipPrevious';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CircularProgress from '@mui/material/CircularProgress';
import WarningIcon from '@mui/icons-material/Warning';
import { usePlayer } from '../context/PlayerContext';
import PlayerFull from '../pages/PlayerFull';

export default function Player() {
  const player = usePlayer();
  const [open, setOpen] = useState(false);
  const touchStartY = useRef(0);

  if (!player || !player.track) return null;
  const { track, playing, toggle, next, time, duration, isLoading, playerError, performRetry, retryTimeRemaining } = player;
  
  const progress = duration ? (time / duration) * 100 : 0;

  const handleTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (diff > 50) setOpen(true);
  };

  const getPlayPauseButton = () => {
    if (playerError) {
      return (
        <IconButton 
          onClick={() => performRetry(playerError.currentTime)} 
          sx={{ color: '#ff6b6b' }}
          title={`Error: ${playerError.message}. Click to retry immediately.`}
        >
          <WarningIcon />
        </IconButton>
      );
    }
    if (isLoading) {
      return (
        <IconButton sx={{ color: 'white' }} disabled>
          <CircularProgress size={24} sx={{ color: 'white' }} />
        </IconButton>
      );
    }
    return (
      <IconButton onClick={toggle} sx={{ color: 'white' }}>
        {playing ? <Pause /> : <PlayArrow />}
      </IconButton>
    );
  };

  return (
    <>
      <div 
        className="card"
        style={{
          position: 'fixed', bottom: 76, left: 16, right: 16,
          padding: 0, zIndex: 1500,
          background: '#151e32',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', overflow:'hidden',
          border: playerError ? '2px solid #ff6b6b' : 'none'
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Progress Line */}
        <LinearProgress 
          variant="determinate" 
          value={progress} 
          sx={{ 
            height: 2, 
            bgcolor: 'transparent', 
            '& .MuiLinearProgress-bar': { 
              bgcolor: playerError ? '#ff6b6b' : 'var(--accent)' 
            } 
          }} 
        />

        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 12 }}>
          {/* Cover */}
          <div style={{ width: 42, height: 42, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
            <img src={track.cover || 'https://placecats.com/neo/800/800'} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>

          {/* Info - Click to Open */}
          <div style={{ flex: 1, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setOpen(true)}>
            <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.95rem' }}>
              {track.title}
            </div>
            <div className="small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: playerError ? '#ff6b6b' : 'inherit' }}>
              {playerError ? `Error: ${playerError.message}` : track.artist}
            </div>
            {retryTimeRemaining > 0 && (
              <div className="small" style={{ color: '#ffb347', marginTop: '2px' }}>
                Retrying in {retryTimeRemaining}s
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <IconButton onClick={player.prev} sx={{ color: 'white' }}>
              <SkipPrevious />
            </IconButton>
            {getPlayPauseButton()}
            <IconButton onClick={next} sx={{ color: 'white' }}>
              <SkipNext />
            </IconButton>
            {/* Explicit Expand Button */}
            <IconButton onClick={() => setOpen(true)} sx={{ color: 'var(--text-secondary)' }}>
              <KeyboardArrowUpIcon />
            </IconButton>
          </div>
        </div>
      </div>
      
      {/* PlayerFull always mounted but kept off-screen to preserve iframe */}
      <PlayerFull open={open} onClose={() => setOpen(false)} />
    </>
  );
}

