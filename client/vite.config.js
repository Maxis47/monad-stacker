import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vercel/rollup sometimes sees Node-only globals (process/global) in deps.
// These shims keep the client bundle happy during production builds.
export default defineConfig({
  plugins: [react()],

  define: {
    'process.env': {},     // prevents "process is not defined"/traceVariable errors
    global: 'window'       // some deps look for global; map it to window
  },

  build: {
    sourcemap: false,
    // Silence harmless warnings for small utility chunks
    chunkSizeWarningLimit: 1200,
    target: 'esnext'
  },

  resolve: {
    // If any dep tries to pull Node built-ins, keep it on the web path
    alias: {
      // Add more if ever needed:
      // 'buffer': 'buffer/',
      // 'util': 'util/',
      // 'events': 'events/'
    }
  },

  optimizeDeps: {
    // Ensure vite pre-bundles common ESM deps cleanly
    entries: ['src/main.jsx'],
  },
});
