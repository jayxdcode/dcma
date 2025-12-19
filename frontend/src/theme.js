import { createTheme } from '@mui/material/styles';

export const CATPPUCCIN_PRESETS = {
  latte: {
    name: "latte",
    background: "#EFF1F5",
    surface: "#FFFFFF",
    text: "#4C4F69",
    accent: "#f2b8a0",
    accent2: "#f5c2e7"
  },
  frappe: {
    name: "frappe",
    background: "#303446",
    surface: "#292C3C",
    text: "#DCE0E8",
    accent: "#8BD5CA",
    accent2: "#B7BDF8"
  },
  macchiato: {
    name: "macchiato",
    background: "#1e1e2e",
    surface: "#242433",
    text: "#CAD3F5",
    accent: "#F2CDCD",
    accent2: "#C6A0F6"
  },
  mocha: {
    name: "mocha",
    background: "#191724",
    surface: "#1f1d2e",
    text: "#CAD3F5",
    accent: "#F5BDE6",
    accent2: "#94E2D5"
  }
};

export function buildMuiThemeFromPalette(p){
  return createTheme({
    palette: {
      mode: (p.background && lightOrDark(p.background) === 'light') ? 'light' : 'dark',
      background: { default: p.background, paper: p.surface },
      text: { primary: p.text },
      primary: { main: p.accent, contrastText: '#0b0b0b' },
      secondary: { main: p.accent2 }
    },
    components: {
      MuiButton: { styleOverrides: { root: { borderRadius: 10, textTransform: 'none' } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } }
    }
  });
}

function lightOrDark(hex) {
  if(!hex) return 'dark';
  const c = hex.startsWith('#') ? hex.substring(1) : hex;
  const r = parseInt(c.substring(0,2),16);
  const g = parseInt(c.substring(2,4),16);
  const b = parseInt(c.substring(4,6),16);
  const luminance = (0.299*r + 0.587*g + 0.114*b)/255;
  return luminance > 0.6 ? 'light' : 'dark';
}
