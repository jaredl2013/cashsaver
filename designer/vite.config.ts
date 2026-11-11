import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// The designer is a separate front-end that Express serves from public/designer.
// `npm run dev:designer` proxies API calls to the Express server on :3000.
export default defineConfig({
  root: __dirname,
  base: '/designer/',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../public/designer'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' }
  }
});
