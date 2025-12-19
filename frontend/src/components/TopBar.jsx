import React from 'react';
import { Typography } from '@mui/material';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';

export default function TopBar() {
  return (
    <div className="app-header">
      <div className="h-stack">
        <div style={{
          width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))'
        }}>
          <GraphicEqIcon sx={{ color: '#000', fontSize: 20 }} />
        </div>
        <Typography variant="h6" fontWeight={700} sx={{ letterSpacing: -0.5 }}>Hitori</Typography>
      </div>
      
      {/* User avatar or other meta could go here */}
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
    </div>
  );
}

