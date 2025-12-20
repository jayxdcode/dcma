import React from 'react';
import { Button, Select, MenuItem, FormControl, InputLabel, Paper } from '@mui/material';

export default function Settings({ selectedPresetKey, setThemeByKey, presets }) {
  const presetKeys = presets ? Object.keys(presets) : [];

  return (
    <div className="fade-in">
      <h2 className="page-title">Settings</h2>
      
      <div className="v-stack">
        <Paper className="card">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Appearance</div>
          <div className="small" style={{ marginBottom: 16 }}>Customize the look and feel of Hitori.</div>
          
          <FormControl size="small" fullWidth sx={{ maxWidth: 300 }}>
            <InputLabel sx={{ color: 'var(--text-secondary)' }}>Theme</InputLabel>
            <Select
              value={selectedPresetKey || 'image'}
              onChange={(e) => setThemeByKey && setThemeByKey(e.target.value)}
              label="Theme"
              sx={{ 
                color: 'var(--text)', 
                '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--accent)' }
              }}
            >
              {presetKeys.map(k => <MenuItem key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</MenuItem>)}
              <MenuItem value="image">Default</MenuItem>
            </Select>
          </FormControl>
        </Paper>

        <Paper className="card">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Data</div>
          <div className="small" style={{ marginBottom: 12 }}>Manage local data and cache.</div>
          <Button 
            variant="outlined" 
            color="error" 
            onClick={() => { localStorage.clear(); window.location.reload(); }}
          >
            Clear Cache & Reset
          </Button>
        </Paper>
      </div>
    </div>
  );
}

