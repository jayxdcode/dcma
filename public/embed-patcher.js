// embed-patcher.js
// patcher version 1.0.0

function init() {
  'use strict';
  
  // Only run on the discord proxy origin
  var isDiscordProxy = !!(location.hostname && location.hostname.indexOf('discordsays.com') !== -1);
  if (!isDiscordProxy) return;
  
  // Config
  var PROXY_BASE = (location.origin || '') + '/yt'; // e.g. https://discordsays.com/yt
  var FONTS_PROXY_PREFIX = '/fonts'; // maps to https://fonts.gstatic.com on your proxy
  // Normalise
  PROXY_BASE = PROXY_BASE.replace(/\/+$/, '');
  FONTS_PROXY_PREFIX = FONTS_PROXY_PREFIX.replace(/\/+$/, '');
  
  // Regexes
  var fontsHostRegexGlobal = /(?:https?:)?\/\/fonts\.gstatic\.com(\/+)/gi;
  var fontsHostRegexSingle = /^(?:https?:)?\/\/fonts\.gstatic\.com(\/+)/i;
  var absoluteSchemeOrProtocolRel = /^[a-zA-Z][a-zA-Z0-9+.\-]*:|^\/\//;
  
  // Helpers
  function isAbsoluteOrSafe(u) {
    if (!u) return true;
    u = String(u).trim();
    // data:, mailto:, javascript:, fragments (#...), protocol-relative (//...) or absolute (scheme:) are safe/left alone
    return u === '' || u[0] === '#' || absoluteSchemeOrProtocolRel.test(u) || /^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(u);
  }
  
  function rewriteFontsPath(path) {
    if (!path) return path;
    // remove leading protocol/domain if present and return /fonts/<path>
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
    
    // Fonts host -> /fonts/...
    if (fontsHostRegexSingle.test(url)) {
      return rewriteFontsPath(url);
    }
    
    // Safe/absolute/protocol-relative -> leave as-is
    if (isAbsoluteOrSafe(url)) return url;
    
    // Root-relative (starts with /) -> PROXY_BASE + url
    if (url.charAt(0) === '/') {
      // guard against double slash
      return PROXY_BASE + url;
    }
    
    // Relative path (no leading slash) -> PROXY_BASE + '/' + url
    return PROXY_BASE + '/' + url.replace(/^\.\/+/, '');
  }
  
  function fixSrcset(val) {
    if (!val) return val;
    // srcset: "url1 1x, url2 2x"
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
    if (!cssText || cssText.indexOf('url(') === -1 && cssText.indexOf('fonts.gstatic.com') === -1) return cssText;
    // Replace url(...) occurrences and fonts.gstatic.com occurrences
    var out = cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function(_, q, u) {
      if (!u) return 'url()';
      // fonts.gstatic -> /fonts
      if (fontsHostRegexSingle.test(u)) {
        return 'url("' + rewriteFontsPath(u) + '")';
      }
      if (isAbsoluteOrSafe(u)) return 'url(' + q + u + q + ')';
      return 'url("' + makeAbsolute(u) + '")';
    });
    // Also replace bare fonts.gstatic.com occurrences (e.g. @import "//fonts.gstatic.com/...")
    out = out.replace(fontsHostRegexGlobal, function(_, slashes) {
      return FONTS_PROXY_PREFIX + '/';
    });
    return out;
  }
  
  function fixElement(el) {
    if (!el || el.nodeType !== 1) return;
    
    try {
      // common attributes
      var attrs = ['src', 'href', 'poster', 'data-src', 'data-href'];
      attrs.forEach(function(a) {
        if (el.hasAttribute && el.hasAttribute(a)) {
          var v = el.getAttribute(a);
          if (!v) return;
          var nv = makeAbsolute(v);
          if (nv !== v) try { el.setAttribute(a, nv); } catch (e) {}
        }
      });
      
      // srcset
      if (el.hasAttribute && el.hasAttribute('srcset')) {
        var ss = el.getAttribute('srcset');
        var newss = fixSrcset(ss);
        if (newss !== ss) try { el.setAttribute('srcset', newss); } catch (e) {}
      }
      
      // inline style attribute
      if (el.hasAttribute && el.hasAttribute('style')) {
        var st = el.getAttribute('style');
        var nst = fixInlineStyleUrls(st);
        if (nst !== st) try { el.setAttribute('style', nst); } catch (e) {}
      }
      
      // element.style.cssText (for js-set styles)
      try {
        if (el.style && el.style.cssText) {
          var css = el.style.cssText;
          var ncss = fixInlineStyleUrls(css);
          if (ncss !== css) el.style.cssText = ncss;
        }
      } catch (e) { /* ignore write failures */ }
      
      // link[rel=stylesheet] href rewrite for fonts.gstatic
      if (el.tagName && el.tagName.toLowerCase() === 'link') {
        var rel = el.getAttribute && el.getAttribute('rel') || '';
        if (rel.toLowerCase().indexOf('stylesheet') !== -1 && el.hasAttribute('href')) {
          var lh = el.getAttribute('href');
          if (lh && fontsHostRegexSingle.test(lh)) {
            var newHref = rewriteFontsPath(lh);
            try { el.setAttribute('href', newHref); } catch (e) {}
          } else {
            // If it's relative and not absolute, make absolute under proxy too
            if (lh && !isAbsoluteOrSafe(lh) && lh.charAt(0) !== '/') {
              try { el.setAttribute('href', makeAbsolute(lh)); } catch (e) {}
            }
          }
        }
      }
    } catch (e) {
      // swallow DOM-specific write errors
    }
  }
  
  function fixStyleTag(styleEl) {
    if (!styleEl) return;
    try {
      var cssText = styleEl.textContent || '';
      var newCssText = fixInlineStyleUrls(cssText);
      if (newCssText !== cssText) styleEl.textContent = newCssText;
    } catch (e) {}
  }
  
  function fixAll(root) {
    root = root || document;
    
    // insert/update <base href> so bare relative URLs resolve under proxy base
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
        }
      }
    } catch (e) { /* ignore */ }
    
    // Rewrite <style> contents first (likely contains @import or url(...))
    try {
      var styles = Array.prototype.slice.call(root.querySelectorAll('style'));
      styles.forEach(fixStyleTag);
    } catch (e) {}
    
    // Rewrite link[href], src/href/srcset, inline styles etc.
    try {
      var selector = '[src],[href],[srcset],[poster],[data-src],[data-href],[style], link[rel~="stylesheet"]';
      var nodes = Array.prototype.slice.call(root.querySelectorAll(selector));
      nodes.forEach(fixElement);
    } catch (e) {}
  }
  
  // initial run
  try { fixAll(document); } catch (e) { console && console.warn && console.warn('embed-fix init err', e); }
  
  // Mutation observer for dynamic changes
  var mo;
  try {
    mo = new MutationObserver(function(muts) {
      muts.forEach(function(m) {
        if (m.type === 'childList') {
          (m.addedNodes || []).forEach(function(node) {
            if (node.nodeType === 1) {
              if (node.tagName && node.tagName.toLowerCase() === 'style') fixStyleTag(node);
              fixElement(node);
              try { fixAll(node); } catch (e) {}
            }
          });
        } else if (m.type === 'attributes') {
          fixElement(m.target);
          if (m.target && m.target.tagName && m.target.tagName.toLowerCase() === 'style') fixStyleTag(m.target);
        }
      });
    });
    
    mo.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href', 'srcset', 'poster', 'style', 'data-src', 'data-href']
    });
  } catch (e) {
    // fallback periodic re-run
    setInterval(function() { try { fixAll(document); } catch (_) {} }, 1200);
  }
  
  // Expose manual hooks for parent/console
  try {
    window.__embedFixMakeAbsolute = makeAbsolute;
    window.__embedFixFixAll = function() { try { fixAll(document); } catch (e) {} };
    window.__embedFixRewriteFonts = function() { try { fixAll(document); } catch (e) {} };
  } catch (e) {}
  
};

document.addEventListener('DOMContentLoaded', (event) => {
    console.log('The DOM is fully loaded!');
    init();
});