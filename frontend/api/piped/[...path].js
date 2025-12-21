// api/piped/[...path].js
// Catch-all proxy that forwards requests to a selected Piped instance.
// Use: /api/piped/<any-path>?ins=0&other=query=...  OR just /api/piped?ins=0&path=/search&q=...
//
// Behavior:
// - Determine instance index from query param `ins` (default 0)
// - Resolve instances by parsing the INSTANCES.md (same logic as instances.js)
// - Build target URL: selectedInstance.api_url (+ appended path from the route or `path` query param)
// - Forward method, headers, and body (for non-GET/HEAD methods).
// - Return upstream status, headers (filtered) and body back to client.
// - Adds CORS: Access-Control-Allow-Origin: * (adjust as needed).
//
// Security notes:
// - You can restrict proxying with an ALLOWED_HOSTS env var or add an API key check if desired.
// - This proxy makes outbound requests to arbitrary public instances listed in INSTANCES.md.

function safeJoin(base, path) {
  if (!base) return String(path || '');
  if (!path) return String(base || '');
  const a = String(base).replace(/\/+$/g, '');
  const b = String(path).replace(/^\/+/g, '');
  return `${a}/${b}`;
}

async function getInstancesList() {
  const RAW_URL = 'https://raw.githubusercontent.com/TeamPiped/Piped/master/INSTANCES.md';
  const r = await fetch(RAW_URL, { headers: { 'User-Agent': 'piped-mitm-proxy/1.0' } });
  if (!r.ok) throw new Error('failed to fetch instances');
  const txt = await r.text();
  
  const urls = new Set();
  const urlRegex = /https?:\/\/[^\s)'"<]+/ig;
  let m;
  while ((m = urlRegex.exec(txt))) {
    try {
      const u = new URL(m[0].trim());
      urls.add(u.origin.replace(/\/+$/g, ''));
    } catch (e) {}
  }
  const domainRegex = /(^|\s)([a-z0-9.-]+\.[a-z]{2,})(?=[\s,)|]|$)/ig;
  while ((m = domainRegex.exec(txt))) {
    const host = m[2];
    try { urls.add(`https://${host}`.replace(/\/+$/g, '')); } catch (e) {}
  }
  
  const instances = Array.from(urls).map(origin => {
    const base = origin.replace(/\/+$/g, '');
    const api_v1 = `${base.replace(/\/api(\/v\d+)?$/i, '')}/api/v1`.replace(/\/{2,}/g, '/').replace(':/', '://');
    const api_no_v = `${base.replace(/\/api(\/v\d+)?$/i, '')}/api`.replace(/\/{2,}/g, '/').replace(':/', '://');
    return {
      name: base.replace(/^https?:\/\//, ''),
      domain: base.replace(/^https?:\/\//, ''),
      api_url: api_v1,
      api_url_v1: api_v1,
      api_url_api: api_no_v,
      raw: base
    };
  });
  
  return instances;
}

async function readRequestBody(req) {
  // Collect raw body into a Buffer (for POST/PUT/PATCH). If body is already set by Vercel, use it.
  if (req.body && Object.keys(req.body).length) {
    // If parsed body exists, return JSON string (but this rarely happens for binary payloads)
    try {
      return JSON.stringify(req.body);
    } catch (e) { /* fallback */ }
  }
  
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // Allow preflight for CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
    res.status(204).end();
    return;
  }
  
  try {
    const instances = await getInstancesList();
    if (!Array.isArray(instances) || instances.length === 0) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(502).json({ error: 'no piped instances discovered' });
      return;
    }
    
    // instance index (ins) from query; default 0
    const urlObj = new URL(`${req.protocol || 'https'}://${req.headers.host}${req.url}`);
    const searchParams = urlObj.searchParams;
    const insRaw = searchParams.get('ins');
    const ins = Number.isFinite(Number(insRaw)) ? Math.max(0, Math.min(instances.length - 1, Number(insRaw))) : 0;
    
    const selected = instances[ins];
    const targetBase = selected.api_url || selected.api_url_v1 || selected.api_url_api || selected.raw;
    if (!targetBase) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(502).json({ error: 'selected instance has no api url' });
      return;
    }
    
    // Build target path: use the catch-all slug (req.query.path?) OR use req.url's pathname after /api/piped/
    // In Vercel the local req.url contains /api/piped/<slug>?..., so derive the suffix by removing the prefix.
    // We'll compute the pathSuffix by removing the "/api/piped" prefix from req.url's pathname.
    const incomingFullUrl = req.url || '/';
    // Remove query portion and decode path
    const pathname = (incomingFullUrl.split('?')[0] || '').replace(/^\/+/, '');
    // Remove the first two segments "api" and "piped"
    const pieces = pathname.split('/').filter(Boolean);
    // if pieces are ['api','piped', ...slug]
    let suffix = '';
    if (pieces.length <= 2) {
      suffix = ''; // root proxy call -> targetBase root
    } else {
      const slugParts = pieces.slice(2);
      suffix = slugParts.join('/');
    }
    
    // Alternatively, user can pass a 'path' query param describing the path
    if (searchParams.has('path')) {
      suffix = searchParams.get('path').replace(/^\/+/, '');
    }
    
    // Remove 'ins' from forwarded query
    searchParams.delete('ins');
    searchParams.delete('path'); // if used
    // Recreate querystring
    const forwardedQs = searchParams.toString();
    const targetUrl = forwardedQs ? `${safeJoin(targetBase, suffix)}?${forwardedQs}` : safeJoin(targetBase, suffix);
    
    // Build headers to forward (strip hop-by-hop headers)
    const forwardedHeaders = {};
    const hopByHop = new Set([
      'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers',
      'transfer-encoding', 'upgrade', 'host'
    ]);
    for (const [k, v] of Object.entries(req.headers || {})) {
      if (!k) continue;
      const lk = k.toLowerCase();
      if (hopByHop.has(lk)) continue;
      // optional: don't forward internal cookies
      if (lk === 'cookie') continue;
      forwardedHeaders[k] = v;
    }
    // Add a forwarded header for tracing
    forwardedHeaders['x-forwarded-by'] = 'vercel-piped-mitm';
    // Preserve user-agent from client, unless you want to override
    // forwardedHeaders['user-agent'] = forwardedHeaders['user-agent'] || 'vercel-piped-mitm/1.0';
    
    // Body (only for relevant methods)
    let body = undefined;
    if (!['GET', 'HEAD'].includes(req.method)) {
      body = await readRequestBody(req);
    }
    
    // Perform fetch to target
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardedHeaders,
      body: body && body.length ? body : undefined,
      // don't follow too many redirects
      redirect: 'manual'
    });
    
    // Relay status
    res.status(upstream.status);
    
    // Relay selected headers back (filter hop-by-hop)
    upstream.headers.forEach((value, key) => {
      const lk = key.toLowerCase();
      if (['transfer-encoding', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'upgrade'].includes(lk)) return;
      // Remove security sensitive headers if desired (like set-cookie)
      if (lk === 'set-cookie') return;
      res.setHeader(key, value);
    });
    
    // Always allow CORS from client (adjust if you want)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
    
    // Stream body to client
    // Convert response to ArrayBuffer then Buffer for Node
    const arrBuf = await upstream.arrayBuffer();
    const buf = Buffer.from(arrBuf);
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  } catch (err) {
    console.error('proxy error', err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: 'proxy_error', message: String(err?.message || err) });
  }
}