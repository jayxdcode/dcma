// /api/discord/interactions.js - ESM Version
import nacl from 'tweetnacl'; // Ensure 'npm install tweetnacl' is run

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const CLIENT_ID = process.env.VITE_DISCORD_CLIENT_ID || '';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || null;

function detectProtocol(req) {
  let protocol = 'http';
  const xf = req.headers['x-forwarded-proto'];
  if (xf) protocol = String(xf).split(',')[0];
  else if (req.socket && req.socket.encrypted) protocol = 'https';
  return protocol;
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => buf += c);
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

/**
 * Modern helper: Uses global fetch if available (Node 18+),
 * otherwise attempts to dynamic import node-fetch.
 */
async function doFetch(url, opts) {
  if (typeof fetch !== 'undefined') return fetch(url, opts);
  const { default: nf } = await import('node-fetch');
  return nf(url, opts);
}

// signature verification using tweetnacl (now using the imported nacl)
function verifySignature(publicKey, signature, timestamp, body) {
  const pubKeyBuf = Buffer.from(publicKey, 'hex');
  const sigBuf = Buffer.from(signature, 'hex');
  const msgBuf = Buffer.concat([Buffer.from(timestamp, 'utf8'), Buffer.from(body, 'utf8')]);
  return nacl.sign.detached.verify(new Uint8Array(msgBuf), new Uint8Array(sigBuf), new Uint8Array(pubKeyBuf));
}

export default async function handler(req, res) {
  // Accept only POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  const raw = await getRawBody(req).catch(() => {
    res.statusCode = 400; res.end('bad request'); return null;
  });
  if (raw === null) return;

  // verify signature
  if (!PUBLIC_KEY) {
    res.statusCode = 500;
    res.end('Server misconfigured: missing DISCORD_PUBLIC_KEY env var');
    return;
  }

  const sig = req.headers['x-signature-ed25519'] || req.headers['x-signature'];
  const ts = req.headers['x-signature-timestamp'];

  if (!sig || !ts) {
    res.statusCode = 401;
    res.end('missing signature headers');
    return;
  }

  try {
    const ok = verifySignature(PUBLIC_KEY, sig, ts, raw);
    if (!ok) {
      res.statusCode = 401;
      res.end('invalid request signature');
      return;
    }
  } catch (err) {
    res.statusCode = 500;
    res.end('signature verification error: ' + String(err?.message ?? err));
    return;
  }

  let body;
  try { body = JSON.parse(raw); } catch (e) {
    res.statusCode = 400; res.end('invalid json'); return;
  }

  // Handle Discord PING (type 1)
  if (body.type === 1) {
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({ type: 1 }));
    return;
  }

  // Application command (slash)
  if (body.type === 2 && body.data) {
    const name = body.data.name;
    const proto = detectProtocol(req);
    const host = req.headers.host || 'localhost';
    const baseUrl = `${proto}://${host}`;

    if (name === 'id') {
      const opts = (body.data.options || []).reduce((acc, o) => {
        acc[o.name] = o.value; return acc;
      }, {});
      const videoID = opts.videoid || opts.videoId || opts.id;
      
      if (!videoID) {
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.end(JSON.stringify({ type: 4, data: { content: 'Missing videoID option.' } }));
        return;
      }

      let embedVideoId = String(videoID);
      if (opts.autoplay === true || opts.autoplay === 'true') embedVideoId = embedVideoId + 'RD';
      
      const qs = new URLSearchParams();
      if (opts.endless === true || opts.endless === 'true') qs.set('endless','true');
      
      if (opts.params) {
        const extra = String(opts.params || '').replace(/^\?/, '');
        if (extra) {
          const sp = new URLSearchParams(extra);
          for (const [k,v] of sp) qs.set(k,v);
        }
      }

      const queryStr = qs.toString() ? ('?' + qs.toString()) : '';
      const embedUrl = `${baseUrl}/api/embed/${encodeURIComponent(embedVideoId)}${queryStr}`;

      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.end(JSON.stringify({ type: 4, data: { content: `Embed URL: ${embedUrl}` } }));
      return;
    }

    if (name === 'play' || name === 'pause') {
      const content = `Received command: ${name.toUpperCase()}. (No persistent server — create followups or register other commands.)`;
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.end(JSON.stringify({ type: 4, data: { content } }));
      return;
    }

    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({ type: 4, data: { content: `Unhandled command: ${name}` } }));
    return;
  }

  res.statusCode = 400;
  res.end('unsupported interaction');
}
