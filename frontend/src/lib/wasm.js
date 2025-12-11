// frontend/src/lib/wasm.js
// Uses @ffmpeg/ffmpeg to create a small waveform PNG from a short segment of audio.
// Note: ffmpeg.wasm is heavy; only use for optional features like preview waveform.
// This returns a dataURL (png) or throws.

import { createFFmpeg, fetchFile } from '@ffmpeg/ffmpeg';

const ffmpeg = createFFmpeg({ log: true });

export async function generateWaveform(streamUrl) {
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }

  // fetch a small chunk (first ~30s) to memory
  const resp = await fetch(streamUrl);
  if (!resp.ok) throw new Error('Failed to fetch stream chunk');
  const buffer = await resp.arrayBuffer();

  // write input
  ffmpeg.FS('writeFile', 'input.webm', new Uint8Array(buffer));

  // generate a 600x120 waveform PNG using ffmpeg showwavespic filter
  // Command: ffmpeg -i input.webm -filter_complex "aformat=channel_layouts=mono,showwavespic=s=600x120" -frames:v 1 out.png
  try {
    await ffmpeg.run('-i', 'input.webm', '-filter_complex', 'aformat=channel_layouts=mono,showwavespic=s=600x120', '-frames:v', '1', 'wave.png');
    const data = ffmpeg.FS('readFile', 'wave.png');
    const blob = new Blob([data.buffer], { type: 'image/png' });
    const dataURL = await new Promise((res) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.readAsDataURL(blob);
    });
    // cleanup
    try { ffmpeg.FS('unlink', 'input.webm'); } catch {}
    try { ffmpeg.FS('unlink', 'wave.png'); } catch {}
    return dataURL;
  } catch (e) {
    console.error('ffmpeg waveform error', e);
    throw e;
  }
}
