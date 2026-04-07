import { useEffect, useState, useMemo, memo } from 'react';
import { loadLyrics } from '../lib/lyrics.js';

const LyricsDisplay = memo(({ track, player }) => {
  const [lines, setLines] = useState([]);

  // Load Lyrics — depend on the metadata used for searching
  useEffect(() => {
    if (!track?.title || !track?.artist) {
      console.debug('[LyricsDisplay] loadLyrics skipped — missing track title/artist', track);
      setLines([]);
      return;
    }
    console.debug('[LyricsDisplay] calling loadLyrics for', track.title, '-', track.artist);
    let ac = new AbortController();
    setLines([]);

    (async() => {
      await loadLyrics(
        track.title,
        track.artist,
        track.album || '',
        player.duration || 0,
        (parsed) => {
          console.debug('[LyricsDisplay] loadLyrics callback — lines:', Array.isArray(parsed) ? parsed.length : parsed);
          setLines(parsed);
        },
        { flag: false, query: '' },
        ac.signal
      );
    })().catch(e => { console.error('An error has occured while trying to load lyrics:', e) });

    return () => {
      console.debug('[LyricsDisplay] aborting lyrics fetch for', track.title);
      ac.abort();
    };
  }, [track?.title, track?.artist, track?.album]); // removed player?.duration

  const activeLineIndex = useMemo(() => {
    if (player?.time == null || !lines.length) return 0; // allow time === 0
    const t = player.time * 1000; // player.time is seconds, lyrics are ms
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= t) idx = i;
      else break;
    }
    return idx;
  }, [player?.time, lines]);

  return (
    <div style={{ textAlign: 'center', paddingBottom: 100 }}>
      {lines.length > 0 ? lines.map((l, i) => (
        <div key={i}
          onClick={() => { player.seek(l.time/1000); }}
          style={{
            padding: '12px 0',
            fontSize: i === activeLineIndex ? '1.5rem' : '1.1rem',
            fontWeight: i === activeLineIndex ? 800 : 500,
            color: i === activeLineIndex ? '#fff' : 'rgba(255,255,255,0.4)',
            transform: i === activeLineIndex ? 'scale(1.05)' : 'scale(1)',
            transition: 'all 0.3s ease',
            cursor: 'pointer'
          }}>
          {l.text}
          {l.trans && <div style={{ fontSize: '0.7em', fontWeight: 400, marginTop: 4 }}>{l.trans}</div>}
        </div>
      )) : (
        <div className="small">Lyrics not available</div>
      )}
    </div>
  );
});

LyricsDisplay.displayName = 'LyricsDisplay';

export default LyricsDisplay;