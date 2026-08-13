import { describe, expect, it, vi } from 'vitest';
import { transformDevCsp } from '../../vite.config';

describe('development server CSP', () => {
  it('allows Vite style injection and HMR only in the development document', async () => {
    const { readFileSync } = await vi.importActual<{
      readFileSync(path: string, encoding: 'utf8'): string;
    }>('node:fs');
    const productionHtml = readFileSync('index.html', 'utf8');
    const developmentHtml = transformDevCsp(productionHtml);

    expect(developmentHtml).toContain("script-src 'self' 'unsafe-inline'");
    expect(developmentHtml).toContain("style-src 'self' 'unsafe-inline'");
    expect(developmentHtml).toContain("connect-src 'self' ws: wss:");
    expect(productionHtml).toContain("style-src 'self'");
    expect(productionHtml).toContain("connect-src 'none'");
    expect(productionHtml).not.toContain("'unsafe-inline'");
  });
});
