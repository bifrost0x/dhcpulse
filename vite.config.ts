import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  build: {
    modulePreload: { polyfill: false },
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](?:react|react-dom)[\\/]/, priority: 20 },
            { name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/, priority: 10 },
            { name: 'utilities', test: /src[\\/]tools[\\/]/, priority: 5 },
          ],
        },
      },
    },
  },
  plugins: [react()],
});
