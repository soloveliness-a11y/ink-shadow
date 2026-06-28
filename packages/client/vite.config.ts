import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { lingui } from '@lingui/vite-plugin';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

function excludeBgmFromDist() {
  return {
    name: 'exclude-bgm-from-dist',
    closeBundle() {
      rmSync(resolve(__dirname, 'dist/audio/bgm'), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: [
    lingui(),
    react({
      babel: {
        plugins: ['@lingui/babel-plugin-lingui-macro'],
      },
    }),
    excludeBgmFromDist(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-zustand': ['zustand'],
        },
      },
    },
  },
});
