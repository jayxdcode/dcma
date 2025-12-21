// api/piped/[...path].js
// Robust proxy: will try the selected instance, then fall back to next ones if it fails.

const RAW_WIKI_URL = 'https://raw.githubusercontent.com/TeamPiped/documentation/refs/heads/main/content/docs/public-instances/index.md';
const INSTANCES_CACHE_TTL = Number(process.env.INSTANCES_TTL_MS || 1000 * 60 * 5);
const UPSTREAM_TIMEOUT_MS = Number(process.env.PIPED_UPSTREAM_TIMEOUT_MS || 15000); // 15s default per attempt
let _instancesCache = null;
let _instancesAt = 0;

function safeJoin(base, path) {
  if (!base) return String(path || '');
  if (!path) return String(base || '');
  const a = String(base).replace(/\/+$/g, '');
  const b = String(path).replace(/^\/+/g, '');
  return `${a}/${b}`;
}

async function fetchTextWithUA(url) {
  return await fetch(url, { headers: { 'User-Agent': 'vercel-piped-proxy/1.0' } }).then(r => {
    if (!r.ok) throw new Error(`failed fetch ${url} -> ${r.status}`);
    return r.text();
  });
}

async function fetchJsonUrl(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'vercel-piped-proxy/1.0' } });
    if (!r.ok) throw new Error(`non-ok ${r.status}`);
    const txt = await r.text();
    return JSON.parse(txt);
  } catch (err) {
    throw err;
  }
}

async function fetchInstances() {
  const now = Date.now();
  if (_instancesCache && (now - _instancesAt) < INSTANCES_CACHE_TTL) return _instancesCache;
  try {
    // prefer a pre-generated JSON list if provided (easier / deterministic)
    const jsonUrl = 'https://raw.githubusercontent.com/jayxdcode/dcma/refs/heads/main/public/piped-instances.json';
    if (jsonUrl) {
      try {
        const list = await fetchJsonUrl(jsonUrl);
        if (Array.isArray(list.instances) && list.instances.length) {
          _instancesCache = list.instances.map(i => ({
            name: i.name || i.api_url,
            api_url: (i.api_url || i.url || i.base || '').replace(/\/+$/g, ''),
            raw: i.raw || JSON.stringify(i),
            cdn: i.cdn || i.CDN || null,
          })).filter(x => x.api_url);
          _instancesAt = Date.now();
          return _instancesCache;
        }
      } catch (err) {
        console.warn('failed to load instances from PIPED_INSTANCES_JSON_URL', err?.message || err);
        // fall back to wiki parsing
      }
    }
    
    // fallback: parse TeamPiped markdown
    const txt = await fetchTextWithUA(RAW_WIKI_URL);
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
          cdn: cdn || null,
          raw: line
        });
      }
    }
    
    // permissive fallback: find http(s) urls in file
    if (!instances.length) {
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
          cdn: null,
          raw: origin
        });
      }
    }
    
    // fallback env var
    if (!instances.length && process.env.PIPED_FALLBACK) {
      instances.push({
        name: 'Custom (FALLBACK)',
        api_url: process.env.PIPED_FALLBACK.replace(/\/+$/g, ''),
        locations: 'Unknown',
        cdn: null,
        raw: process.env.PIPED_FALLBACK
      });
    }
    
    _instancesCache = instances;
    _instancesAt = Date.now();
    return instances;
  } catch (err) {
    console.error('fetchInstances error', err);
    if (process.env.PIPED_FALLBACK) {
      return [{
        name: 'Custom (FALLBACK)',
        api_url: process.env.PIPED_FALLBACK.replace(/\/+$/g, ''),
        locations: 'Unknown',
        cdn: null,
        raw: process.env.PIPED_FALLBACK
      }];
    }
    return [];
  }
}

async function readRequestBody(req) {
  if (req.body && Object.keys(req.body || {}).length) {
    try { return Buffer.from(JSON.stringify(req.body)); } catch (e) {}
  }
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// perform a single upstream attempt with timeout and return an object describing the result
async function doUpstreamRequest(targetUrl, req, forwardedHeaders, bodyBuf) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  
  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardedHeaders,
      body: bodyBuf && bodyBuf.length ? bodyBuf : undefined,
      redirect: 'manual',
      signal: controller.signal
    });
    clearTimeout(timeout);
    return { ok: true, upstream };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, error: err };
  }
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
    
    // parse requested index
    const parsed = new URL(req.url, `https://${req.headers.host}`);
    const searchParams = parsed.searchParams;
    const insRaw = searchParams.get('ins');
    let startIdx = (Number.isFinite(Number(insRaw)) ? Math.max(0, Math.min(instances.length - 1, Number(insRaw))) : 0);
    
    // compute suffix (everything after /api/piped)
    const incomingPath = parsed.pathname || '';
    const prefix = '/api/piped';
    let suffix = '';
    if (incomingPath.startsWith(prefix)) {
      suffix = incomingPath.slice(prefix.length).replace(/^\/+/g, '');
    } else {
      if (searchParams.has('path')) suffix = searchParams.get('path').replace(/^\/+/, '');
    }
    
    // remove ins & path before forwarding
    searchParams.delete('ins');
    searchParams.delete('path');
    
    const forwardedQs = searchParams.toString();
    
    // build forwarded headers (filter hop-by-hop)
    const forwardedHeaders = {};
    const hopByHop = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade', 'host']);
    for (const [k, v] of Object.entries(req.headers || {})) {
      const lk = String(k).toLowerCase();
      if (hopByHop.has(lk)) continue;
      if (lk === 'cookie') continue;
      forwardedHeaders[k] = v;
    }
    forwardedHeaders['x-forwarded-by'] = 'vercel-piped-mitm';
    
    // read body once
    let bodyBuf;
    if (!['GET', 'HEAD'].includes(req.method)) {
      bodyBuf = await readRequestBody(req);
    }
    
    // attempt instances in sequence starting at startIdx, wrapping around
    const maxAttempts = instances.length;
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const idx = (startIdx + attempt) % instances.length;
      const selected = instances[idx];
      if (!selected || !selected.api_url) continue;
      
      const targetBase = selected.api_url || selected.raw;
      const targetUrl = forwardedQs ? `${safeJoin(targetBase, suffix)}?${forwardedQs}` : safeJoin(targetBase, suffix);
      
      try {
        const result = await doUpstreamRequest(targetUrl, req, forwardedHeaders, bodyBuf);
        if (!result.ok) {
          lastError = result.error;
          console.warn(`upstream attempt ${idx} failed (network):`, result.error?.message || result.error);
          continue; // try next instance
        }
        const upstream = result.upstream;
        // if upstream responded with server error (5xx), treat as failure and try next instance
        if (upstream.status >= 500) {
          lastError = new Error(`upstream ${targetUrl} returned ${upstream.status}`);
          console.warn('upstream server error, trying next instance:', upstream.status);
          continue;
        }
        
        // forward status and headers
        res.status(upstream.status);
        upstream.headers.forEach((value, key) => {
          const lk = key.toLowerCase();
          if (['transfer-encoding', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'upgrade'].includes(lk)) return;
          if (lk === 'set-cookie') return;
          res.setHeader(key, value);
        });
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
        
        // stream / buffer upstream body into response
        const arrBuf = await upstream.arrayBuffer();
        const buf = Buffer.from(arrBuf);
        res.setHeader('Content-Length', String(buf.length));
        res.end(buf);
        return; // success — done
      } catch (err) {
        lastError = err;
        console.warn('upstream attempt error for', targetUrl, err?.message || err);
        // try next instance
      }
    }
    
    // if we reach here, all attempts failed
    console.error('All upstream instances failed', lastError?.message || lastError);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(502).json({ error: 'all_upstream_failed', message: String(lastError?.message || lastError) });
  } catch (err) {
    console.error('proxy error', err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: 'proxy_error', message: String(err?.message || err) });
  }
}