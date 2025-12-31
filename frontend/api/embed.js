// api/embed.js
export default function handler(req, res) {
  const { v, origin, start } = req.query;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background-color: #000; }
          #player { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div id="player"></div>
        <script>
          var tag = document.createElement('script');
          tag.src = 'https://www.youtube.com/iframe_api';
          var firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

          const targetOrigin = "${origin || '*'}";
          var player;

          function onYouTubeIframeAPIReady() {
            player = new YT.Player('player', {
              height: '100%', width: '100%',
              videoId: "${v || ''}", 
              host: 'https://www.youtube-nocookie.com',
              playerVars: { 
                playsinline: 1, rel: 0, controls: 0, disablekb: 1,
                start: ${parseInt(start) || 0},
                autoplay: 0, // Explicitly off for initial load
                origin: window.location.protocol + '//' + window.location.host
              },
              events: {
                onReady: () => window.parent.postMessage(JSON.stringify({ type: 'READY' }), targetOrigin),
                onStateChange: (e) => {
                  window.parent.postMessage(JSON.stringify({
                    type: 'STATE_CHANGE',
                    state: e.data,
                    duration: player.getDuration(),
                    currentTime: player.getCurrentTime()
                  }), targetOrigin);
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
                  // Programmatic play to ensure unmuted audio after user interaction
                  player.playVideo(); 
                  break;
              }
            } catch (e) {}
          });

          setInterval(() => {
            if (player && player.getCurrentTime) {
              window.parent.postMessage(JSON.stringify({
                type: 'TIME_UPDATE',
                currentTime: player.getCurrentTime(),
                duration: player.getDuration()
              }), targetOrigin);
            }
          }, 500);
        </script>
      </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}
