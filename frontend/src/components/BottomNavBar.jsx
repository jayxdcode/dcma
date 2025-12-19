// src/components/BottomNavBar.jsx
import React from 'react';
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import HomeIcon from '@mui/icons-material/HomeRounded';
import SearchIcon from '@mui/icons-material/SearchRounded';
import SettingsIcon from '@mui/icons-material/SettingsRounded';
import { useNavigate, useLocation } from 'react-router-dom';

export default function BottomNavBar() {
  const navigate = useNavigate();
  const location = useLocation();

  // Simple mapping based on path
  const getVal = () => {
    if (location.pathname === '/') return 0;
    if (location.pathname === '/search') return 1;
    if (location.pathname === '/settings') return 2;
    return 0;
  };

  const handleChange = (_, newValue) => {
    if (newValue === 0) navigate('/');
    if (newValue === 1) navigate('/search');
    if (newValue === 2) navigate('/settings');
  };

  return (
    <Paper sx={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1300,
      background: 'rgba(7, 16, 41, 0.95)',
      backdropFilter: 'blur(10px)',
      borderTop: '1px solid rgba(255,255,255,0.05)'
    }} elevation={0}>
      <BottomNavigation 
        showLabels={false} 
        value={getVal()} 
        onChange={handleChange}
        sx={{ background: 'transparent', height: 64 }}
      >
        <BottomNavigationAction label="Home" icon={<HomeIcon />} onMouseEnter={() => import('../pages/Home')} sx={{ color: 'var(--text-secondary)', '&.Mui-selected': { color: 'var(--accent)' } }} />
        <BottomNavigationAction label="Search" icon={<SearchIcon />} onMouseEnter={() => import('../pages/Search')} sx={{ color: 'var(--text-secondary)', '&.Mui-selected': { color: 'var(--accent)' } }} />
        <BottomNavigationAction label="Settings" icon={<SettingsIcon />} onMouseEnter={() => import('../pages/Settings')} sx={{ color: 'var(--text-secondary)', '&.Mui-selected': { color: 'var(--accent)' } }} />
      </BottomNavigation>
    </Paper>
  );
}

