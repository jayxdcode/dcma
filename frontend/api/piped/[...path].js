// api/piped/[...path].js
// Proxy /api/piped/<anything> -> selected Piped instance (from the wiki Instances.md).
// Query param `ins` selects instance index (default 0). Query param `path` can override forwarded path.
// Example: GET /api/piped/search?q=beatles&ins=0

const RAW_WIKI_URL = 'https://raw.githubusercontent.com/TeamPiped/documentation/refs/heads/main/content/docs/public-instances/index.md';
const INSTANCES_CACHE_TTL = Number(process.env.INSTANCES_TTL_MS || 1000 * 60 * 5);
let _instancesCache = null;
let _instancesAt = 0;

function safeJoin(base, path) {
  if (!base) return String(path || '');
  if (!path) return String(base || '');
  const a = String(base).replace(/\/+$/g, '');
  const b = String(path).replace(/^\/+/g, '');
  return `${a}/${b}`;
}

async function fetchInstances() {
  const now = Date.now();
  if (_instancesCache && (now - _instancesAt) < INSTANCES_CACHE_TTL) return _instancesCache;
  
  try {
    const r = await fetch(RAW_WIKI_URL, { headers: { 'User-Agent': 'vercel-piped-proxy/1.0' } });
    if (!r.ok) throw new Error('failed to fetch instances');
    
    const txt = await r.text();
    const lines = txt.split('\n');
    const instances = [];
    let skipped = 0;
    for (const line of lines) {
      const split = line.split('|').map(s => s.trim());
      if (split.length === 5 || split.length === 4) {
        if (skipped < 2) { skipped++; continue; }
        const name = split[0] || split[1] || '';
        const apiurl = split[1] || split[2] || '';
        const locations = split[2] || '';
        const cdn = split[3] || '';
        const api_url_norm = apiurl ? apiurl.replace(/\s+/g, '').replace(/\/+$/g, '') : '';
        if (!api_url_norm) continue;
        instances.push({
          name: name || api_url_norm.replace(/^https?:\/\//, ''),
          api_url: api_url_norm,
          locations: locations || 'Unknown',
          cdn: cdn || 'Unknown',
          raw: line
        });
      }
    }
    
    if (!instances.length) {
      // permissive fallback: find http(s) urls
      const urlRegex = /https?:\/\/[^\s)'"<]+/ig;
      const set = new Set();
      let m;
      while ((m = urlRegex.exec(txt))) {
        try {
          const u = new URL(m[0].trim());
          set.add(u.origin.replace(/\/+$/g, ''));
        } catch (e) {}
      }
      for (const origin of set) {
        instances.push({
          name: origin.replace(/^https?:\/\//, ''),
          api_url: `${origin}/api/v1`.replace(/\/{2,}/g, '/').replace(':/', '://'),
          locations: 'Unknown',
          cdn: 'Unknown',
          raw: origin
        });
      }
    }
    
    if (!instances.length && process.env.PIPED_FALLBACK) {
      instances.push({
        name: 'Custom (FALLBACK)',
        api_url: process.env.PIPED_FALLBACK.replace(/\/+$/g, ''),
        locations: 'Unknown',
        cdn: 'Unknown',
        raw: process.env.PIPED_FALLBACK
      });
    }
    
    _instancesCache = instances;
    _instancesAt = Date.now();
    return instances;
  } catch (err) {
    console.error('fetchInstances error', err);
    // if we have a fallback env var, use it
    if (process.env.PIPED_FALLBACK) {
      return [{
        name: 'Custom (FALLBACK)',
        api_url: process.env.PIPED_FALLBACK.replace(/\/+$/g, ''),
        locations: 'Unknown',
        cdn: 'Unknown',
        raw: process.env.PIPED_FALLBACK
      }];
    }
    return [];
  }
}

async function readRequestBody(req) {
  if (req.body && Object.keys(req.body || {}).length) {
    try { return JSON.stringify(req.body); } catch (e) {}
  }
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
    res.status(204).end();
    return;
  }
  
  try {
    const instances = await fetchInstances();
    if (!Array.isArray(instances) || instances.length === 0) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(502).json({ error: 'no piped instances discovered' });
      return;
    }
    
    // derive path suffix from req.url (remove /api/piped prefix)
    // req.url may contain query string: use URL with dummy base for parsing
    const parsed = new URL(req.url, `https://${req.headers.host}`);
    const searchParams = parsed.searchParams;
    const insRaw = searchParams.get('ins');
    const ins = Number.isFinite(Number(insRaw)) ? Math.max(0, Math.min(instances.length - 1, Number(insRaw))) : 0;
    
    const selected = instances[ins];
    const targetBase = selected.api_url || selected.raw;
    if (!targetBase) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(502).json({ error: 'selected instance has no api url' });
      return;
    }
    
    // compute suffix: everything after /api/piped/
    const incomingPath = parsed.pathname || '';
    // expected prefix: /api/piped
    const prefix = '/api/piped';
    let suffix = '';
    if (incomingPath.startsWith(prefix)) {
      suffix = incomingPath.slice(prefix.length).replace(/^\/+/g, ''); // remove leading slash
    } else {
      // fallback: use 'path' query param if provided
      if (searchParams.has('path')) suffix = searchParams.get('path').replace(/^\/+/, '');
    }
    
    // remove ins and path before forwarding
    searchParams.delete('ins');
    searchParams.delete('path');
    
    const forwardedQs = searchParams.toString();
    const targetUrl = forwardedQs ? `${safeJoin(targetBase, suffix)}?${forwardedQs}` : safeJoin(targetBase, suffix);
    
    // build headers to forward
    const forwardedHeaders = {};
    const hopByHop = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade', 'host']);
    for (const [k, v] of Object.entries(req.headers || {})) {
      const lk = String(k).toLowerCase();
      if (hopByHop.has(lk)) continue;
      if (lk === 'cookie') continue; // don't forward client cookies by default
      forwardedHeaders[k] = v;
    }
    forwardedHeaders['x-forwarded-by'] = 'vercel-piped-mitm';
    
    let body = undefined;
    if (!['GET', 'HEAD'].includes(req.method)) {
      body = await readRequestBody(req);
    }
    
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardedHeaders,
      body: body && body.length ? body : undefined,
      redirect: 'manual'
    });
    
    // set status
    res.status(upstream.status);
    
    // forward selected headers
    upstream.headers.forEach((value, key) => {
      const lk = key.toLowerCase();
      if (['transfer-encoding', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'upgrade'].includes(lk)) return;
      // don't forward set-cookie for now
      if (lk === 'set-cookie') return;
      res.setHeader(key, value);
    });
    
    // set CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
    
    // stream / buffer body
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