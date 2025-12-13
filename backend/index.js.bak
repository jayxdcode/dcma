// backend/index.js
const express = require('express');
const { spawn } = require('child_process');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Config via env
const PORT = process.env.PORT || 8080;
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const STREAM_RATE_LIMIT_PER_HOUR = parseInt(process.env.STREAM_RATE_LIMIT_PER_HOUR || '60', 10);
const STREAM_CONCURRENT_PER_IP = parseInt(process.env.STREAM_CONCURRENT_PER_IP || '2', 10);

// Global limiter
const globalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

// Stream limiter (per-IP)
const streamLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: STREAM_RATE_LIMIT_PER_HOUR,
  message: { error: 'Rate limit exceeded for streaming endpoint. Try later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Track per-IP concurrent streams
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

// GET /api/search?q=...&max=6
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  const max = parseInt(req.query.max || '6', 10);
  if (!q) return res.status(400).json({ error: 'missing query' });

  const searchTerm = `ytsearch${max}:${q}`;
  const ytdlp = spawn(YTDLP, ['-j', searchTerm]);

  let out = '', err = '';
  ytdlp.stdout.on('data', d => out += d.toString());
  ytdlp.stderr.on('data', d => err += d.toString());

  ytdlp.on('close', code => {
    if (code !== 0 && !out) return res.status(500).json({ error: 'yt-dlp error', details: err });
    const lines = out.split(/\r?\n/).filter(Boolean);
    const items = lines.map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean).map(obj => ({
      id: obj.id,
      title: obj.title,
      uploader: obj.uploader,
      duration: obj.duration,
      webpage_url: obj.webpage_url,
      thumbnails: obj.thumbnails || []
    }));
    res.json({ ok: true, results: items });
  });
});

// GET /api/stream?url=<url>  (pipes yt-dlp stdout)
// - rate-limited and concurrent-limited
app.get('/api/stream', streamLimiter, (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'missing url parameter' });

  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (!canStartStream(ip)) return res.status(429).json({ error: `Too many concurrent streams for this IP (max ${STREAM_CONCURRENT_PER_IP})` });

  incStream(ip);

  const args = [
    '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
    '-o', '-',
    '--no-playlist',
    url
  ];

  const ytdlp = spawn(YTDLP, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  // Set content type optimistically
  res.setHeader('Content-Type', 'audio/webm; codecs=opus');
  res.setHeader('Cache-Control', 'no-cache');

  ytdlp.stdout.pipe(res);

  ytdlp.stderr.on('data', d => console.error('yt-dlp stderr:', d.toString()));

  const cleanup = () => {
    try { ytdlp.kill('SIGKILL'); } catch (e) {}
    decStream(ip);
  };

  ytdlp.on('close', code => {
    decStream(ip);
    try { res.end(); } catch (e) {}
  });

  req.on('close', () => { cleanup(); });

  // Safety: kill after 15 minutes
  const killTimeout = setTimeout(() => {
    try { ytdlp.kill('SIGKILL'); } catch (e) {}
  }, 15 * 60 * 1000);

  ytdlp.on('exit', () => clearTimeout(killTimeout));
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
