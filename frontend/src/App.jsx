// src/App.jsx
import { useState, Suspense, lazy, memo } from 'react';
import { Routes, Route } from 'react-router-dom';
import TopBar from './components/TopBar';
import BottomNavBar from './components/BottomNavBar';
import Player from './components/Player';
import { PlayerProvider } from './lib/playerContext';
import ProgressBar from './components/ProgressBar';

// lazy pages (code-split)
const Home = lazy(() => import('./pages/Home'));
const Search = lazy(() => import('./pages/Search'));
const LyricsPage = lazy(() => import('./pages/Lyrics'));
const About = lazy(() => import('./pages/About'));
const Settings = lazy(() => import('./pages/Settings'));

// lazy player full to avoid initial bundle cost
const PlayerFull = lazy(() => import('./pages/PlayerFull'));

// memoize top/bottom bars to avoid re-renders when props are stable
const MemoTopBar = memo(TopBar);
const MemoBottomNav = memo(BottomNavBar);

export default function App({ palette, setPalette, presets, selectedPresetKey, setThemeByKey }){
  const [isPlayerOpen, setPlayerOpen] = useState(false);

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

        {/* PlayerFull is lazy: only loaded when open or navigated to */}
        <Suspense fallback={null}>
          {isPlayerOpen && (
            <PlayerFull
              open={isPlayerOpen}
              onClose={() => setPlayerOpen(false)}
            />
          )}
        </Suspense>

        {/* Small persistent player component (should be light) */}
        <Player onOpen={() => setPlayerOpen(true)} />

        <MemoBottomNav />
      </div>
    </PlayerProvider>
  );
}
