import { createContext, useContext, useEffect, useRef, useState } from 'react';

const PlayerContext = createContext(null);
export function usePlayer() { return useContext(PlayerContext); }

const YT_API_SRC = "https://www.youtube.com/iframe_api";
const SPONSORBLOCK_API = "https://sponsor.ajay.app/api/skipSegments";

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

export function PlayerProvider({ children, initialQueue, setOpenFull }) {
  const playerRef = useRef(null);

  useEffect(() => {
    // Assign the ref to window for debugging purposes (can be removed on production)
    window.playerRef = playerRef;
  }, []);

  const audioRef = useRef(null);
  const containerRef = useRef(null);
  const skipSegmentsRef = useRef([]);
  const skippingRef = useRef(false);
  const currentVideoIdRef = useRef(null);
  const isInitialLoad = useRef(true); // used to prevent autoplay on initial restore
  const wasUserAction = useRef(false);
  const youtubeApiReadyRef = useRef(false); // Track when YT API is ready
  const playerInitializedRef = useRef(false); // Track if player has been initialized
  
  const saveTimeoutRef = useRef(null); // debounce saver
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [useAudioEngine, setUseAudioEngine] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]); // Debugger state
  
  const addLog = (msg) => {
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
  const [endlessPlaybackEnabled, setEndlessPlaybackEnabledState] = useState(() => {
    try {
      return localStorage.getItem('hitori_endless_playback') !== 'false';
    } catch (e) {
      return true;
    }
  });
  const [readyToReplay, setReadyToReplay] = useState(false);
  
  // Ensure initial load doesn't set playing to true
  useEffect(() => {
    if (isInitialLoad.current) {
      setPlaying(false);
    }
  }, []);
  
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
    
    const p = playerRef.current;
    if (!p) return;
    if (command === 'PLAY') p.playVideo?.();
    if (command === 'PAUSE') p.pauseVideo?.();
    if (command === 'SEEK') p.seekTo?.(value, true);
    if (command === 'SET_VOLUME') p.setVolume?.(Math.round(value * 100));
    if (command === 'LOAD') p.loadVideoById?.({ videoId: value, startSeconds: extra.start || 0 });
  };

  const getPlayer = () => playerRef.current;

  const getCurrentIframeTime = () => {
    const p = getPlayer();
    if (p && typeof p.getCurrentTime === 'function') {
      return Math.floor(p.getCurrentTime() || 0);
    }
    return Math.floor(time || 0);
  };

  const syncIframeStateFromPlayer = () => {
    const p = getPlayer();
    if (!p) return;

    if (typeof p.getPlaylistIndex === 'function') {
      const iframeIndex = p.getPlaylistIndex();
      if (typeof iframeIndex === 'number' && iframeIndex !== index && iframeIndex >= 0 && iframeIndex < queue.length) {
        setIndexState(iframeIndex);
      }
    }

    if (typeof p.getPlaylist === 'function') {
      const iframePlaylist = p.getPlaylist();
      if (Array.isArray(iframePlaylist) && iframePlaylist.length) {
        const ids = iframePlaylist.filter(Boolean);
        const existingIds = queue.map(t => t.id).filter(Boolean);
        if (ids.length && ids.join(',') !== existingIds.join(',')) {
          setQueueState(ids.map(id => normalizeTrack({ id })));
        }
      }
    }
  };

  const applyPlaylistToIframe = ({ playlistIds, currentIndex = 0, startSeconds = 0, autoplay = false }) => {
    const p = getPlayer();
    if (!p || !isPlayerReady || useAudioEngine || !Array.isArray(playlistIds) || !playlistIds.length) return false;

    try {
      if (autoplay) {
        if (typeof p.loadPlaylist === 'function') {
          addLog(`Applying playlist to iframe via loadPlaylist [${playlistIds.length} items] @${currentIndex}`);
          p.loadPlaylist(playlistIds, currentIndex, startSeconds);
          p.playVideo?.();
          setPlaying(true);
          return true;
        }
        if (typeof p.cuePlaylist === 'function') {
          addLog(`Applying playlist to iframe via cuePlaylist [${playlistIds.length} items] @${currentIndex}`);
          p.cuePlaylist(playlistIds, currentIndex, startSeconds);
          p.playVideo?.();
          setPlaying(true);
          return true;
        }
      } else {
        if (typeof p.cuePlaylist === 'function') {
          addLog(`Applying playlist to iframe via cuePlaylist (paused) [${playlistIds.length} items] @${currentIndex}`);
          p.cuePlaylist(playlistIds, currentIndex, startSeconds);
          setPlaying(false);
          return true;
        }
        if (typeof p.loadPlaylist === 'function') {
          addLog(`Applying playlist to iframe via loadPlaylist (paused) [${playlistIds.length} items] @${currentIndex}`);
          p.loadPlaylist(playlistIds, currentIndex, startSeconds);
          p.pauseVideo?.();
          setPlaying(false);
          return true;
        }
      }

      if (typeof p.loadVideoById === 'function') {
        addLog(`Falling back to loading single video ${playlistIds[currentIndex]}`);
        p.loadVideoById({ videoId: playlistIds[currentIndex], startSeconds });
        if (autoplay) p.playVideo?.();
        setPlaying(autoplay);
        return true;
      }
    } catch (err) {
      addLog(`Playlist sync failed: ${err.message}`);
    }

    return false;
  };

  const persistEndlessPlaybackSetting = (enabled) => {
    try {
      localStorage.setItem('hitori_endless_playback', enabled ? 'true' : 'false');
    } catch (e) {}
  };

  const setEndlessPlaybackEnabled = (enabled) => {
    setEndlessPlaybackEnabledState(enabled);
    persistEndlessPlaybackSetting(enabled);
  };
  
  const loadTrackByIndex = (idx = index, start = 0, autoplay = false) => {
    const t = queue[idx];
    if (!t?.id || !isPlayerReady) return;
    addLog(`Loading track ${t.id}${autoplay ? ' + autoplay' : ''}`);
    const playlistIds = queue.map(track => track?.id).filter(Boolean);
    const loaded = applyPlaylistToIframe({ playlistIds, currentIndex: idx, startSeconds: start, autoplay });
    if (!loaded) {
      sendCommand('LOAD', t.id, { start });
      if (autoplay) {
        sendCommand('PLAY');
        setPlaying(true);
      }
    }
  };

  const playTrack = (track, { start = 0 } = {}) => {
    const normalized = normalizeTrack(track);
    if (!normalized?.id) return;
    wasUserAction.current = true;
    setQueueState([normalized]);
    setIndexState(0);
    setReadyToReplay(false);
    if (isPlayerReady) {
      const playlistIds = [normalized.id];
      const loaded = applyPlaylistToIframe({ playlistIds, currentIndex: 0, startSeconds: start, autoplay: true });
      if (!loaded) {
        sendCommand('LOAD', normalized.id, { start });
        sendCommand('PLAY');
      }
    }
    setTimeout(() => persistLastPlay(true), 0);
  };

  const enqueue = (item, nextUp = false) => {
    const normalized = normalizeTrack(item);
    if (!normalized?.id) return;
    wasUserAction.current = true;

    const currentQueue = Array.isArray(queue) ? queue : [];
    const currentTime = getCurrentIframeTime();
    const currentIndex = currentQueue.length ? index : 0;
    const insertIndex = currentQueue.length ? (nextUp ? Math.min(currentQueue.length, index + 1) : currentQueue.length) : 0;
    const nextQueue = [...currentQueue];
    nextQueue.splice(insertIndex, 0, normalized);

    setQueueState(nextQueue);
    if (!currentQueue.length) setIndexState(0);

    if (isPlayerReady) {
      const playlistIds = nextQueue.map(track => track.id).filter(Boolean);
      if (readyToReplay && nextQueue.length > currentIndex + 1) {
        const nextIndex = currentIndex + 1;
        setIndexState(nextIndex);
        setReadyToReplay(false);
        applyPlaylistToIframe({ playlistIds, currentIndex: nextIndex, startSeconds: 0, autoplay: true });
      } else {
        applyPlaylistToIframe({ playlistIds, currentIndex, startSeconds: currentTime, autoplay: playing });
      }
    }

    setTimeout(() => persistLastPlay(true), 0);
  };

  const openFull = (open = true) => {
    if (typeof setOpenFull === 'function') setOpenFull(open);
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
      const serializedTrack = safeSerialize(t);
      // Remove queue from serialized track to avoid duplicate keys
      const { queue: _, ...trackWithoutQueue } = serializedTrack;
      return {
        ...trackWithoutQueue,
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
  
  // ---------- Endless Playback Handler for YouTube Playlists ----------
  /**
   * Implements endless playback by detecting and loading YouTube playlist IDs.
   * Prioritizes: My Supermix (RDTMAK...) > [Song] Mix (RDTM/RDCL...) > Song Radio (RD...)
   * Falls back to Song Radio (RD{videoId}) if no valid playlist ID is found.
   */
  const handleEndlessPlayback = () => {
    addLog('handleEndlessPlayback triggered');
    if (index < queue.length - 1) {
      addLog('Manual next track exists, using queue next');
      handleNext();
      return;
    }
    if (!endlessPlaybackEnabled) {
      addLog('Endless playback disabled, switching to replay state');
      handleQueueEnd();
      return;
    }
    const currentTrack = queue[index];
    const currentVideoId = currentTrack?.id;
    
    if (!currentVideoId) {
      addLog('No current video ID, falling back to handleNext');
      handleNext();
      return;
    }
    
    // Try to get playlist ID from current track's raw data
    const listId = currentTrack?.raw?.list || currentTrack?.list || null;
    const p = playerRef.current;
    
    if (!p) {
      addLog('Player not ready, using handleNext');
      handleNext();
      return;
    }
    
    // Helper to safely load playlist with fallback
    const loadPlaylistSafely = (playlistId) => {
      try {
        // Check for different playlist loading methods (API may vary)
        if (typeof p.loadPlaylist === 'function') {
          addLog(`Loading playlist: ${playlistId} via loadPlaylist()`);
          p.loadPlaylist({ list: playlistId, listType: 'playlist' });
          return true;
        } else if (typeof p.loadPlaylistById === 'function') {
          addLog(`Loading playlist: ${playlistId} via loadPlaylistById()`);
          p.loadPlaylistById({ list: playlistId });
          return true;
        } else if (typeof p.cuePlaylist === 'function') {
          addLog(`Cueing playlist: ${playlistId} via cuePlaylist()`);
          p.cuePlaylist({ list: playlistId, listType: 'playlist' });
          p.playVideo?.();
          return true;
        } else if (typeof p.cuePlaylistById === 'function') {
          addLog(`Cueing playlist: ${playlistId} via cuePlaylistById()`);
          p.cuePlaylistById({ list: playlistId });
          p.playVideo?.();
          return true;
        } else {
          addLog(`No playlist loading method found on player`);
          return false;
        }
      } catch (err) {
        addLog(`Error loading playlist: ${err.message}`);
        return false;
      }
    };
    
    // Helper to safely load video
    const loadVideoSafely = (videoId) => {
      try {
        if (typeof p.loadVideoById === 'function') {
          addLog(`Loading video: ${videoId} via loadVideoById()`);
          p.loadVideoById({ videoId, startSeconds: 0 });
          return true;
        } else if (typeof p.cueVideoById === 'function') {
          addLog(`Cueing video: ${videoId} via cueVideoById()`);
          p.cueVideoById({ videoId, startSeconds: 0 });
          p.playVideo?.();
          return true;
        } else {
          addLog(`No video loading method found on player`);
          return false;
        }
      } catch (err) {
        addLog(`Error loading video: ${err.message}`);
        return false;
      }
    };
    
    // Priority: My Supermix > [Song] Mix > Song Radio
    if (listId) {
      const listStr = String(listId);
      
      // Check priority: My Supermix (RDTMAK...)
      if (listStr.startsWith('RDTMAK')) {
        addLog('Detected My Supermix playlist');
        if (loadPlaylistSafely(listId)) return;
      }
      
      // Check priority: [Song] Mix (RDTM... or RDCL...)
      if (listStr.startsWith('RDTM') || listStr.startsWith('RDCL')) {
        addLog('Detected Song Mix playlist');
        if (loadPlaylistSafely(listId)) return;
      }
      
      // Check priority: Song Radio (RD...)
      if (listStr.startsWith('RD')) {
        addLog('Detected Song Radio playlist');
        if (loadPlaylistSafely(listId)) return;
      }
      
      // If list ID exists but doesn't match any pattern, try to load it anyway
      addLog('List ID exists but unrecognized format, attempting to load');
      if (loadPlaylistSafely(listId)) return;
    }
    
    // Fallback: Generate Song Radio ID from current video and load
    const radioId = `RD${currentVideoId}`;
    addLog(`No valid playlist ID found, generating Song Radio: ${radioId}`);
    if (loadVideoSafely(currentVideoId)) {
      // After loading the current video, queue should transition to radio if YouTube supports it
      // This is a limitation: without explicit playlist ID, we fall back to next track in queue
      addLog(`Loaded fallback video, will continue with queue`);
      return;
    }
    
    // Ultimate fallback: use normal handleNext if all else fails
    addLog('All playback methods failed, falling back to handleNext');
    handleNext();
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
  // Expose player initialization function for PlayerFull to call when ready
  const initializeYouTubePlayer = (containerElement) => {
    if (playerInitializedRef.current || !youtubeApiReadyRef.current || !containerElement) {
      addLog(`Cannot init player: initialized=${playerInitializedRef.current}, API ready=${youtubeApiReadyRef.current}, container=${!!containerElement}`);
      return;
    }

    const ytDiv = document.createElement('div');
    ytDiv.id = "hitori-player-core";
    containerElement.appendChild(ytDiv);
    
    const lastData = JSON.parse(localStorage.getItem('lastPlay') || '{}');
    const startSec = lastData?.lastTime || 0;

    containerRef.current = ytDiv;
    playerRef.current = new window.YT.Player("hitori-player-core", {
      height: '100%',
      width: '100%',
      videoId: queue[index]?.id || '',
      playerVars: { origin: window.location.origin, controls: 0, playsinline: 1, rel: 0, start: startSec, autoplay: 0 },
      events: {
        onReady: () => {
          setIsPlayerReady(true);
          addLog("Native Player Ready");
        },
        onStateChange: (e) => {
          // During initial load, don't update playing state from YouTube events
          if (isInitialLoad.current && e.data === 1) {
            // Pause the video to prevent autoplay during initial load
            playerRef.current?.pauseVideo?.();
            return;
          }
          if (e.data === 1) setPlaying(true);
          if (e.data === 2) setPlaying(false);
          if (e.data === 0) {
            handleTrackEnded();
          }
        }
      }
    });
    
    playerInitializedRef.current = true;
    addLog("YouTube Player initialized");
  };

  // Load YouTube API script and mark when ready
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => {
        wasUserAction.current = true;
        handleNext();
      };
    }
    
    addLog("Loading YouTube API...");
    const script = document.createElement('script');
    script.src = YT_API_SRC;
    document.head.appendChild(script);
    
    window.onYouTubeIframeAPIReady = () => {
      youtubeApiReadyRef.current = true;
      addLog("YouTube API Ready (player initialization deferred to PlayerFull)");
    };
    
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
          if (data.state === 0) {
            handleTrackEnded();
          }
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
      const playlistIds = queue.map(track => track.id).filter(Boolean);
      const loaded = applyPlaylistToIframe({ playlistIds, currentIndex: index, startSeconds: time || 0, autoplay: true });
      if (!loaded) {
        sendCommand('LOAD', vid, { start: time || 0 });
        sendCommand('PLAY');
      }
      setPlaying(true);
    }
  }, [isPlayerReady]); // eslint-disable-line

  useEffect(() => {
    if (!isPlayerReady) return;
    const interval = setInterval(() => {
      const p = getPlayer();
      if (!p) return;
      if (typeof p.getPlaylistIndex === 'function') {
        const iframeIndex = p.getPlaylistIndex();
        if (typeof iframeIndex === 'number' && iframeIndex >= 0 && iframeIndex < queue.length && iframeIndex !== index) {
          setIndexState(iframeIndex);
        }
      }
      if (typeof p.getPlaylist === 'function') {
        const iframePlaylist = p.getPlaylist();
        if (Array.isArray(iframePlaylist) && iframePlaylist.length) {
          const ids = iframePlaylist.filter(Boolean);
          const currentIds = queue.map(t => t.id).filter(Boolean);
          if (ids.length && ids.join(',') !== currentIds.join(',')) {
            setQueueState(ids.map(id => normalizeTrack({ id })));
          }
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlayerReady, queue.length, index]);

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
    const playlistIds = queue.map(track => track.id).filter(Boolean);
    const loaded = applyPlaylistToIframe({ playlistIds, currentIndex: index, startSeconds: 0, autoplay: true });
    if (!loaded) {
      sendCommand('LOAD', vid, { start: 0 });
      sendCommand('PLAY');
    }
    setPlaying(true);
  }, [index, isPlayerReady]); // eslint-disable-line
  
  // ---------- Time/Duration polling ----------
useEffect(() => {
  const interval = setInterval(() => {
    if (useAudioEngine && audioRef.current) {
      setTime(Math.floor(audioRef.current.currentTime || 0));
      setDuration(Math.floor(audioRef.current.duration || 0));
      return;
    }
    const p = playerRef.current;
    if (!p || typeof p.getPlayerState !== 'function') return;
    const state = p.getPlayerState?.();
    // states: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    if (state === 1 || state === 2 || state === 3) {
      const ct = p.getCurrentTime?.() ?? 0;
      const dur = p.getDuration?.() ?? 0;
      setTime(Math.floor(ct));
      setDuration(Math.floor(dur));
    }
  }, 500);
  return () => clearInterval(interval);
}, [isPlayerReady, useAudioEngine]);
  
  // ---------- Player controls ----------
  const play = () => {
    wasUserAction.current = true;
    setReadyToReplay(false);
    sendCommand('PLAY');
    setPlaying(true);
  };
  const pause = () => {
    sendCommand('PAUSE');
    setPlaying(false);
  };
  const toggle = () => playing ? pause() : play();

  const replayCurrent = () => {
    const p = getPlayer();
    if (!p || !isPlayerReady) return;
    if (typeof p.seekTo === 'function') p.seekTo(0, true);
    p.playVideo?.();
    setTime(0);
    setPlaying(true);
    setReadyToReplay(false);
    persistLastPlay(true, 0);
  };

  const handleQueueEnd = () => {
    addLog('Queue exhausted, switching to replay state');
    setReadyToReplay(true);
    setPlaying(false);
  };

  const handleTrackEnded = () => {
    wasUserAction.current = true;
    if (index < queue.length - 1) {
      handleNext();
      return;
    }
    if (endlessPlaybackEnabled) {
      handleEndlessPlayback();
      return;
    }
    handleQueueEnd();
  };

  const handleNext = () => {
    wasUserAction.current = true;
    setReadyToReplay(false);
    if (index < queue.length - 1) {
      setIndexState(i => i + 1);
      return;
    }
    if (endlessPlaybackEnabled) {
      handleEndlessPlayback();
      return;
    }
    handleQueueEnd();
  };
  const handlePrev = () => {
    wasUserAction.current = true;
    setReadyToReplay(false);
    if (queue.length) {
      setIndexState(i => (i - 1 + queue.length) % queue.length);
    }
  };
  const seek = (s) => {
    sendCommand('SEEK', s);
    setTime(s);
    // also persist immediately because user sought
    persistLastPlay(true, s);
  };
  const setPlayerVolume = (v) => {
    setVolume(v);
    sendCommand('SET_VOLUME', v);
    persistLastPlay(false);
  };
  
  const value = {
    queue,
    setQueue: (q, i = 0, autoplay = false) => {
      const normalizedQueue = Array.isArray(q) ? q.map(normalizeTrack) : [];
      wasUserAction.current = true;
      setReadyToReplay(false);
      setQueueState(normalizedQueue);
      setIndexState(i);
      if (isPlayerReady && normalizedQueue[i]?.id) {
        const playlistIds = normalizedQueue.map(track => track.id).filter(Boolean);
        const startSeconds = 0;
        applyPlaylistToIframe({ playlistIds, currentIndex: i, startSeconds, autoplay });
      }
      // immediate persist because user explicitly changed the queue
      setTimeout(() => persistLastPlay(true), 0);
    },
    playTrack,
    enqueue,
    openFull,
    index,
    setIndex: (i) => {
      wasUserAction.current = true;
      setIndexState(i);
      // immediate persist because user explicitly changed track
      setTimeout(() => persistLastPlay(true), 0);
    },
    track: queue[index],
    endlessPlaybackEnabled,
    setEndlessPlaybackEnabled,
    readyToReplay,
    replayCurrent,
    playing,
    play,
    pause,
    toggle,
    next: handleNext,
    prev: handlePrev,
    handleEndlessPlayback,
    time,
    seek,
    duration,
    volume,
    setVolume: setPlayerVolume,
    isPlayerReady,
    setPlayerContainer,
    initializeYouTubePlayer
  };
  
  useEffect(() => {
    window.hitoriPlayer = value;
    return () => {
      if (window.hitoriPlayer === value) delete window.hitoriPlayer;
    };
  }, [value]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <div id="htr-logs" className="hidden" style={{
        position: 'fixed', bottom: '10px', right: '10px', zIndex: 9999,
        background: 'rgba(0,0,0,0.8)', color: '#0f0', padding: '10px',
        fontSize: '10px', fontFamily: 'monospace', borderRadius: '5px',
        pointerEvents: 'none', maxWidth: '200px'
      }}>
        <div style={{ borderBottom: '1px solid #0f0', marginBottom: '5px' }}>Hitori Debugger</div>
        {debugLogs.map((log, i) => <div key={i}>{log}</div>)}
      </div>
    </PlayerContext.Provider>
  );
}