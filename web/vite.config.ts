import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served by the Express backend: HTML at /feed/:steamId, assets under
// /feed-app/. The base path makes asset URLs resolve regardless of the
// /feed/<steamId> route depth.
export default defineConfig({
  plugins: [react()],
  base: '/feed-app/',
  build: {
    outDir: '../src/views/feed-app',
    emptyOutDir: true,
  },
});
