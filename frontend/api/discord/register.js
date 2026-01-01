// /api/discord/register.js - ESM Version
// Usage (quick):
//  GET  /api/discord/register           -> help
//  POST /api/discord/register           -> register globally
//  POST /api/discord/register?guild=GID -> register to a specific guild for instant testing

const CLIENT_ID = process.env.VITE_DISCORD_CLIENT_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

/**
 * Modern helper: Uses global fetch if available (Node 18+), 
 * otherwise attempts to dynamic import node-fetch.
 */
async function doFetch(url, opts) {
  if (typeof fetch !== 'undefined') return fetch(url, opts);
  
  // In ESM, you must use dynamic import() instead of require()
  const { default: nf } = await import('node-fetch');
  return nf(url, opts);
}

export default async function handler(req, res) {
  if (!CLIENT_ID || !DISCORD_TOKEN) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Missing VITE_DISCORD_CLIENT_ID or DISCORD_TOKEN env var' }));
    return;
  }
  
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok: true,
      info: 'POST to this endpoint to register commands. Use ?guild=GUILD_ID to register to a guild for quick testing.'
    }));
    return;
  }
  
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET,POST');
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }
  
  const commands = [
    {
      name: "id",
      type: 1,
      description: "Load an embed for a given YouTube-like video id",
      options: [
        { name: "videoid", description: "Video ID", type: 3, required: true },
        { name: "endless", description: "Make it loop/endless", type: 5, required: false },
        { name: "autoplay", description: "Autoplay (will append 'RD' to the id)", type: 5, required: false },
        { name: "params", description: "Extra player params as query string (e.g. start=10&controls=1)", type: 3, required: false }
      ]
    },
    { name: "play", type: 1, description: "Play command (test)" },
    { name: "pause", type: 1, description: "Pause command (test)" }
  ];
  
  const host = req.headers.host || 'localhost';
  const urlObj = new URL(req.url, `https://${host}`);
  const guildId = urlObj.searchParams.get('guild');
  
  const endpoint = guildId ?
    `https://discord.com/api/v10/applications/${CLIENT_ID}/guilds/${guildId}/commands` :
    `https://discord.com/api/v10/applications/${CLIENT_ID}/commands`;
  
  try {
    const results = [];
    for (const cmd of commands) {
      const r = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(cmd)
      });
      const json = await r.text();
      let parsed;
      try { parsed = JSON.parse(json); } catch (e) { parsed = { raw: json }; }
      results.push({ cmd: cmd.name, status: r.status, body: parsed });
    }
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, results }));
  } catch (err) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: String(err?.message ?? err) }));
  }
}
