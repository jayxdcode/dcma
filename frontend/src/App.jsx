// src/App.jsx
import { Suspense, lazy, memo } from 'react';
import { Routes, Route } from 'react-router-dom';
import TopBar from './components/TopBar';
import BottomNavBar from './components/BottomNavBar';
import Player from './components/Player';
import { PlayerProvider } from './context/PlayerContext';
import ProgressBar from './components/ProgressBar';

// lazy pages (code-split)
const Home = lazy(() => import('./pages/Home'));
const Search = lazy(() => import('./pages/Search'));
const LyricsPage = lazy(() => import('./pages/Lyrics'));
const About = lazy(() => import('./pages/About'));
const Settings = lazy(() => import('./pages/Settings'));
const Album = lazy(() => import('./pages/Album'));
const Playlist = lazy(() => import('./pages/Playlist'));
const History = lazy(() => import('./pages/History'));

// memoize top/bottom bars to avoid re-renders when props are stable
const MemoTopBar = memo(TopBar);
const MemoBottomNav = memo(BottomNavBar);

export default function App({ palette, setPalette, presets, selectedPresetKey, setThemeByKey }){
  return (
    <PlayerProvider>
      <div className="app-shell" aria-label="Hitori App">
        <MemoTopBar
          palette={palette}
          setPalette={setPalette}
          presets={presets}
          selectedPresetKey={selectedPresetKey}
          setThemeByKey={setThemeByKey}
        />

        <ProgressBar />

        <main className="app-main">
          {/* Suspense fallback is minimal; the ProgressBar above shows top loading */}
          <Suspense fallback={<div aria-hidden style={{minHeight: 200}} />}>
            <Routes>
              <Route path="/" element={<Home/>} />
              <Route path="/search" element={<Search/>} />
              <Route path="/lyrics" element={<LyricsPage/>} />
              <Route path="/album/:albumId" element={<Album/>} />
              <Route path="/playlist/:playlistId" element={<Playlist/>} />
              <Route path="/history" element={<History/>} />
              {/* keep /player route commented unless you want it routed */}
              <Route path="/about" element={<About/>} />
              <Route path="/settings" element={
                <Settings
                  selectedPresetKey={selectedPresetKey}
                  setThemeByKey={setThemeByKey}
                  presets={presets}
                />
              } />
            </Routes>
          </Suspense>
        </main>

        {/* Small persistent player component (should be light) */}
        <Player />

        <MemoBottomNav />
      </div>
    </PlayerProvider>
  );
}
