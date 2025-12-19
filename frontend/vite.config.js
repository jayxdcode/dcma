import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './', // relative asset paths so dist works in subfolders
  plugins: [react()],
  server: {
    proxy: {
      "/adblock": {
        target: process.env.VITE_BACKEND_BASE,
        changeOrigin: true
        // rewrite: p => p.replace(/^\/adblock/, "")
      }
    }
  }
});
