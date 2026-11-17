import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Extra hostnames the dev server will answer for, supplied per-run rather than
// hardcoded: VITE_ALLOWED_HOSTS=a.example,b.example npm run dev
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react()],
  // Root deployment uses "/"; GitHub Pages project sites need the repo name.
  // The manifest, icons and worker use relative paths, so only assets rebase.
  base: process.env.VITE_BASE ?? '/',
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 3001),
    strictPort: false,
    allowedHosts,
  },
  preview: {
    host: '0.0.0.0',
    port: 3001,
  },
});
