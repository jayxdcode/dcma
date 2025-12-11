// extractDominantColor(url) -> returns CSS hex string like "#aabbcc"
// Uses canvas, fast and dependency-free.
export async function extractDominantColor(imageUrl) {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const w = 64, h = 64;
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          const len = data.length;
          const counts = {};
          let maxCount = 0, dominant = [0,0,0];
          for (let i = 0; i < len; i += 4) {
            // quantize to reduce unique colors
            const r = Math.round(data[i] / 32) * 32;
            const g = Math.round(data[i+1] / 32) * 32;
            const b = Math.round(data[i+2] / 32) * 32;
            const key = `${r},${g},${b}`;
            counts[key] = (counts[key] || 0) + 1;
            if (counts[key] > maxCount) { maxCount = counts[key]; dominant = [r,g,b]; }
          }
          const hex = '#' + dominant.map(v => v.toString(16).padStart(2,'0')).join('');
          resolve(hex);
        } catch (e) { reject(e); }
      };
      img.onerror = reject;
      img.src = imageUrl;
      // cached images may not fire onload; ensure that
      if (img.complete) img.onload();
    } catch (e) { reject(e); }
  });
}
