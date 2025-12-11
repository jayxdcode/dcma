import React, { useEffect, useRef, useState } from 'react';
import PlayerControls from '../components/PlayerControls';
import { useNavigate } from 'react-router-dom';
import { extractDominantColor } from '../lib/colorUtils';
import { generateWaveform } from '../lib/wasm';

export default function Player() {
  const [track, setTrack] = useState(null);
  const [url, setUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [themeColor, setThemeColor] = useState(null);
  const [autoTheme, setAutoTheme] = useState(false);
  const [waveformImg, setWaveformImg] = useState(null);
  const audioRef = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    const last = JSON.parse(localStorage.getItem('lastPlay') || 'null');
    if (!last) { nav('/search'); return; }
    setTrack(last);
    setUrl(`${import.meta.env.VITE_BACKEND_BASE || ''}/api/stream?url=${encodeURIComponent(last.url)}`);
    if (last.thumbnail) {
      extractDominantColor(last.thumbnail).then(color => {
        setThemeColor(color);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!url) return;
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('ended', () => setPlaying(false));
    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [url]);

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play();
    else a.pause();
  }

  async function makeWaveform() {
    if (!track) return;
    try {
      const backend = import.meta.env.VITE_BACKEND_BASE || '';
      const streamUrl = `${backend}/api/stream?url=${encodeURIComponent(track.url)}`;
      const png = await generateWaveform(streamUrl); // returns dataURL
      setWaveformImg(png);
    } catch (e) {
      console.error('waveform', e);
      alert('Waveform generation failed (wasm).');
    }
  }

  const cardStyle = autoTheme && themeColor ? { background: `linear-gradient(180deg, ${themeColor}, #020617)` } : {};

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-slate-900 p-6 rounded flex gap-6" style={cardStyle}>
        <div className="w-40 h-40 bg-gray-800 rounded" style={{backgroundImage: `url(${track?.thumbnail || ''})`, backgroundSize: 'cover'}} />
        <div className="flex-1">
          <div className="font-bold text-xl">{track?.title}</div>
          <div className="text-sm text-gray-400">{track?.artist}</div>

          <div className="mt-6">
            <PlayerControls playing={playing} onToggle={togglePlay} onNext={()=>{}} onPrev={()=>{}} onSeek={()=>{}} />
          </div>

          <div className="mt-4 flex gap-2 items-center">
            <button onClick={()=>nav('/lyrics')} className="px-3 py-1 border rounded">Lyrics</button>
            <button onClick={()=>{ navigator.clipboard.writeText(track?.url || ''); }} className="px-3 py-1 border rounded">Copy URL</button>
            <label className="ml-4 flex items-center gap-2">
              <input type="checkbox" checked={autoTheme} onChange={(e)=>setAutoTheme(e.target.checked)} />
              Auto theme from art
            </label>
            <button onClick={makeWaveform} className="px-3 py-1 border rounded">Generate Waveform (WASM)</button>
          </div>
          {waveformImg && <img src={waveformImg} alt="waveform" className="mt-4 w-full rounded" />}
        </div>
      </div>
    </div>
  );
}
