// src/pages/PlayerFull.jsx
import { useEffect, useMemo, useState, useRef } from 'react';
import { usePlayer } from '../lib/playerContext';
// explicit .js import (lyrics.js converted)
import { loadLyrics } from '../lib/lyrics.js';
import { IconButton, Slider, Tabs, Tab, useMediaQuery, Box } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import PlayCircleIcon from '@mui/icons-material/PlayCircleFilledWhite';
import PauseCircleIcon from '@mui/icons-material/PauseCircleFilled';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import RepeatIcon from '@mui/icons-material/Repeat';

const fmtTime = (s) => {
  if (isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
};

export default function PlayerFull({ open, onClose }) {
  const player = usePlayer();
  const track = player?.track;
  const isDesktop = useMediaQuery('(min-width:900px)');

  const [lines, setLines] = useState([]);
  const [tabValue, setTabValue] = useState(0); // 0: Up Next, 1: Lyrics, 2: Related
  const [seeking, setSeeking] = useState(false);
  const [seekVal, setSeekVal] = useState(0);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);

  // Gesture refs
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);

  // DEBUG 
  useEffect(()=> {
    console.debug('[PlayerFull] track keys:', Object.keys(track || {}), track);
  }, [track]);

  // Load Lyrics — depend on the metadata used for searching
  useEffect(() => {
    if (!track?.title || !track?.artist) {
      console.debug('[PlayerFull] loadLyrics skipped — missing track title/artist', track);
      return;
    }
    console.debug('[PlayerFull] calling loadLyrics for', track.title, '-', track.artist);
    let ac = new AbortController();
    setLines([]);

    loadLyrics(
      track.title,
      track.artist,
      track.album || '',
      player.duration || 0,
      (parsed) => {
        console.debug('[PlayerFull] loadLyrics callback — lines:', Array.isArray(parsed) ? parsed.length : parsed);
        setLines(parsed);
      },
      { flag: false, query: '' },
      ac.signal
    );

    return () => {
      console.debug('[PlayerFull] aborting lyrics fetch for', track.title);
      ac.abort();
    };
  }, [track?.title, track?.artist, track?.album, player?.duration]);

  const activeLineIndex = useMemo(() => {
    if (player?.time == null || !lines.length) return 0; // allow time === 0
    const t = player.time * 1000; // player.time is seconds, lyrics are ms
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= t) idx = i;
      else break;
    }
    return idx;
  }, [player?.time, lines]);

  const handleSeekChange = (_, val) => { setSeeking(true); setSeekVal(val); };
  const handleSeekCommit = (_, val) => { setSeeking(false); player.seek(val); };
  const currentTime = seeking ? seekVal : (player?.time || 0);
  const duration = player?.duration || 1;

  // Gestures
  const onTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e) => {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dx = e.changedTouches[0].clientX - touchStartX.current;

    // Swipe Down to Close (only if bottom sheet is closed)
    if (!bottomSheetOpen && dy > 100 && Math.abs(dx) < 50) {
      onClose();
      return;
    }

    // Swipe Horizontal for Tracks (only on top section)
    if (Math.abs(dx) > 80 && Math.abs(dy) < 60) {
      if (dx > 0) player.prev();
      else player.next();
    }
  };

  if (!track) return null;

  return (
    <div className={`fs-player ${open ? 'open' : ''}`} style={{ background: '#071029' }}>

      {/* --- TOP SECTION (Controls + Art) --- */}
      <div
        style={{
          height: bottomSheetOpen ? '15%' : '100%',
          transition: 'all 0.3s ease',
          display: 'flex', flexDirection: 'column',
          padding: '20px 24px 140px',
          opacity: bottomSheetOpen ? 0.3 : 1
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Header */}
        <div className="h-stack" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
          <IconButton onClick={onClose} sx={{ color: 'white' }}><KeyboardArrowDownIcon fontSize="large" /></IconButton>
          <div className="small" style={{ letterSpacing: 1 }}>PLAYING FROM HITORI</div>
          <div style={{ width: 40 }} />
        </div>

        {/* Cover Art */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          <div style={{
            aspectRatio: '1/1', width: '100%', maxHeight: '45vh',
            borderRadius: 12, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.6)'
          }}>
            <img src={track.cover || 'https://placecats.com/neo/800/800'} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          </div>
        </div>

        {/* Info + Seek + Controls */}
        <div style={{ marginTop: 30 }}>
           <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
             <div style={{ overflow:'hidden' }}>
               <div style={{ fontSize:'1.5rem', fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{track.title}</div>
               <div style={{ fontSize:'1.1rem', color:'rgba(255,255,255,0.7)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{track.artist}</div>
             </div>
             {/* Add Like/Add button here if needed */}
           </div>

           <div style={{ marginTop: 20 }}>
             <Slider
                size="small" value={currentTime} max={duration}
                onChange={handleSeekChange} onChangeCommitted={handleSeekCommit}
                sx={{ color: '#fff', height: 4, '& .MuiSlider-thumb': { width: 12, height: 12 } }}
             />
             <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', color:'rgba(255,255,255,0.6)', marginTop:-6 }}>
               <span>{fmtTime(currentTime)}</span>
               <span>{fmtTime(duration)}</span>
             </div>
           </div>

           <div style={{ display:'flex', justifyContent:'space-around', alignItems:'center', marginTop: 10 }}>
             <IconButton size="large" sx={{ color: 'rgba(255,255,255,0.6)' }}><ShuffleIcon /></IconButton>
             <IconButton onClick={player.prev} size="large" sx={{ color: 'white' }}><SkipPreviousIcon sx={{ fontSize: 40 }} /></IconButton>
             <IconButton onClick={player.toggle} sx={{ color: 'white', p:0 }}>
               {player.playing ? <PauseCircleIcon sx={{ fontSize: 75 }} /> : <PlayCircleIcon sx={{ fontSize: 75 }} />}
             </IconButton>
             <IconButton onClick={player.next} size="large" sx={{ color: 'white' }}><SkipNextIcon sx={{ fontSize: 40 }} /></IconButton>
             <IconButton size="large" sx={{ color: 'rgba(255,255,255,0.6)' }}><RepeatIcon /></IconButton>
           </div>
        </div>
      </div>

      {/* --- BOTTOM SHEET (Nav Group) --- */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: bottomSheetOpen ? '100%' : '80px',
        transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        zIndex: 10,
        borderRadius: bottomSheetOpen ? 0 : '24px 24px 0 0',
      }}>
        {/* Background Blur Layer */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${track.cover})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(40px) brightness(0.4)',
          zIndex: -1
        }} />

        {/* Content Container */}
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

          {/* Tabs Header - Always Visible (or acts as handle) */}
          <div
            onClick={() => setBottomSheetOpen(!bottomSheetOpen)}
            style={{
              height: 80, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', borderBottom: bottomSheetOpen ? '1px solid rgba(255,255,255,0.1)' : 'none'
            }}
          >
             <Tabs
               value={tabValue}
               onChange={(e, v) => { e.stopPropagation(); setTabValue(v); setBottomSheetOpen(true); }}
               centered
               sx={{
                 '& .MuiTab-root': { color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: 600, minWidth: 80 },
                 '& .Mui-selected': { color: '#fff' },
                 '& .MuiTabs-indicator': { backgroundColor: '#fff' }
               }}
             >
               <Tab label="UP NEXT" />
               <Tab label="LYRICS" />
               <Tab label="RELATED" />
             </Tabs>
          </div>

          {/* Expanded Content Area */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '20px',
            opacity: bottomSheetOpen ? 1 : 0,
            transition: 'opacity 0.2s'
          }}>
            {/* LYRICS TAB */}
            {tabValue === 1 && (
              <div style={{ textAlign: 'center', paddingBottom: 100 }}>
                {lines.length > 0 ? lines.map((l, i) => (
                  <div key={i}
                    onClick={() => { player.seek(l.time/1000); }}
                    style={{
                      padding: '12px 0',
                      fontSize: i === activeLineIndex ? '1.5rem' : '1.1rem',
                      fontWeight: i === activeLineIndex ? 800 : 500,
                      color: i === activeLineIndex ? '#fff' : 'rgba(255,255,255,0.4)',
                      transform: i === activeLineIndex ? 'scale(1.05)' : 'scale(1)',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer'
                    }}>
                    {l.text}
                    {l.trans && <div style={{ fontSize: '0.7em', fontWeight: 400, marginTop: 4 }}>{l.trans}</div>}
                  </div>
                )) : (
                  <div className="small">Lyrics not available</div>
                )}
              </div>
            )}

            {/* UP NEXT TAB */}
            {tabValue === 0 && (
              <div className="v-stack">
                 <div className="small" style={{ fontWeight: 700 }}>Now Playing</div>
                 <div className="card" style={{ background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 12, border: 0 }}>
                   <img src={track.cover} style={{ width: 48, height: 48, borderRadius: 4 }} alt="" />
                   <div>
                     <div style={{ fontWeight: 700 }}>{track.title}</div>
                     <div className="small">{track.artist}</div>
                   </div>
                 </div>

                 <div className="small" style={{ fontWeight: 700, marginTop: 20 }}>Up Next</div>
                 {player.queue.slice(player.index + 1).map((q, i) => (
                   <div key={i} className="h-stack" style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                     <div style={{ color: 'rgba(255,255,255,0.5)', width: 20 }}>{i+1}</div>
                     <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{q.title}</div>
                        <div className="small">{q.artist}</div>
                     </div>
                     <div className="small">{fmtTime(q.duration)}</div>
                   </div>
                 ))}
                 {player.queue.length <= player.index + 1 && <div className="small" style={{ opacity: 0.5 }}>End of queue</div>}
              </div>
            )}

            {/* RELATED TAB */}
            {tabValue === 2 && <div className="small" style={{ textAlign: 'center', marginTop: 50 }}>No related tracks found.</div>}

          </div>
        </div>
      </div>
    </div>
  );
}
