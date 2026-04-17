// src/pages/PlayerFull.jsx
import { useEffect, useMemo, useState, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { useModals } from '../components/ModalProvider';
// explicit .js import (lyrics.js converted)
import { IconButton, Slider, Tabs, Tab, useMediaQuery, Box, Menu, MenuItem, FormControlLabel, Switch } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import PlayCircleIcon from '@mui/icons-material/PlayCircleFilledWhite';
import PauseCircleIcon from '@mui/icons-material/PauseCircleFilled';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import RepeatIcon from '@mui/icons-material/Repeat';
import VideocamIcon from '@mui/icons-material/VideocamOutlined';
import VideocamOffIcon from '@mui/icons-material/VideocamOffOutlined';
import MoreVert from '@mui/icons-material/MoreVert';
import ReplayCircleIcon from '@mui/icons-material/ReplayCircleFilled';
import CircularProgress from '@mui/material/CircularProgress';
import WarningIcon from '@mui/icons-material/Warning';

import { LyricsProvider } from '../context/LyricsContext';
import LyricsDisplay from '../components/LyricsDisplay';

import { related as pipedRelated } from '../lib/piped-api.js';
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
  const { showAlert } = useModals();

  const [tabValue, setTabValue] = useState(0); // 0: Up Next, 1: Lyrics, 2: Related
  const [seeking, setSeeking] = useState(false);
  const [seekVal, setSeekVal] = useState(0);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [showIframe, setShowIframe] = useState(false); // Toggle between cover and iframe
  const [relatedTracks, setRelatedTracks] = useState([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuTarget, setMenuTarget] = useState(null);
  const [coverAspectRatio, setCoverAspectRatio] = useState(1); // Default aspect ratio

  // Gesture refs
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const iframeContainerRef = useRef(null);

  // Handle iframe display toggle - overlay approach
  // Initialize YouTube player once container is ready
  useEffect(() => {
    const playerCore = document.querySelector('#hitori-player-core');
    const displayContainer = iframeContainerRef.current;

    if (!displayContainer) return;

    // Initialize YouTube player if not already done
    if (!playerCore && player?.initializeYouTubePlayer) {
      player.initializeYouTubePlayer(displayContainer);
      return;
    }

    // If player already exists, move it to this container if needed
    if (playerCore && playerCore.parentNode !== displayContainer) {
      displayContainer.appendChild(playerCore);
    }
    
    if (playerCore) {
      playerCore.style.display = 'block';
      playerCore.style.width = '100%';
      playerCore.style.height = '100%';
      playerCore.style.pointerEvents = showIframe ? 'auto' : 'none';
    }
  }, [showIframe, player]);

  useEffect(() => {
    const playerCore = document.querySelector('#hitori-player-core');
    if (!playerCore) return;
    playerCore.style.pointerEvents = showIframe ? 'auto' : 'none';
  }, [showIframe]);

  // Load related tracks when track changes
  useEffect(() => {
    if (!track?.id) {
      setRelatedTracks([]);
      return;
    }
    setLoadingRelated(true);
    pipedRelated(track.id, { rawItem: track })
      .then(result => {
        setRelatedTracks(result.related || []);
      })
      .catch(err => {
        console.warn('Failed to load related tracks:', err);
        setRelatedTracks([]);
      })
      .finally(() => setLoadingRelated(false));
  }, [track?.id]);

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

    // Swipe Horizontal for Tracks (only on top section
    if (Math.abs(dx) > 80 && Math.abs(dy) < 60) {
      if (dx > 0) player.prev();
      else player.next();
    }
  };

  // Menu handlers
  const openMenu = (e, relatedTrack) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuTarget(relatedTrack);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuTarget(null);
  };

  const handleMenuAddToQueue = () => {
    if (menuTarget && player) {
      player.enqueue(menuTarget, false);
      closeMenu();
      showAlert?.('Added to queue', 'success');
    }
  };

  const handleMenuAddNext = () => {
    if (menuTarget && player) {
      player.enqueue(menuTarget, true);
      closeMenu();
      showAlert?.('Added next', 'success');
    }
  };

  const handleMenuOpenInPlayer = () => {
    if (menuTarget && player) {
      player.playTrack?.(menuTarget, { openPlayer: true });
      closeMenu();
    }
  };

  if (!track) return null;

  const handleImageLoad = (event) => {
    const { naturalWidth, naturalHeight } = event.target;
    // Calculate aspect ratio: width / height
    const ratio = naturalWidth / naturalHeight;
    setCoverAspectRatio(ratio);
    console.log("Aspect Ratio:", ratio);
  };

  return (
    <div
      className={`fs-player ${open ? 'open' : ''}`}
      style={{
        background: '#071029',
        position: 'fixed',
        inset: 0,
        zIndex: 1600,
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.35s ease, opacity 0.35s ease',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
      }}
    >

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
          <IconButton onClick={() => setShowIframe(!showIframe)} sx={{ color: 'white' }}>
            {showIframe ? <VideocamIcon fontSize="large" /> : <VideocamOffIcon fontSize="large" />}
          </IconButton>
        </div>

        {/* Cover Art / Iframe Toggle */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          <div style={{
            width: '100%', height: '100%', maxHeight: '45vh',
            borderRadius: 12, overflow: 'hidden', boxShadow: showIframe ? '0 12px 40px rgba(0,0,0,0.6)' : 'none',
            position: 'relative'
          }}>
            {/* Iframe always present */}
            <div
              ref={iframeContainerRef}
              id="iframe-display-container"
              style={{
                aspectRatio: '16/9',
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                borderRadius: 12,
                overflow: 'hidden',
                opacity: showIframe ? 1 : 0
              }}
            />
            {/* Cover Image Overlay */}
            <div
              style={{
                width: 'auto',
                height: '100%',
                aspectRatio: coverAspectRatio,
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                margin: '0 auto',
                boxShadow: showIframe ? 'none' : '0 12px 40px rgba(0,0,0,0.6)',
                opacity: showIframe ? 0 : 1,
                transition: 'opacity 0.3s ease',
                pointerEvents: showIframe ? 'none' : 'auto',
              }}
            >
              <img
                src={track.cover || 'https://placecats.com/neo/800/800'}
                alt=""
                onLoad={handleImageLoad}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  borderRadius: 12,
                }}
              />
            </div>
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
             <IconButton 
               onClick={() => {
                 if (player?.playerError) {
                   showAlert?.(
                     `Retrying playback...`,
                     'info',
                     5000
                   );
                   player.performRetry(player.playerError.currentTime);
                 } else if (player.readyToReplay) {
                   player.replayCurrent();
                 } else {
                   player.toggle();
                 }
               }}
               sx={{ color: player?.playerError ? '#ff6b6b' : 'white', p:0 }}
               title={player?.playerError ? `Error: ${player?.playerError.message}. Click to retry immediately.` : ''}
             >
               {player?.playerError ? (
                 <WarningIcon sx={{ fontSize: 75 }} />
               ) : player?.isLoading ? (
                 <CircularProgress sx={{ width: '75px !important', height: '75px !important', color: 'white' }} />
               ) : player.readyToReplay ? (
                 <ReplayCircleIcon sx={{ fontSize: 75 }} />
               ) : (
                 player.playing ? <PauseCircleIcon sx={{ fontSize: 75 }} /> : <PlayCircleIcon sx={{ fontSize: 75 }} />
               )}
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
               onChange={
                (e, v) => {
                  if (e.target.classList.contains('disabled')) {
                    e.stopPropagation(); showAlert('Sorry, this feature is not available at the moment', 'info');
                  } else {
                    e.stopPropagation(); setTabValue(v); setBottomSheetOpen(true);
                  }
                }
              }
               centered
               sx={{
                 '& .MuiTab-root': { color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: 600, minWidth: 80 },
                 '& .Mui-selected': { color: '#fff' },
                 '& .MuiTabs-indicator': { backgroundColor: '#fff' },
                 justifyContent: 'space-evenly', width: '100%'
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
              <LyricsProvider>
                <LyricsDisplay track={track} player={player} />
              </LyricsProvider>
            )}

            {/* UP NEXT TAB */}
            {tabValue === 0 && (
              <div className="v-stack">
                 <FormControlLabel
                   control={
                     <Switch
                       checked={player.endlessPlaybackEnabled}
                       onChange={(e) => player.setEndlessPlaybackEnabled?.(e.target.checked)}
                       size="small"
                       sx={{ color: '#fff' }}
                     />
                   }
                   label="Endless playback"
                   sx={{ marginBottom: 1, color: 'rgba(255,255,255,0.8)', '.MuiFormControlLabel-label': { fontWeight: 600 } }}
                 />
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
            {tabValue === 2 && (
              <div className="v-stack">
                <div className="small" style={{ fontWeight: 700 }}>Related Tracks</div>
                {loadingRelated ? (
                  <div className="small" style={{ textAlign: 'center', marginTop: 20 }}>Loading...</div>
                ) : relatedTracks.length > 0 ? (
                  relatedTracks.map((relTrack, i) => (
                    <div
                      key={relTrack.id || i}
                      className="h-stack"
                      style={{
                        padding: '10px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        cursor: 'pointer',
                        alignItems: 'center'
                      }}
                      onClick={(e) => {
                        if (e.target && e.target.closest && e.target.closest('.related-menu-button')) return;
                        player.play(relTrack);
                      }}
                    >
                      <div style={{ color: 'rgba(255,255,255,0.5)', width: 20 }}>{i+1}</div>
                      <img src={relTrack.cover || 'https://placecats.com/neo/300/300'} style={{ width: 48, height: 48, borderRadius: 4, marginRight: 12 }} alt="" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{relTrack.title}</div>
                        <div className="small">{relTrack.artist}</div>
                      </div>
                      <div className="small" style={{ marginRight: 12 }}>{fmtTime(relTrack.duration)}</div>
                      <IconButton
                        className="related-menu-button"
                        onClick={(e) => openMenu(e, relTrack)}
                        size="small"
                        sx={{ color: 'var(--text, white)' }}
                      >
                        <MoreVert />
                      </IconButton>
                    </div>
                  ))
                ) : (
                  <div className="small" style={{ opacity: 0.5, textAlign: 'center', marginTop: 20 }}>No related tracks found</div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Related tracks menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem onClick={handleMenuAddToQueue}>Add to queue</MenuItem>
        <MenuItem onClick={handleMenuAddNext}>Add next</MenuItem>
        <MenuItem onClick={handleMenuOpenInPlayer}>Open in player</MenuItem>
      </Menu>
    </div>
  );
}
