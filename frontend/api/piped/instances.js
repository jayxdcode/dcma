// api/piped/instances.js
// Vercel serverless handler that returns a parsed list of TeamPiped instances.
// It fetches the INSTANCES.md raw from the TeamPiped repo and tries to construct sensible api_url candidates.
//
// Response: JSON array of { name, domain, api_url, api_url_v1, raw }.

export default async function handler(req, res) {
  try {
    // Fetch raw instances doc from the Piped repo
    const RAW_URL = 'https://raw.githubusercontent.com/TeamPiped/Piped/master/INSTANCES.md';
    const r = await fetch(RAW_URL, { headers: { 'User-Agent': 'piped-mitm-proxy/1.0' } });
    if (!r.ok) {
      res.status(502).json({ error: 'failed to fetch instances list', status: r.status });
      return;
    }
    const txt = await r.text();
    
    // Parse domains from the markdown. We look for http(s) links and bare domains.
    // This is permissive: we attempt to produce api candidates for each host found.
    const urls = new Set();
    
    // Match explicit urls e.g. https://piped.example or https://piped.example/api/v1
    const urlRegex = /https?:\/\/[^\s)'"<]+/ig;
    let m;
    while ((m = urlRegex.exec(txt))) {
      try {
        const u = new URL(m[0].trim());
        // store origin (protocol + host)
        urls.add(u.origin.replace(/\/+$/g, ''));
      } catch (e) { /* ignore invalid */ }
    }
    
    // Also search for bare domains (lines without protocol) like piped.example.com
    const domainRegex = /(^|\s)([a-z0-9.-]+\.[a-z]{2,})(?=[\s,)|]|$)/ig;
    while ((m = domainRegex.exec(txt))) {
      const host = m[2];
      // skip obviously non-http like 'example.com' if already captured, otherwise add as https
      try {
        urls.add(`https://${host}`.replace(/\/+$/g, ''));
      } catch (e) {}
    }
    
    // Build array of instance candidates
    const instances = Array.from(urls).map(origin => {
      // candidate api url shapes commonly used by Piped instances:
      //  - https://<origin>/api/v1
      //  - https://<origin>/api
      // but origin may already contain '/api' -> keep it sanitized
      const base = origin.replace(/\/+$/g, '');
      const api_v1 = `${base.replace(/\/api(\/v\d+)?$/i, '')}/api/v1`.replace(/\/{2,}/g, '/').replace(':/', '://');
      const api_no_v = `${base.replace(/\/api(\/v\d+)?$/i, '')}/api`.replace(/\/{2,}/g, '/').replace(':/', '://');
      return {
        name: base.replace(/^https?:\/\//, ''),
        domain: base.replace(/^https?:\/\//, ''),
        // primary candidate (kept for legacy frontend expecting "api_url")
        api_url: api_v1,
        api_url_v1: api_v1,
        api_url_api: api_no_v,
        raw: base
      };
    });
    
    // Basic sanity: if none found, return fallback (empty)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(instances);
  } catch (err) {
    console.error('instances handler error', err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: 'internal', message: String(err?.message || err) });
  }
}