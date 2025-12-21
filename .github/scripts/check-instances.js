/**
 * check-instances.js
 * - Ports the behavior of TeamPiped/instances-api main.go into Node
 * - Probes /api/v1/version to prioritize latest backend version
 * - Runs 5 randomized suggestion + search runs per instance
 * - Writes public/piped-instances.json
 */
const fs = require('fs').promises;
const { spawnSync } = require('child_process');
const fetch = (...args) => import('node-fetch').then(m=>m.default(...args));
const semver = require('semver');

const RAW_WIKI_URL = process.env.RAW_WIKI_URL || 'https://raw.githubusercontent.com/TeamPiped/documentation/refs/heads/main/content/docs/public-instances/index.md';
const OUTPUT = process.env.OUTPUT_PATH || 'public/piped-instances.json';

const SUGGEST_PATHS = [
  '/search/suggestions?q=',
  '/api/v1/search/suggestions?q=',
  '/suggest?q=',
  '/autocomplete?q='
];
const SEARCH_PATHS = [
  '/search?query=',
  '/api/v1/search?query=',
  '/search?q=',
  '/api/v1/search?q='
];
const VERSION_PATHS = [
  '/api/v1/version',
  '/version',
  '/api/version'
];

const SEARCH_TERMS = [
  'Never Gonna Give You Up',
  'rick astley',
  'piped',
  'openai',
  'lofi hip hop'
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function normalizeApiUrl(u) {
  if (!u) return null;
  u = u.trim();
  const m = u.match(/https?:\/\/[^\s)"]+/);
  if (!m) return null;
  try {
    const url = new URL(m[0]);
    // return origin + path (without trailing slash)
    return (url.origin + (url.pathname && url.pathname !== '/' ? url.pathname.replace(/\/+$/, '') : '')).replace(/\/+$/, '');
  } catch(e) {
    return null;
  }
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'github-actions/piped-inst-checker/1.0' }});
  if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
  return await r.text();
}

async function fetchJsonMaybe(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'github-actions/piped-inst-checker/1.0' }, redirect: 'follow' });
    const text = await r.text();
    try { return { ok: r.ok, status: r.status, json: JSON.parse(text) }; } catch(e) { return { ok: r.ok, status: r.status, text }; }
  } catch (e) {
    return { ok: false, err: String(e) };
  }
}

function parseMarkdownToApis(md) {
  const lines = md.split('\n');
  const instances = [];
  for (const line of lines) {
    if (!line.includes('|')) continue;
    if (!/https?:\/\//.test(line)) continue;
    const urlMatch = line.match(/https?:\/\/[^\s|)]+/);
    if (!urlMatch) continue;
    const api = normalizeApiUrl(urlMatch[0]);
    if (!api) continue;
    const parts = line.split('|').map(s => s.trim());
    const name = parts[1] || api.replace(/^https?:\/\//,'');
    const cdn = parts.length >= 5 ? (parts[4] || null) : null;
    instances.push({ raw: line, api_url: api, name, cdn });
  }
  // dedupe preserving first mention
  const seen = new Set();
  return instances.filter(i => {
    if (seen.has(i.api_url)) return false;
    seen.add(i.api_url);
    return true;
  });
}

async function probeVersion(instance) {
  for (const p of VERSION_PATHS) {
    const url = `${instance.api_url.replace(/\/+$/,'')}${p}`;
    try {
      const res = await fetchJsonMaybe(url);
      if (!res) continue;
      if (res.ok && res.json && (res.json.version || res.json.build_version || res.json.commit || res.json.tag)) {
        // prefer semver-like fields
        const v = res.json.version || res.json.build_version || res.json.tag || res.json.commit;
        // normalize v if starts with 'v'
        return { url, ok: true, status: res.status, version_raw: String(v) };
      }
      // Some instances return JSON with "version": {"version": "vX.Y.Z"}
      if (res.ok && res.json && typeof res.json === 'object') {
        const candidates = [];
        function scan(o) {
          if (!o || typeof o !== 'object') return;
          for (const k of Object.keys(o)) {
            const val = o[k];
            if (typeof val === 'string' && /\\d+\\.\\d+/.test(val)) candidates.push(val);
            if (typeof val === 'object') scan(val);
          }
        }
        scan(res.json);
        if (candidates.length) return { url, ok: true, status: res.status, version_raw: candidates[0] };
      }
      // If plain text
      if (res.ok && res.text && /\\d+\\.\\d+/.test(res.text)) {
        const m = res.text.match(/\\d+\\.\\d+(?:\\.\\d+)?/);
        if (m) return { url, ok: true, status: res.status, version_raw: m[0] };
      }
    } catch (e) { /*try next*/ }
  }
  return { ok: false };
}

async function tryFetchPaths(base, paths, q) {
  for (const p of paths) {
    const url = `${base.replace(/\/+$/,'')}${p}${encodeURIComponent(q)}`;
    try {
      const start = Date.now();
      const r = await fetch(url, { redirect: 'follow' });
      const time = Date.now() - start;
      let text = '';
      try { text = await r.text(); } catch(e){}
      return { url, ok: r.ok, status: r.status, time_ms: time, body_sample: (text||'').slice(0,320) };
    } catch (e) {
      // ignore and try next path
    }
  }
  return null;
}

async function checkInstance(instance) {
  const runs = 5;
  const runResults = [];
  for (let i=0;i<runs;i++) {
    const term = SEARCH_TERMS[(Date.now()+i) % SEARCH_TERMS.length];
    await sleep(2000 + Math.floor(Math.random()*5000));
    const suggestions = await tryFetchPaths(instance.api_url, SUGGEST_PATHS, term);
    await sleep(10000 + Math.floor(Math.random()*20000));
    const search = await tryFetchPaths(instance.api_url, SEARCH_PATHS, term);
    runResults.push({ attempt: i+1, term, suggestions, search, checked_at: new Date().toISOString() });
  }
  // metrics
  const suggestionSuccess = runResults.filter(r => r.suggestions && r.suggestions.ok).length;
  const searchSuccess = runResults.filter(r => r.search && r.search.ok).length;
  const total = runResults.length;
  const combinedSuccesses = suggestionSuccess + searchSuccess;
  const combinedPossible = total * 2;
  const avgSuggestionMs = runResults.filter(r=>r.suggestions && r.suggestions.time_ms).reduce((a,b)=>a + (b.suggestions.time_ms||0),0) / Math.max(1, suggestionSuccess);
  const avgSearchMs = runResults.filter(r=>r.search && r.search.time_ms).reduce((a,b)=>a + (b.search.time_ms||0),0) / Math.max(1, searchSuccess);

  return {
    name: instance.name,
    api_url: instance.api_url,
    cdn: instance.cdn || null,
    raw: instance.raw,
    runs: runResults,
    metrics: {
      suggestion_success_count: suggestionSuccess,
      search_success_count: searchSuccess,
      suggestion_success_rate: suggestionSuccess / total,
      search_success_rate: searchSuccess / total,
      combined_success_rate: combinedSuccesses / combinedPossible,
      avg_suggestion_ms: Number.isFinite(avgSuggestionMs) ? Math.round(avgSuggestionMs) : null,
      avg_search_ms: Number.isFinite(avgSearchMs) ? Math.round(avgSearchMs) : null
    },
    checked_at: new Date().toISOString()
  };
}

function sortInstances(items) {
  return items.sort((a,b) => {
    // latest version first
    const aLatest = a.isLatest ? 1 : 0;
    const bLatest = b.isLatest ? 1 : 0;
    if (bLatest - aLatest) return bLatest - aLatest;
    // CDN presence next
    const aCdn = a.cdn ? 1 : 0;
    const bCdn = b.cdn ? 1 : 0;
    if (bCdn - aCdn) return bCdn - aCdn;
    // combined_success_rate desc
    const aRate = a.metrics?.combined_success_rate ?? 0;
    const bRate = b.metrics?.combined_success_rate ?? 0;
    if (bRate - aRate) return bRate - aRate;
    // avg_search_ms asc
    const aTime = a.metrics?.avg_search_ms ?? 1e9;
    const bTime = b.metrics?.avg_search_ms ?? 1e9;
    if (aTime - bTime) return aTime - bTime;
    return (a.api_url || '').localeCompare(b.api_url || '');
  });
}

(async function main(){
  try {
    const md = await fetchText(RAW_WIKI_URL);
    const parsed = parseMarkdownToApis(md);
    if (!parsed.length) {
      await fs.mkdir('public', { recursive: true });
      await fs.writeFile(OUTPUT, JSON.stringify({ generated_at: new Date().toISOString(), source: RAW_WIKI_URL, instances: [] }, null, 2));
      console.log('No instances parsed — wrote empty JSON');
      return;
    }

    // Step 1: probe version for every instance (parallel but throttled)
    console.log('Probing versions for', parsed.length, 'instances');
    const versionPromises = parsed.map(async inst => {
      try {
        const vres = await probeVersion(inst);
        if (vres.ok && vres.version_raw) {
          // clean version string
          let v = String(vres.version_raw).trim();
          // try to extract semver (x.y.z)
          const m = v.match(/(\\d+\\.\\d+\\.\\d+|\\d+\\.\\d+)/);
          if (m) v = m[0];
          inst.version = v;
          inst.version_probe = vres;
        } else {
          inst.version = null;
          inst.version_probe = vres;
        }
      } catch (e) {
        inst.version = null;
        inst.version_probe = { ok: false, err: String(e) };
      }
      return inst;
    });

    const withVersions = await Promise.all(versionPromises);

    // Determine latest semver among reported instances
    const candidates = withVersions.map(i => i.version).filter(Boolean);
    let latest = null;
    if (candidates.length) {
      // filter to semver-valid
      const vlist = candidates.map(v => semver.coerce(v)).filter(Boolean).map(v=>v.version);
      if (vlist.length) latest = vlist.sort(semver.rcompare)[0];
    }

    if (latest) {
      console.log('Detected latest backend version:', latest);
      withVersions.forEach(i => {
        if (i.version) {
          const coerced = semver.coerce(i.version);
          i.isLatest = coerced ? semver.eq(coerced.version, latest) : false;
        } else i.isLatest = false;
      });
    } else {
      console.log('No version information detected; marking none as latest');
      withVersions.forEach(i => i.isLatest = false);
    }

    // Step 2: For each instance perform multi-run suggestion/search probes
    const finalResults = [];
    for (const inst of withVersions) {
      try {
        console.log('Checking', inst.api_url);
        const checked = await checkInstance(inst);
        checked.version = inst.version;
        checked.isLatest = inst.isLatest;
        finalResults.push(checked);
      } catch (e) {
        finalResults.push({ api_url: inst.api_url, error: String(e), checked_at: new Date().toISOString(), version: inst.version, isLatest: inst.isLatest });
      }
    }

    // Step 3: sort and write
    const sorted = sortInstances(finalResults);
    const out = { generated_at: new Date().toISOString(), source: RAW_WIKI_URL, version_priority: latest || null, instances: sorted };
    await fs.mkdir('public', { recursive: true });
    await fs.writeFile(OUTPUT, JSON.stringify(out, null, 2));
    console.log('Wrote', OUTPUT);
  } catch (err) {
    console.error('Fatal error', err);
    process.exit(2);
  }
})();