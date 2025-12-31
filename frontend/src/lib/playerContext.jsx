import { createContext, useContext, useEffect, useRef, useState } from 'react';

const PlayerContext = createContext(null);
export function usePlayer() { return useContext(PlayerContext); }

const isDiscordProxy = window.location.hostname.includes('discordsays.com');
const YT_API_SRC = "https://www.youtube.com/iframe_api";
const SPONSORBLOCK_API = isDiscordProxy ? "/sb/api/skipSegments" : "https://sponsor.ajay.app/api/skipSegments";

function normalizeTrack(t) {
  if (!t || typeof t !== 'object') return t;
  const raw = t.raw || t;
  return {
    ...t,
    id: t.id || t.videoId || raw?.id || raw?.videoId || '',
    title: t.title || raw?.title || '',
    artist: t.artist || t.uploader || '',
    cover: t.cover || t.thumbnail || '',
    duration: t.duration ?? raw?.duration ?? 0,
    raw: raw
  };
}

export function PlayerProvider({ children, initialQueue }) {
  const playerRef = useRef(null);
  const audioRef = useRef(null);
  const containerRef = useRef(null);
  const skipSegmentsRef = useRef([]);
  const skippingRef = useRef(false);
  const currentVideoIdRef = useRef(null);
  const isInitialLoad = useRef(true);
  const wasUserAction = useRef(false);
  
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [useAudioEngine, setUseAudioEngine] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]); // Debugger state
  
  const addLog = (msg) => {
    if (!isDiscordProxy) return;
    setDebugLogs(prev => [`${new Date().toLocaleTimeString()}: ${msg}`, ...prev].slice(0, 5));
  };
  
  const [queue, setQueueState] = useState(() => {
    try {
      const last = JSON.parse(localStorage.getItem('lastPlay') || 'null');
      return (last?.queue || initialQueue || []).map(normalizeTrack);
    } catch (e) { return (initialQueue || []).map(normalizeTrack); }
  });
  
  const [index, setIndexState] = useState(() => {
    try {
      const last = JSON.parse(localStorage.getItem('lastPlay') || 'null');
      if (last?.id && queue.length > 0) {
        const found = queue.findIndex(t => t.id === last.id);
        return found !== -1 ? found : 0;
      }
    } catch (e) {}
    return 0;
  });
  
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  
  const setPlayerContainer = (destEl, customStyle = {}) => {
    if (!destEl || !containerRef.current) return;
    const el = containerRef.current;
    const defaultCoverStyle = {
      width: '115%',
      height: '115%',
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      border: 'none'
    };
    Object.assign(el.style, defaultCoverStyle, customStyle);
    if (el.parentNode !== destEl) destEl.appendChild(el);
  };
  
  const sendCommand = (command, value, extra = {}) => {
    addLog(`Sending Command: ${command}`);
    if (useAudioEngine && audioRef.current) {
      const a = audioRef.current;
      if (command === 'PLAY') a.play().catch(() => {});
      if (command === 'PAUSE') a.pause();
      if (command === 'SEEK') a.currentTime = value;
      if (command === 'SET_VOLUME') a.volume = value;
      if (command === 'LOAD') {
        a.src = `/api/stream?videoId=${value}`;
        if (extra.start) a.currentTime = extra.start;
        a.play().catch(() => {});
      }
      return;
    }
    
    if (isDiscordProxy) {
      containerRef.current?.contentWindow?.postMessage(
        JSON.stringify({ command, value, ...extra }), "*"
      );
    } else {
      const p = playerRef.current;
      if (!p) return;
      if (command === 'PLAY') p.playVideo?.();
      if (command === 'PAUSE') p.pauseVideo?.();
      if (command === 'SEEK') p.seekTo?.(value, true);
      if (command === 'SET_VOLUME') p.setVolume?.(Math.round(value * 100));
      if (command === 'LOAD') p.loadVideoById?.({ videoId: value, startSeconds: extra.start || 0 });
    }
  };
  
  useEffect(() => {
    const storageId = 'hitori-hidden-storage';
    let storage = document.getElementById(storageId);
    if (!storage) {
      storage = document.createElement('div');
      storage.id = storageId;
      Object.assign(storage.style, { position: 'fixed', left: '-9999px', top: '-9999px' });
      document.body.appendChild(storage);
    }
    
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => { wasUserAction.current = true;
        handleNext(); };
    }
    
    const lastData = JSON.parse(localStorage.getItem('lastPlay') || '{}');
    const startSec = lastData.lastTime || 0;
    
    if (isDiscordProxy) {
      addLog("Initializing Discord Proxy Iframe...");
      const ifr = document.createElement('iframe');
      ifr.id = 'hitori-player-core';
      ifr.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
      ifr.setAttribute('allowfullscreen', 'true');
      const initialVid = queue[index]?.id || '';
      ifr.src = `/api/embed?v=${initialVid}&start=${startSec}&origin=${encodeURIComponent(window.location.origin)}`;
      ifr.style.border = 'none';
      storage.appendChild(ifr);
      containerRef.current = ifr;
    } else {
      addLog("Initializing Native YouTube API...");
      const script = document.createElement('script');
      script.src = YT_API_SRC;
      document.head.appendChild(script);
      window.onYouTubeIframeAPIReady = () => {
        const ytDiv = document.createElement('div');
        storage.appendChild(ytDiv);
        containerRef.current = ytDiv;
        playerRef.current = new window.YT.Player(ytDiv, {
          height: '100%',
          width: '100%',
          videoId: queue[index]?.id || '',
          playerVars: { controls: 0, playsinline: 1, rel: 0, start: startSec, autoplay: 0 },
          events: {
            onReady: () => { setIsPlayerReady(true);
              addLog("Native Player Ready"); },
            onStateChange: (e) => {
              if (e.data === 1) setPlaying(true);
              if (e.data === 2) setPlaying(false);
              if (e.data === 0) { wasUserAction.current = true;
                handleNext(); }
            }
          }
        });
      };
    }
  }, []);
  
  useEffect(() => {
    const handleMessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'READY') {
          addLog("RECEIVED: READY FROM PROXY");
          setIsPlayerReady(true);
        }
        if (data.type === 'STATE_CHANGE' || data.type === 'TIME_UPDATE') {
          if (data.state === 1) setPlaying(true);
          if (data.state === 2) setPlaying(false);
          if (data.state === 0) { wasUserAction.current = true;
            handleNext(); }
          setTime(Math.floor(data.currentTime || 0));
          setDuration(Math.floor(data.duration || 0));
        }
      } catch (err) {}
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [index, queue]);
  
  const play = () => { wasUserAction.current = true;
    sendCommand('PLAY');
    setPlaying(true); };
  const pause = () => { sendCommand('PAUSE');
    setPlaying(false); };
  const toggle = () => playing ? pause() : play();
  const handleNext = () => { wasUserAction.current = true;
    setIndexState(i => (i + 1) % Math.max(1, queue.length)); };
  const handlePrev = () => { wasUserAction.current = true;
    setIndexState(i => (i - 1 + queue.length) % Math.max(1, queue.length)); };
  const seek = (s) => sendCommand('SEEK', s);
  const setPlayerVolume = (v) => { setVolume(v);
    sendCommand('SET_VOLUME', v); };
  
  const value = {
    queue,
    setQueue: (q, i = 0) => { wasUserAction.current = true;
      setQueueState(q.map(normalizeTrack));
      setIndexState(i); },
    index,
    setIndex: (i) => { wasUserAction.current = true;
      setIndexState(i); },
    track: queue[index],
    playing,
    play,
    pause,
    toggle,
    next: handleNext,
    prev: handlePrev,
    time,
    seek,
    duration,
    volume,
    setVolume: setPlayerVolume,
    isPlayerReady,
    setPlayerContainer
  };
  
  return (
    <PlayerContext.Provider value={value}>
      {children}
      {isDiscordProxy && (
        <div style={{
          position: 'fixed', bottom: '10px', right: '10px', zIndex: 9999,
          background: 'rgba(0,0,0,0.8)', color: '#0f0', padding: '10px',
          fontSize: '10px', fontFamily: 'monospace', borderRadius: '5px',
          pointerEvents: 'none', maxWidth: '200px'
        }}>
          <div style={{ borderBottom: '1px solid #0f0', marginBottom: '5px' }}>Hitori Debugger</div>
          {debugLogs.map((log, i) => <div key={i}>{log}</div>)}
        </div>
      )}
    </PlayerContext.Provider>
  );
}