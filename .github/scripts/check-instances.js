/**
 * check-instances.js
 * - Ports the behavior of TeamPiped/instances-api main.go into Node
 * - Verbose logging enabled
 * - Fail-fast logic: Retries once on 500+, then discards
 * - Runs 5 randomized suggestion + search runs per instance
 * - Writes public/piped-instances.json
 */
const fs = require('fs').promises;
const fetch = (...args) => import('node-fetch').then(m => m.default(...args));
const semver = require('semver');

const RAW_WIKI_URL = process.env.RAW_WIKI_URL || 'https://raw.githubusercontent.com/TeamPiped/documentation/refs/heads/main/content/docs/public-instances/index.md';
const OUTPUT = process.env.OUTPUT_PATH || 'public/piped-instances.json';

// Reduced timeouts for faster failure detection
const REQUEST_TIMEOUT_MS = 8000;

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

function log(label, msg) {
    const time = new Date().toISOString().split('T')[1].replace('Z', '');
    console.log(`[${time}] [${label}] ${msg}`);
}

function normalizeApiUrl(u) {
    if (!u) return null;
    u = u.trim();
    const m = u.match(/https?:\/\/[^\s)"]+/);
    if (!m) return null;
    try {
        const url = new URL(m[0]);
        // return origin + path (without trailing slash)
        return (url.origin + (url.pathname && url.pathname !== '/' ? url.pathname.replace(/\/+$/, '') : '')).replace(/\/+$/, '');
    } catch (e) {
        return null;
    }
}

// Wrapper for fetch with Timeout
async function fetchWithTimeout(url, opts = {}) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            ...opts,
            signal: controller.signal,
            headers: { 'User-Agent': 'github-actions/piped-inst-checker/1.1', ...opts.headers }
        });
        clearTimeout(id);
        return res;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function fetchText(url) {
    const r = await fetchWithTimeout(url);
    if (!r.ok) throw new Error(`fetch ${url} -> ${r.status}`);
    return await r.text();
}

async function fetchJsonMaybe(url) {
    try {
        const r = await fetchWithTimeout(url, { redirect: 'follow' });
        const text = await r.text();
        try {
            return { ok: r.ok, status: r.status, json: JSON.parse(text) };
        } catch (e) {
            return { ok: r.ok, status: r.status, text };
        }
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
        const name = parts[1] || api.replace(/^https?:\/\//, '');
        const cdn = parts.length >= 5 ? (parts[4] || null) : null;
        instances.push({ raw: line, api_url: api, name, cdn });
    }
    const seen = new Set();
    return instances.filter(i => {
        if (seen.has(i.api_url)) return false;
        seen.add(i.api_url);
        return true;
    });
}

async function probeVersion(instance) {
    for (const p of VERSION_PATHS) {
        const url = `${instance.api_url.replace(/\/+$/, '')}${p}`;
        try {
            const res = await fetchJsonMaybe(url);
            if (!res) continue;

            if (res.ok && res.json && (res.json.version || res.json.build_version || res.json.commit || res.json.tag)) {
                const v = res.json.version || res.json.build_version || res.json.tag || res.json.commit;
                return { url, ok: true, status: res.status, version_raw: String(v) };
            }

            if (res.ok && res.json && typeof res.json === 'object') {
                const candidates = [];
                function scan(o) {
                    if (!o || typeof o !== 'object') return;
                    for (const k of Object.keys(o)) {
                        const val = o[k];
                        if (typeof val === 'string' && /\d+\.\d+/.test(val)) candidates.push(val);
                        if (typeof val === 'object') scan(val);
                    }
                }
                scan(res.json);
                if (candidates.length) return { url, ok: true, status: res.status, version_raw: candidates[0] };
            }

            if (res.ok && res.text && /\d+\.\d+/.test(res.text)) {
                const m = res.text.match(/\d+\.\d+(?:\.\d+)?/);
                if (m) return { url, ok: true, status: res.status, version_raw: m[0] };
            }
        } catch (e) { /* try next */ }
    }
    return { ok: false };
}

async function tryFetchPaths(base, paths, q) {
    for (const p of paths) {
        const url = `${base.replace(/\/+$/, '')}${p}${encodeURIComponent(q)}`;
        try {
            const start = Date.now();
            const r = await fetchWithTimeout(url, { redirect: 'follow' });
            const time = Date.now() - start;
            let text = '';
            try { text = await r.text(); } catch (e) { }
            
            // Only consider it a success if status is 200-299
            if (r.ok) {
                 return { url, ok: r.ok, status: r.status, time_ms: time, body_sample: (text || '').slice(0, 320) };
            } else {
                // If 5xx, throw error to trigger next path attempt or failure count
                throw new Error(`Status ${r.status}`);
            }
           
        } catch (e) {
            // ignore and try next path
        }
    }
    return null;
}

/**
 * Performs a quick check to see if instance is alive.
 * If fail (502, timeout), wait 5s, try once more.
 * If still fail, return false.
 */
async function preflightCheck(instance) {
    const checkUrl = `${instance.api_url}/api/v1/streams/dQw4w9WgXcQ`; // Simple stream check
    
    const check = async () => {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 5000);
            const r = await fetch(checkUrl, { method: 'HEAD', signal: controller.signal });
            clearTimeout(id);
            if (r.status >= 500) throw new Error(`Status ${r.status}`);
            return true;
        } catch (e) {
            return false;
        }
    };

    // First attempt
    if (await check()) return true;
    
    log(instance.name, 'Initial check failed (5xx/Timeout). Retrying in 5s...');
    await sleep(5000);

    // Second attempt
    if (await check()) {
        log(instance.name, 'Recovered on second attempt.');
        return true;
    }

    log(instance.name, 'Failed second attempt. Marking dead.');
    return false;
}


async function checkInstance(instance) {
    // 1. Pre-flight "Is it dead?" Check
    const isAlive = await preflightCheck(instance);
    if (!isAlive) {
        return null; // Signals the main loop to drop this instance
    }

    // 2. Run randomized checks
    const runs = 5;
    const runResults = [];
    
    log(instance.name, `Starting ${runs} check runs...`);

    for (let i = 0; i < runs; i++) {
        const term = SEARCH_TERMS[(Date.now() + i) % SEARCH_TERMS.length];
        
        // Reduced wait times: 500ms - 2500ms
        await sleep(500 + Math.floor(Math.random() * 2000));
        
        const suggestions = await tryFetchPaths(instance.api_url, SUGGEST_PATHS, term);
        
        // Reduced wait times: 1500ms - 3500ms
        await sleep(1500 + Math.floor(Math.random() * 2000));
        
        const search = await tryFetchPaths(instance.api_url, SEARCH_PATHS, term);
        
        // Log progress dot
        process.stdout.write('.');
        
        runResults.push({ attempt: i + 1, term, suggestions, search, checked_at: new Date().toISOString() });
    }
    process.stdout.write('\n');

    // Metrics calculation
    const suggestionSuccess = runResults.filter(r => r.suggestions && r.suggestions.ok).length;
    const searchSuccess = runResults.filter(r => r.search && r.search.ok).length;
    const total = runResults.length;
    const combinedSuccesses = suggestionSuccess + searchSuccess;
    const combinedPossible = total * 2;
    const avgSuggestionMs = runResults.filter(r => r.suggestions && r.suggestions.time_ms).reduce((a, b) => a + (b.suggestions.time_ms || 0), 0) / Math.max(1, suggestionSuccess);
    const avgSearchMs = runResults.filter(r => r.search && r.search.time_ms).reduce((a, b) => a + (b.search.time_ms || 0), 0) / Math.max(1, searchSuccess);

    const result = {
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
    
    log(instance.name, `Finished. Success Rate: ${(result.metrics.combined_success_rate * 100).toFixed(0)}%`);
    return result;
}

function sortInstances(items) {
    return items.sort((a, b) => {
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

(async function main() {
    try {
        log('INIT', `Fetching wiki list from ${RAW_WIKI_URL}`);
        const md = await fetchText(RAW_WIKI_URL);
        const parsed = parseMarkdownToApis(md);
        
        if (!parsed.length) {
            log('WARN', 'No instances parsed — wrote empty JSON');
            await fs.mkdir('public', { recursive: true });
            await fs.writeFile(OUTPUT, JSON.stringify({ generated_at: new Date().toISOString(), source: RAW_WIKI_URL, instances: [] }, null, 2));
            return;
        }

        log('INFO', `Found ${parsed.length} instances. Probing versions...`);

        // Step 1: probe version for every instance
        const versionPromises = parsed.map(async inst => {
            try {
                const vres = await probeVersion(inst);
                if (vres.ok && vres.version_raw) {
                    let v = String(vres.version_raw).trim();
                    const m = v.match(/(\d+\.\d+\.\d+|\d+\.\d+)/);
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

        // Determine latest semver
        const candidates = withVersions.map(i => i.version).filter(Boolean);
        let latest = null;
        if (candidates.length) {
            const vlist = candidates.map(v => semver.coerce(v)).filter(Boolean).map(v => v.version);
            if (vlist.length) latest = vlist.sort(semver.rcompare)[0];
        }

        if (latest) {
            log('INFO', `Detected latest backend version: ${latest}`);
            withVersions.forEach(i => {
                if (i.version) {
                    const coerced = semver.coerce(i.version);
                    i.isLatest = coerced ? semver.eq(coerced.version, latest) : false;
                } else i.isLatest = false;
            });
        } else {
            log('WARN', 'No version information detected; marking none as latest');
            withVersions.forEach(i => i.isLatest = false);
        }

        // Step 2: Main Health Check Loop
        const finalResults = [];
        for (const inst of withVersions) {
            try {
                const checked = await checkInstance(inst);
                
                // If checkInstance returns null, it failed the preflight check
                if (checked) {
                    checked.version = inst.version;
                    checked.isLatest = inst.isLatest;
                    finalResults.push(checked);
                } else {
                    log('SKIP', `Excluding ${inst.api_url} from JSON due to preflight failure.`);
                }
            } catch (e) {
                log('ERR', `Unexpected error checking ${inst.api_url}: ${e.message}`);
            }
        }

        // Step 3: sort and write
        const sorted = sortInstances(finalResults);
        const out = { generated_at: new Date().toISOString(), source: RAW_WIKI_URL, version_priority: latest || null, instances: sorted };
        
        await fs.mkdir('public', { recursive: true });
        await fs.writeFile(OUTPUT, JSON.stringify(out, null, 2));
        log('DONE', `Wrote ${sorted.length} active instances to ${OUTPUT}`);
        
    } catch (err) {
        console.error('Fatal error', err);
        process.exit(2);
    }
})();
