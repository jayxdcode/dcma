import { createTheme } from '@mui/material/styles';

export const CATPPUCCIN_PRESETS = {
  latte: {
    name: "latte",
    background: "#EFF1F5",
    surface: "#FFFFFF",
    surface2: "#ACB0BE",
    text: "#4C4F69",
    subtext0: "#6C6F85",
    accent: "#f2b8a0",
    accent2: "#f5c2e7",
    error: "#D20F38",
    warn: "#F9E2AF",
    info: "#89B4FA",
    success: "#A6E3A1"
  },
  frappe: {
    name: "frappe",
    background: "#303446",
    surface: "#292C3C",
    surface2: "#626880",
    text: "#DCE0E8",
    subtext0: "#A5ADCE",
    accent: "#8BD5CA",
    accent2: "#B7BDF8",
    error: "#E78284",
    warn: "#E5C890",
    info: "#8CAAEE",
    success: "#A6D189"
  },
  macchiato: {
    name: "macchiato",
    background: "#1e1e2e",
    surface: "#242433",
    surface2: "#5B6078",
    text: "#CAD3F5",
    subtext0: "#A5ADCB",
    accent: "#F2CDCD",
    accent2: "#C6A0F6",
    error: "#ED8796",
    warn: "#EED49F",
    info: "#8AADF4",
    success: "#A6DA95"
  },
  mocha: {
    name: "mocha",
    background: "#191724",
    surface: "#1f1d2e",
    surface2: "#585B70",
    text: "#CAD3F5",
    subtext0: "#A6ADC8",
    accent: "#F5BDE6",
    accent2: "#94E2D5",
    error: "#F38BA8",
    warn: "#F9E2AF",
    info: "#89B4FA",
    success: "#A6E3A1"
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
