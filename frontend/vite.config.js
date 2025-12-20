import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './', // relative asset paths so dist works in subfolders
  plugins: [react()],
  build: {
    target: 'es2022'
  }
});
