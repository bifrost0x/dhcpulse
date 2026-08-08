import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  build: {
    modulePreload: { polyfill: false },
  },
  plugins: [react()],
});
