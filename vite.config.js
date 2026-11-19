import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'node:path'

const api = `http://localhost:${process.env.PORT || 3000}`;

export default defineConfig({
  logLevel: 'error',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    proxy: { '/api': { target: api, changeOrigin: false }, '/files': { target: api } },
  },
  build: { chunkSizeWarningLimit: 4000 },
});
