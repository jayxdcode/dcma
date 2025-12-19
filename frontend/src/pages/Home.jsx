import React from 'react';
import { Grid, Paper, Button, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

export default function Home() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

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
            >
              Play Something
            </Button>
          </Paper>
        </Grid>

        {/* Quick Activity Mockup */}
        <Grid item xs={12} md={6}>
          <div style={{ marginBottom: 12, fontWeight: 700 }}>Recent Activity</div>
          <div className="v-stack">
            {[1,2,3].map(i => (
              <div key={i} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, background: '#333', borderRadius: 4 }}></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Track History #{i}</div>
                  <div className="small">Artist Name</div>
                </div>
              </div>
            ))}
          </div>
        </Grid>
      </Grid>
    </div>
  );
}

