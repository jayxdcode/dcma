// embed-patcher-v2.js
// patcher version 2.0.0 - diagnostics + stylesheet inlining
(function() {
	'use strict';
	
	// Config (same defaults)
	var PROXY_BASE = (location.origin || '') + '/yt';
	var FONTS_PROXY_PREFIX = (location.origin || '') + '/fonts';
	PROXY_BASE = PROXY_BASE.replace(/\/+$/, '');
	FONTS_PROXY_PREFIX = FONTS_PROXY_PREFIX.replace(/\/+$/, '');
	
	var fontsHostRegexGlobal = /(?:https?:)?\/\/fonts\.gstatic\.com(\/+)/gi;
	var fontsHostRegexSingle = /^(?:https?:)?\/\/fonts\.gstatic\.com(\/+)/i;
	var absoluteSchemeOrProtocolRel = /^[a-zA-Z][a-zA-Z0-9+.\-]*:|^\/\//;
	
	// load eruda :)
	(function() {
		if (typeof window.eruda !== 'undefined') return;
		var script = document.createElement('script');
		script.src = window.location.origin + "/src/eruda/eruda.js";
		document.body.appendChild(script);
		script.onload = function() { eruda.init() };
	})();
	
	function log() { try { if (window.top !== window) console.log.apply(console, arguments);
			else console.log.apply(console, arguments); } catch (e) {} }
	
	// --- helpers ---
	function isAbsoluteOrSafe(u) {
		if (!u) return true;
		u = String(u).trim();
		return u === '' || u[0] === '#' || absoluteSchemeOrProtocolRel.test(u) || /^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(u);
	}
	
	function rewriteFontsPath(path) {
		if (!path) return path;
		var m = path.match(/(?:https?:)?\/\/fonts\.gstatic\.com(\/+)(.*)/i);
		if (m) {
			var p = m[2] || '';
			p = p.replace(/^\/+/, '');
			return FONTS_PROXY_PREFIX + '/' + p;
		}
		return path;
	}
	
	function makeAbsolute(url) {
		if (!url) return url;
		url = String(url).trim();
		if (fontsHostRegexSingle.test(url)) return rewriteFontsPath(url);
		if (isAbsoluteOrSafe(url)) return url;
		if (url.charAt(0) === '/') return PROXY_BASE + url;
		return PROXY_BASE + '/' + url.replace(/^\.\/+/, '');
	}
	
	function fixSrcset(val) {
		if (!val) return val;
		return val.split(',').map(function(part) {
			part = part.trim();
			if (!part) return part;
			var pieces = part.split(/\s+/);
			var u = pieces.shift();
			var desc = pieces.join(' ');
			var newU = makeAbsolute(u);
			return desc ? (newU + ' ' + desc) : newU;
		}).join(', ');
	}
	
	function fixInlineStyleUrls(cssText) {
		if (!cssText) return cssText;
		// Escaped the quotes in the regex to ensure no template literal interference
		var out = cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function(_, q, u) {
			if (!u) return 'url()';
			if (fontsHostRegexSingle.test(u)) return 'url("' + rewriteFontsPath(u) + '")';
			if (isAbsoluteOrSafe(u)) return 'url(' + q + u + q + ')';
			return 'url("' + makeAbsolute(u) + '")';
		});
		out = out.replace(fontsHostRegexGlobal, function() { return FONTS_PROXY_PREFIX + '/'; });
		return out;
	}
	
	var stats = {
		rewrittenAttrs: 0,
		rewrittenSrcsets: 0,
		rewrittenStyleTags: 0,
		inlinedStylesheets: 0,
		lastSamples: []
	};
	
	function samplePush(s) {
		if (stats.lastSamples.length < 10) stats.lastSamples.push(s);
	}
	
	function fixElement(el) {
		if (!el || el.nodeType !== 1) return;
		try {
			var attrs = ['src', 'href', 'poster', 'data-src', 'data-href'];
			attrs.forEach(function(a) {
				try {
					if (el.hasAttribute && el.hasAttribute(a)) {
						var v = el.getAttribute(a);
						if (!v) return;
						var nv = makeAbsolute(v);
						if (nv !== v) {
							el.setAttribute(a, nv);
							stats.rewrittenAttrs++;
							samplePush('attr ' + a + ': ' + v + ' -> ' + nv);
						}
					}
				} catch (e) {}
			});
			
			if (el.hasAttribute && el.hasAttribute('srcset')) {
				try {
					var ss = el.getAttribute('srcset'),
						newss = fixSrcset(ss);
					if (newss !== ss) {
						el.setAttribute('srcset', newss);
						stats.rewrittenSrcsets++;
						samplePush('srcset: ' + ss + ' -> ' + newss);
					}
				} catch (e) {}
			}
			
			if (el.hasAttribute && el.hasAttribute('style')) {
				try {
					var st = el.getAttribute('style'),
						nst = fixInlineStyleUrls(st);
					if (nst !== st) {
						el.setAttribute('style', nst);
						samplePush('inline style changed');
					}
				} catch (e) {}
			}
			
			try {
				if (el.style && el.style.cssText) {
					var css = el.style.cssText,
						ncss = fixInlineStyleUrls(css);
					if (ncss !== css) {
						el.style.cssText = ncss;
						samplePush('element.style cssText changed');
					}
				}
			} catch (e) {}
			
			if (el.tagName && el.tagName.toLowerCase() === 'link') {
				try {
					var rel = el.getAttribute && el.getAttribute('rel') || '';
					if (rel.toLowerCase().indexOf('stylesheet') !== -1 && el.hasAttribute('href')) {
						var lh = el.getAttribute('href');
						if (lh && fontsHostRegexSingle.test(lh)) {
							var newHref = rewriteFontsPath(lh);
							el.setAttribute('href', newHref);
							stats.rewrittenAttrs++;
							samplePush('link[href] fonts -> ' + newHref);
						} else if (lh && !isAbsoluteOrSafe(lh) && lh.charAt(0) !== '/') {
							var mh = makeAbsolute(lh);
							el.setAttribute('href', mh);
							stats.rewrittenAttrs++;
							samplePush('link[href] relative -> ' + mh);
						}
					}
				} catch (e) {}
			}
		} catch (e) {}
	}
	
	function fixStyleTag(styleEl) {
		if (!styleEl) return;
		try {
			var cssText = styleEl.textContent || '';
			var newCssText = fixInlineStyleUrls(cssText);
			if (newCssText !== cssText) {
				styleEl.textContent = newCssText;
				stats.rewrittenStyleTags++;
				samplePush('style tag rewritten');
			}
		} catch (e) {}
	}
	
	function inlineStylesheet(linkEl) {
		return new Promise(function(resolve) {
			if (!linkEl || !linkEl.href) return resolve(false);
			var href = linkEl.getAttribute('href');
			try {
				var u = new URL(href, location.href);
				if (u.origin !== location.origin && !href.startsWith('/')) return resolve(false);
			} catch (e) {
				return resolve(false);
			}
			
			fetch(href, { credentials: 'same-origin' }).then(function(res) {
				if (!res.ok) return resolve(false);
				return res.text();
			}).then(function(css) {
				if (!css) return resolve(false);
				try {
					var out = fixInlineStyleUrls(css);
					var s = document.createElement('style');
					s.type = 'text/css';
					s.textContent = out;
					linkEl.parentNode && linkEl.parentNode.replaceChild(s, linkEl);
					stats.inlinedStylesheets++;
					samplePush('inlined stylesheet: ' + href);
					return resolve(true);
				} catch (e) {
					return resolve(false);
				}
			}).catch(function() { resolve(false); });
		});
	}
	
	function fixAll(root) {
		root = root || document;
		try {
			try {
				var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
				if (head) {
					var base = head.querySelector && head.querySelector('base');
					var desiredBase = PROXY_BASE + '/';
					if (!base) {
						base = document.createElement('base');
						head.insertBefore(base, head.firstChild || null);
					}
					if (base.getAttribute('href') !== desiredBase) {
						base.setAttribute('href', desiredBase);
						samplePush('base href set to ' + desiredBase);
					}
				}
			} catch (e) {}
			
			try {
				var styles = Array.prototype.slice.call(root.querySelectorAll('style'));
				styles.forEach(fixStyleTag);
			} catch (e) {}
			
			var selector = '[src],[href],[srcset],[poster],[data-src],[data-href],[style], link[rel~="stylesheet"]';
			var nodes = Array.prototype.slice.call(root.querySelectorAll(selector));
			var linkCandidates = [];
			nodes.forEach(function(n) {
				fixElement(n);
				try { if (n.tagName && n.tagName.toLowerCase() === 'link' && n.getAttribute && n.getAttribute('rel') && n.getAttribute('rel').toLowerCase().indexOf('stylesheet') !== -1) linkCandidates.push(n); } catch (e) {}
			});
			
			var inlines = linkCandidates.map(function(l) { return inlineStylesheet(l); });
			return Promise.all(inlines).then(function(results) {
				return {
					stats: stats,
					samples: stats.lastSamples.slice(),
					inlinedCount: stats.inlinedStylesheets,
					rewroteAttrs: stats.rewrittenAttrs,
					rewroteStyleTags: stats.rewrittenStyleTags
				};
			});
		} catch (e) {
			return Promise.resolve({ error: String(e), stats: stats, samples: stats.lastSamples.slice() });
		}
	}
	
	var runCount = 0;
	
	function tryRunOnce() {
		runCount++;
		return fixAll(document).then(function(report) {
			log('[embed-patcher-v2] run #' + runCount + ' report:', report);
			return report;
		}).catch(function(err) {
			log('[embed-patcher-v2] run #' + runCount + ' err:', err);
			return { error: String(err) };
		});
	}
	
	tryRunOnce();
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', tryRunOnce);
	} else {
		setTimeout(tryRunOnce, 60);
	}
	window.addEventListener('load', function() { setTimeout(tryRunOnce, 60); });
	
	[500, 1500, 3000].forEach(function(ms) { setTimeout(tryRunOnce, ms); });
	
	try {
		window.__embedFixFixAll = function() {
			return tryRunOnce();
		};
	} catch (e) {}
	
	try {
		var isDiscordProxy = !!(location.hostname && location.hostname.indexOf('discordsays.com') !== -1);
		log('[embed-patcher-v2] injected. location.hostname=', location.hostname, 'isDiscordProxy=', isDiscordProxy);
		log('[embed-patcher-v2] PROXY_BASE=', PROXY_BASE, 'FONTS_PROXY_PREFIX=', FONTS_PROXY_PREFIX);
	} catch (e) {}
})();