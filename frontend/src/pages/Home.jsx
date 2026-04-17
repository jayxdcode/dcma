import React, { useEffect, useState } from 'react';
import { Grid, Paper, Button, Typography, Card, CardContent } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { usePlayer } from '../context/PlayerContext';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const player = usePlayer();
  const navigate = useNavigate();
  const [recentTracks, setRecentTracks] = useState([]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    // Load recently played from localStorage
    try {
      const lastPlay = JSON.parse(localStorage.getItem('lastPlay') || '{}');
      if (lastPlay.queue && Array.isArray(lastPlay.queue)) {
        // Get last 10 tracks, excluding current if playing
        const recent = lastPlay.queue.slice(-10).reverse();
        setRecentTracks(recent);
      }
    } catch (e) {
      console.warn('Failed to load recent tracks:', e);
    }
  }, []);

  const playTrack = (track) => {
    player.play(track);
  };

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 32, marginTop: 12 }}>
        <Typography variant="h4" fontWeight={800} sx={{ mb: 1 }}>{greeting}</Typography>
        <Typography className="text-grad" variant="h5" fontWeight={600}>Welcome to Hitori</Typography>
      </div>

      <Grid container spacing={2}>
        {/* Hero Card */}
        <Grid item xs={12}>
          <Paper className="card" sx={{
            background: 'linear-gradient(120deg, var(--surface-2), var(--surface))',
            padding: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2
          }}>
            <div>
              <Typography variant="h6" fontWeight={700}>Start Listening</Typography>
              <Typography className="small">Search for your favorite tracks or import a playlist.</Typography>
            </div>
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              sx={{
                borderRadius: 20,
                textTransform: 'none',
                background: 'var(--text)',
                color: '#000',
                fontWeight: 700,
                '&:hover': { background: '#fff' }
              }}
              onClick={() => navigate('/search')}
            >
              Play Something
            </Button>
          </Paper>
        </Grid>

        {/* Recently Played */}
        <Grid item xs={12}>
          <div style={{ marginBottom: 12, fontWeight: 700 }}>Recently Played</div>
          {recentTracks.length > 0 ? (
            <div className="v-stack">
              {recentTracks.map((track, i) => (
                <Card
                  key={track.id || i}
                  className="card"
                  sx={{
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    cursor: 'pointer',
                    borderRadius: 3,
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' }
                  }}
                  onClick={() => playTrack(track)}
                >
                  <img
                    src={track.cover || 'https://placecats.com/neo/300/300'}
                    alt=""
                    style={{ width: 48, height: 48, borderRadius: 8 }}
                  />
                  <CardContent sx={{ flex: 1, py: 0 }}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      {track.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                      {track.artist}
                    </Typography>
                  </CardContent>
                  <PlayArrowIcon sx={{ color: 'rgba(255,255,255,0.6)' }} />
                </Card>
              ))}
            </div>
          ) : (
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', py: 4 }}>
              No recent tracks. Start playing some music!
            </Typography>
          )}
        </Grid>
      </Grid>
    </div>
  );
}

