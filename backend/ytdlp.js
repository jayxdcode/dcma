const { EventSource } = require('eventsource');

const BASE = 'https://ytdlp.online/stream';
const TOKEN = process.env.YTDLP_TOKEN || null;

/**
 * Run a yt-dlp command via SSE and stream output.
 *
 * @param {string} commandStr  e.g. '-f bestaudio "ytsearch1:mabataki vaundy"'
 * @param {object} [options]
 * @param {number} [options.timeout]  optional timeout in seconds
 *
 * @returns {EventSource} the active EventSource connection
 */
function runYtdlp(commandStr, options = {}) {
  const { timeout } = options;

  // Build URL
  let url = `${BASE}?command=${encodeURIComponent(commandStr)}`;
  if (TOKEN) url += `&token=${encodeURIComponent(TOKEN)}`;

  console.log('Connecting to SSE URL:\n', url);
  console.log('---\nStreaming output:\n');

  const es = new EventSource(url, {
    headers: { Accept: 'text/event-stream' }
  });

  // Standard message event
  es.onmessage = (evt) => {
    process.stdout.write(evt.data + '\n');
  };

  // Error events (disconnects, failures, server close)
  es.onerror = (err) => {
    console.error('SSE error:', err?.message || err);
  };

  // Optional custom close event sent by server
  es.addEventListener('close', () => {
    console.log('\nServer requested close — shutting down client.');
    es.close();
  });

  // Optional timeout for auto-closing
  if (timeout) {
    setTimeout(() => {
      console.log(`\nTimeout reached (${timeout}s). Closing connection.`);
      es.close();
    }, timeout * 1000);
  }

  return es;
}

module.exports = runYtdlp;
