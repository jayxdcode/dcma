import { useMemo, useState, useEffect, Component } from 'react'; // Added Component for ErrorBoundary
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, Typography, Button } from '@mui/material'; // Added MUI components for error UI
import App from './App';
import { ModalProvider } from './components/ModalProvider';
import './index.css';
import hitori from '../hitori.json';
import { CATPPUCCIN_PRESETS, buildMuiThemeFromPalette } from './theme';

// --- FIXED: Set global variable immediately so it's available before render ---
window.hitori = hitori;

// --- ADDED: Error Boundary Component ---
class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("App Crash:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ 
          height: '100vh', display: 'flex', flexDirection: 'column', 
          alignItems: 'center', justifyContent: 'center', bgcolor: '#071029', color: 'white', p: 3 
        }}>
          <Box
            component="img"
            sx={{
              height: 300,
              aspectRatio: "16/9",
              mb: 2, // Adds margin bottom
              borderRadius: '10px'
            }}
            alt="Hitori"
            src="../assets/htr-scared-tp.png" 
          />
          <Typography variant="h4" sx={{ fontWeight: 'bold' }} gutterBottom>Something went wrong</Typography>
          <Typography variant="body1" sx={{ color: '#E382A8', mb: 5 }}>
            {this.state.error?.toString()}
          </Typography>
          <Button
            variant="outlined"
            onClick={() => window.location.reload()}
            sx={{
              borderRadius: '10px',
              borderColor: 'linear-gradient(90deg, var(--accent, #1db954), var(--accent-2, #1ed760))',
              paddingX: 3,
              fontWeight: 700,
              textTransform: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            }}
          >
            Reload Application
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

const imagePalette = {
  background: '#071029',
  surface: '#0F1724',
  text: '#E6EEF8',
  accent: '#2AA9F2',
  accent2: '#E382A8'
};

function Root(){
  const persistedKey = localStorage.getItem('hitori_selected_preset') || 'image';
  const [selectedPresetKey, setSelectedPresetKey] = useState(persistedKey);
  const initialPalette = (persistedKey && persistedKey !== 'image' && CATPPUCCIN_PRESETS[persistedKey]) 
    ? CATPPUCCIN_PRESETS[persistedKey] 
    : imagePalette;
  
  const [palette, setPalette] = useState(initialPalette);

  // Removed the window.hitori useEffect from here because it's now at the top level

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
        <App 
          palette={palette} 
          setPalette={setPalette} 
          selectedPresetKey={selectedPresetKey} 
          setThemeByKey={setThemeByKey} 
          presets={CATPPUCCIN_PRESETS}
        />
      </HashRouter>
    </ThemeProvider>
  );
}

// --- WRAPPED: Error Boundary goes around Root ---
createRoot(document.getElementById('root')).render(
  <GlobalErrorBoundary>
    <ModalProvider>
      <Root/>
    </ModalProvider>
  </GlobalErrorBoundary>
);
