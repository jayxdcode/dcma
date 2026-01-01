// /api/embed.js
// Plain Node serverless handler. Drop into /api/embed.js
// Usage:
//  GET /api/embed/VIDEOID?start=10&endless=true&autoplay=1
//  or GET /api/embed?v=VIDEOID&...
//
// Notes:
//  - autoplay param (truthy) will append 'RD' to the embedded video id (per your spec).
//  - endless=true enables loop and sets playlist to the original video id.
//  - Allowed forwarded player params are whitelisted below.

const ALLOWED_PARAMS = [
  'autoplay','controls','rel','start','end','playsinline','mute',
  'modestbranding','iv_load_policy','loop','playlist','enablejsapi'
];

function detectProtocol(req) {
  let protocol = 'http';
  const xf = req.headers['x-forwarded-proto'];
  if (xf) protocol = String(xf).split(',')[0];
  else if (req.socket && req.socket.encrypted) protocol = 'https';
  return protocol;
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]);
}
function escapeJs(s = '') {
  return String(s).replace(/['\\]/g, (m) => m === "'" ? "\\'" : "\\\\");
}

module.exports = async function (req, res) {
  try {
    // Determine video id from path /api/embed/{id} or query v=...
    // req.url includes path + query. Use protocol+host to build URL object.
    const host = req.headers.host || 'localhost';
    const protocol = detectProtocol(req);
    const fullUrl = new URL(req.url || '', `${protocol}://${host}`);
    const pathname = fullUrl.pathname || '';

    // Attempt to parse video id from path segments after '/api/embed/'
    let videoIdFromPath = '';
    const parts = pathname.split('/').filter(Boolean);
    // find 'api' then 'embed' then next segment (common layouts)
    const embedIndex = parts.indexOf('embed');
    if (embedIndex !== -1 && parts.length > embedIndex + 1) {
      videoIdFromPath = decodeURIComponent(parts[embedIndex + 1] || '');
    }

    // query
    const qs = fullUrl.searchParams;
    const qv = (k) => qs.has(k) ? qs.get(k) : undefined;

    const videoId = videoIdFromPath || qv('v') || qv('videoId') || qv('id') || '';

    // decide API src (proxy vs youtube)
    const isDiscordProxy = (req.headers.host || '').includes('discordsays.com');
    const apiSrc = (isDiscordProxy || qv('test') === '1') ? '/yt/iframe_api' : 'https://www.youtube.com/iframe_api';

    // build src params with whitelist
    const srcParams = new URLSearchParams();
    for (const k of ALLOWED_PARAMS) {
      if (qs.has(k)) srcParams.set(k, qs.get(k));
    }

    // default safe params
    if (!srcParams.has('playsinline')) srcParams.set('playsinline', '1');
    if (!srcParams.has('rel')) srcParams.set('rel', '0');
    if (!srcParams.has('controls')) srcParams.set('controls', '0');

    // endless handling
    const endless = (qv('endless') === '1' || qv('endless') === 'true');
    if (endless) {
      srcParams.set('loop', '1');
      if (!srcParams.has('playlist') && videoId) srcParams.set('playlist', videoId);
    }

    // autoplay behavior: append RD to embed id when autoplay param is truthy
    const autoplayFlag = (() => {
      if (qs.has('autoplay')) {
        const v = qs.get('autoplay');
        return !(v === '0' || v === 'false');
      }
      return false;
    })();

    let embedId = videoId ? String(videoId) : '';
    if (autoplayFlag && embedId) embedId = embedId + 'RD';

    // iframe src
    const iframeSrc = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(embedId)}?${srcParams.toString()}`;

    // prepare playerVars to pass into YT.Player init (some numeric conversion)
    const numericKeys = ['start','end','autoplay','controls','rel','playsinline','loop','mute','iv_load_policy'];
    const playerVars = {};
    for (const k of numericKeys) {
      if (srcParams.has(k)) {
        const vv = srcParams.get(k);
        const n = parseInt(vv, 10);
        playerVars[k] = Number.isFinite(n) ? n : vv;
      }
    }
    if (playerVars.playsinline === undefined) playerVars.playsinline = 1;
    if (playerVars.rel === undefined) playerVars.rel = 0;
    if (playerVars.controls === undefined) playerVars.controls = 0;

    // Build HTML
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Embed - ${escapeHtml(videoId)}</title>
    <style>
      html,body{margin:0;padding:0;height:100%;background:#000}
      #player-wrap{position:relative;width:100%;height:100%;overflow:hidden}
      #player-iframe{width:100%;height:100%;border:0}
      #stat-msg{
        display:flex;align-items:center;justify-content:center;
        position:fixed;top:0;left:0;width:100%;height:100vh;
        font-size:1.8rem;z-index:9999;pointer-events:none;color:#fff;
        background:rgba(0,0,0,0.35);-webkit-backdrop-filter:blur(4px);
        backdrop-filter:blur(4px);
      }
    </style>
  </head>
  <body>
    <div id="player-wrap">
      <div id="stat-msg">Standby mode. Waiting for Iframe API initialization...</div>

      <iframe
        id="player-iframe"
        src="${iframeSrc}"
        frameborder="0"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowfullscreen
        title="YouTube video player"
      ></iframe>
    </div>

    <script>
      (function loadApi(){
        if (window.YT && window.YT.Player) { onYouTubeIframeAPIReady(); return; }
        var t = document.createElement('script');
        t.src = '${apiSrc}';
        t.async = true;
        var f = document.getElementsByTagName('script')[0];
        f.parentNode.insertBefore(t, f);
      })();

      var player = null;
      var iframeEl = document.getElementById('player-iframe');

      function onYouTubeIframeAPIReady() {
        try {
          var options = {
            height: '100%',
            width: '100%',
            host: 'https://www.youtube-nocookie.com',
            videoId: '${escapeJs(embedId)}',
            playerVars: Object.assign({}, ${JSON.stringify(playerVars)}, { origin: window.location.origin }),
            events: {
              onReady: function(event) {
                var stat = document.querySelector('#stat-msg');
                if (stat) {
                  stat.textContent = 'Iframe API initialized. This message will disappear in 3 sec.';
                  setTimeout(function(){ if (stat && stat.parentNode) stat.parentNode.removeChild(stat); }, 3000);
                }
                var msg = JSON.stringify({ type: 'READY' });
                window.parent.postMessage(msg, "*");
                try{ window.top.postMessage(msg, "*"); } catch(e){}
              },
              onStateChange: function(e) {
                try {
                  var duration = (player && player.getDuration) ? player.getDuration() : null;
                  var currentTime = (player && player.getCurrentTime) ? player.getCurrentTime() : null;
                  var m = JSON.stringify({ type: 'STATE_CHANGE', state: e.data, duration: duration, currentTime: currentTime });
                  window.parent.postMessage(m, "*");
                  try{ window.top.postMessage(m, "*"); } catch(err){}
                } catch(err){}
              }
            }
          };

          if (iframeEl && iframeEl.id) {
            player = new YT.Player(iframeEl.id, options);
          } else {
            var d = document.createElement('div');
            d.id = 'player';
            d.style.width = '100%'; d.style.height = '100%';
            document.getElementById('player-wrap').appendChild(d);
            player = new YT.Player(d.id, options);
          }

          window.addEventListener('message', function(event){
            if (!player) return;
            var raw = event.data;
            try {
              var data = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            } catch(e){ return; }
            if (!data || !data.command) return;
            try {
              switch (data.command) {
                case 'PLAY': player.playVideo(); break;
                case 'PAUSE': player.pauseVideo(); break;
                case 'SEEK': player.seekTo(data.value || 0, true); break;
                case 'SET_VOLUME': player.setVolume(Math.round((data.value || 1) * 100)); break;
                case 'LOAD':
                  player.loadVideoById({ videoId: data.value, startSeconds: data.start || 0 });
                  player.playVideo();
                  break;
                default: break;
              }
            } catch(e){}
          });

          setInterval(function(){
            try {
              if (player && player.getCurrentTime) {
                var cur = player.getCurrentTime();
                var dur = (player.getDuration && player.getDuration()) || null;
                var m = JSON.stringify({ type: 'TIME_UPDATE', currentTime: cur, duration: dur });
                window.parent.postMessage(m, "*");
                try{ window.top.postMessage(m, "*"); } catch(e){}
              }
            } catch(e){}
          }, 500);

        } catch (err) {
          var stat = document.querySelector('#stat-msg');
          if (stat) {
            stat.textContent = 'Failed to initialize Iframe API.';
            setTimeout(function(){ if (stat && stat.parentNode) stat.parentNode.removeChild(stat); }, 3000);
          }
        }
      }
    </script>
  </body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.statusCode = 200;
    res.end(html);
  } catch (err) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
  }
};