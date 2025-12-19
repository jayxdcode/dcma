import { useMemo, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import App from './App';
import './index.css';
import { CATPPUCCIN_PRESETS, buildMuiThemeFromPalette } from './theme';

// palette extracted from image (default)
const imagePalette = {
  background: '#071029',
  surface: '#0F1724',
  text: '#E6EEF8',
  accent: '#2AA9F2',
  accent2: '#E382A8'
};

function Root(){
  // restore selected preset from localStorage to persist theme across reloads
  const persistedKey = localStorage.getItem('hitori_selected_preset') || 'image';
  const [selectedPresetKey, setSelectedPresetKey] = useState(persistedKey);
  const initialPalette = (persistedKey && persistedKey !== 'image' && CATPPUCCIN_PRESETS[persistedKey]) ? CATPPUCCIN_PRESETS[persistedKey] : imagePalette;
  const [palette, setPalette] = useState(initialPalette);

  const setThemeByKey = (key) => {
    if (key === 'image') {
      setPalette(imagePalette);
      setSelectedPresetKey('image');
      localStorage.setItem('hitori_selected_preset', 'image');
      return;
    }
    const p = CATPPUCCIN_PRESETS[key];
    if (p) {
      setPalette(p);
      setSelectedPresetKey(key);
      localStorage.setItem('hitori_selected_preset', key);
    }
  };

  const muiTheme = useMemo(() => buildMuiThemeFromPalette(palette), [palette]);

  useEffect(() => {
    if(!palette) return;
    document.documentElement.style.setProperty('--background', palette.background || "#071029");
    document.documentElement.style.setProperty('--accent', palette.accent || '#2AA9F2');
    document.documentElement.style.setProperty('--accent-2', palette.accent2 || '#E382A8');
    document.documentElement.style.setProperty('--surface', palette.surface || '#0F1724');
    document.documentElement.style.setProperty('--text', palette.text || '#E6EEF8');
    document.documentElement.style.setProperty('--soft-skin', palette.softSkin || '#FFF3EA');
  }, [palette]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <HashRouter>
        <App palette={palette} setPalette={setPalette} selectedPresetKey={selectedPresetKey} setThemeByKey={setThemeByKey} presets={CATPPUCCIN_PRESETS}/>
      </HashRouter>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(<Root/>);
