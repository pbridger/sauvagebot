import { defineConfig } from 'vite';

// The probe (and later the real extension) is served from this directory.
// OBR loads it by URL, so during development it must be reachable over the
// network as well as from this machine: `host: true` binds all interfaces.
export default defineConfig({
  root: __dirname,
  server: {
    host: true,
    port: 5173,
    cors: true,
  },
  build: {
    outDir: '../dist-extension',
    emptyOutDir: true,
  },
});
