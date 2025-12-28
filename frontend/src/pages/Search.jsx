// src/pages/Search.jsx
import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import {
  TextField,
  Button,
  Box,
  Typography,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  CircularProgress,
  List,
  ListItem,
  Paper,
  Select,
  FormControl,
  MenuItem as SelectItem,
} from '@mui/material';
import {
  Search as SearchIcon,
  PlayArrow,
  MoreVert,
  Image as ImageIcon,
  GraphicEq as GraphicEqIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { usePlayer } from '../lib/playerContext';
import { search as pipedSearch, suggestions as pipedSuggestions } from '../lib/piped-api.js';

const SS_KEY = 'search:last:v1';

const getYTId = (url) => {
  if (!url) return null;
  const s = String(url);
  const m = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || s.match(/\/([A-Za-z0-9_-]{11})(?:$|[?#])/);
  return m ? m[1] : null;
};

function bucketForFilter(filter, buckets) {
  if (!buckets) return [];
  const b = buckets;
  const flatten = (arrOrMaybe) => {
    if (!arrOrMaybe) return [];
    if (Array.isArray(arrOrMaybe)) return arrOrMaybe;
    if (Array.isArray(arrOrMaybe.items)) return arrOrMaybe.items;
    if (Array.isArray(arrOrMaybe.results)) return arrOrMaybe.results;
    return [];
  };

  if (filter === 'all') {
    if (Array.isArray(b.music_all)) return flatten(b.music_all);
    const merged = [];
    for (const k of Object.keys(b)) {
      if (k.startsWith('music_') && Array.isArray(b[k])) merged.push(...b[k]);
    }
    if (merged.length) return merged;
    for (const k of ['items', 'results', 'videos', 'contents']) {
      if (Array.isArray(b[k])) return flatten(b[k]);
    }
    return [];
  }

  if (filter === 'music_songs' || filter === 'songs') {
    const a = flatten(b.music_songs);
    if (a.length) return a;
    const b2 = flatten(b.music_videos);
    if (b2.length) return b2;
    return flatten(b.music_all);
  }
  if (filter === 'music_artists') {
    const a = flatten(b.music_artists);
    if (a.length) return a;
    return flatten(b.channels) || [];
  }
  if (filter === 'music_albums') {
    const a = flatten(b.music_albums);
    if (a.length) return a;
    return flatten(b.albums) || [];
  }
  if (filter === 'music_playlists') {
    const a = flatten(b.music_playlists);
    if (a.length) return a;
    return flatten(b.playlists) || [];
  }

  if (Array.isArray(b.music_all)) return flatten(b.music_all);
  return flatten(b.items || b.results || b.videos || b.contents || []);
}

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [buckets, setBuckets] = useState(null);
  const [loading, setLoading] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [suggestVisible, setSuggestVisible] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('relevance');

  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuTarget, setMenuTarget] = useState(null);

  const player = usePlayer();
  const [playingId, setPlayingId] = useState(null);

  const inputRef = useRef(null);
  const suggestTimer = useRef(null);
  const latestSuggestReq = useRef(0);
  const mounted = useRef(true);

  const [suggestPos, setSuggestPos] = useState({ top: 0, left: 0, width: 360 });

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // restore session
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.query) setQ(parsed.query);
      if (parsed?.buckets) {
        setBuckets(parsed.buckets);
        const bucketItems = bucketForFilter(parsed.filter || filter, parsed.buckets);
        const mapped = Array.isArray(bucketItems) ? bucketItems : [];
        setResults(mapped);
      }
      if (parsed?.filter) setFilter(parsed.filter);
      if (parsed?.sortBy) setSortBy(parsed.sortBy);
    } catch (e) { /* ignore */ }
  }, []);

  // player sync
  useEffect(() => {
    if (!player) return;
    if (typeof player.getCurrent === 'function') {
      try {
        const cur = player.getCurrent();
        if (cur?.id) setPlayingId(cur.id);
      } catch (e) {}
    }
    if (player.on && typeof player.on === 'function') {
      const cb = (cur) => setPlayingId(cur?.id || null);
      player.on('currentChanged', cb);
      return () => { if (player.off) player.off('currentChanged', cb); };
    }
    if (!player.on && typeof player.getCurrent === 'function') {
      const id = setInterval(() => {
        try {
          const c = player.getCurrent();
          setPlayingId(c?.id || null);
        } catch (e) {}
      }, 2000);
      return () => clearInterval(id);
    }
  }, [player]);

  // Suggestions debounce + cancel stale responses
  useEffect(() => {
    // don't show suggestions for empty or very short queries
    if (!q || q.trim().length < 2) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }

    setSuggestLoading(true);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);

    const reqId = ++latestSuggestReq.current;
    suggestTimer.current = setTimeout(async () => {
      try {
        const s = await pipedSuggestions(q, { limit: 8 });
        // check stale
        if (reqId !== latestSuggestReq.current) return;
        const normalized = Array.isArray(s) ? s.map(x => (typeof x === 'string' ? x : (x.text || x.query || JSON.stringify(x)))) : [];
        if (mounted.current) setSuggestions(normalized);
      } catch (err) {
        console.warn('suggest fetch failed', err);
        if (reqId === latestSuggestReq.current && mounted.current) setSuggestions([]);
      } finally {
        if (reqId === latestSuggestReq.current && mounted.current) setSuggestLoading(false);
      }
    }, 300); // debounce 300ms

    return () => clearTimeout(suggestTimer.current);
  }, [q]);

  // compute suggestion position under input to avoid covering the input
  useLayoutEffect(() => {
    function updatePos() {
      const el = inputRef.current;
      if (!el) return;
      const root = el.getBoundingClientRect();
      const width = Math.min(Math.max(root.width, 240), 720);
      setSuggestPos({
        top: root.bottom + window.scrollY + 8,
        left: root.left + window.scrollX,
        width,
      });
    }
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, { passive: true });
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos);
    };
  }, [inputRef, suggestVisible]);

  // search
  async function doSearch(e, typedQuery) {
    if (e && e.preventDefault) e.preventDefault();
    const query = typeof typedQuery === 'string' ? typedQuery : q;
    if (!query) return;
    setLoading(true);
    setResults([]);
    setBuckets(null);
    try {
      const b = await pipedSearch(query, { limit: 50, filter });
      if (!b) {
        setBuckets(null);
        setResults([]);
        return;
      }
      setBuckets(b);
      const rawBucketItems = bucketForFilter(filter, b);
      const mapped = Array.isArray(rawBucketItems) ? rawBucketItems : [];
      const sorted = applySort(mapped, sortBy);
      setResults(sorted);

      const save = { query, buckets: b, timestamp: Date.now(), filter, sortBy };
      try { sessionStorage.setItem(SS_KEY, JSON.stringify(save)); } catch (e) {}
    } catch (err) {
      console.error('piped search failed', err);
      setBuckets(null);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function applySort(arr, sortKey) {
    if (!Array.isArray(arr)) return arr;
    const copy = [...arr];
    if (sortKey === 'views') {
      copy.sort((a, b) => (b.raw?.views || b.views || 0) - (a.raw?.views || a.views || 0));
    } else if (sortKey === 'duration') {
      copy.sort((a, b) => (a.duration || 0) - (b.duration || 0));
    } else {
      copy.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    }
    return copy;
  }

  useEffect(() => {
    if (!buckets) return;
    const rawBucketItems = bucketForFilter(filter, buckets);
    const mapped = Array.isArray(rawBucketItems) ? rawBucketItems : [];
    const sorted = applySort(mapped, sortBy);
    setResults(sorted);
    try {
      const cur = JSON.parse(sessionStorage.getItem(SS_KEY) || '{}');
      const merged = { ...cur, filter, sortBy };
      sessionStorage.setItem(SS_KEY, JSON.stringify(merged));
    } catch (e) {}
  }, [filter, sortBy, buckets]);

  // play + enqueue helpers
  function playFromCover(item) {
    const t = item;
    if (player && typeof player.playTrack === 'function') {
      player.playTrack(t, { openPlayer: false });
    } else if (player && typeof player.setQueue === 'function') {
      player.setQueue([t], 0, true);
    }
    setPlayingId(t.id);
  }

  function playAndOpenPlayer(item) {
    const t = item;
    if (player && typeof player.playTrack === 'function') {
      player.playTrack(t, { openPlayer: true });
    } else if (player && typeof player.setQueue === 'function') {
      player.setQueue([t], 0, true);
      if (player.openFull && typeof player.openFull === 'function') player.openFull(true);
    }
    setPlayingId(t.id);
  }

  function enqueue(item, nextUp = false) {
    const t = item;
    if (player && typeof player.enqueue === 'function') player.enqueue(t, nextUp);
  }

  // menus
  function openMenu(e, item) { setMenuAnchor(e.currentTarget); setMenuTarget(item); }
  function closeMenu() { setMenuAnchor(null); setMenuTarget(null); }
  async function handleMenuAddToQueue() { if (menuTarget) { enqueue(menuTarget, false); closeMenu(); } }
  async function handleMenuAddNext() { if (menuTarget) { enqueue(menuTarget, true); closeMenu(); } }
  async function handleMenuOpenInPlayer() { if (menuTarget) { playAndOpenPlayer(menuTarget); closeMenu(); } }

  // suggestions focus handling
  function onInputFocus() { setSuggestVisible(true); }
  function onInputBlur() { setTimeout(() => setSuggestVisible(false), 150); }

  function handleSortChange(e) { setSortBy(e.target.value || 'relevance'); }

  // clear input helper
  function clearInput() {
    setQ('');
    setSuggestions([]);
    setSuggestVisible(false);
    inputRef.current?.focus();
  }

  // improved filter click: load from sessionStorage if no buckets present
  function onFilterClick(key) {
    if (!buckets) {
      try {
        const raw = sessionStorage.getItem(SS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.buckets) {
            setBuckets(parsed.buckets);
            const items = bucketForFilter(key, parsed.buckets);
            setResults(Array.isArray(items) ? items : []);
            setFilter(key);
            return;
          }
        }
      } catch (e) { /* ignore */ }
    }
    setFilter(key);
  }

  const topResult = results && results.length > 0 ? results[0] : null;
  const otherResults = results && results.length > 1 ? results.slice(1) : [];

  return (
    <Box sx={{ maxWidth: '100%', padding: 2, color: 'var(--text, white)', position: 'relative' }}>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 3, letterSpacing: '-0.5px' }}>Search</Typography>

      <form onSubmit={(e) => doSearch(e)} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <TextField
          inputRef={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          variant="filled"
          placeholder="What do you want to listen to?"
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch(e); }}
          InputProps={{
            disableUnderline: true,
            startAdornment: (
              <InputAdornment position="start" sx={{ alignItems: 'center', mr: 1, marginTop: '0 !important', display: 'flex', height: '100%' }}>
                <SearchIcon sx={{ color: 'var(--text, #888)', fontSize: 20, verticalAlign: 'middle', lineHeight: 1 }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end" sx={{ display: 'flex', alignItems: 'center' }}>
                {suggestLoading ? <CircularProgress size={18} /> : null}
                {q ? (
                  <IconButton aria-label="clear" size="small" onClick={clearInput} sx={{ ml: 1 }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                ) : null}
              </InputAdornment>
            ),
            sx: { display: 'flex', alignItems: 'center' },
          }}
          sx={{
            flex: 1,
            '& .MuiFilledInput-root': {
              borderRadius: '12px',
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.06)',
              transition: 'all 0.12s',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' },
              '&.Mui-focused': { backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--accent, #fff)' },
              '& input': { paddingTop: '10px', paddingBottom: '10px', color: 'var(--text, white)' }
            }
          }}
        />

        <Button
          type="submit"
          variant="contained"
          disabled={loading}
          sx={{
            borderRadius: '10px',
            paddingX: 3,
            fontWeight: 700,
            textTransform: 'none',
            background: 'linear-gradient(90deg, var(--accent, #1db954), var(--accent-2, #1ed760))',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          {loading ? <CircularProgress size={18} /> : 'Search'}
        </Button>
      </form>

      {/* filters + sort */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', fontSize: 14 }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'music_songs', label: 'Songs' },
            { key: 'channels', label: 'Artist' },
            { key: 'albums', label: 'Album' },
            { key: 'playlists', label: 'Playlist' },
          ].map(opt => {
            const selected = filter === opt.key;
            return (
              <Box
                key={opt.key}
                onClick={() => onFilterClick(opt.key)}
                sx={{
                  cursor: 'pointer',
                  opacity: selected ? 1 : 0.7,
                  fontWeight: selected ? 700 : 500,
                  paddingX: 1,
                  paddingY: 0.25,
                  borderRadius: 1,
                  '&:hover': { opacity: 1 },
                  borderBottom: selected ? '2px solid var(--accent-2, #1ed760)' : '2px solid transparent'
                }}
              >
                {opt.label}
              </Box>
            );
          })}
        </Box>

        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography sx={{ opacity: 0.8, fontSize: 13 }}>Sort:</Typography>
          <FormControl size="small" variant="filled" sx={{ minWidth: 140 }}>
            <Select value={sortBy} onChange={handleSortChange} sx={{ borderRadius: '8px', '& .MuiFilledInput-input': { py: '8px' } }}>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="views">Views</SelectItem>
              <SelectItem value="duration">Duration</SelectItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* floating suggestions (positioned under input so it doesn't cover it) */}
      {suggestVisible && suggestions.length > 0 && (
        <Paper sx={{
          position: 'absolute',
          zIndex: 60,
          top: suggestPos.top,
          left: suggestPos.left,
          width: suggestPos.width,
          maxWidth: 'calc(100% - 32px)',
          height: 'min(25vh, 300px)',
          boxShadow: 6,
          overflow: 'hidden'
        }}>
          <List dense>
            {suggestions.map((s, idx) => (
              <ListItem
                key={idx}
                button
                onMouseDown={(ev) => {
                  ev.preventDefault(); // keep focus
                  setQ(s);
                  doSearch(null, s);
                  setSuggestVisible(false);
                }}
              >
                <Typography variant="body2" sx={{ width: '100%' }}>{s}</Typography>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* results */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1, minHeight: 160 }}>
        {/* spinner when searching */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 220 }}>
            <CircularProgress />
          </Box>
        )}

        {/* Top result card */}
        {!loading && topResult && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ color: 'var(--subtext,#bbb)', fontWeight: 700 }}>Top result</Typography>
            <Box
              className="top-result"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                padding: 2,
                borderRadius: 2,
                backgroundColor: 'var(--surface-2, rgba(255,255,255,0.02))',
                border: '1px solid rgba(255,255,255,0.04)'
              }}
            >
              <Box
                onClick={() => playFromCover(topResult)}
                sx={{
                  width: 120,
                  height: 120,
                  borderRadius: 1,
                  overflow: 'hidden',
                  flexShrink: 0,
                  position: 'relative',
                  cursor: 'pointer',
                  '&:hover .play-overlay': { opacity: 1, transform: 'scale(1)' }
                }}
              >
                <img src={topResult.cover} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <IconButton
                  className="play-overlay"
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    transition: 'all 0.12s',
                    opacity: 0.95,
                    background: 'rgba(0,0,0,0.45)',
                    color: 'var(--accent, #1db954)'
                  }}
                  onClick={(e) => { e.stopPropagation(); playFromCover(topResult); }}
                >
                  {playingId === topResult.id ? <AnimatedEq sx={{ fontSize: 26 }} /> : <PlayArrow />}
                </IconButton>
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {topResult.title}
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--subtext, #aaa)', mt: 0.5 }}>
                  {topResult.artist}
                </Typography>
                {topResult.album ? (
                  <Typography variant="caption" sx={{ color: 'var(--subtext, #999)', mt: 0.5 }}>
                    {topResult.album}
                  </Typography>
                ) : null}
                <Box sx={{ mt: 1, display: 'flex', gap: 2, alignItems: 'center' }}>
                  {topResult.duration ? <Typography variant="caption" sx={{ color: 'var(--subtext,#999)' }}>{formatDuration(topResult.duration)}</Typography> : null}
                  {topResult.views ? <Typography variant="caption" sx={{ color: 'var(--subtext,#999)' }}>{prettyViews(topResult.views)}</Typography> : null}
                </Box>
              </Box>

              <Box>
                <IconButton onClick={(e) => openMenu(e, topResult)} size="small" sx={{ color: 'var(--text, white)' }}>
                  <MoreVert />
                </IconButton>
              </Box>
            </Box>
          </Box>
        )}

        {/* other results */}
        {!loading && otherResults.map((t, i) => {
          const isPlaying = playingId === t.id;
          return (
            <Box
              key={t.id || i}
              onClick={(e) => {
                if (e.target && e.target.closest && e.target.closest('.menu-button')) return;
                playAndOpenPlayer(t);
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                paddingY: 1,
                paddingX: 0.5,
                borderRadius: 1,
                background: 'transparent',
                borderLeft: isPlaying ? '4px solid var(--accent, #1db954)' : '4px solid transparent',
                transition: 'background-color 0.12s ease, border-left 0.12s',
                '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' }
              }}
            >
              <Box
                onClick={(ev) => { ev.stopPropagation(); playFromCover(t); }}
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: 1,
                  overflow: 'hidden',
                  flexShrink: 0,
                  position: 'relative',
                  cursor: 'pointer',
                  '&:hover .play-overlay': { opacity: 1, transform: 'scale(1)' }
                }}
              >
                {t.cover ? (
                  <img src={t.cover} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Box sx={{ width: '100%', height: '100%', bgcolor: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ImageIcon sx={{ color: '#555' }} />
                  </Box>
                )}

                <IconButton
                  className="play-overlay"
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: isPlaying ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.95)',
                    transition: 'all 120ms',
                    opacity: isPlaying ? 1 : 0,
                    background: 'rgba(0,0,0,0.45)',
                    color: 'var(--accent, #1db954)',
                  }}
                  onClick={(e) => { e.stopPropagation(); playFromCover(t); }}
                >
                  {isPlaying ? <AnimatedEq sx={{ fontSize: 20 }} /> : <PlayArrow />}
                </IconButton>
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body1" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.title}
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--subtext, #aaa)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.artist}
                </Typography>
              </Box>

              <Box>
                <IconButton
                  className="menu-button"
                  onClick={(e) => { e.stopPropagation(); openMenu(e, t); }}
                  size="small"
                  sx={{ color: 'var(--text, white)' }}
                >
                  <MoreVert />
                </IconButton>
              </Box>
            </Box>
          );
        })}

        {!loading && results.length === 0 && (
          <Box sx={{ textAlign: 'center', mt: 4, opacity: 0.6 }}>
            <Typography variant="body2">No results yet. Try searching for an artist.</Typography>
          </Box>
        )}
      </Box>

      {/* three-dot menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem onClick={handleMenuAddToQueue}>Add to queue</MenuItem>
        <MenuItem onClick={handleMenuAddNext}>Add next</MenuItem>
        <MenuItem onClick={handleMenuOpenInPlayer}>Open in player</MenuItem>
      </Menu>
    </Box>
  );
}

// small helpers
function formatDuration(d) {
  if (!d && d !== 0) return null;
  const s = Number(d || 0);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  if (hh) return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}
function prettyViews(v) {
  if (!v && v !== 0) return null;
  const n = Number(v);
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B views`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M views`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K views`;
  return `${n} views`;
}

// Animated equalizer icon component
function AnimatedEq(props) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: props.sx?.fontSize ? `calc(${props.sx.fontSize}px)` : 24,
        height: props.sx?.fontSize ? `calc(${props.sx.fontSize}px)` : 24,
        '& svg': {
          '@keyframes eq': {
            '0%': { transform: 'scaleY(0.6)' },
            '50%': { transform: 'scaleY(1.05)' },
            '100%': { transform: 'scaleY(0.6)' },
          },
          transformOrigin: 'center bottom',
          animation: 'eq 900ms linear infinite',
        }
      }}
    >
      <GraphicEqIcon {...props} />
    </Box>
  );
}
