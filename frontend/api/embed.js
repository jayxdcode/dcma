// api/embed.js
export default function handler(req, res) {
  const { v, origin, start, test } = req.query;
  const isDiscordProxy = req.get('host').includes('discordsays.com');
  const apiSrc = (isDiscordProxy || test === '1') ? '/yt/iframe_api' : 'https://www.youtube.com/iframe_api';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body, html { 
            margin: 0; 
            padding: 0; 
            width: 100%; 
            height: 100%; 
            overflow: hidden; 
            background-color: #000; 
          }
          #player { 
            width: 100%; 
            height: 100%; 
          }
        </style>
      </head>
      <body>
        <div id="stat-msg" style="display: flex; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100%; height: 100vh; font-size: 3em; z-index: 9999; pointer-events: none;">Standby mode. Waiting for Iframe API initialization...</div>

        <div id="player"></div>
        <script>
          var tag = document.createElement('script');
          tag.src = '${apiSrc}';
          var firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

          var player;

          function onYouTubeIframeAPIReady() {
            player = new YT.Player('player', {
              height: '100%', 
              width: '100%',
              videoId: "${v || ''}", 
              host: 'https://www.youtube-nocookie.com',
              playerVars: { 
                playsinline: 1, 
                rel: 0, 
                controls: 0, 
                disablekb: 1,
                start: ${parseInt(start) || 0},
                autoplay: 0,
                enablejsapi: 1,
                origin: window.location.origin // The discord proxy domain
              },
              events: {
                onReady: () => {
                  const stat = document.querySelector('#stat-msg'); e.textContent = 'Iframe API inialized. This message will disappear in 3 sec.';
                  setTimeout(() => {document.body.removeChild(stat)}, 3000);
                  // Send to BOTH parent and top just in case
                  const msg = JSON.stringify({ type: 'READY' });
                  window.parent.postMessage(msg, "*");
                  window.top.postMessage(msg, "*");
                },
                onStateChange: (e) => {
                  const msg = JSON.stringify({
                    type: 'STATE_CHANGE',
                    state: e.data,
                    duration: player.getDuration(),
                    currentTime: player.getCurrentTime()
                  });
                  window.parent.postMessage(msg, "*");
                  window.top.postMessage(msg, "*");
                }
              }
            });
          }

          window.addEventListener('message', (event) => {
            if (!player) return;
            try {
              const data = JSON.parse(event.data);
              switch(data.command) {
                case 'PLAY': player.playVideo(); break;
                case 'PAUSE': player.pauseVideo(); break;
                case 'SEEK': player.seekTo(data.value, true); break;
                case 'SET_VOLUME': player.setVolume(Math.round(data.value * 100)); break;
                case 'LOAD': 
                  player.loadVideoById({ 
                    videoId: data.value, 
                    startSeconds: data.start || 0 
                  }); 
                  player.playVideo(); 
                  break;
              }
            } catch (e) {}
          });

          // Heartbeat
          setInterval(() => {
            if (player && player.getCurrentTime) {
              const msg = JSON.stringify({
                type: 'TIME_UPDATE',
                currentTime: player.getCurrentTime(),
                duration: player.getDuration()
              });
              window.parent.postMessage(msg, "*");
              window.top.postMessage(msg, "*");
            }
          }, 500);
        </script>
      </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}