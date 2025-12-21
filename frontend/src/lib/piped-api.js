// piped-api.js
// ES module client for Piped-based backend with base path /piped
// Exports: search, suggestions, related, nextTracks, artistPage, albumPage, playlistPage, getStreams, getInstanceList

const BASE = '/api/piped'; // <-- your app/server should proxy /piped -> actual piped instance or an mitm router for dynamic 

/** Safely join base + path without producing double or missing slashes */
function safeJoin(base, path) {
  if (!base) return String(path || '');
  if (!path) return String(base || '');
  const a = String(base).replace(/\/+$/g, ''); // remove trailing slashes from base
  const b = String(path).replace(/^\/+/g, ''); // remove leading slashes from path
  return `${a}/${b}`;
}

/** Build URL string from base/path and params (URLSearchParams) */
function buildUrl(path, params = {}) {
  const url = safeJoin(BASE, path);
  const entries = [];
  for (const key of Object.keys(params || {})) {
    const val = params[key];
    if (val === undefined || val === null) continue;
    // If value is array, append multiple
    if (Array.isArray(val)) {
      for (const v of val) entries.push([key, String(v)]);
    } else {
      entries.push([key, String(val)]);
    }
  }
  if (entries.length === 0) return url;
  const sp = new URLSearchParams(entries);
  return url.includes('?') ? `${url}&${sp.toString()}` : `${url}?${sp.toString()}`;
}

/** Generic request helper. opts: { method, body, headers, params } */
async function request(path, opts = {}) {
  const { method = 'GET', body, headers, params } = opts;
  const url = buildUrl(path, params);
  const res = await fetch(url, { method, body, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Piped API error ${res.status} ${res.statusText}: ${text}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch (err) {
    return text;
  }
}

/** Utilities for normalizing Piped items into a common "video-like" shape */
function extractVideoId(url) {
  if (!url) return null;
  const s = String(url);
  const m1 = s.match(/[?&]v=([^&]+)/);
  if (m1) return m1[1];
  const m2 = s.match(/\/watch\/([^/?]+)/);
  if (m2) return m2[1];
  const m3 = s.match(/\/vi\/([^/]+)/);
  if (m3) return m3[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return s;
}

function normalizeVideoItem(item) {
  return {
    id: extractVideoId(item?.url || item?.videoId || item?.watchUrl || item?.id),
    title: item?.title || item?.name || '',
    url: item?.url || item?.watchUrl || (item?.videoId ? `/watch?v=${item.videoId}` : ''),
    thumbnail: item?.thumbnail || item?.thumbnailUrl || item?.thumbnails?.[0],
    duration: item?.duration ?? null,
    uploader: item?.uploader || item?.channel || item?.uploaderName || null,
    uploaderUrl: item?.uploaderUrl || item?.channelUrl || null,
    uploaderAvatar: item?.uploaderAvatar || null,
    views: item?.views ?? null,
    uploadedDate: item?.uploadDate || item?.uploadedDate || null,
    raw: item
  };
}

/** --- exported API functions --- */

/**
 * search(q, opts)
 * opts: { sort, type, limit }
 * returns { music_all, music_videos, music_albums, music_artists, raw }
 */
export async function search(q, opts = {}) {
  if (!q) throw new Error('search: q is required');
  const { sort = 'rel', type = 'all', limit } = opts;
  const params = { q, sort, type, limit };
  const data = await request('/search', { params });

  const buckets = {
    music_all: [],
    music_videos: [],
    music_albums: [],
    music_artists: [],
    raw: data
  };

  const candidates = [];

  // Collect likely candidate arrays (common keys)
  (['videos', 'contents', 'items', 'results', 'playlists', 'sections']).forEach(k => {
    if (Array.isArray(data?.[k])) candidates.push(...data[k]);
  });
  if (Array.isArray(data)) candidates.push(...data);

  function extractArrays(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v)) candidates.push(...v);
      else if (v && typeof v === 'object') extractArrays(v);
    }
  }
  extractArrays(data);

  function pushToBucket(item) {
    const nv = normalizeVideoItem(item);
    const isMusic = /music|vevo|official audio|lyric|audio/i.test(`${nv.title} ${nv.uploader || ''}`) || (item?.category && /music/i.test(item.category));
    if (!isMusic) return;
    buckets.music_all.push(nv);
    if (/album|ep|deluxe/i.test(nv.title)) buckets.music_albums.push(nv);
    else if (/artist|official|channel|band/i.test(nv.uploader || '')) buckets.music_artists.push(nv);
    else buckets.music_videos.push(nv);
  }

  for (const c of candidates) {
    try { pushToBucket(c); } catch (e) { /* ignore */ }
  }

  if (!buckets.music_all.length) {
    const videos = candidates.filter(it => it?.url || it?.videoId).slice(0, limit || 50).map(normalizeVideoItem);
    buckets.music_all = videos;
    buckets.music_videos = videos;
  }

  return buckets;
}

/**
 * suggestions(query, opts)
 * always includes music=true
 */
export async function suggestions(query, opts = {}) {
  if (!query) throw new Error('suggestions: query is required');
  const params = Object.assign({}, opts.params || {}, { query, music: true, limit: opts.limit || 10 });
  const data = await request('/suggestions', { params });
  if (Array.isArray(data)) return data;
  if (data?.suggestions) return data.suggestions;
  return data;
}

/**
 * RELATED - robust fallback that does not rely on /streams
 * @param {string} videoId - youtube/piped id or url. Can be the raw id or a watch URL.
 * @param {object} opts - { rawItem } optional raw item you already have (gives title/uploader to seed search)
 * @returns {Promise<{ related: Array, raw: object }>}
 */
export async function related(videoId, opts = {}) {
  if (!videoId && !opts.rawItem) throw new Error('related: videoId or rawItem is required');
  
  // safe encode helper
  const enc = (v) => encodeURIComponent(String(v));
  
  // 1) try /related/:id (some piped instances implement this)
  try {
    const r1 = await request(safeJoin('related', enc(videoId)));
    if (r1 && Array.isArray(r1)) {
      return { related: r1.map(normalizeVideoItem), raw: r1 };
    }
    // maybe it's { items: [...] }
    if (r1?.items && Array.isArray(r1.items)) {
      return { related: r1.items.map(normalizeVideoItem), raw: r1 };
    }
  } catch (e) {
    // ignore and try next
  }
  
  // 2) try /video/:id or /videos/:id (some forks expose video info which may include related)
  const tryVideoPaths = ['video', 'videos', 'watch'];
  for (const p of tryVideoPaths) {
    try {
      const r = await request(safeJoin(p, enc(videoId)));
      // If server returns a single object with related or plays content arrays, extract them.
      if (r?.related || r?.relatedVideos || r?.relatedStreams) {
        const arr = r.related || r.relatedVideos || r.relatedStreams;
        if (Array.isArray(arr) && arr.length) return { related: arr.map(normalizeVideoItem), raw: r };
      }
      // If response looks like an object with items/contents
      if (Array.isArray(r)) return { related: r.map(normalizeVideoItem), raw: r };
      if (r?.items && Array.isArray(r.items)) return { related: r.items.map(normalizeVideoItem), raw: r };
    } catch (e) {
      // continue
    }
  }
  
  // 3) fallback: search by title/uploader using rawItem if provided,
  // or attempt to get a title by searching for the id as a query (some instances return the correct result)
  let titleSeed = opts.rawItem?.title || opts.rawItem?.name || null;
  let uploaderSeed = opts.rawItem?.uploader || opts.rawItem?.channel || null;
  
  // If we still don't have a title, do a targeted search for the id to retrieve info to seed a query.
  if (!titleSeed) {
    try {
      const maybeInfo = await request('/search', { params: { q: videoId, limit: 1 } });
      const candidate = (Array.isArray(maybeInfo) ? maybeInfo[0] : (maybeInfo?.items?.[0] || null));
      if (candidate) {
        titleSeed = candidate.title || candidate.name || titleSeed;
        uploaderSeed = uploaderSeed || candidate.uploader || candidate.channel || null;
      }
    } catch (e) {
      // ignore
    }
  }
  
  // Build a relevance search query
  let searchQ = videoId;
  if (titleSeed) {
    searchQ = `${titleSeed}${uploaderSeed ? ' ' + uploaderSeed : ''}`;
  }
  
  try {
    const sr = await request('/search', { params: { q: searchQ, filter: 'all', limit: 25 } });
    // Collect reasonable video-like items
    const arr = [];
    // common shapes: array top-level, or sr.items, sr.results, sr.videos, sr.contents
    if (Array.isArray(sr)) arr.push(...sr);
    if (Array.isArray(sr?.items)) arr.push(...sr.items);
    if (Array.isArray(sr?.results)) arr.push(...sr.results);
    if (Array.isArray(sr?.videos)) arr.push(...sr.videos);
    if (Array.isArray(sr?.contents)) arr.push(...sr.contents);
    // map and dedupe (exclude same id)
    const seen = new Set();
    const normalized = [];
    for (const it of arr) {
      const nv = normalizeVideoItem(it);
      if (!nv.id) continue;
      if (nv.id === extractVideoId(videoId)) continue; // exclude self
      if (seen.has(nv.id)) continue;
      seen.add(nv.id);
      normalized.push(nv);
      if (normalized.length >= 25) break;
    }
    if (normalized.length) return { related: normalized, raw: sr };
  } catch (e) {
    // ignore
  }
  
  // 4) last resort: include trending to guarantee some results
  try {
    const trending = await request('/trending', { params: { limit: 25 } });
    const arr = Array.isArray(trending) ? trending : trending?.items || trending?.videos || [];
    const nt = (Array.isArray(arr) ? arr.map(normalizeVideoItem) : []);
    return { related: nt, raw: { fallback: 'trending', trending } };
  } catch (e) {
    // nothing else we can do
    return { related: [], raw: null };
  }
}

/**
 * getStreams(videoId)
 */
export async function getStreams(videoId) {
  if (!videoId) throw new Error('getStreams: videoId is required');
  return request(safeJoin('streams', encodeURIComponent(videoId)));
}

/**
 * nextTracks - build a continuous queue for "nonstop playback".
 * DOES NOT USE /streams. Uses related() above, then trending fallback.
 *
 * prefs: {
 *   faves: [string], // channel names or substrings
 *   keywords: [string],
 *   boosts: { uploaderUrlOrName: number },
 *   shuffle: bool,
 *   limit: number,
 *   region: optional
 * }
 */
export async function nextTracks(videoId, prefs = {}) {
  if (!videoId) throw new Error('nextTracks: videoId is required');
  
  const {
    faves = [],
      keywords = [],
      boosts = {},
      shuffle = false,
      limit = 25,
      region = 'US',
      rawItem = null
  } = prefs;
  
  // First try to get 'related' via the fallback related() above
  const relRes = await related(videoId, { rawItem }).catch(() => ({ related: [] }));
  let candidates = Array.isArray(relRes?.related) ? relRes.related.slice() : [];
  
  // If still short, add trending or search-by-keywords
  if (candidates.length < Math.max(6, Math.floor(limit / 2))) {
    // try keyword-boosted search
    if (keywords && keywords.length) {
      try {
        const q = keywords.join(' ');
        const sr = await request('/search', { params: { q, filter: 'music_songs', limit: limit } });
        const arr = Array.isArray(sr) ? sr : (sr?.items || []);
        candidates.push(...(Array.isArray(arr) ? arr.map(normalizeVideoItem) : []));
      } catch (err) {
        // ignore
      }
    }
    
    // If still short, try trending
    if (candidates.length < Math.max(6, Math.floor(limit / 2))) {
      try {
        const tr = await request('/trending', { params: { region, limit } });
        const arr = Array.isArray(tr) ? tr : (tr?.items || []);
        candidates.push(...(Array.isArray(arr) ? arr.map(normalizeVideoItem) : []));
      } catch (err) {
        // ignore trending errors
      }
    }
  }
  
  // Dedupe and remove original
  const seen = new Set();
  const filtered = [];
  for (const c of candidates) {
    if (!c || !c.id) continue;
    if (c.id === extractVideoId(videoId)) continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    filtered.push(c);
    if (filtered.length >= (limit || 25)) break;
  }
  
  // scoring function using user prefs
  function scoreItem(item) {
    let score = 0;
    const title = (item.title || '').toLowerCase();
    const uploader = (item.uploader || '').toLowerCase();
    try {
      if (item.views) score += Math.min(20, Math.log10(item.views + 1));
    } catch (e) {}
    for (const fave of faves) {
      const f = String(fave).toLowerCase();
      if (!f) continue;
      if (uploader.includes(f) || title.includes(f)) score += 50;
    }
    for (const kw of keywords) {
      const k = String(kw).toLowerCase();
      if (!k) continue;
      if (title.includes(k) || uploader.includes(k)) score += 8;
    }
    if (item.raw?.uploaderUrl) {
      const ch = item.raw.uploaderUrl;
      if (boosts[ch]) score += Number(boosts[ch]) || 0;
    }
    return score;
  }
  
  const scored = filtered.map(i => ({ item: i, score: scoreItem(i) }));
  scored.sort((a, b) => (b.score - a.score) || ((b.item.views || 0) - (a.item.views || 0)));
  
  let queue = scored.map(s => s.item);
  
  if (shuffle) {
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  }
  
  queue = queue.slice(0, limit || 25);
  
  return { queue, raw: { relatedSource: relRes?.raw || null } };
}

/**
 * artistPage(idOrName)
 */
export async function artistPage(idOrName) {
  if (!idOrName) throw new Error('artistPage: idOrName is required');
  try {
    const channel = await request(safeJoin('channel', encodeURIComponent(idOrName)));
    return { type: 'channel', data: channel };
  } catch (e) {}
  try {
    const user = await request(safeJoin('user', encodeURIComponent(idOrName)));
    return { type: 'user', data: user };
  } catch (e) {}
  try {
    const c = await request(safeJoin('c', encodeURIComponent(idOrName)));
    return { type: 'c', data: c };
  } catch (err) {
    throw new Error(`artistPage: couldn't fetch artist for "${idOrName}"`);
  }
}

/**
 * playlistPage(playlistId)
 */
export async function playlistPage(playlistId) {
  if (!playlistId) throw new Error('playlistPage: playlistId is required');
  return request(safeJoin('playlists', encodeURIComponent(playlistId)));
}

/**
 * albumPage(albumId)
 */
export async function albumPage(albumId) {
  if (!albumId) throw new Error('albumPage: albumId is required');
  try {
    return await request(safeJoin('album', encodeURIComponent(albumId)));
  } catch (e) {
    const results = await search(albumId, { type: 'all', limit: 30 });
    return { fallback: true, results };
  }
}

export default {
  search,
  suggestions,
  related,
  nextTracks,
  artistPage,
  albumPage,
  playlistPage,
  getStreams
};