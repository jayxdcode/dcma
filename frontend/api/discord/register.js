// /api/discord/register.js
// Usage (quick):
//  GET  /api/discord/register           -> help
//  POST /api/discord/register           -> register globally
//  POST /api/discord/register?guild=GID -> register to a specific guild for instant testing
//
// Body (JSON) optional; we use query param `guild` to register to a guild quickly.
//
// Env required: VITE_DISCORD_CLIENT_ID, DISCORD_TOKEN

const CLIENT_ID = process.env.VITE_DISCORD_CLIENT_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

async function doFetch(url, opts) {
  if (typeof fetch !== 'undefined') return fetch(url, opts);
  const nf = require('node-fetch');
  return nf(url, opts);
}

module.exports = async function(req, res) {
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
  
  // build the commands payload (adjust or add commands here)
  const commands = [
    {
      name: "id",
      type: 1, // chat input
      description: "Load an embed for a given YouTube-like video id",
      options: [
        { name: "videoid", description: "Video ID", type: 3, required: true },
        { name: "endless", description: "Make it loop/endless", type: 5, required: false },
        { name: "autoplay", description: "Autoplay (will append 'RD' to the id)", type: 5, required: false },
        { name: "params", description: "Extra player params as query string (e.g. start=10&controls=1)", type: 3, required: false }
      ]
    },
    // simple testing commands:
    {
      name: "play",
      type: 1,
      description: "Play command (test)"
    },
    {
      name: "pause",
      type: 1,
      description: "Pause command (test)"
    }
  ];
  
  // Check for guild query param to register to a guild (instant); otherwise global
  const urlObj = new URL(req.url, `https://${req.headers.host}`);
  const guildId = urlObj.searchParams.get('guild');
  
  const endpoint = guildId ?
    `https://discord.com/api/v10/applications/${CLIENT_ID}/guilds/${guildId}/commands` :
    `https://discord.com/api/v10/applications/${CLIENT_ID}/commands`;
  
  try {
    // Register commands one-by-one (allows partial success and clearer errors).
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
    res.end(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
  }
};