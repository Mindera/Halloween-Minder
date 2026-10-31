import { defineConfig } from 'vite';

// Relative base so the same build works on GitHub Pages (/Halloween-Minder/) and inside the Capacitor WebView.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    target: 'es2020',
  },
});
