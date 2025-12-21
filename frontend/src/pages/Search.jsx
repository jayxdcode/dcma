// src/pages/Search.jsx
import React, { useEffect, useRef, useState } from 'react';
import {
  TextField,
  Button,
  Box,
  Typography,
  IconButton,
  InputAdornment,
  ToggleButtonGroup,
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
  Pause as PauseIcon,
  GraphicEq as GraphicEqIcon,
} from '@mui/icons-material';
import { usePlayer } from '../lib/playerContext';

// ---------- Session storage key ----------
const SS_KEY = 'search:last:v1';

// ---------- Small helpers ----------
function safeJoin(base, path) {
  if (!base) return String(path || '');
  if (!path) return String(base || '');
  const a = String(base).replace(/\/+$/g, '');
  const b = String(path).replace(/^\/+/g, '');
  return `${a}/${b}`;
}

function buildUrl(base, path, params = {}) {
  const url = safeJoin(base, path);
  const sp = new URLSearchParams();
  for (const k of Object.keys(params || {})) {
    const v = params[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const x of v) sp.append(k, x);
    } else sp.append(k, String(v));
  }
  return sp.toString() ? `${url}?${sp.toString()}` : url;
}

// id extractor (PIPED / YT)
const getYTId = (url) => {
  if (!url) return null;
  const s = String(url);
  const match = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || s.match(/\/([A-Za-z0-9_-]{11})(?:$|[?#])/);
  return match ? match[1] : null;
};

// map piped item to our track shape
function mapSearchItemToTrack(item) {
  return {
    id:
      item.videoId ||
      item.id ||
      getYTId(item.url) ||
      item.video_id ||
      item.trackId ||
      item.resultId ||
      item.uid ||
      Math.random().toString(36).slice(2),
    title: item.title || item.name || item.videoTitle || item.resultTitle || 'Unknown',
    artist:
      item.artist || (item.authors && item.authors.join(', ')) || item.uploaderName || item.channelName || '',
    cover:
      item.thumbnail ||
      (item.thumbnails && item.thumbnails[0] && item.thumbnails[0].url) ||
      'https://placecats.com/300/300',
    duration: item.durationSeconds || item.duration || 0,
    source: item.videoId || item.id || getYTId(item.url) || item.video_id || item.trackId || '',
    relevance: item.relevance || item.score || 0,
    raw: item,
  };
}

// ---------- component ----------
export default function SearchPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]); // mapped results (tracks)
  const [rawResults, setRawResults] = useState(null); // original raw response for session storage
  const [loading, setLoading] = useState(false);

  // suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestVisible, setSuggestVisible] = useState(false);

  // filters & sort
  const filterOptions = ['all', 'music_songs', 'channels', 'albums', 'playlists'];
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('relevance'); // 'relevance' | 'views' | 'duration'

  // menu for three-dot
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuTarget, setMenuTarget] = useState(null);

  // piped api base (discovered at runtime)
  const [pipedApiBase, setPipedApiBase] = useState(null);

  const player = usePlayer();
  const [playingId, setPlayingId] = useState(null);

  // focus ref for input (to keep suggestion visibility accurate)
  const inputRef = useRef(null);
  const suggestTimer = useRef(null);

  // ---------- discover piped instance on mount ----------
  useEffect(() => {
    let mounted = true;
    fetch('/api/piped/instances')
      .then((r) => r.json())
      .then((d) => {
        if (!mounted) return;
        if (Array.isArray(d) && d.length) {
          // choose first healthy instance; your backend may want to pick differently
          const apiUrl = d[0].api_url || d[0].apiUrl || d[0].api_url_v1 || d[0].api;
          // We expect the proxy mapping to handle /piped -> actual instance, but expose actual api url for direct calls
          setPipedApiBase(apiUrl ? apiUrl.replace(/\/+$/g, '') : '/piped');
          console.log(`[PIPED] using ${d[0].name} (${apiUrl})`);
        } else {
          setPipedApiBase('/piped');
        }
      })
      .catch((e) => {
        console.warn('failed to find piped instances, falling back to /piped proxy', e);
        setPipedApiBase('/piped');
      });
    return () => { mounted = false; };
  }, []);

  // ---------- piped helper (uses pipedApiBase) ----------
  const piped = {
    build(path, params) {
      const base = pipedApiBase || '/piped';
      // many instances expect /api so allow path to start with 'api/' or not
      return buildUrl(base, path, params);
    },
    async search(q, opts = {}) {
      if (!q) return null;
      try {
        const url = this.build('search', { q, filter: opts.filter ?? 'all', limit: opts.limit });
        const r = await fetch(url);
        if (!r.ok) throw new Error(`status ${r.status}`);
        return await r.json();
      } catch (e) {
        console.error('[piped.search]', e);
        return null;
      }
    },
    async suggestions(q, opts = {}) {
      if (!q) return [];
      try {
        const url = this.build('suggestions', { query: q, music: true, limit: opts.limit || 10 });
        const r = await fetch(url);
        if (!r.ok) throw new Error(`status ${r.status}`);
        return await r.json();
      } catch (e) {
        console.error('[piped.suggestions]', e);
        return [];
      }
    },
    // minimal related fallback: call /related or /video or fallback to /search
    async related(videoId, rawItem = null) {
      // try endpoints in prioritized order
      const enc = encodeURIComponent;
      const attempts = [
        () => fetch(this.build(safeJoin('related', enc(videoId)))),
        () => fetch(this.build(safeJoin('video', enc(videoId)))),
        () => fetch(this.build(safeJoin('videos', enc(videoId)))),
      ];
      for (const fn of attempts) {
        try {
          const r = await fn();
          if (!r.ok) continue;
          const json = await r.json();
          // various shapes: top-level array, json.items, json.related...
          if (Array.isArray(json)) return json;
          if (Array.isArray(json?.items)) return json.items;
          if (Array.isArray(json?.related) || Array.isArray(json?.relatedVideos) || Array.isArray(json?.relatedStreams)) {
            return json.related || json.relatedVideos || json.relatedStreams;
          }
        } catch (e) {
          // continue to fallback
        }
      }
      // fallback: search by title/uploader
      let seed = rawItem?.title || rawItem?.name || null;
      let uploader = rawItem?.uploader || rawItem?.channel || null;
      if (!seed) {
        // quick attempt to find title by querying id
        try {
          const r = await fetch(this.build('search', { q: videoId, limit: 1 }));
          if (r.ok) {
            const j = await r.json();
            const candidate = (Array.isArray(j) ? j[0] : (j?.items?.[0] || null));
            if (candidate) {
              seed = seed || candidate.title || candidate.name;
              uploader = uploader || candidate.uploader || candidate.channel;
            }
          }
        } catch (e) { /* ignore */ }
      }
      const q = seed ? `${seed} ${uploader || ''}`.trim() : String(videoId);
      try {
        const r2 = await fetch(this.build('search', { q, filter: 'all', limit: 25 }));
        if (r2.ok) {
          const j2 = await r2.json();
          // return array if possible
          if (Array.isArray(j2)) return j2;
          if (Array.isArray(j2?.items)) return j2.items;
          if (Array.isArray(j2?.results)) return j2.results;
        }
      } catch (e) { /* ignore */ }

      // final fallback to trending
      try {
        const rt = await fetch(this.build('trending', { limit: 25 }));
        if (rt.ok) {
          const jt = await rt.json();
          if (Array.isArray(jt)) return jt;
          if (Array.isArray(jt?.items)) return jt.items;
        }
      } catch (e) { /* ignore */ }

      return [];
    }
  };

  // ---------- Load last search from sessionStorage on mount ----------
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.query) setQ(parsed.query);
        if (parsed?.rawResults) {
          setRawResults(parsed.rawResults);
          const mapped = (parsed.rawResults.items || parsed.rawResults || []).map(mapSearchItemToTrack);
          setResults(mapped);
        }
        if (parsed?.filter) setFilter(parsed.filter);
        if (parsed?.sortBy) setSortBy(parsed.sortBy);
      }
    } catch (e) {
      // ignore parse errors
    }
  }, []);

  // ---------- player subscription ----------
  useEffect(() => {
    if (!player) return;
    // try sync current
    if (typeof player.getCurrent === 'function') {
      try {
        const cur = player.getCurrent();
        if (cur?.id) setPlayingId(cur.id);
      } catch (e) {}
    }
    // subscribe if possible
    if (player.on && typeof player.on === 'function') {
      const cb = (cur) => setPlayingId(cur?.id || null);
      player.on('currentChanged', cb);
      return () => { if (player.off) player.off('currentChanged', cb); };
    }
    // fallback polling
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

  // ---------- suggestions logic (debounced) ----------
  useEffect(() => {
    if (!q) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }
    setSuggestLoading(true);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(async () => {
      if (!pipedApiBase) {
        setSuggestions([]);
        setSuggestLoading(false);
        return;
      }
      try {
        const s = await piped.suggestions(q, { limit: 8 });
        // normalize to strings when objects present
        const normalized = Array.isArray(s) ? s.map(x => (typeof x === 'string' ? x : (x.text || x.query || JSON.stringify(x)))) : [];
        setSuggestions(normalized);
      } catch (err) {
        console.warn('suggest fetch failed', err);
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 250);
    return () => clearTimeout(suggestTimer.current);
  }, [q, pipedApiBase]);

  // ---------- helper: perform the actual search ----------
  async function doSearch(e, typedQuery) {
    if (e && e.preventDefault) e.preventDefault();
    const query = typeof typedQuery === 'string' ? typedQuery : q;
    if (!query || !pipedApiBase) return;
    setLoading(true);
    setResults([]);
    setRawResults(null);
    try {
      const raw = await piped.search(query, { limit: 50, filter });
      // raw may be array or object - try items then fallback to array
      const items = (raw?.items || raw || []);
      const mapped = (Array.isArray(items) ? items : []).map(mapSearchItemToTrack);

      // Save raw and context to session storage to avoid re-query on filter change
      const saved = { query, rawResults: raw, timestamp: Date.now(), filter, sortBy };
      try { sessionStorage.setItem(SS_KEY, JSON.stringify(saved)); } catch (e) { /* ignore */ }

      setRawResults(raw);
      setResults(mapped);
    } catch (err) {
      console.error('piped search failed', err);
      setResults([]);
      setRawResults(null);
    } finally {
      setLoading(false);
    }
  }

  // ---------- Filter locally without re-query ----------
  useEffect(() => {
    // if we have rawResults, filter them locally
    if (!rawResults) return;
    const items = (rawResults?.items || rawResults || []);
    let arr = Array.isArray(items) ? items.map(mapSearchItemToTrack) : [];
    // apply filter heuristics (simple)
    if (filter && filter !== 'all') {
      if (filter === 'music_songs') {
        arr = arr.filter(it => /music|song|audio|official/i.test((it.title + ' ' + it.artist) || ''));
      } else if (filter === 'channels') {
        arr = arr.filter(it => !it.duration || it.duration === 0); // simple heuristic: channels often have no duration
      } else if (filter === 'albums') {
        arr = arr.filter(it => /album|ep|deluxe/i.test(it.title));
      } else if (filter === 'playlists') {
        arr = arr.filter(it => /playlist/i.test(it.raw?.type || it.raw?.resultType || ''));
      }
    }
    // apply sort
    if (sortBy === 'views') {
      arr.sort((a, b) => (b.raw?.views || b.views || 0) - (a.raw?.views || a.views || 0));
    } else if (sortBy === 'duration') {
      arr.sort((a, b) => (a.duration || 0) - (b.duration || 0));
    } else {
      // relevance default
      arr.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    }
    setResults(arr);
    // persist filter and sort in session storage
    try {
      const cur = JSON.parse(sessionStorage.getItem(SS_KEY) || '{}');
      const merged = { ...cur, filter, sortBy };
      sessionStorage.setItem(SS_KEY, JSON.stringify(merged));
    } catch (e) {}
  }, [filter, sortBy, rawResults]);

  // ---------- Play handlers ----------
  function playFromCover(item) {
    const t = mapSearchItemToTrack(item);
    if (player && typeof player.playTrack === 'function') {
      player.playTrack(t, { openPlayer: false });
    } else if (player && typeof player.setQueue === 'function') {
      player.setQueue([t], 0, true);
    }
    setPlayingId(t.id);
  }

  function playAndOpenPlayer(item) {
    const t = mapSearchItemToTrack(item);
    if (player && typeof player.playTrack === 'function') {
      player.playTrack(t, { openPlayer: true });
    } else if (player && typeof player.setQueue === 'function') {
      player.setQueue([t], 0, true);
      if (player.openFull && typeof player.openFull === 'function') player.openFull(true);
    }
    setPlayingId(t.id);
  }

  function enqueue(item, nextUp = false) {
    const t = mapSearchItemToTrack(item);
    if (player && typeof player.enqueue === 'function') player.enqueue(t, nextUp);
  }

  // ---------- menu ----------
  function openMenu(e, item) { setMenuAnchor(e.currentTarget); setMenuTarget(item); }
  function closeMenu() { setMenuAnchor(null); setMenuTarget(null); }
  async function handleMenuAddToQueue() { if (menuTarget) { enqueue(menuTarget, false); closeMenu(); } }
  async function handleMenuAddNext() { if (menuTarget) { enqueue(menuTarget, true); closeMenu(); } }
  async function handleMenuOpenInPlayer() { if (menuTarget) { playAndOpenPlayer(menuTarget); closeMenu(); } }

  // ---------- UI logic for suggestions visibility & click stability ----------
  function onInputFocus() {
    setSuggestVisible(true);
  }
  function onInputBlur() {
    // small delay to allow clicks on suggestion items (mousedown handled below)
    setTimeout(() => setSuggestVisible(false), 150);
  }

  // ---------- sort control handler ----------
  function handleSortChange(e) {
    setSortBy(e.target.value || 'relevance');
  }

  // ---------- Render ----------
  const topResult = results && results.length > 0 ? results[0] : null;
  const otherResults = results && results.length > 1 ? results.slice(1) : [];

  return (
    <Box sx={{ maxWidth: '100%', padding: 2, color: 'var(--text, white)', position: 'relative' }}>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 3, letterSpacing: '-0.5px' }}>
        Search
      </Typography>

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
              <InputAdornment position="start" sx={{ alignItems: 'center', mr: 1, display: 'flex', height: '100%' }}>
                <SearchIcon sx={{ color: 'var(--text, #888)', fontSize: 20, verticalAlign: 'middle', lineHeight: 1 }} />
              </InputAdornment>
            ),
            sx: {
              display: 'flex',
              alignItems: 'center',
            },
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

      {/* Sort control - right aligned below the search bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        {/* inline "text" filters */}
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
                onClick={() => setFilter(opt.key)}
                sx={{
                  cursor: 'pointer',
                  opacity: selected ? 1 : 0.7,
                  fontWeight: selected ? 700 : 500,
                  paddingX: 1,
                  paddingY: 0.25,
                  borderRadius: 1,
                  '&:hover': { opacity: 1 },
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

      {/* Suggestions - floating */}
      {suggestVisible && suggestions.length > 0 && (
        <Paper sx={{
          position: 'absolute',
          zIndex: 60,
          top: 94, // adjust according to layout
          left: 16,
          maxWidth: 420,
          width: 'min(60vw, 420px)',
          boxShadow: 6,
          overflow: 'hidden'
        }}>
          <List dense>
            {suggestLoading ? (
              <ListItem><Typography>Loading suggestions...</Typography></ListItem>
            ) : suggestions.map((s, idx) => (
              <ListItem
                key={idx}
                button
                onMouseDown={(ev) => {  // use onMouseDown to capture clicks before blur
                  ev.preventDefault();
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

      {/* RESULTS */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
        {/* Top Result */}
        {topResult && (
          <Box
            className="top-result"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: 1,
              borderRadius: 1,
              border: '1px solid rgba(255,255,255,0.04)'
            }}
          >
            <Box
              onClick={() => playFromCover(topResult)}
              sx={{
                width: 84,
                height: 84,
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
                {playingId === topResult.id ? <GraphicEqIcon /> : <PlayArrow />}
              </IconButton>
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body1" sx={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {topResult.title}
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--subtext, #aaa)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {topResult.artist}
              </Typography>
            </Box>

            <Box>
              <IconButton onClick={(e) => openMenu(e, topResult)} size="small" sx={{ color: 'var(--text, white)' }}>
                <MoreVert />
              </IconButton>
            </Box>
          </Box>
        )}

        {/* Other results */}
        {otherResults.map((t, i) => {
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
                  {isPlaying ? <GraphicEqIcon /> : <PlayArrow />}
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

        {results.length === 0 && !loading && (
          <Box sx={{ textAlign: 'center', mt: 4, opacity: 0.6 }}>
            <Typography variant="body2">No results yet. Try searching for an artist.</Typography>
          </Box>
        )}
      </Box>

      {/* Three-dot menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem onClick={handleMenuAddToQueue}>Add to queue</MenuItem>
        <MenuItem onClick={handleMenuAddNext}>Add next</MenuItem>
        <MenuItem onClick={handleMenuOpenInPlayer}>Open in player</MenuItem>
      </Menu>
    </Box>
  );
}