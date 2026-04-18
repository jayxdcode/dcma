import { useEffect, useMemo, memo } from 'react';
import { useLyrics } from '../context/LyricsContext.jsx';

/**
 * LyricsDisplay Component
 * Handles the triggering of searches via the Context and renders the scrolling lines.
 */
const LyricsDisplay = memo(({ track, player, onProgressUpdate, onSearchComplete, manualMetadata }) => {
  // Pull lyrics state and the loader from our new Context
  const { lyrics, loadLyrics } = useLyrics();
  
  // Load Lyrics — triggered when metadata or manual search parameters change
  useEffect(() => {
    // 1. Resolve which metadata to use (Manual vs Automatic)
    const effectiveTrack = manualMetadata && manualMetadata.title ? {
      title: manualMetadata.title,
      artist: manualMetadata.artist,
      album: manualMetadata.album,
      duration: player?.duration || 0,
      customQuery: manualMetadata.customQuery || ''
    } : track;
    
    // 2. Validation check
    if (!effectiveTrack?.title || !effectiveTrack?.artist) {
      if (onProgressUpdate) onProgressUpdate('[LyricsDisplay] Missing track info', 'warn');
      return;
    }
    
    if (onProgressUpdate) {
      onProgressUpdate(`[LyricsDisplay] Searching: "${effectiveTrack.title}" by ${effectiveTrack.artist}`, 'info');
    }
    
    let ac = new AbortController();
    
    // 3. Define the async loader
    const fetchLyrics = async () => {
      try {
        const { title, artist, album, duration } = effectiveTrack;
        const isManual = !!(manualMetadata.customQuery);
        const query = manualMetadata.customQuery || "";
        
        await loadLyrics(
          {
            meta: {
              title, artist, album, duration,
            },
            isManual,
            query,
          },
          // Callback for UI progress (fired when lyrics are first parsed or translations arrive)
          (parsed) => {
            if (onProgressUpdate) {
              const count = Array.isArray(parsed) ? parsed.length : 0;
              onProgressUpdate(`[LyricsDisplay] Loaded ${count} lines`, 'success');
            }
          },
          ac.signal
        );
        
        if (onSearchComplete) onSearchComplete();
      } catch (e) {
        if (e.name === 'AbortError') return;
        if (onProgressUpdate) onProgressUpdate(`Error: ${e.message}`, 'fail');
        console.error('[LyricsDisplay] Load failed:', e);
      }
    };
    
    fetchLyrics();
    
    // Cleanup: Abort fetch if track changes or component unmounts
    return () => {
      ac.abort();
    };
  }, [
    track?.title,
    track?.artist,
    track?.album,
    manualMetadata?.title,
    manualMetadata?.artist,
    player?.duration,
    onProgressUpdate,
    onSearchComplete,
    loadLyrics // included loader from context
  ]);
  
  // Logic to determine which line is currently "active" based on player time
  const activeLineIndex = useMemo(() => {
    if (player?.time == null || !lyrics || !lyrics.length) return 0;
    
    const currentTimeMs = player.time * 1000; // Player (seconds) -> Lyrics (ms)
    let idx = 0;
    
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].time <= currentTimeMs) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [player?.time, lyrics]);
  
  return (
    <div style={{ textAlign: 'center', paddingBottom: '20vh', paddingTop: '10vh' }}>
      {lyrics && lyrics.length > 0 ? (
        lyrics.map((line, i) => {
          const isActive = i === activeLineIndex;
          
          return (
            <div 
              key={i}
              onClick={() => { 
                if (player?.seek) player.seek(line.time / 1000); 
              }}
              style={{
                padding: '16px 20px',
                fontSize: isActive ? '1.6rem' : '1.1rem',
                fontWeight: isActive ? 800 : 500,
                color: isActive ? '#ffffff' : 'rgba(255,255,255,0.3)',
                transform: isActive ? 'scale(1.05)' : 'scale(1)',
                transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                cursor: 'pointer',
                lineHeight: '1.4'
              }}
            >
              {/* Main Lyric Text */}
              <div>{line.text}</div>
              
              {/* Romaji (if available) */}
              {line.roman && (
                <div style={{ 
                    fontSize: '0.65em', 
                    opacity: 0.8, 
                    marginTop: 4, 
                    fontWeight: 400,
                    letterSpacing: '0.05em' 
                }}>
                  {line.roman}
                </div>
              )}

              {/* Translation (if available) */}
              {line.trans && (
                <div style={{ 
                    fontSize: '0.75em', 
                    opacity: 0.9, 
                    marginTop: 6, 
                    fontWeight: 400,
                    color: isActive ? '#4aeaf3' : 'inherit' // Highlight translation too if active
                }}>
                  {line.trans}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div style={{ opacity: 0.5, marginTop: '20%' }}>
          <p>No lyrics found for this track</p>
          <p style={{ fontSize: '0.8rem' }}>Try searching manually if metadata is incorrect.</p>
        </div>
      )}
    </div>
  );
});

LyricsDisplay.displayName = 'LyricsDisplay';

export default LyricsDisplay;