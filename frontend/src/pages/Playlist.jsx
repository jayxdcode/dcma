import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Card,
  CardContent,
  CardMedia,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ShuffleIcon from '@mui/icons-material/Shuffle';
import { usePlayer } from '../context/PlayerContext';
import { playlistPage as pipedPlaylistPage } from '../lib/piped-api.js';

export default function PlaylistPage() {
  const { playlistId } = useParams();
  const navigate = useNavigate();
  const player = usePlayer();
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playlistId) return;

    setLoading(true);
    pipedPlaylistPage(playlistId)
      .then(data => {
        setPlaylist(data);
        setError(null);
      })
      .catch(err => {
        console.error('Failed to load playlist:', err);
        setError('Failed to load playlist');
      })
      .finally(() => setLoading(false));
  }, [playlistId]);

  const playTrack = (track) => {
    player.play(track);
  };

  const playPlaylist = (shuffle = false) => {
    if (!playlist?.tracks?.length) return;

    let tracks = [...playlist.tracks];
    if (shuffle) {
      tracks = tracks.sort(() => Math.random() - 0.5);
    }

    player.play(tracks[0]);
    tracks.slice(1).forEach(track => player.enqueue(track));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !playlist) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" color="error">{error || 'Playlist not found'}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: '#071029', minHeight: '100vh', color: 'white' }}>
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton onClick={() => navigate(-1)} sx={{ color: 'white' }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6">Playlist</Typography>
      </Box>

      {/* Playlist Info */}
      <Box sx={{ p: 3, display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        <CardMedia
          component="img"
          sx={{ width: 200, height: 200, borderRadius: 2 }}
          image={playlist.cover || 'https://placecats.com/neo/400/400'}
          alt={playlist.title}
        />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
            {playlist.title}
          </Typography>
          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.7)', mb: 2 }}>
            {playlist.uploader}
          </Typography>
          <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>
            {playlist.tracks?.length || 0} tracks
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <IconButton
              onClick={() => playPlaylist(false)}
              sx={{
                bgcolor: 'var(--accent, #1db954)',
                color: 'white',
                borderRadius: '50%',
                width: 56,
                height: 56,
                '&:hover': { bgcolor: 'var(--accent-hover, #1aa34a)' }
              }}
            >
              <PlayArrowIcon sx={{ fontSize: 28 }} />
            </IconButton>
            <IconButton
              onClick={() => playPlaylist(true)}
              sx={{
                bgcolor: 'rgba(255,255,255,0.1)',
                color: 'white',
                borderRadius: '50%',
                width: 56,
                height: 56,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
              }}
            >
              <ShuffleIcon sx={{ fontSize: 28 }} />
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Tracks */}
      <Box sx={{ px: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Tracks</Typography>
        {playlist.tracks?.map((track, index) => (
          <Card
            key={track.id || index}
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
            <Box sx={{ p: 2, minWidth: 60, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                {index + 1}
              </Typography>
            </Box>
            <CardContent sx={{ flex: 1, py: 2 }}>
              <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                {track.title}
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                {track.artist}
              </Typography>
            </CardContent>
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
              </Typography>
            </Box>
          </Card>
        ))}
      </Box>
    </Box>
  );
}