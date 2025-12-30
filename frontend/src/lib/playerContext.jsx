// src/lib/playerContext.jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react';

const PlayerContext = createContext(null);
export function usePlayer(){ return useContext(PlayerContext); }

const isDiscordProxy = window.location.hostname.includes('discordsays.com');
const YT_API_SRC = isDiscordProxy ? `/yt/iframe_api` : "https://www.youtube.com/iframe_api";
const SPONSORBLOCK_API = isDiscordProxy ? "/sb/api/skipSegments" : "https://sponsor.ajay.app/api/skipSegments";

function normalizeTrack(t) {
  if (!t || typeof t !== 'object') return t;

  const raw = t.raw || t; 
  const id = t.id || t.videoId || raw?.id || raw?.videoId || raw?.watchId || '';
  const title = t.title || raw?.title || raw?.name || raw?.videoTitle || '';
  const artist =
    t.artist ||
    t.uploader ||
    t.uploaderName ||
    raw?.uploader ||
    raw?.uploaderName ||
    (raw?.authors && Array.isArray(raw.authors) ? raw.authors.join(', ') : '') ||
    '';
  const cover =
    t.cover ||
    t.thumbnail ||
    t.thumbnailUrl ||
    (t.thumbnails && t.thumbnails[0] && (t.thumbnails[0].url || t.thumbnails[0])) ||
    raw?.thumbnail ||
    raw?.thumbnailUrl ||
    raw?.thumbnails?.[0]?.url ||
    raw?.uploaderAvatar ||
    '';

  const duration = t.duration ?? t.durationSeconds ?? raw?.duration ?? 0;
  return {
    ...t,
    id,
    title,
    artist,
    cover,
    duration,
    raw: raw 
  };
}

/**
 * Patched loadYouTubeApi for Discord Proxy
 * Intercepts the script and replaces youtube domains with the local /yt proxy
 */
async function loadYouTubeApi() {
  try {
    if (window.YT && window.YT.Player) return window.YT;

    return new Promise(async (resolve, reject) => {
      // Prevent duplicate scripts
      if (document.getElementById('hitori-yt-api')) {
        const check = setInterval(() => { 
          if (window.YT && window.YT.Player) { clearInterval(check); resolve(window.YT); } 
        }, 50);
        setTimeout(()=> { clearInterval(check); reject(new Error('YT API timeout')); }, 15000);
        return;
      }

      const s = document.createElement('script');
      s.id = 'hitori-yt-api';
      s.async = true;

      if (isDiscordProxy) {
        try {
          console.log("[Hitori] Patching YouTube Iframe API for Discord Proxy...");
          const response = await fetch(YT_API_SRC);
          const scriptContent = await response.text();
          
          // Replace standard and escaped YouTube URLs with your /yt proxy
          const patchedContent = scriptContent.replace(/https:\\?\/\\?\/www\.youtube\.com/g, '/yt');
          
          const blob = new Blob([patchedContent], { type: 'application/javascript' });
          s.src = URL.createObjectURL(blob);
          
          // Cleanup memory once loaded
          s.onload = () => URL.revokeObjectURL(s.src);
        } catch (err) {
          console.warn("[Hitori] Proxy fetch failed, trying direct link:", err);
          s.src = YT_API_SRC; 
        }
      } else {
        s.src = YT_API_SRC;
      }

      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function() {
        if (prev) try { prev(); } catch(e) {}
        resolve(window.YT);
      };

      document.head.appendChild(s);

      setTimeout(() => {
        if (window.YT && window.YT.Player) resolve(window.YT);
        else reject(new Error('YouTube Iframe API failed to load'));
      }, 15000);
    });
  } catch(e) {
    console.error("An error occurred while trying to load YT Iframe API:", e.message, e);
  }
}

export function PlayerProvider({ children, initialQueue }) {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const audioRef = useRef(null);
  const skipSegmentsRef = useRef([]);
  const skippingRef = useRef(false);
  const currentVideoIdRef = useRef(null); 

  const [useAudioEngine, setUseAudioEngine] = useState(false);
  const [queue, setQueueState] = useState(() => {
    try {
      const last = JSON.parse(localStorage.getItem('lastPlay') || 'null');
      if (last && last.queue) {
        return (last.queue || []).map(normalizeTrack);
      }
    } catch(e){}
    return initialQueue || [];
  });
  const [index, setIndexState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(queue[0]?.duration || 0);
  const [volume, setVolume] = useState(0.8);

  useEffect(() => {
    const id = 'hitori-yt-player';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.position = 'absolute';
      el.style.left = '-9999px';
      el.style.top = '-9999px';
      el.style.width = '1px';
      el.style.height = '1px';
      el.style.overflow = 'hidden';
      document.body.appendChild(el);
    }
    containerRef.current = el;

    if (!audioRef.current) {
      const a = new Audio();
      a.preload = 'metadata';
      audioRef.current = a;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await loadYouTubeApi();
        if (!mounted) return;
        if (!playerRef.current && containerRef.current && window.YT) {
          playerRef.current = new window.YT.Player(containerRef.current, {
            height: '1', width: '1', videoId: '',
            playerVars: { nocookie: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1 },
            events: {
              onReady: (e) => { try { e.target.setVolume(Math.round(volume * 100)); } catch(e){} },
              onStateChange: (e) => {
                const st = e.data;
                if (st === window.YT.PlayerState.PLAYING) {
                  setPlaying(true);
                  try {
                    const d = Math.floor(e.target.getDuration() || 0);
                    if (d > 0) {
                        setQueueState(prevQ => {
                            if (prevQ[index] && prevQ[index].duration !== d) {
                                const nq = [...prevQ];
                                nq[index] = { ...nq[index], duration: d };
                                return nq;
                            }
                            return prevQ;
                        });
                        setDuration(d);
                    }
                  } catch {}
                }
                if (st === window.YT.PlayerState.PAUSED) setPlaying(false);
                if (st === window.YT.PlayerState.ENDED) handleNext();
              }
            }
          });
        }
      } catch (err) { console.error('YT API load failed', err); }
    })();
    return () => { mounted = false; };
  }, [containerRef.current]);

  useEffect(() => {
    const tick = setInterval(() => {
      try {
        if (useAudioEngine && audioRef.current) {
          const t = Math.floor(audioRef.current.currentTime || 0);
          const d = Math.floor(audioRef.current.duration || queue[index]?.duration || 0);
          setTime(t); setDuration(d);
          maybeSkipSponsor(t, true);
        } else if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          const t = Math.floor(playerRef.current.getCurrentTime() || 0);
          const d = Math.floor(playerRef.current.getDuration() || queue[index]?.duration || 0);
          setTime(t); setDuration(d);
          maybeSkipSponsor(t, false);
        }
      } catch(e){}
    }, 500);
    return () => clearInterval(tick);
  }, [useAudioEngine, index]);

  useEffect(() => {
    try { if (audioRef.current) audioRef.current.volume = volume; } catch(e){}
    try { if (playerRef.current && playerRef.current.setVolume) playerRef.current.setVolume(Math.round(volume * 100)); } catch(e){}
  }, [volume]);

  useEffect(() => {
    const t = queue[index];
    if (!t) return;
    const videoId = t.id;
    
    if (currentVideoIdRef.current === videoId) return;
    currentVideoIdRef.current = videoId;

    const useServerFlag = localStorage.getItem('hitori_use_server_stream') === 'true';
    setUseAudioEngine(false); 

    (async () => {
      const loadViaYT = () => {
        if (playerRef.current && videoId) {
          try {
            if (playerRef.current.loadVideoById) playerRef.current.loadVideoById({ videoId, startSeconds: 0 });
            else if (playerRef.current.cueVideoById) playerRef.current.cueVideoById(videoId, 0);
          } catch(e){ console.warn('YT load failed', e); }
        }
      };

      if (useServerFlag && videoId) {
        try {
          const url = `/api/stream?videoId=${encodeURIComponent(videoId)}`;
          const res = await fetch(url, { method: 'HEAD' });
          if (res.ok) {
            setUseAudioEngine(true);
            const a = audioRef.current;
            if (!a) return loadViaYT();
            a.src = url;
            a.currentTime = 0;
            await a.play().catch(()=>{});
            fetchSponsorBlockSegments(videoId);
            try { localStorage.setItem('lastPlay', JSON.stringify({ title: t.title, artist: t.artist, album: t.album ?? null, cover: t.cover, id: t.id, queue })); } catch(e){}
            return;
          }
        } catch(e){}
      }

      loadViaYT();
      fetchSponsorBlockSegments(videoId);
      try { localStorage.setItem('lastPlay', JSON.stringify({ title: t.title, artist: t.artist, album: t.album ?? null, cover: t.cover, id: t.id, queue })); } catch(e){}
    })();
  }, [index, queue]);

  async function fetchSponsorBlockSegments(videoId) {
    skipSegmentsRef.current = [];
    if (!videoId) return;
    const skipEnabled = localStorage.getItem('hitori_skip_sponsor') !== 'false';
    if (!skipEnabled) return;
    try {
      const url = `${SPONSORBLOCK_API}?videoID=${encodeURIComponent(videoId)}&categories=${encodeURIComponent(JSON.stringify(["sponsor","selfpromo","preview","outro"]))}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const segs = (Array.isArray(json) ? json : []).map(s => {
        const seg = s.segment || s.segmentTime || s.segments || s;
        if (Array.isArray(seg)) return { start: Math.floor(seg[0]), end: Math.floor(seg[1]), category: s.category || 'sponsor' };
        return null;
      }).filter(Boolean);
      skipSegmentsRef.current = segs;
    } catch (e) {}
  }

  function maybeSkipSponsor(currentTime, usingAudio) {
    const skipEnabled = localStorage.getItem('hitori_skip_sponsor') !== 'false';
    if (!skipEnabled || skippingRef.current) return;
    const segs = skipSegmentsRef.current;
    if (!segs || segs.length === 0) return;
    for (const s of segs) {
      if (currentTime >= s.start && currentTime < s.end) {
        skippingRef.current = true;
        const seekTo = Math.min(Math.floor(s.end + 0.5), s.end + 2);
        if (usingAudio && audioRef.current) audioRef.current.currentTime = seekTo;
        else if (playerRef.current && playerRef.current.seekTo) playerRef.current.seekTo(seekTo, true);
        setTimeout(() => { skippingRef.current = false; }, 700);
        break;
      }
    }
  }

  const play = () => {
    if (useAudioEngine && audioRef.current) { audioRef.current.play().catch(()=>{}); setPlaying(true); return; }
    try { playerRef.current?.playVideo(); } catch(e){}
  };
  const pause = () => {
    if (useAudioEngine && audioRef.current) { audioRef.current.pause(); setPlaying(false); return; }
    try { playerRef.current?.pauseVideo(); } catch(e){}
  };
  const toggle = () => (playing ? pause() : play());
  const handleNext = () => setIndexState(i => (i + 1) % Math.max(1, queue.length));
  const handlePrev = () => setIndexState(i => (i - 1 + queue.length) % Math.max(1, queue.length));
  
  const seek = (s) => {
    const val = Number(s) || 0;
    if (useAudioEngine && audioRef.current) { audioRef.current.currentTime = val; setTime(Math.floor(val)); return; }
    try { playerRef.current?.seekTo(val, true); } catch(e){}
  };

  const enqueue = (track, goNext=false) => {
    if (!track) return;
    const t = normalizeTrack(track);
    goNext ? setQueueState(q => {
        const n = [...q];
        n.splice(index + 1, 0, t);
        return n;
    }) : setQueueState(q => [...q, t]);
  };

  const setQueue = (newQueue, startIndex = 0, autoplay = true) => {
    const normalized = Array.isArray(newQueue) ? newQueue.map(normalizeTrack) : [];
    setQueueState(normalized);
    setIndexState(startIndex);
    if (autoplay) setTimeout(() => play(), 100);
  };

  const setIndex = (i, autoplay = true) => {
    setIndexState(i);
    setTimeout(() => { if (autoplay) play(); }, 100);
  };

  const setPlayerVolume = (v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
  };

  const value = {
    queue, setQueue, enqueue, index, setIndex,
    track: queue[index] || null,
    playing, play, pause, toggle, next: handleNext, prev: handlePrev,
    time, seek, duration, volume, setVolume: setPlayerVolume
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
