// src/pages/Search.jsx
import { useEffect, useRef, useState } from 'react';
import {
  TextField,
  Button,
  Box,
  Typography,
  IconButton,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  Menu,
  MenuItem,
  CircularProgress,
  List,
  ListItem,
  Paper,
} from '@mui/material';
import {
  Search as SearchIcon, // renamed so it doesn't clash
  PlayArrow,
  MoreVert,
  Image as ImageIcon,
} from '@mui/icons-material';
import { usePlayer } from '../lib/playerContext';

const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE || '';

// Custon piped.video API interaction
const PIPED_API = await fetch("https://piped-instances.kavin.rocks/")
  .then(r => { return r.json(); } )
  .then(d => {
    const P_URL = d[0]["api_url"];
    console.log(`[PIPED] using ${d[0].name} (${P_URL}) as the API server...`);
    return P_URL;
  })
  .catch(e => { console.error("An error occured while finding available servers:", e.message); });

const piped = {
  search: async(q,opts) => {
    if (!q) return;
    try {
      const response = await fetch(`${PIPED_API}/search?q=${q}&filter=${opts.filter ?? "all"}${opts.limit ? `&limit=${opts.limit}` : ''}`);
  
      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
      }

      return await response.json();
    } catch (e) {
      console.error("[piped.search]", e.message, e);
      return null;
    }
  },

  get_search_suggestions: async(q) => {
    if (!q) return;
    try {
      const response = await fetch(`${PIPED_API}/suggestions?query=${q}`);

      if (!response.ok) {
        throw new Error(`Response status: ${response.status}`);
      }

      return await response.json();

    } catch (e) {
      console.error("[piped.get_search_suggestions]", e.message, e);
      return null;
    }
  }
}

// id extractor (PIPED)
const getYTId = (url) => {
  const match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
};

/* ---------------------------
  Helper: mapping backend/piped api items -> internal track shape
   (adapt if your muse results differ)
---------------------------- */
function mapSearchItemToTrack(item) {
  console.log(item); console.log(item.thumbnail); // debug
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

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // suggestions for live-as-you-type
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  // filter: All | Songs | Artists | Albums | Playlists
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('relevance'); // keeps option if you add UI to change it

  // menu state for three-dot
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuTarget, setMenuTarget] = useState(null);

  const player = usePlayer();

  // currently playing id (we keep in local state and try to subscribe to player's events)
  const [playingId, setPlayingId] = useState(null);

  // If player exposes a subscription API, subscribe to updates.
  useEffect(() => {
    // Best-effort subscription. Adjust according to your player API.
    if (!player) return;
    // if player has current() method
    if (typeof player.getCurrent === 'function') {
      try {
        const cur = player.getCurrent();
        if (cur && cur.id) setPlayingId(cur.id);
      } catch (e) {}
    }
    // sample event API usage (no-op if not present)
    if (player.on && typeof player.on === 'function') {
      const cb = (cur) => {
        if (cur?.id) setPlayingId(cur.id);
        else setPlayingId(null);
      };
      player.on('currentChanged', cb);
      return () => {
        if (player.off) player.off('currentChanged', cb);
      };
    }
    // fallback: poll once every 2s if no event API
    if (!player.on && typeof player.getCurrent === 'function') {
      const id = setInterval(() => {
        try {
          const cur = player.getCurrent();
          setPlayingId(cur?.id || null);
        } catch (e) {}
      }, 2000);
      return () => clearInterval(id);
    }
  }, [player]);

  /* Suggestions Helper */

  async function getSuggestions(input) {
    if (!input) return [];
  
    try {
      const suggestions = await piped.get_search_suggestions(input);
      return suggestions;
    } catch (error) {
      console.error("Search suggestion failed:", error);
      return [];
    }
  }

  /* ---------------------------
    Debounced suggestions as user types
  ---------------------------- */
  const suggestTimer = useRef(null);
  useEffect(() => {
    if (!q) {
      setSuggestions([]);
      return;
    }
    setSuggestLoading(true);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(async () => {
      try {
        setSuggestions(await getSuggestions(q));
      } catch (err) {
        console.warn('suggestion fetch failed, trying fallback', err);
        // fallback: call your backend suggest endpoint (if you have one)
        /*
        try {
          const r = await fetch(`${BACKEND_BASE}/api/suggest?q=${encodeURIComponent(q)}`);
          if (r.ok) {
            const js = await r.json();
            setSuggestions(js.suggestions || js || []);
          } else setSuggestions([]);
        } catch (e) {
          setSuggestions([]);
        }
        */
        setSuggestions([]);  // set to none if failed
      } finally {
        setSuggestLoading(false);
      }
    }, 300); // 300ms debounce
    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
  }, [q, filter]);

  /* ---------------------------
    Main search function (triggered on submit or suggestion click)
  ---------------------------- */
  async function doSearch(e, typedQuery) {
    if (e && e.preventDefault) e.preventDefault();
    const query = typeof typedQuery === 'string' ? typedQuery : q;
    if (!query) return;
    setLoading(true);
    setResults([]);
    try {
      const raw = await piped.search(query, {
        limit: 50,
        filter: filter ?? "all"
      });

      // raw might be an object or array. map carefully.
      const items = (raw?.items || raw || []).map(mapSearchItemToTrack);

      // Sort by relevance if requested
      if (sortBy === 'relevance') {
        items.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
      }

      setResults(items);
    } catch (err) {
      console.error("piped.video api search failed");
      setResults([]);
      /*
      console.error('muse search failed — falling back to backend search', err);
      // fallback to your previous backend search
      try {
        const res = await fetch(`${BACKEND_BASE}/api/search?q=${encodeURIComponent(query)}&type=${filter}`);
        if (!res.ok) throw new Error('fallback search failed: ' + res.status);
        const json = await res.json();
        const items = (json.results || json || []).map(mapSearchItemToTrack);
        if (sortBy === 'relevance') {
          items.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
        }
        setResults(items);
      } catch (err2) {
        console.error('both muse and backend search failed', err2);
        setResults([]);
      }
      */
    } finally {
      setLoading(false);
    }
  }

  /* ---------------------------
    Play handlers
    - Clicking the cover: play without opening full player (overlay visible)
    - Clicking the item body (excluding 3-dot): play and open full player
  ---------------------------- */
  function playFromCover(item) {
    const t = mapSearchItemToTrack(item);
    console.log("t:", t);
    // try player.playTrack(t, { openPlayer: false }) or fallback
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
      if (player.openFull && typeof player.openFull === 'function') {
        player.openFull(true);
      }
    }
    setPlayingId(t.id);
  }

  function addToQueue(item, nextUp = false) {
    const t = mapSearchItemToTrack(item);
    if (player && typeof player.enqueue === 'function') {
      player.enqueue(t, nextUp);
    }
  }

  /* ---------------------------
    Menu (three-dot) handlers
  ---------------------------- */
  function openMenu(e, item) {
    setMenuAnchor(e.currentTarget);
    setMenuTarget(item);
  }
  function closeMenu() {
    setMenuAnchor(null);
    setMenuTarget(null);
  }
  async function handleMenuAddToQueue() {
    if (!menuTarget) return;
    addToQueue(menuTarget, false);
    closeMenu();
  }
  async function handleMenuAddNext() {
    if (!menuTarget) return;
    addToQueue(menuTarget, true);
    closeMenu();
  }
  async function handleMenuOpenInPlayer() {
    if (!menuTarget) return;
    playAndOpenPlayer(menuTarget);
    closeMenu();
  }

  /* ---------------------------
    UI helpers
  ---------------------------- */
  const topResult = results && results.length > 0 ? results[0] : null;
  const otherResults = results && results.length > 1 ? results.slice(1) : [];

  /* ---------------------------
    Render
  ---------------------------- */
  return (
    <Box sx={{ maxWidth: '100%', padding: 2, color: 'var(--text, white)' }}>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 3, letterSpacing: '-0.5px' }}>
        Search
      </Typography>

      {/* SEARCH BAR */}
      <form onSubmit={(e) => doSearch(e)} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <TextField
          variant="filled"
          placeholder="What do you want to listen to?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              doSearch(e);
            }
          }}
          InputProps={{
            disableUnderline: true,
            startAdornment: (
              <InputAdornment position="start" sx={{ alignItems: 'center', mr: 1 }}>
                {/* fixed placement & centering */}
                <SearchIcon sx={{ color: 'var(--text, #888)', fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
          sx={{
            flex: 1,
            '& .MuiFilledInput-root': {
              borderRadius: '12px', // less pill-ish to match "transparent" cards
              backgroundColor: 'transparent', // transparent background per request
              border: '1px solid rgba(255,255,255,0.06)',
              transition: 'all 0.12s',
              '&:hover': {
                backgroundColor: 'rgba(255,255,255,0.02)',
              },
              '&.Mui-focused': {
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--accent, #fff)',
              },
              '& input': {
                paddingTop: '10px',
                paddingBottom: '10px',
                color: 'var(--text, white)',
              },
            },
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

      {/* suggestions dropdown */}
      {suggestions.length > 0 && (
        <Paper sx={{ maxWidth: 350, mb: 1 }}>
          <List dense>
            {suggestions.map((s, idx) => (
              <ListItem
                key={idx}
                button
                onClick={() => {
                  setQ(s);
                  doSearch(null, s);
                }}
              >
                <Typography variant="body2" sx={{ width: '100%' }}>
                  {s}
                </Typography>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* Filters row */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
        <ToggleButtonGroup
          value={filter}
          exclusive
          onChange={(e, v) => {
            if (v !== null) setFilter(v);
          }}
          size="small"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="music_songs">Songs</ToggleButton>
          <ToggleButton value="channels">Channels/Artists</ToggleButton>
          {/*<ToggleButton value="album">Albums</ToggleButton>*/}
          <ToggleButton value="playlists">Playlists</ToggleButton>
        </ToggleButtonGroup>

        {/* future: add sort options UI */}
        <Box sx={{ ml: 'auto', opacity: 0.8, fontSize: 13 }}>Sort: {sortBy}</Box>
      </Box>

      {/* RESULTS */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {/* Top Result (larger layout) */}
        {topResult && (
          <Box
            className="top-result"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: 1,
              borderRadius: 1,
              // highlight the top result slightly
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            {/* Larger cover (1.5x) */}
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
                '&:hover .play-overlay': { opacity: 1, transform: 'scale(1)' },
              }}
            >
              <img
                src={topResult.cover}
                alt="cover"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              {/* play overlay */}
              <IconButton
                className="play-overlay"
                sx={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%) scale(0.95)',
                  transition: 'all 0.12s',
                  opacity: playingId === topResult.id ? 1 : 0.85,
                  background: 'rgba(0,0,0,0.45)',
                  color: 'var(--accent, #1db954)',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  playFromCover(topResult);
                }}
              >
                <PlayArrow />
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

            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <IconButton onClick={(e) => openMenu(e, topResult)} size="small" sx={{ color: 'var(--text, white)' }}>
                <MoreVert />
              </IconButton>
            </Box>
          </Box>
        )}

        {/* Other results (transparent containers) */}
        {otherResults.map((r, i) => {
          const t = r; // already mapped above
          const isPlaying = playingId === t.id;
          return (
            <Box
              key={t.id || i}
              className="result-item"
              onClick={(e) => {
                // if clicking on the 3-dot menu, it will stopPropagation; otherwise, open full player
                if ((e.target && e.target.closest && e.target.closest('.menu-button'))) return;
                playAndOpenPlayer(t);
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                paddingY: 1,
                paddingX: 0.5,
                borderRadius: 1,
                // transparent look; highlight when playing
                background: 'transparent',
                borderLeft: isPlaying ? '4px solid var(--accent, #1db954)' : '4px solid transparent',
                transition: 'background-color 0.12s ease, border-left 0.12s',
                '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' },
              }}
            >
              {/* Cover - plays on click and shows overlay on hover/when playing */}
              <Box
                onClick={(ev) => {
                  ev.stopPropagation();
                  playFromCover(t);
                }}
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: 1,
                  overflow: 'hidden',
                  flexShrink: 0,
                  position: 'relative',
                  cursor: 'pointer',
                  '&:hover .play-overlay': { opacity: 1, transform: 'scale(1)' },
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
                  onClick={(e) => {
                    e.stopPropagation();
                    playFromCover(t);
                  }}
                >
                  <PlayArrow />
                </IconButton>
              </Box>

              {/* Text */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body1" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.title}
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--subtext, #aaa)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.artist}
                </Typography>
              </Box>

              {/* 3-dot menu (replaces add/play buttons). Keep accessible. */}
              <Box>
                <IconButton
                  className="menu-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openMenu(e, t);
                  }}
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
        <MenuItem
          onClick={() => {
            handleMenuAddToQueue();
          }}
        >
          Add to queue
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleMenuAddNext();
          }}
        >
          Add next
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleMenuOpenInPlayer();
          }}
        >
          Open in player
        </MenuItem>
      </Menu>
    </Box>
  );
}
