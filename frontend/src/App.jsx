import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Start from './pages/Start';
import Home from './pages/Home';
import Search from './pages/Search';
import Player from './pages/Player';
import Lyrics from './pages/Lyrics';
import Activity from './pages/Activity';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">YTPlayer</h1>
        <nav className="space-x-3">
          <Link to="/" className="text-sm hover:underline">Start</Link>
          <Link to="/home" className="text-sm hover:underline">Home</Link>
          <Link to="/search" className="text-sm hover:underline">Search</Link>
          <Link to="/activity" className="text-sm hover:underline">Activity</Link>
        </nav>
      </header>

      <main className="flex-1 p-6">
        <Routes>
          <Route path="/" element={<Start />} />
          <Route path="/home" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/player" element={<Player />} />
          <Route path="/lyrics" element={<Lyrics />} />
          <Route path="/activity" element={<Activity />} />
        </Routes>
      </main>

      <footer className="p-4 text-sm text-muted-foreground text-center">
        YTPlayer — demo layout
      </footer>
    </div>
  );
}
