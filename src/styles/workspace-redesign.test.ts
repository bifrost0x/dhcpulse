import { describe, expect, it, vi } from 'vitest';

async function readCss() {
  const { readFileSync } = await vi.importActual<{
    readFileSync(path: string, encoding: 'utf8'): string;
  }>('node:fs');
  return readFileSync('src/styles/app.css', 'utf8');
}

describe('business workspace layout', () => {
  it('uses the available desktop width and a four-column overview metric grid', async () => {
    const css = await readCss();
    expect(css).toMatch(/main\s*\{[^}]*max-width\s*:\s*1680px/i);
    expect(css).toMatch(/\.workspace-overview-product\s*>\s*\.workspace-metrics\s*\{[^}]*grid-template-columns\s*:\s*repeat\(4\s*,\s*minmax\(0\s*,\s*1fr\)\)/i);
  });

  it('gives overview cards business-ready spacing and readable copy', async () => {
    const css = await readCss();
    expect(css).toMatch(/\.workspace-overview-status\s*>\s*article\s*,\s*\.workspace-overview-grid\s*>\s*article\s*\{[^}]*padding\s*:\s*1\.5rem/i);
    expect(css).toMatch(/\.workspace-overview-status\s+p\s*,\s*\.workspace-overview-grid\s+p\s*\{[^}]*font-size\s*:\s*\.8rem/i);
  });

  it('separates issue controls from a wide queue and context workspace', async () => {
    const css = await readCss();
    expect(css).toMatch(/\.remediation-command-bar\s*>\s*div\s*\{[^}]*grid-column\s*:\s*1\s*\/\s*-1/i);
    expect(css).toMatch(/\.remediation-layout\s*\{[^}]*grid-template-columns\s*:\s*minmax\(620px\s*,\s*1\.08fr\)\s+minmax\(500px\s*,\s*\.92fr\)/i);
    expect(css).toMatch(/\.remediation-context\s*\{[^}]*padding\s*:\s*1\.5rem/i);
  });

  it('uses a three-pane inventory with distinct filter, result, and detail widths', async () => {
    const css = await readCss();
    expect(css).toMatch(/\.workspace-object-product\s*\{[^}]*grid-template-columns\s*:\s*minmax\(220px\s*,\s*\.55fr\)\s+minmax\(340px\s*,\s*\.8fr\)\s+minmax\(480px\s*,\s*1\.45fr\)/i);
    expect(css).toMatch(/\.workspace-object-filter-rail\s*,\s*\.workspace-object-list-pane\s*\{[^}]*padding\s*:\s*1\.5rem/i);
    expect(css).toMatch(/@media\s*\(max-width\s*:\s*980px\)\s*\{[\s\S]*?\.workspace-object-product\s*\{[^}]*grid-template-columns\s*:\s*1fr/i);
  });

  it('keeps change review and export content away from card edges', async () => {
    const css = await readCss();
    expect(css).toMatch(/\.workspace-prepared-changes\s*,\s*\.workspace-package-panel\s*\{[^}]*padding\s*:\s*1\.75rem/i);
  });
});
