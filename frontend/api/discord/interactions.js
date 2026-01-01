// /api/discord/interactions.js
// Discord interaction endpoint. Configure your Discord App -> Interactions endpoint URL to this path.
// Env required: DISCORD_PUBLIC_KEY, VITE_DISCORD_CLIENT_ID (optional), DISCORD_TOKEN (optional if you want to do followups).

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

async function doFetch(url, opts) {
  if (typeof fetch !== 'undefined') return fetch(url, opts);
  const nf = require('node-fetch');
  return nf(url, opts);
}

// signature verification using tweetnacl
function verifySignature(publicKey, signature, timestamp, body) {
  try {
    const nacl = require('tweetnacl');
    const pubKeyBuf = Buffer.from(publicKey, 'hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const msgBuf = Buffer.concat([Buffer.from(timestamp, 'utf8'), Buffer.from(body, 'utf8')]);
    return nacl.sign.detached.verify(new Uint8Array(msgBuf), new Uint8Array(sigBuf), new Uint8Array(pubKeyBuf));
  } catch (e) {
    throw new Error('tweetnacl not available. npm install tweetnacl');
  }
}

module.exports = async function (req, res) {
  // Accept only POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.end('Method not allowed');
    return;
  }

  const raw = await getRawBody(req).catch((e) => {
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
  const ts = req.headers['x-signature-timestamp'] || req.headers['x-signature-timestamp'];

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
    res.end('signature verification error: ' + String(err && err.message ? err.message : err));
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
    // Build base URL for embed link (detect host and protocol)
    const proto = detectProtocol(req);
    const host = req.headers.host || 'localhost';
    const baseUrl = `${proto}://${host}`;

    if (name === 'id') {
      // extract options
      const opts = (body.data.options || []).reduce((acc, o) => {
        acc[o.name] = o.value; return acc;
      }, {});
      const videoID = opts.videoid || opts.videoId || opts.id;
      if (!videoID) {
        // respond with error
        const content = 'Missing videoID option.';
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.end(JSON.stringify({ type: 4, data: { content } }));
        return;
      }

      // construct embed URL
      let embedVideoId = String(videoID);
      if (opts.autoplay === true || opts.autoplay === 'true') embedVideoId = embedVideoId + 'RD';
      const qs = new URLSearchParams();
      if (opts.endless === true || opts.endless === 'true') qs.set('endless','true');
      if (opts.params) {
        // user provided extra param string; append as-is
        const extra = String(opts.params || '').replace(/^\?/, '');
        if (extra) {
          // append each kv from extra into qs
          const sp = new URLSearchParams(extra);
          for (const [k,v] of sp) qs.set(k,v);
        }
      }

      const embedUrl = `${baseUrl}/api/embed/${encodeURIComponent(embedVideoId)}${qs.toString() ? ('?' + qs.toString()) : ''}`;

      // Immediate reply (channel message with source). You can make ephemeral by adding flags: 64
      const responseData = {
        content: `Embed URL: ${embedUrl}`,
        // optional: make ephemeral so only the invoking user sees it:
        // flags: 64
      };

      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.end(JSON.stringify({ type: 4, data: responseData }));
      return;
    }

    // simple play/pause commands for testing
    if (name === 'play' || name === 'pause') {
      const content = `Received command: ${name.toUpperCase()}. (No persistent server — create followups or register other commands.)`;
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.end(JSON.stringify({ type: 4, data: { content } }));
      return;
    }

    // Unknown command
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({ type: 4, data: { content: `Unhandled command: ${name}` } }));
    return;
  }

  // fallback
  res.statusCode = 400;
  res.end('unsupported interaction');
};