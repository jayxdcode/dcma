import React, { useState, useEffect } from 'react';
import { Button, Select, MenuItem, FormControl, InputLabel, Paper, Switch, FormControlLabel, LinearProgress, Typography, Box } from '@mui/material';
import { useModals } from '../components/ModalProvider';
import packageJson from '../../package.json';
import hitoriJson from '../../hitori.json';

/**
 * Returns the version of a package from the imported package.json
 * @param {string} packageName - The name of the package (e.g., 'react')
 * @returns {string|null} - The version string or null if not found
 */
const getVersion = (packageName) => {
  return packageJson.dependencies?.[packageName] || 
         packageJson.devDependencies?.[packageName] || 
         null;
};

export default function Settings({ selectedPresetKey, setThemeByKey, presets }) {
  const presetKeys = presets ? Object.keys(presets) : [];
  const { showConfirm, showAlert } = useModals();
  
  // Local state to track the switch UI
  const [autoLoadEruda, setAutoLoadEruda] = useState(
    localStorage.getItem('hitori_autoload_eruda') === 'true'
  );
  
  const [storageUsage, setStorageUsage] = useState({ used: 0, total: 0 });
  
  // Calculate storage usage
  useEffect(() => {
    const calculateStorage = () => {
      let total = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          total += localStorage[key].length + key.length;
        }
      }
      // Estimate total storage (5MB typical for localStorage)
      const totalMB = 5;
      const usedMB = (total / (1024 * 1024)).toFixed(2);
      setStorageUsage({ used: parseFloat(usedMB), total: totalMB });
    };
    
    calculateStorage();
  }, []);
  
  // Function to inject Eruda script
  const injectEruda = (isInitialLoad = false) => {
    if (typeof window.eruda !== 'undefined') return;
    
    const script = document.createElement('script');
    script.src = "https://cdn.jsdelivr.net/npm/eruda";
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
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 3, letterSpacing: '-0.5px' }} className="page-title">Settings</Typography>
      
      <div className="v-stack" sx={{
        '.card': { marginBottom: 1.5 }
      }}>
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

          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Storage Usage: {storageUsage.used}MB / {storageUsage.total}MB
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(storageUsage.used / storageUsage.total) * 100}
              sx={{
                height: 8,
                borderRadius: 4,
                bgcolor: 'rgba(255,255,255,0.1)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: storageUsage.used > storageUsage.total * 0.8 ? '#ff6b6b' : 'var(--accent)'
                }
              }}
            />
          </Box>

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

        <Paper className="card">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Build Info</div>
          <div className="small" style={{ marginBottom: 12 }}>Application version and build details.</div>
          <div className="v-stack" style={{ gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="small" style={{ opacity: 0.8 }}>Version</span>
              <span className="small" style={{ fontWeight: 600 }}>{ `${hitoriJson.versionNumber} (${hitoriJson.codeName})` }</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="small" style={{ opacity: 0.8 }}>Stage</span>
              <span className="small" style={{ fontWeight: 600 }}>{ hitoriJson.stage }</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="small" style={{ opacity: 0.8 }}>Build Date</span>
              <span className="small" style={{ fontWeight: 600 }}>{new Date().toLocaleDateString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="small" style={{ opacity: 0.8 }}>React</span>
              <span className="small" style={{ fontWeight: 600 }}>{ getVersion("react") }</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="small" style={{ opacity: 0.8 }}>MUI</span>
              <span className="small" style={{ fontWeight: 600 }}>{ getVersion("@mui/material") }</span>
            </div>
          </div>
        </Paper>
      </div>
    </div>
  );
}