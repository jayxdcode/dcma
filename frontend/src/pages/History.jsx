import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  IconButton,
  CircularProgress,
  Chip,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import HistoryIcon from '@mui/icons-material/History';
import { usePlayer } from '../context/PlayerContext';

export default function HistoryPage() {
  const player = usePlayer();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = () => {
    try {
      const lastPlay = JSON.parse(localStorage.getItem('lastPlay') || '{}');
      if (lastPlay.queue && Array.isArray(lastPlay.queue)) {
        // Get all tracks from history, deduplicate by id
        const seen = new Set();
        const uniqueHistory = lastPlay.queue.filter(track => {
          if (!track.id || seen.has(track.id)) return false;
          seen.add(track.id);
          return true;
        }).reverse(); // Most recent first

        setHistory(uniqueHistory);
      }
    } catch (e) {
      console.warn('Failed to load history:', e);
    } finally {
      setLoading(false);
    }
  };

  const playTrack = (track) => {
    player.play(track);
  };

  const getTotalPlayTime = () => {
    return history.reduce((total, track) => total + (track.duration || 0), 0);
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: '#071029', minHeight: '100vh', p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <HistoryIcon sx={{ fontSize: 32 }} />
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          Listening History
        </Typography>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Chip
          label={`${history.length} tracks`}
          sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}
        />
        <Chip
          label={`${formatDuration(getTotalPlayTime())} total`}
          sx={{ bgcolor: 'rgba(255,255,255,0.1)' }}
        />
      </Box>

      {/* History List */}
      {history.length > 0 ? (
        <Box>
          {history.map((track, index) => (
            <Card
              key={`${track.id}-${index}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                mb: 1,
                bgcolor: 'rgba(255,255,255,0.05)',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
              }}
              onClick={() => playTrack(track)}
            >
              <Box sx={{ p: 2 }}>
                <img
                  src={track.cover || 'https://placecats.com/neo/300/300'}
                  alt=""
                  style={{ width: 48, height: 48, borderRadius: 4 }}
                />
              </Box>
              <CardContent sx={{ flex: 1, py: 2 }}>
                <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                  {track.title}
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                  {track.artist}
                </Typography>
              </CardContent>
              <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                  {formatDuration(track.duration || 0)}
                </Typography>
                <IconButton sx={{ color: 'var(--accent, #1db954)' }}>
                  <PlayArrowIcon />
                </IconButton>
              </Box>
            </Card>
          ))}
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <HistoryIcon sx={{ fontSize: 64, color: 'rgba(255,255,255,0.3)', mb: 2 }} />
          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.6)', mb: 1 }}>
            No listening history yet
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
            Start playing some music to see your history here
          </Typography>
        </Box>
      )}
    </Box>
  );
}