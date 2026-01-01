// /api/discord/interactions.js
// ESM serverless handler for Discord Interactions
// - Uses LAUNCH_ACTIVITY (type 12) for activity launches
// - Defers (type 5) for other commands, then posts followups via webhook
//
// Required env:
//   DISCORD_PUBLIC_KEY
//   VITE_DISCORD_CLIENT_ID   (APP_ID)
//   DISCORD_TOKEN            (optional for other operations)
//
// npm: install tweetnacl
//   npm i tweetnacl

import nacl from 'tweetnacl';

/** helpers **/
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
const APP_ID = process.env.VITE_DISCORD_CLIENT_ID;

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => buf += c);
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

function verifySig(req, rawBody) {
  const sig = req.headers['x-signature-ed25519'];
  const ts = req.headers['x-signature-timestamp'];
  if (!sig || !ts || !PUBLIC_KEY) return false;
  
  try {
    const msg = Buffer.concat([Buffer.from(ts, 'utf8'), Buffer.from(rawBody, 'utf8')]);
    return nacl.sign.detached.verify(
      new Uint8Array(msg),
      Uint8Array.from(Buffer.from(sig, 'hex')),
      Uint8Array.from(Buffer.from(PUBLIC_KEY, 'hex'))
    );
  } catch (e) {
    return false;
  }
}

async function postFollowup(appId, token, body) {
  // POST to interaction webhook to create followup (no auth header needed)
  const url = `https://discord.com/api/v10/webhooks/${appId}/${token}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r;
}

/** Build embed URL using your pattern:
    https://<videoId>.discordsays.com/api/embed/<videoId>?params
**/
function buildEmbedUrl(videoId, extras = {}) {
  const params = new URLSearchParams();
  if (extras.start) params.set('start', String(extras.start));
  if (extras.end) params.set('end', String(extras.end));
  if (extras.endless) params.set('endless', '1');
  // add any other allowed params as needed
  const paramStr = params.toString();
  // NOTE: uses the videoId as subdomain per your spec
  return `https://${encodeURIComponent(videoId)}.discordsays.com/api/embed/${encodeURIComponent(videoId)}${paramStr ? ('?' + paramStr) : ''}`;
}

/** Exported handler **/
export default async function handler(req, res) {
  // Only POST interactions
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }
  
  // read raw body (signature verification requires raw body)
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  
  // verify signature
  if (!verifySig(req, rawBody)) {
    res.statusCode = 401;
    res.end('Invalid request signature');
    return;
  }
  
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (err) {
    res.statusCode = 400;
    res.end('Invalid JSON');
    return;
  }
  
  // PING (Type 1)
  if (body.type === 1) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ type: 1 }));
    return;
  }
  
  // Application command (Type 2)
  if (body.type === 2 && body.data) {
    const name = body.data.name;
    const token = body.token; // for followups
    const interactionId = body.id;
    const options = (body.data.options || []).reduce((acc, o) => (acc[o.name] = o.value, acc), {});
    const proto = (req.headers['x-forwarded-proto']?.split(',')[0]) || (req.socket?.encrypted ? 'https' : 'http');
    
    // If user asked to launch the Activity, reply with type 12 immediately:
    // LAUNCH_ACTIVITY (type 12) – will launch the Activity associated with this application.
    // This must be returned within 3s.
    if (name === 'activity') {
      // optional: you can include a small data object if you later need it;
      // docs show LaunchActivity is represented by type 12 (no extra required).
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ type: 12 })); // LAUNCH_ACTIVITY
      return;
    }
    
    // For other commands, we use Defer + followup (type 5), to avoid timing out
    // Send immediate defer response (user sees 'Bot is thinking...')
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ type: 5 })); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    
    // Now perform the slower work and POST a followup via webhook
    // (the followup uses APP_ID + interaction token)
    try {
      if (name === 'id') {
        // expected option: videoid (string), optional: start,end,endless,autoplay
        const videoId = options.videoid || options.videoId || options.id;
        if (!videoId) {
          await postFollowup(APP_ID, token, { content: 'Missing `videoid` option.' });
          return;
        }
        
        // handle autoplay -> append RD to embed id per your spec (if provided)
        let embedId = String(videoId);
        const autoplay = options.autoplay === true || options.autoplay === 'true';
        if (autoplay) embedId += 'RD';
        
        const extras = {};
        if (options.start) extras.start = options.start;
        if (options.end) extras.end = options.end;
        if (options.endless === true || options.endless === 'true') extras.endless = true;
        
        const embedUrl = buildEmbedUrl(embedId, extras);
        
        // reply followup
        await postFollowup(APP_ID, token, {
          content: `🔗 Open embed: ${embedUrl}`
        });
        return;
      }
      
      if (name === 'play' || name === 'pause') {
        // these are quick control commands — we just return a followup that indicates the bot received the command.
        await postFollowup(APP_ID, token, {
          content: `Command received: **${name.toUpperCase()}**`
        });
        return;
      }
      
      // unknown command – reply followup with helpful message
      await postFollowup(APP_ID, token, {
        content: `Unhandled command: ${name}`
      });
      return;
      
    } catch (err) {
      // followup failed — nothing more we can do in this invocation
      try {
        await postFollowup(APP_ID, token, { content: `Error handling command: ${String(err && err.message ? err.message : err)}` });
      } catch (_) { /* swallow */ }
      return;
    }
  }
  
  // everything else
  res.statusCode = 400;
  res.end('Unsupported interaction');
}