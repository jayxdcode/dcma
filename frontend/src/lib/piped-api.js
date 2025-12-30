// piped-api.js (yt-music style search enhancements)
// ES module client for Piped-based backend with base path /piped
// Exports: search, suggestions, related, nextTracks, artistPage, albumPage, playlistPage, getStreams

// const BASE = 'https://frontend-dcma.vercel.app/api/piped'; // <-- your app/server should
// proxy /piped -> actual piped instance or an mitm router for dynamic

const isDiscordProxy = window.location.hostname.includes('discordsays.com');

/** Safely join base + path without producing double or missing slashes */
function safeJoin(base, path) {
	if (!base) return String(path || '');
	if (!path) return String(base || '');
	const a = String(base).replace(/\/+$/g, '');
	const b = String(path).replace(/^\/+/, '');
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

/**
 * getYoutubeThumbnail (synchronous - safest fallback)
 *
 * Returns a safe, always-present thumbnail path (default.jpg) when using the Discord proxy.
 * This avoids any HTTP checks/HEAD requests and keeps the function synchronous.
 *
 * @param {string} videoId
 * @param {string} defaultURL - URL returned if proxy is false or videoId missing
 * @returns {string}
 */
function getYoutubeThumbnail(videoId, defaultURL = '') {
	if (!videoId) return defaultURL || '';
	// If not using the proxy that serves proxied thumbnails, return the defaultURL
	if (!isDiscordProxy) return defaultURL || '';
	// The safest thumbnail filename that exists for (virtually) all YouTube videos is "default.jpg".
	// Use the proxied path pattern
	return `/yt-img/vi/${videoId}/hqdefault.jpg`;
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
	const m4 = s.match(/\/embed\/([^/?]+)/);
	if (m4) return m4[1];
	const m2 = s.match(/\/watch\/([^/?]+)/);
	if (m2) return m2[1];
	const m3 = s.match(/\/vi\/([^/]+)/);
	if (m3) return m3[1];
	// plain id string fallback
	if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
	return s;
}

function normalizeVideoItem(item) {
	const id = extractVideoId(item?.url || item?.videoId || item?.watchUrl || item?.id || item?.video_id || item?.vid);
	const thumb = item?.thumbnail || item?.thumbnailUrl || (item?.thumbnails && item.thumbnails[0]) || null;

	return {
		id: id,
		title: item?.title || item?.name || item?.titleText || item?.caption || '',
		url: item?.url || item?.watchUrl || (item?.videoId ? `/watch?v=${item.videoId}` : ''),
		cover: getYoutubeThumbnail(id, thumb),
		duration: item?.duration ?? item?.lengthSeconds ?? null,
		artist: item?.uploader || item?.channel || item?.uploaderName || item?.author || null,
		artistUrl: item?.uploaderUrl || item?.channelUrl || null,
		artistPfp: item?.uploaderAvatar || null,
		views: item?.views ?? item?.viewCount ?? null,
		uploadedDate: item?.uploadDate || item?.uploadedDate || item?.published || null,
		raw: item
	};
}

// --- New helpers for YT Music style classification + stable unique ids ---

/** Generate a stable, type-prefixed id for de-duping React keys.
 *
 * For videos/songs we use the video id prefixed with `v:`. For albums, artists and playlists
 * we create a prefix with a fallback fingerprint so duplicates are avoided.
 */
function stableIdFor(item) {
	if (!item || typeof item !== 'object') return null;
	const raw = item;
	// possible id sources
	const vid = extractVideoId(raw?.videoId || raw?.id || raw?.video_id || raw?.watchUrl || raw?.url);
	if (vid) return `v:${vid}`;

	// channel/artist id
	const ch = raw?.channelId || raw?.uploaderId || raw?.uploaderUrl;
	if (ch) return `artist:${String(ch)}`;

	// playlists and albums often have an id field or playlistId
	if (raw?.playlistId || raw?.list) return `playlist:${raw?.playlistId || raw?.list}`;
	if (raw?.albumId || raw?.musicAlbumId) return `album:${raw?.albumId || raw?.musicAlbumId}`;

	// fallback fingerprint on title+uploader
	const t = (raw?.title || raw?.name || raw?.label || '').trim();
	const u = (raw?.uploader || raw?.channel || raw?.author || '').trim();
	if (t || u) return `x:${t}|${u}`;
	return `x:${JSON.stringify(raw)}`; // last resort
}

/** Classify item into one of: song, album, artist, playlist, video, other
 *
 * Uses several heuristics: explicit fields, resultType, category or title hints.
 */
function classifyItem(raw) {
	if (!raw || typeof raw !== 'object') return 'other';
	const title = String(raw?.title || raw?.name || raw?.caption || '').toLowerCase();
	const uploader = String(raw?.uploader || raw?.channel || raw?.author || '').toLowerCase();
	const category = String(raw?.category || raw?.type || raw?.resultType || '').toLowerCase();

	// explicit hints
	if (/album|ep|deluxe|remaster|remastere?d/.test(title) || /album/.test(category) || raw?.album) return 'album';
	if (/artist|band|singer/.test(category) || raw?.isArtist || raw?.artist) return 'artist';
	if (/playlist|list|queue/.test(title) || /playlist/.test(category) || raw?.playlistId || raw?.list) return 'playlist';

	// songs: explicit music indicators or length/duration present and small
	if (/song|track|single|audio|official audio|lyrics|lyric/.test(title) || /music|song|audio/.test(category) || raw?.isMusic) return 'song';
	if (raw?.duration || raw?.lengthSeconds) {
		// short durations likely songs (<= 15 minutes)
		const d = Number(raw?.duration || raw?.lengthSeconds || 0);
		if (d && d <= 60 * 15) return 'song';
	}

	// videos (non-music) fallback if it has video-like props
	if (raw?.videoId || raw?.watchUrl || raw?.views || raw?.duration) return 'video';

	return 'other';
}

// --- improved search() implementation (yt-music style grouping + dedupe) ---
/**
 * search(q, opts)
 * opts: { filter, limit }
 * returns { music_all, music_songs, music_albums, music_artists, music_playlists, music_videos, raw }
 */
export async function search(q, opts = {}) {
	if (!q) throw new Error('search: q is required');
	const { filter = 'all', limit = 50 } = opts;
	const params = { q, filter, limit };
	const data = await request('/search', { params });

	// We'll collect candidates from many possible keys and nested arrays
	const candidates = [];
	function collectArrays(obj) {
		if (!obj || typeof obj !== 'object') return;
		for (const [k, v] of Object.entries(obj)) {
			if (Array.isArray(v)) {
				for (const it of v) candidates.push(it);
			} else if (v && typeof v === 'object') collectArrays(v);
		}
	}

	// top-level arrays
	['videos', 'contents', 'items', 'results', 'playlists', 'sections', 'suggestions', 'albums'].forEach(k => {
		if (Array.isArray(data?.[k])) candidates.push(...data[k]);
	});
	if (Array.isArray(data)) candidates.push(...data);
	collectArrays(data);

	// maps to dedupe
	const seen = new Map(); // stableId -> normalized item

	// buckets
	const buckets = { music_all: [], music_songs: [], music_albums: [], music_artists: [], music_playlists: [], music_videos: [], raw: data };

	// push helper that classifies, normalizes and dedupes
	function pushCandidate(raw) {
		if (!raw || typeof raw !== 'object') return;
		const cls = classifyItem(raw);
		const norm = normalizeVideoItem(raw);
		const stable = stableIdFor(raw) || stableIdFor(norm);
		if (!stable) return;
		if (seen.has(stable)) {
			// merge lightweight missing properties if helpful (prefer first seen)
			const existing = seen.get(stable);
			if (!existing.thumbnail && norm.thumbnail) existing.thumbnail = norm.thumbnail;
			if (!existing.uploader && norm.uploader) existing.uploader = norm.uploader;
			return; // skip duplicates
		}
		seen.set(stable, norm);

		// only include music-like items in music buckets
		if (cls === 'song') buckets.music_songs.push(norm);
		else if (cls === 'album') buckets.music_albums.push(norm);
		else if (cls === 'artist') buckets.music_artists.push(norm);
		else if (cls === 'playlist') buckets.music_playlists.push(norm);
		else if (cls === 'video') buckets.music_videos.push(norm);
		else {
			// still include unknowns in music_all if they look musical
			const isMusic = /music|audio|song|lyric|official audio|vevo/i.test(`${norm.title} ${norm.uploader || ''}`);
			if (!isMusic) return;
			buckets.music_videos.push(norm);
		}

		// also push into the master list
		buckets.music_all.push(norm);
	}

	for (const c of candidates) {
		try {
			pushCandidate(c);
		} catch (e) { /* ignore */ }
	}

	// If nothing found, fallback to a lighter candidate scan (top-level objects)
	if (!buckets.music_all.length) {
		const videos = candidates.filter(it => it && (it.url || it.videoId || it.id)).slice(0, limit).map(normalizeVideoItem);
		for (const v of videos) {
			const stable = stableIdFor(v);
			if (stable && !seen.has(stable)) {
				seen.set(stable, v);
				buckets.music_all.push(v);
				buckets.music_videos.push(v);
			}
		}
	}

	// Final dedupe and ordering: prefer songs, then albums, artists, playlists, videos
	const order = (arr) => arr.filter(Boolean).slice(0, limit || 50);
	buckets.music_songs = order(buckets.music_songs);
	buckets.music_albums = order(buckets.music_albums);
	buckets.music_artists = order(buckets.music_artists);
	buckets.music_playlists = order(buckets.music_playlists);
	buckets.music_videos = order(buckets.music_videos);

	// Rebuild master list with priority: songs -> albums -> artists -> playlists -> videos
	const master = [];
	const pushed = new Set();
	function addList(list) {
		for (const it of list) {
			const sid = stableIdFor(it.raw || it);
			if (!sid || pushed.has(sid)) continue;
			pushed.add(sid);
			master.push(it);
			if (master.length >= (limit || 50)) break;
		}
	}
	addList(buckets.music_songs);
	if (master.length < (limit || 50)) addList(buckets.music_albums);
	if (master.length < (limit || 50)) addList(buckets.music_artists);
	if (master.length < (limit || 50)) addList(buckets.music_playlists);
	if (master.length < (limit || 50)) addList(buckets.music_videos);

	buckets.music_all = master;

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

// --- rest of file unchanged (related, getStreams, nextTracks, artistPage, playlistPage, albumPage, default export)

/** RELATED - robust fallback that does not rely on /streams */
export async function related(videoId, opts = {}) {
	if (!videoId && !opts.rawItem) throw new Error('related: videoId or rawItem is required');

	const enc = (v) => encodeURIComponent(String(v));

	try {
		const r1 = await request(safeJoin('related', enc(videoId)));
		if (r1 && Array.isArray(r1)) return { related: r1.map(normalizeVideoItem), raw: r1 };
		if (r1?.items && Array.isArray(r1.items)) return { related: r1.items.map(normalizeVideoItem), raw: r1 };
	} catch (e) {}

	const tryVideoPaths = ['video', 'videos', 'watch'];
	for (const p of tryVideoPaths) {
		try {
			const r = await request(safeJoin(p, enc(videoId)));
			if (r?.related || r?.relatedVideos || r?.relatedStreams) {
				const arr = r.related || r.relatedVideos || r.relatedStreams;
				if (Array.isArray(arr) && arr.length) return { related: arr.map(normalizeVideoItem), raw: r };
			}
			if (Array.isArray(r)) return { related: r.map(normalizeVideoItem), raw: r };
			if (r?.items && Array.isArray(r.items)) return { related: r.items.map(normalizeVideoItem), raw: r };
		} catch (e) {}
	}

	let titleSeed = opts.rawItem?.title || opts.rawItem?.name || null;
	let uploaderSeed = opts.rawItem?.uploader || opts.rawItem?.channel || null;

	if (!titleSeed) {
		try {
			const maybeInfo = await request('/search', { params: { q: videoId, limit: 1 } });
			const candidate = (Array.isArray(maybeInfo) ? maybeInfo[0] : (maybeInfo?.items?.[0] || null));
			if (candidate) {
				titleSeed = candidate.title || candidate.name || titleSeed;
				uploaderSeed = uploaderSeed || candidate.uploader || candidate.channel || null;
			}
		} catch (e) {}
	}

	let searchQ = videoId;
	if (titleSeed) searchQ = `${titleSeed}${uploaderSeed ? ' ' + uploaderSeed : ''}`;

	try {
		const sr = await request('/search', { params: { q: searchQ, filter: 'all', limit: 25 } });
		const arr = [];
		if (Array.isArray(sr)) arr.push(...sr);
		if (Array.isArray(sr?.items)) arr.push(...sr.items);
		if (Array.isArray(sr?.results)) arr.push(...sr.results);
		if (Array.isArray(sr?.videos)) arr.push(...sr.videos);
		if (Array.isArray(sr?.contents)) arr.push(...sr.contents);

		const seenRel = new Set();
		const normalized = [];
		for (const it of arr) {
			const nv = normalizeVideoItem(it);
			if (!nv.id) continue;
			if (nv.id === extractVideoId(videoId)) continue;
			if (seenRel.has(nv.id)) continue;
			seenRel.add(nv.id);
			normalized.push(nv);
			if (normalized.length >= 25) break;
		}
		if (normalized.length) return { related: normalized, raw: sr };
	} catch (e) {}

	try {
		const trending = await request('/trending', { params: { limit: 25 } });
		const arr = Array.isArray(trending) ? trending : trending?.items || trending?.videos || [];
		const nt = (Array.isArray(arr) ? arr.map(normalizeVideoItem) : []);
		return { related: nt, raw: { fallback: 'trending', trending } };
	} catch (e) {
		return { related: [], raw: null };
	}
}

export async function getStreams(videoId) {
	if (!videoId) throw new Error('getStreams: videoId is required');
	return request(safeJoin('streams', encodeURIComponent(videoId)));
}

export async function nextTracks(videoId, prefs = {}) {
	if (!videoId) throw new Error('nextTracks: videoId is required');
	const { faves = [], keywords = [], boosts = {}, shuffle = false, limit = 25, region = 'US', rawItem = null } = prefs;

	const relRes = await related(videoId, { rawItem }).catch(() => ({ related: [] }));
	let candidates = Array.isArray(relRes?.related) ? relRes.related.slice() : [];

	if (candidates.length < Math.max(6, Math.floor(limit / 2))) {
		if (keywords && keywords.length) {
			try {
				const q = keywords.join(' ');
				const sr = await request('/search', { params: { q, filter: 'music_songs', limit: limit } });
				const arr = Array.isArray(sr) ? sr : (sr?.items || []);
				candidates.push(...(Array.isArray(arr) ? arr.map(normalizeVideoItem) : []));
			} catch (err) {}
		}
		if (candidates.length < Math.max(6, Math.floor(limit / 2))) {
			try {
				const tr = await request('/trending', { params: { region, limit } });
				const arr = Array.isArray(tr) ? tr : (tr?.items || []);
				candidates.push(...(Array.isArray(arr) ? arr.map(normalizeVideoItem) : []));
			} catch (err) {}
		}
	}

	const seen2 = new Set();
	const filtered = [];
	for (const c of candidates) {
		if (!c || !c.id) continue;
		if (c.id === extractVideoId(videoId)) continue;
		if (seen2.has(c.id)) continue;
		seen2.add(c.id);
		filtered.push(c);
		if (filtered.length >= (limit || 25)) break;
	}

	function scoreItem(item) {
		let score = 0;
		const title = (item.title || '').toLowerCase();
		const uploader = (item.uploader || '').toLowerCase();
		try { if (item.views) score += Math.min(20, Math.log10(item.views + 1)); } catch (e) {}
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

export async function playlistPage(playlistId) {
	if (!playlistId) throw new Error('playlistPage: playlistId is required');
	return request(safeJoin('playlists', encodeURIComponent(playlistId)));
}

export async function albumPage(albumId) {
	if (!albumId) throw new Error('albumPage: albumId is required');
	try {
		return await request(safeJoin('album', encodeURIComponent(albumId)));
	} catch (e) {
		const results = await search(albumId, { type: 'all', limit: 30 });
		return { fallback: true, results };
	}
}

export default { search, suggestions, related, nextTracks, artistPage, albumPage, playlistPage, getStreams };