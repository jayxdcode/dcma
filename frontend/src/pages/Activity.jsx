import React, { useEffect, useState } from 'react';

// The Embedded App SDK is loaded in index.html as window.DiscordEmbed (UMD).
// If you bundle the SDK, import it instead. For demo we use the UMD global.

export default function Activity() {
  const [discordSdk, setDiscordSdk] = useState(null);
  const [status, setStatus] = useState('init');
  const [audioEl, setAudioEl] = useState(null);
  const BACKEND = import.meta.env.VITE_BACKEND_BASE || '';

  useEffect(() => {
    const tryInit = async () => {
      if (!window.DiscordEmbed && !window.EmbeddedAppSDK && !window.Discord) {
        setStatus('no-sdk');
        return;
      }
      // UMD global name: DiscordEmbed or EmbeddedAppSDK (depending on version)
      const SDK = window.EmbeddedAppSDK || window.Discord || window.DiscordEmbed;
      try {
        const sdk = new SDK({ clientId: import.meta.env.VITE_DISCORD_CLIENT_ID });
        await sdk.ready();
        setDiscordSdk(sdk);
        setStatus('ready');
      } catch (e) {
        console.error('SDK init failed', e);
        setStatus('failed');
      }
    };
    tryInit();
  }, []);

  async function handlePlay(trackUrl) {
    // Must be called by user gesture
    try {
      setStatus('playing');
      const audio = new Audio(`${BACKEND}/api/stream?url=${encodeURIComponent(trackUrl)}`);
      audio.crossOrigin = 'anonymous';
      audio.autoplay = true;
      await audio.play();
      setAudioEl(audio);
      // Discord should capture iframe audio of Activity (client-dependent).
    } catch (e) {
      console.error('play failed', e);
      alert('Cannot autoplay. Please tap again to start audio.');
    }
  }

  // Grab lastPlay from localStorage for testing
  const last = JSON.parse(localStorage.getItem('lastPlay') || 'null');
  const exampleUrl = last?.url || '';

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-slate-900 p-6 rounded">
        <h2 className="text-xl font-bold mb-2">Discord Activity Player</h2>
        <p className="text-sm text-gray-400 mb-4">This page is meant to be opened inside a Discord Activity iframe. Click Play (user gesture required) to let Discord capture the audio.</p>
        <div className="flex gap-3">
          <button disabled={!exampleUrl} onClick={()=>handlePlay(exampleUrl)} className="px-4 py-2 bg-orange-500 rounded">
            Play in Activity
          </button>
          <button onClick={()=>{ audioEl?.pause(); setStatus('paused'); }} className="px-4 py-2 border rounded">Pause</button>
        </div>
        <div className="mt-4">
          <div>Status: {status}</div>
          <div className="mt-2 text-sm text-gray-400">Track: {last?.title || '—'}</div>
        </div>
      </div>
    </div>
  );
}
