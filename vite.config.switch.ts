import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dedicated Vite build configuration for Nintendo Switch WebKit runtime
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-switch',
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/switch-[name]-[hash].js',
        chunkFileNames: 'assets/switch-[name]-[hash].js',
        assetFileNames: 'assets/switch-[name]-[hash].[ext]',
      },
    },
  },
  server: {
    host: true,
    port: 3000,
  },
});
