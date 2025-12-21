// api/piped/instances.js
// Returns parsed instances from the TeamPiped wiki Instances.md
// Uses wiki raw URL: https://raw.githubusercontent.com/wiki/TeamPiped/Piped-Frontend/Instances.md

const RAW_WIKI_URL = 'https://raw.githubusercontent.com/TeamPiped/documentation/refs/heads/main/content/docs/public-instances/index.md';
const CACHE_TTL_MS = Number(process.env.INSTANCES_TTL_MS || 1000 * 60 * 5); // 5 minutes default
let _cache = null;
let _cacheAt = 0;

function normalizeApiUrl(apiurl) {
  if (!apiurl) return apiurl;
  return apiurl.replace(/\s+/g, '').replace(/\/+$/g, '');
}

export default async function handler(req, res) {
  try {
    const now = Date.now();
    if (_cache && (now - _cacheAt) < CACHE_TTL_MS) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json(_cache);
      return;
    }
    
    const rsp = await fetch(RAW_WIKI_URL, { headers: { 'User-Agent': 'vercel-piped-instances/1.0' } });
    if (!rsp.ok) {
      // fallback: if env fallback provided, return that as single instance
      const fallback = process.env.PIPED_FALLBACK;
      if (fallback) {
        const inst = [{
          name: 'Custom Instance (FALLBACK)',
          api_url: normalizeApiUrl(fallback),
          locations: 'Unknown',
          cdn: 'Unknown',
          raw: fallback
        }];
        _cache = inst;
        _cacheAt = Date.now();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(inst);
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(502).json({ error: 'failed to fetch instances list', status: rsp.status });
      return;
    }
    
    const txt = await rsp.text();
    const lines = txt.split('\n');
    
    const instances = [];
    // skip initial header lines, as per the sample in docs: first two lines are table header/separators
    let skipped = 0;
    for (const line of lines) {
      const split = line.split('|').map(s => s.trim());
      // valid rows will have 4 columns per docs: Name | API URL | Locations | CDN
      if (split.length === 5) {
        // markdown tables often produce an empty first/last element due to leading/trailing '|'
        // The sample code in docs skipped first two 'header' lines; we replicate that logic.
        if (skipped < 2) {
          skipped++;
          continue;
        }
        // split is like ['', 'Name', 'API', 'Locations', 'CDN', ''] for some lines; we handled length 5 above.
      } else if (split.length === 4) {
        if (skipped < 2) {
          skipped++;
          continue;
        }
      } else {
        // not a table row
        continue;
      }
      
      // Try to pick the 4 relevant columns: name | apiurl | locations | cdn
      // depending on leading/trailing '|', the columns may sit at different indexes
      // find the first non-empty-ish column index
      const cols = split.filter((_, i) => i >= 0); // keep as-is
      // Heuristic to select last 4 non-empty cells
      const nonEmpty = split.map(s => s === '' ? null : s);
      // Determine name/apiurl/locations/cdn by scanning
      // Simpler approach: rely on the documented pattern: Name | API URL | Locations | CDN
      const name = split[0] || split[1] || '';
      const apiurl = split[1] || split[2] || '';
      const locations = split[2] || '';
      const cdn = split[3] || '';
      
      // sanitize apiurl
      const api_url_norm = normalizeApiUrl(apiurl);
      
      if (!api_url_norm) continue;
      instances.push({
        name: (name || api_url_norm).replace(/^https?:\/\//, ''),
        api_url: api_url_norm,
        locations: locations || 'Unknown',
        cdn: cdn || 'Unknown',
        raw: line
      });
    }
    
    // If parsing returned nothing, try a more permissive domain scan (as fallback)
    if (!instances.length) {
      // permissive scan: find http(s) urls in file
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
          api_url: normalizeApiUrl(`${origin}/api/v1`),
          locations: 'Unknown',
          cdn: 'Unknown',
          raw: origin
        });
      }
    }
    
    // final fallback: PIPED_FALLBACK env var
    if (!instances.length && process.env.PIPED_FALLBACK) {
      instances.push({
        name: 'Custom Instance (FALLBACK)',
        api_url: normalizeApiUrl(process.env.PIPED_FALLBACK),
        locations: 'Unknown',
        cdn: 'Unknown',
        raw: process.env.PIPED_FALLBACK
      });
    }
    
    _cache = instances;
    _cacheAt = Date.now();
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(instances);
  } catch (err) {
    console.error('instances handler error', err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: 'internal', message: String(err?.message || err) });
  }
}