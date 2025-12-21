import React, { useState, useEffect } from 'react';
import { Button, Select, MenuItem, FormControl, InputLabel, Paper, Switch, FormControlLabel } from '@mui/material';
import { useModals } from '../components/ModalProvider';

export default function Settings({ selectedPresetKey, setThemeByKey, presets }) {
  const presetKeys = presets ? Object.keys(presets) : [];
  const isDiscordProxy = window.location.hostname.includes('discordsays.com');
  const { showConfirm, showAlert } = useModals();

  // Local state to track the switch UI
  const [autoLoadEruda, setAutoLoadEruda] = useState(
    localStorage.getItem('hitori_autoload_eruda') === 'true'
  );

  // Function to inject Eruda script
  const injectEruda = (isInitialLoad = false) => {
    if (typeof window.eruda !== 'undefined') return;

    const script = document.createElement('script');
    script.src = isDiscordProxy ? "/src/eruda" : "//cdn.jsdelivr.net/npm/eruda";
    document.body.appendChild(script);
    script.onload = () => {
      window.eruda.init();
      if (!isInitialLoad) {
        showAlert("Eruda Loaded!", "success");
      }
    };
  };

  // Check for autoload on mount
  useEffect(() => {
    if (autoLoadEruda) {
      injectEruda(true);
    }
  }, []);

  const handleEnableDebug = async () => {
    if (typeof window.eruda !== 'undefined') {
      showAlert('Eruda is already present. Check the bottom right corner for the icon.');
      return;
    }
    const confirm = await showConfirm("Enable Eruda Dev Tools?", "This will load the Eruda console for this session.");
    if (confirm) {
      injectEruda();
    }
  };

  const handleToggleAutoload = async (e) => {
    const newValue = e.target.checked;

    if (newValue) {
      const confirm = await showConfirm(
        "Enable Eruda Autoload?",
        "Eruda will automatically load every time you open the app. This is recommended for debugging only."
      );
      if (confirm) {
        localStorage.setItem('hitori_autoload_eruda', 'true');
        setAutoLoadEruda(true);
        injectEruda();
      }
    } else {
      localStorage.removeItem('hitori_autoload_eruda');
      setAutoLoadEruda(false);
      showAlert("Autoload disabled. Eruda will not load on next refresh.");
    }
  };

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
              {presetKeys.map(k => (
                <MenuItem key={k} value={k}>
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </MenuItem>
              ))}
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
            onClick={async () => { 
              const confirmed = await showConfirm('Clear Cache & Reset', 'Do you want to proceed? This action can\'t be undone.'); 
              if (confirmed) { 
                localStorage.clear(); 
                sessionStorage.clear(); 
                window.location.reload(); 
              }
            }}
          >
            Clear Cache & Reset
          </Button>
        </Paper>
        
        <Paper className="card">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Dev Flags</div>
          <div className="small" style={{ marginBottom: 12 }}>Development and debugging tools.</div>
          <div className="v-stack" style={{ gap: '12px', alignItems: 'flex-start' }}>
            <FormControlLabel
              control={
                <Switch 
                  checked={autoLoadEruda} 
                  onChange={handleToggleAutoload} 
                  color="primary"
                />
              }
              label={<span className="small">Always load Eruda</span>}
            />
            <Button 
              variant="outlined" 
              size="small"
              onClick={handleEnableDebug}
            >
              Load Eruda Now
            </Button>
          </div>
        </Paper>
      </div>
    </div>
  );
}
