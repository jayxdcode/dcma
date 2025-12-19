import { loadLyrics } from './lyrics.ts'; // adjust extension/path if needed

function onTransReady(lines) { console.log(JSON.stringify(lines, null, 2)); }

(async () => {
  try {
    await loadLyrics('Kaikai Kitan', 'Eve', '', 180, onTransReady, { flag: false, query: '' }, null);
  } catch (e) { console.error(e); }
})();
