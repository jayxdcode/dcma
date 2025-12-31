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
  const isInitialLoad = useRef(true);        // used to prevent autoplay on initial restore
  const wasUserAction = useRef(false);

  const saveTimeoutRef = useRef(null);       // debounce saver
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [useAudioEngine, setUseAudioEngine] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]); // Debugger state

  const addLog = (msg) => {
    if (!isDiscordProxy) return;
    setDebugLogs(prev => [`${new Date().toLocaleTimeString()}: ${msg}`, ...prev].slice(0, 5));
  };

  // --------- Init queue from lastPlay.queue (if present) or initialQueue ----------
  const [queue, setQueueState] = useState(() => {
    try {
      const last = JSON.parse(localStorage.getItem('lastPlay') || 'null');
      const savedQueue = Array.isArray(last?.queue) ? last.queue : (initialQueue || []);
      return savedQueue.map(normalizeTrack);
    } catch (e) {
      return (initialQueue || []).map(normalizeTrack);
    }
  });

  // --------- Init index using lastPlay.id (if present and in queue) ----------
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

  // ---------- Safe serializer (to store whole track safely) ----------
  const safeSerialize = (obj) => {
    if (!obj) return obj;
    try {
      // Try to stringify & parse to remove non-serializable bits
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      // Fallback: keep essential fields if full serialization fails
      return {
        id: obj?.id || '',
        title: obj?.title || '',
        artist: obj?.artist || '',
        cover: obj?.cover || '',
        duration: obj?.duration ?? 0
      };
    }
  };

  // ---------- Persistence: lastPlay is the track object with addons ----------
  const buildPersistPayload = (payloadTime = null) => {
    const curIdx = Math.max(0, Math.min(index, queue.length - 1));
    const t = queue[curIdx] || null;
    const serializedQueue = queue.map(q => safeSerialize(q));
    if (t) {
      // lastPlay is the track object itself, augmented with lastTime and queue
      return {
        ...safeSerialize(t),
        lastTime: payloadTime ?? time ?? 0,
        queue: serializedQueue
      };
    }
    // If no current track, still write a payload with lastTime + queue
    return {
      lastTime: payloadTime ?? time ?? 0,
      queue: serializedQueue
    };
  };

  const persistLastPlay = (immediate = false, overrideTime = null) => {
    // don't persist while still in initial restore phase (unless explicit immediate save)
    if (isInitialLoad.current && !immediate) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    const writeNow = () => {
      try {
        const payload = buildPersistPayload(overrideTime);
        localStorage.setItem('lastPlay', JSON.stringify(payload));
        addLog(`Persisted lastPlay: ${payload.id || '<no-id>'}@${payload.lastTime}`);
      } catch (err) {
        // fail silently
      }
    };

    if (immediate) {
      writeNow();
    } else {
      // debounce writes to avoid thrash on frequent time updates
      saveTimeoutRef.current = setTimeout(writeNow, 1000);
    }
  };

  // persist on unmount / page close
  useEffect(() => {
    const onBeforeUnload = () => persistLastPlay(true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [queue, index, time]);

  // Save whenever index, queue or (debounced) time changes:
  useEffect(() => { persistLastPlay(false); }, [index, queue]);
  useEffect(() => { persistLastPlay(false); }, [time]);
  useEffect(() => { persistLastPlay(false); }, [volume]);

  // ---------- Player init ----------
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

    // Read lastPlay shape: now lastPlay is either an augmented track obj or older shape
    const lastData = JSON.parse(localStorage.getItem('lastPlay') || '{}');
    const startSec = lastData?.lastTime || 0;

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
            onReady: () => {
              setIsPlayerReady(true);
              addLog("Native Player Ready");
              // will respect isInitialLoad in later effects
            },
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
  }, []); // eslint-disable-line

  // ---------- Message handler for proxy ----------
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

  // ---------- Autoplay behavior ----------
  // When the player becomes ready, autoplay only if this is NOT the initial restore
  useEffect(() => {
    if (!isPlayerReady) return;

    if (isInitialLoad.current) {
      // finishing initial load: mark restore complete but DO NOT autoplay.
      isInitialLoad.current = false;
      addLog("Initial restore complete — autoplay suppressed.");
      return;
    }

    // Not initial load -> auto-load and play current track
    const vid = queue[index]?.id;
    if (vid) {
      addLog("Autoplay: loading and playing " + vid);
      sendCommand('LOAD', vid, { start: time || 0 });
      sendCommand('PLAY');
      setPlaying(true);
    }
  }, [isPlayerReady]); // eslint-disable-line

  // When index changes (user pressed next/prev or setIndex was called), load & autoplay,
  // but suppress this behavior if it's the initial restoration.
  useEffect(() => {
    if (!isPlayerReady) return;
    if (isInitialLoad.current) {
      // this index change is likely from initial restore; suppress autoplay but clear the initial flag
      isInitialLoad.current = false;
      addLog("Index set during initial restore — autoplay suppressed.");
      return;
    }
    const vid = queue[index]?.id;
    if (!vid) return;
    addLog("Index changed -> loading & autoplay " + vid);
    sendCommand('LOAD', vid, { start: 0 });
    sendCommand('PLAY');
    setPlaying(true);
  }, [index, isPlayerReady]); // eslint-disable-line

  // ---------- Player controls ----------
  const play = () => { wasUserAction.current = true;
    sendCommand('PLAY');
    setPlaying(true); };
  const pause = () => { sendCommand('PAUSE');
    setPlaying(false); };
  const toggle = () => playing ? pause() : play();
  const handleNext = () => { wasUserAction.current = true;
    setIndexState(i => {
      const next = (i + 1) % Math.max(1, queue.length);
      return next;
    });
  };
  const handlePrev = () => { wasUserAction.current = true;
    setIndexState(i => (i - 1 + queue.length) % Math.max(1, queue.length)); };
  const seek = (s) => {
    sendCommand('SEEK', s);
    setTime(s);
    // also persist immediately because user sought
    persistLastPlay(true, s);
  };
  const setPlayerVolume = (v) => { setVolume(v);
    sendCommand('SET_VOLUME', v);
    persistLastPlay(false);
  };

  const value = {
    queue,
    setQueue: (q, i = 0) => { wasUserAction.current = true;
      setQueueState(q.map(normalizeTrack));
      setIndexState(i);
      // immediate persist because user explicitly changed the queue
      setTimeout(() => persistLastPlay(true), 0);
    },
    index,
    setIndex: (i) => { wasUserAction.current = true;
      setIndexState(i);
      // immediate persist because user explicitly changed track
      setTimeout(() => persistLastPlay(true), 0);
    },
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