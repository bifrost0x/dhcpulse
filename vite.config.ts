import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

export function transformDevCsp(html: string) {
  return html
    .replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
    .replace("style-src 'self';", "style-src 'self' 'unsafe-inline';")
    .replace("connect-src 'none';", "connect-src 'self' ws: wss:;");
}

const developmentCspPlugin: Plugin = {
  name: 'dhcpulse-development-csp',
  apply: 'serve',
  transformIndexHtml: transformDevCsp,
};

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
  plugins: [react(), developmentCspPlugin],
});
