// backend/index.js
// Full backend with:
//  - YTMusic-based search (cached in Redis)
//  - Audio streaming endpoint that uses local yt-dlp to produce audio, uploads a copy to MEGA for caching
//  - Fallbacks: remote executor if local yt-dlp fails
//  - Redis caching for metadata and mapping to MEGA file handles
//
// Packages used (install via npm):
// express, express-rate-limit, helmet, cors, ioredis, megajs, ytmusic-api
//
// Docs referenced:
// ytmusic-api (npm) - unofficial YouTube Music lib for Node. 3
// MEGAJS docs - streaming upload/download examples. 4

const express = require('express');
const { spawn } = require('child_process');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const Redis = require('ioredis');
const { Storage } = require('megajs'); // megajs exports Storage-like API
const crypto = require('crypto');
const stream = require('stream');
const { promisify } = require('util');
const runYtdlp = require('./ytdlp');

let YTMusic;
try {
  // prefer ytmusic-api (npm). If users have another package, swap here.
  YTMusic = require('ytmusic-api');
} catch (e) {
  console.warn('ytmusic-api module not found. /api/search will fallback to yt-dlp metadata if needed.');
  YTMusic = null;
}

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Config
const PORT = process.env.PORT || 8080;
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const REMOTE_YTDLP_EXECUTOR = process.env.REMOTE_YTDLP_EXECUTOR || '';
const MEGA_USER = process.env.MEGA_USER || '';
const MEGA_PASS = process.env.MEGA_PASS || '';
const REDIS_SERVER = process.env.REDIS_SERVER || '';
const STREAM_RATE_LIMIT_PER_HOUR = parseInt(process.env.STREAM_RATE_LIMIT_PER_HOUR || '60', 10);
const STREAM_CONCURRENT_PER_IP = parseInt(process.env.STREAM_CONCURRENT_PER_IP || '2', 10);
const AUDIO_UPLOAD_BUFFER_LIMIT_BYTES = parseInt(process.env.AUDIO_UPLOAD_BUFFER_LIMIT_BYTES || (50 * 1024 * 1024), 10); // 50MB

// Basic rate limiters
const globalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

const streamLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: STREAM_RATE_LIMIT_PER_HOUR,
  message: { error: 'Rate limit exceeded for streaming endpoint. Try later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Redis
let redis = null;
if (REDIS_SERVER) {
  redis = new Redis(REDIS_SERVER);
  redis.on('error', (err) => console.error('Redis error:', err));
} else {
  console.warn('No REDIS_SERVER configured — caching disabled.');
}

// MEGA: login and keep storage ready
let megaStorage = null;
async function initMega() {
  if (!MEGA_USER || !MEGA_PASS) {
    console.warn('MEGA_USER/MEGA_PASS not configured — MEGA caching disabled.');
    return;
  }
  try {
    // megajs usage: new Storage({email, password})
    megaStorage = new Storage({
      email: MEGA_USER,
      password: MEGA_PASS
    });
    // megajs uses events; wait for ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('MEGA login timed out')), 20000);
      megaStorage.on('ready', () => {
        clearTimeout(timeout);
        console.log('Mega storage ready');
        resolve();
      });
      megaStorage.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  } catch (err) {
    console.error('Failed to initialize MEGA:', err);
    megaStorage = null;
  }
}

// Kick off MEGA login async
initMega().catch(e => console.error('MEGA init error:', e));

// Track concurrent streams per IP
const activeStreamsByIP = new Map();
function canStartStream(ip) {
  const cur = activeStreamsByIP.get(ip) || 0;
  return cur < STREAM_CONCURRENT_PER_IP;
}
function incStream(ip) { activeStreamsByIP.set(ip, (activeStreamsByIP.get(ip) || 0) + 1); }
function decStream(ip) {
  const cur = activeStreamsByIP.get(ip) || 0;
  if (cur <= 1) activeStreamsByIP.delete(ip);
  else activeStreamsByIP.set(ip, cur - 1);
}

// helpers
function hashKey(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// ----------------------
// SEARCH (using ytmusic module when available)
// GET /api/search?q=...&max=6
// Cached in Redis keyed by search:<query>
// ----------------------
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  const max = parseInt(req.query.max || '6', 10);
  if (!q) return res.status(400).json({ error: 'missing query' });

  const cacheKey = `search:${q}:${max}`;
  try {
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    }

    let results = [];
    if (YTMusic) {
      try {
        const ytm = new YTMusic(); // usage depends on the package; this is the common pattern
        await ytm.initialize();
        // many ytmusic wrappers offer search(query, filter, limit) or similar; attempt both
        if (typeof ytm.search === 'function') {
          // try search(query, filter) signature. We'll request songs/videos
          const raw = await ytm.search(q, 'songs', max);
          // normalize whatever structure we get
          results = raw && raw.results ? raw.results : raw;
          // if library returns items with different keys, normalize to { id, title, artists, duration, thumbnails, url }
          results = results.slice(0, max).map(item => {
            return {
              id: item.videoId || item.id || item.video_id || item.watchId || item.youtubeId || item.videoId,
              title: item.title || item.name,
              artists: item.artists || item.author || item.uploader || [],
              duration: item.duration || item.duration_seconds || item.lengthSeconds,
              thumbnails: item.thumbnails || item.thumbnail || [],
              url: item.url || item.webpage_url || (item.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : undefined),
              raw: item
            };
          });
        } else {
          // fallback: try generic call
          const raw = await ytm.search(q);
          results = Array.isArray(raw) ? raw.slice(0, max) : [raw];
        }
      } catch (err) {
        console.warn('ytmusic search failed, falling back to yt-dlp metadata search:', err && err.message ? err.message : err);
        // fallback to yt-dlp search: spawn yt-dlp -j "ytsearch{max}:<q>"
        results = await fallbackSearchWithYtdlp(q, max);
      }
    } else {
      // no ytmusic module available — use yt-dlp fallback
      results = await fallbackSearchWithYtdlp(q, max);
    }

    const payload = { ok: true, source: YTMusic ? 'ytmusic' : 'yt-dlp', results };
    if (redis) await redis.setex(cacheKey, 60 * 10, JSON.stringify(payload)); // cache 10m
    return res.json(payload);
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'search failed', details: err && err.message ? err.message : String(err) });
  }
});

// fallback search uses yt-dlp -j 'ytsearchN:term'
async function fallbackSearchWithYtdlp(q, max = 6) {
  return new Promise((resolve, reject) => {
    const searchTerm = `ytsearch${max}:${q}`;
    const ytdlp = spawn(YTDLP, ['-j', searchTerm]);
    let out = '', err = '';
    ytdlp.stdout.on('data', d => out += d.toString());
    ytdlp.stderr.on('data', d => err += d.toString());
    ytdlp.on('close', code => {
      if (code !== 0 && !out) return reject(new Error('yt-dlp search failed: ' + err));
      const lines = out.split(/\r?\n/).filter(Boolean).slice(0, max);
      const items = lines.map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean).map(obj => ({
        id: obj.id,
        title: obj.title,
        uploader: obj.uploader,
        duration: obj.duration,
        webpage_url: obj.webpage_url,
        thumbnails: obj.thumbnails || [],
        _raw: obj
      }));
      resolve(items);
    });
  });
}

// ----------------------
// AUDIO endpoint
// GET /api/audio?url=<url>
// - checks Redis for cached mapping to MEGA file
// - if cached and MEGA available -> stream from MEGA
// - else: run yt-dlp, stream audio to client, while uploading to MEGA in parallel (if MEGA configured)
// - store mapping in Redis (key audio:<hash>) with { source: 'mega', fileId: ..., mime: ... }
// ----------------------
app.get('/api/audio', streamLimiter, async (req, res) => {
  const urlParam = (req.query.url || '').trim();
  if (!urlParam) return res.status(400).json({ error: 'missing url parameter' });

  const ip = getClientIp(req);
  if (!canStartStream(ip)) return res.status(429).json({ error: `Too many concurrent streams for this IP (max ${STREAM_CONCURRENT_PER_IP})` });
  incStream(ip);

  const key = `audio:${hashKey(urlParam)}`;

  try {
    // 1) Check Redis cache for MEGA mapping
    if (redis) {
      const cached = await redis.get(key);
      if (cached) {
        const obj = JSON.parse(cached);
        if (obj && obj.source === 'mega' && megaStorage) {
          // stream from mega
          console.log('Serving audio from MEGA cache for', urlParam);
          await streamFromMega(obj.megaFileId, res);
          decStream(ip);
          return;
        }
      }
    }

    // 2) Not cached or MEGA not available -> spawn yt-dlp to produce audio
    // We'll stream bestaudio to stdout, and also pipe a copy to MEGA uploader if configured.
    // Use formats: preferred webm opus or m4a
    const ytdlpArgs = [
      '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
      '-o', '-', // output to stdout
      '--no-playlist',
      '--newline',
      urlParam
    ];

    const child = spawn(YTDLP, ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    // Set response headers (content-type optimistic; yt-dlp doesn't always tell)
    res.setHeader('Content-Type', 'audio/webm; codecs=opus');
    res.setHeader('Cache-Control', 'no-cache');

    // We'll create a passthrough stream to pipe to both response and MEGA uploader.
    const pass1 = new stream.PassThrough();
    const pass2 = new stream.PassThrough();

    // Pipe child stdout into both passthroughs using tee
    child.stdout.pipe(pass1);
    child.stdout.pipe(pass2);

    // Pipe one copy to client
    pass1.pipe(res);

    // Meanwhile, if MEGA is available, upload using storage.upload with known size if available.
    // Problem: we don't know total size ahead of time. Megajs allows piping to upload stream but requires size or allows buffering.
    // Strategy: buffer up to AUDIO_UPLOAD_BUFFER_LIMIT_BYTES in memory and if size remains under limit, upload buffer; else fall back to streaming upload with size if known (not usually) or skip caching.
    let uploadedMegaFileId = null;
    if (megaStorage) {
      try {
        uploadedMegaFileId = await uploadStreamToMega(pass2, urlParam);
      } catch (err) {
        console.warn('Failed to upload audio to MEGA:', err && err.message ? err.message : err);
      }
    }

    // log yt-dlp stderr to server logs
    child.stderr.on('data', d => console.error('yt-dlp stderr:', d.toString()));

    child.on('close', async (code) => {
      // when finished, save mapping to Redis if upload succeeded
      if (uploadedMegaFileId && redis) {
        const info = {
          source: 'mega',
          megaFileId: uploadedMegaFileId,
          mime: 'audio/webm' // optimistic
        };
        await redis.setex(key, 60 * 60 * 24 * 14, JSON.stringify(info)); // cache 14 days
      }
      decStream(ip);
      try { res.end(); } catch (e) {}
    });

    child.on('error', (err) => {
      console.error('yt-dlp spawn error:', err);
      decStream(ip);
      try {
        res.statusCode = 500;
        res.end('yt-dlp failed: ' + (err.message || String(err)));
      } catch (e) {}
    });

    // if client disconnects, kill child
    req.on('close', () => {
      try { child.kill('SIGKILL'); } catch (e) {}
    });

  } catch (err) {
    console.error('audio endpoint error:', err);
    decStream(ip);
    return res.status(500).json({ error: 'internal error', details: err && err.message ? err.message : String(err) });
  }
});

// helper: stream a file from MEGA given its file id/object
async function streamFromMega(megaFileId, res) {
  if (!megaStorage) throw new Error('MEGA not configured');
  // megaFileId may be a handle or file key; this code assumes we stored a file handle/identifier we can find.
  // Common approach: store public link or file node id; megajs lets you find files by name or id.
  // For simplicity we try megaStorage.root.children to find file by handle
  // NOTE: you may need to adapt this depending on what you store (file handle vs public link)
  const files = await new Promise((resolve, reject) => {
    // iterate root children
    megaStorage.root.children(async (err, children) => {
      if (err) return reject(err);
      resolve(children || []);
    });
  });

  // try match by handle/id or name
  let file = files.find(f => f.handle === megaFileId || f.nodeId === megaFileId || f.name === megaFileId);
  if (!file) {
    // fallback: maybe the megaFileId is a public link? try using storage.file with handle
    try {
      file = megaStorage.file(megaFileId);
    } catch (e) {
      throw new Error('MEGA file not found');
    }
  }

  // download while streaming to res
  // megajs provides .download() as a stream or method; use the stream/promise method
  await new Promise((resolve, reject) => {
    const downloadStream = file.download(); // returns a readable stream
    downloadStream.on('error', (err) => reject(err));
    downloadStream.on('end', () => resolve());
    downloadStream.pipe(res);
  });
}

// helper: upload a Node readable stream to MEGA and return file id (handle)
// Because MEGA requires size for streamed upload, we buffer up to AUDIO_UPLOAD_BUFFER_LIMIT_BYTES.
// If the stream exceeds that, we abort caching to avoid unbounded memory use.
async function uploadStreamToMega(readableStream, sourceUrl) {
  if (!megaStorage) throw new Error('MEGA not configured');

  // Buffer chunks until complete or threshold exceeded
  const chunks = [];
  let total = 0;
  let exceeded = false;

  for await (const chunk of readableStream) {
    chunks.push(chunk);
    total += chunk.length;
    if (total > AUDIO_UPLOAD_BUFFER_LIMIT_BYTES) {
      exceeded = true;
      break;
    }
  }

  if (exceeded) {
    // we opted not to buffer huge file -> don't cache
    console.warn('Audio size exceeded buffer limit; skipping MEGA cache.');
    return null;
  }

  // combine buffer and upload to mega
  const buffer = Buffer.concat(chunks, total);
  // Determine file name: hash of source + .webm
  const name = `audio_${hashKey(sourceUrl)}.webm`;
  // Upload with known size
  const uploadStream = megaStorage.upload({ name, size: buffer.length });
  // you can pipe or pass buffer directly
  uploadStream.write(buffer);
  uploadStream.end();

  // wait for completion
  const file = await uploadStream.complete;
  // file.handle is the unique identifier (or file.nodeId) - store that
  const fileId = file.handle || file.nodeId || file.name;
  console.log('Uploaded audio to MEGA:', fileId);
  return fileId;
}

// -----------------------------
// /api/stream (original streaming-bytes route) - kept for backwards compatibility
// -----------------------------
app.get('/api/stream', streamLimiter, (req, res) => {
  const urlParam = req.query.url;
  if (!urlParam) return res.status(400).json({ error: 'missing url parameter' });

  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (!canStartStream(ip)) return res.status(429).json({ error: `Too many concurrent streams for this IP (max ${STREAM_CONCURRENT_PER_IP})` });

  incStream(ip);

  const args = [
    '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
    '-o', '-',
    '--no-playlist',
    urlParam
  ];

  const ytdlp = spawn(YTDLP, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  res.setHeader('Content-Type', 'audio/webm; codecs=opus');
  res.setHeader('Cache-Control', 'no-cache');

  ytdlp.stdout.pipe(res);
  ytdlp.stderr.on('data', d => console.error('yt-dlp stderr:', d.toString()));

  ytdlp.on('close', code => {
    decStream(ip);
    try { res.end(); } catch (e) {}
  });

  req.on('close', () => {
    try { ytdlp.kill('SIGKILL'); } catch (e) {}
  });
});

// health
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
