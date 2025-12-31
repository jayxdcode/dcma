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
  
  // Refs to manage autoplay behavior
  const isInitialLoad = useRef(true);
  const wasUserAction = useRef(false);
  
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [useAudioEngine, setUseAudioEngine] = useState(false);
  
  const [queue, setQueueState] = useState(() => {
    try {
      const last = JSON.parse(localStorage.getItem('lastPlay') || 'null');
      if (last?.queue) return last.queue.map(normalizeTrack);
    } catch (e) {}
    return (initialQueue || []).map(normalizeTrack);
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
    if (useAudioEngine && audioRef.current) {
      const a = audioRef.current;
      if (command === 'PLAY') a.play().catch(() => {});
      if (command === 'PAUSE') a.pause();
      if (command === 'SEEK') a.currentTime = value;
      if (command === 'SET_VOLUME') a.volume = value;
      if (command === 'LOAD') {
        a.src = `/api/stream?videoId=${value}`;
        if (extra.start) a.currentTime = extra.start;
        // Audio engine autoplays on LOAD command
        a.play().catch(() => {});
      }
      return;
    }
    
    if (isDiscordProxy) {
      containerRef.current?.contentWindow?.postMessage(
        JSON.stringify({ command, value, ...extra }), window.location.origin
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
  
  // --- Persistence Loop ---
  useEffect(() => {
    const track = queue[index];
    if (!track) return;
    localStorage.setItem('lastPlay', JSON.stringify({
      ...track,
      queue,
      lastTime: time
    }));
  }, [time, index, queue]);
  
  // --- Initialization ---
  useEffect(() => {
    const storageId = 'hitori-hidden-storage';
    let storage = document.getElementById(storageId);
    if (!storage) {
      storage = document.createElement('div');
      storage.id = storageId;
      Object.assign(storage.style, { position: 'fixed', left: '-1000vw', top: '-1000vh' });
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
      const ifr = document.createElement('iframe');
      ifr.id = 'hitori-player-core';
      ifr.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
      ifr.setAttribute('allowfullscreen', 'true');
      const initialVid = queue[index]?.id || '';
      // Start is passed, but autoplay is 0 in the proxy script
      ifr.src = `/api/embed?origin=${encodeURIComponent(window.location.origin)}&v=${initialVid}&start=${startSec}`;
      ifr.style.border = 'none';
      storage.appendChild(ifr);
      containerRef.current = ifr;
    } else {
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
            onReady: () => setIsPlayerReady(true),
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
  
  // --- Proxy Message Listener ---
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.origin !== window.location.origin) return;
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'READY') setIsPlayerReady(true);
        if (data.type === 'STATE_CHANGE' || data.type === 'TIME_UPDATE') {
          if (data.state === 1) setPlaying(true);
          if (data.state === 2) setPlaying(false);
          if (data.state === 0) { wasUserAction.current = true;
            handleNext(); }
          setTime(Math.floor(data.currentTime || 0));
          setDuration(Math.floor(data.duration || 0));
          maybeSkipSponsor(data.currentTime);
        }
      } catch (err) {}
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [index, queue]);
  
  // --- Track / Engine Management ---
  useEffect(() => {
    const track = queue[index];
    if (!track || track.id === currentVideoIdRef.current) return;
    
    // Resume logic: If this is the very first mount, just record the ID and don't trigger LOAD
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      currentVideoIdRef.current = track.id;
      fetchSponsorBlockSegments(track.id);
      return;
    }
    
    currentVideoIdRef.current = track.id;
    const useServer = localStorage.getItem('hitori_use_server_stream') === 'true';
    setUseAudioEngine(useServer);
    
    // Only autoplay if it was triggered by a user action (next, prev, select)
    if (wasUserAction.current) {
      sendCommand('LOAD', track.id, { start: 0 });
    } else {
      // This case handles external queue updates that shouldn't interrupt silence
      if (!isDiscordProxy && playerRef.current?.cueVideoById) {
        playerRef.current.cueVideoById({ videoId: track.id });
      }
    }
    
    fetchSponsorBlockSegments(track.id);
  }, [index, queue]);
  
  async function fetchSponsorBlockSegments(videoId) {
    skipSegmentsRef.current = [];
    if (localStorage.getItem('hitori_skip_sponsor') === 'false') return;
    try {
      const url = `${SPONSORBLOCK_API}?videoID=${videoId}&categories=["sponsor","selfpromo"]`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        skipSegmentsRef.current = json.map(s => ({ start: s.segment[0], end: s.segment[1] }));
      }
    } catch (e) {}
  }
  
  function maybeSkipSponsor(t) {
    if (skippingRef.current) return;
    for (const s of skipSegmentsRef.current) {
      if (t >= s.start && t < s.end) {
        skippingRef.current = true;
        seek(s.end + 0.5);
        setTimeout(() => { skippingRef.current = false; }, 1000);
        break;
      }
    }
  }
  
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
    setQueue: (q, i = 0) => {
      wasUserAction.current = true;
      setQueueState(q.map(normalizeTrack));
      setIndexState(i);
    },
    enqueue: (t) => setQueueState(prev => [...prev, normalizeTrack(t)]),
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
  
  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}