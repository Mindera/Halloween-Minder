import { defineConfig } from 'vite';

// Relative base so the same build works on GitHub Pages (/Halloween-Minder/) and inside the Capacitor WebView.
export default defineConfig({
  base: './',
  // When this build was made, shown at the bottom of Settings as the last release.
  define: { __RELEASE__: JSON.stringify(new Date().toISOString()) },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    target: 'es2020',
  },
});
