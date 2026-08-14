import { describe, expect, it, vi } from 'vitest';

async function readCss() {
  const { readFileSync } = await vi.importActual<{
    readFileSync(path: string, encoding: 'utf8'): string;
  }>('node:fs');
  return readFileSync('src/styles/app.css', 'utf8');
}

describe('business workspace layout', () => {
  it('presents the entry outcomes as a spacious grid that collapses on narrow screens', async () => {
    const css = await readCss();
    expect(css).toMatch(/\.config-outcome-grid\s*\{[^}]*grid-template-columns\s*:\s*repeat\(3\s*,\s*minmax\(0\s*,\s*1fr\)\)/i);
    expect(css).toMatch(/\.config-outcome-grid\s+article\s*\{[^}]*padding\s*:\s*1\.35rem/i);
    expect(css).toMatch(/@media\s*\(max-width\s*:\s*800px\)\s*\{[\s\S]*?\.config-outcome-grid\s*\{[^}]*grid-template-columns\s*:\s*1fr/i);
  });

  it('uses a compact workspace header and a four-column overview metric grid', async () => {
    const css = await readCss();
    expect(css).toMatch(/main\s*\{[^}]*max-width\s*:\s*1680px/i);
    expect(css).toMatch(/\.configuration-workspace\s*\{[^}]*padding-top\s*:\s*1\.25rem/i);
    expect(css).toMatch(/\.workspace-session-header\s+h1\s*\{[^}]*font-size\s*:\s*clamp\(2rem\s*,\s*3vw\s*,\s*3rem\)/i);
    expect(css).toMatch(/\.workspace-overview-product\s*>\s*\.workspace-metrics\s*\{[^}]*grid-template-columns\s*:\s*repeat\(4\s*,\s*minmax\(0\s*,\s*1fr\)\)/i);
  });

  it('gives overview cards readable working copy without oversized empty cards', async () => {
    const css = await readCss();
    expect(css).toMatch(/\.workspace-start-actions\s*\{[^}]*grid-column\s*:\s*1(?:\s|;)/i);
    expect(css).toMatch(/\.workspace-overview-status\s*>\s*article\s*,\s*\.workspace-overview-grid\s*>\s*article\s*\{[^}]*padding\s*:\s*1\.5rem/i);
    expect(css).toMatch(/\.workspace-overview-status\s+p\s*,\s*\.workspace-overview-grid\s+p\s*\{[^}]*font-size\s*:\s*\.875rem/i);
    expect(css).toMatch(/\.workspace-overview-grid\s+article\s*\{[^}]*min-height\s*:\s*160px/i);
  });

  it('separates issue controls from a readable queue without nested context scrolling', async () => {
    const css = await readCss();
    expect(css).toMatch(/\.remediation-command-bar\s*>\s*div\s*\{[^}]*grid-column\s*:\s*1\s*\/\s*-1/i);
    expect(css).toMatch(/\.remediation-layout\s*\{[^}]*grid-template-columns\s*:\s*minmax\(340px\s*,\s*\.72fr\)\s+minmax\(0\s*,\s*1\.28fr\)/i);
    expect(css).toMatch(/\.remediation-queue\s*\{[^}]*gap\s*:\s*0[^}]*overflow\s*:\s*hidden[^}]*padding\s*:\s*0/i);
    expect(css).toMatch(/\.remediation-section\s*\{[^}]*border\s*:\s*0[^}]*border-radius\s*:\s*0[^}]*background\s*:\s*transparent/i);
    expect(css).toMatch(/\.remediation-context\s*\{[^}]*max-height\s*:\s*none[^}]*overflow\s*:\s*visible/i);
    expect(css).toMatch(/@media\s*\(max-width\s*:\s*700px\)\s*\{[\s\S]*?\.remediation-review-tray\s*\{[^}]*position\s*:\s*static/i);
  });

  it('stacks a bounded issue list above its separate detail pane on narrow screens', async () => {
    const css = await readCss();
    expect(css).toMatch(/@media\s*\(max-width\s*:\s*980px\)\s*\{[\s\S]*?\.remediation-layout\s*\{[^}]*grid-template-columns\s*:\s*1fr/i);
    expect(css).toMatch(/@media\s*\(max-width\s*:\s*980px\)\s*\{[\s\S]*?\.remediation-queue\s*\{[^}]*max-height\s*:\s*620px[^}]*overflow\s*:\s*auto/i);
  });

  it('uses a filter rail above a two-pane inventory and stacks it below tablet width', async () => {
    const css = await readCss();
    expect(css).toMatch(/\.workspace-object-product\s*\{[^}]*grid-template-columns\s*:\s*minmax\(340px\s*,\s*\.72fr\)\s+minmax\(0\s*,\s*1\.28fr\)/i);
    expect(css).toMatch(/\.workspace-object-filter-rail\s*\{[^}]*grid-column\s*:\s*1\s*\/\s*-1/i);
    expect(css).toMatch(/\.workspace-object-counts\s*\{[^}]*grid-template-columns\s*:\s*repeat\(5\s*,\s*minmax\(0\s*,\s*1fr\)\)/i);
    expect(css).toMatch(/\.workspace-object-filter-rail\s*,\s*\.workspace-object-list-pane\s*\{[^}]*padding\s*:\s*1\.5rem/i);
    expect(css).toMatch(/@media\s*\(max-width\s*:\s*980px\)\s*\{[\s\S]*?\.workspace-object-product\s*\{[^}]*grid-template-columns\s*:\s*1fr/i);
  });

  it('fits all five workspace destinations on phones without a horizontal scrollbar', async () => {
    const css = await readCss();
    expect(css).toMatch(/\.workspace-tab-compact\s*\{[^}]*display\s*:\s*none/i);
    expect(css).toMatch(/@media\s*\(max-width\s*:\s*700px\)\s*\{[\s\S]*?\.workspace-product-tabs\s*\{[^}]*display\s*:\s*grid[^}]*grid-template-columns\s*:\s*repeat\(5\s*,\s*minmax\(0\s*,\s*1fr\)\)[^}]*overflow\s*:\s*visible/i);
    expect(css).toMatch(/@media\s*\(max-width\s*:\s*700px\)\s*\{[\s\S]*?\.workspace-tab-wide\s*\{[^}]*display\s*:\s*none[^}]*\}[\s\S]*?\.workspace-tab-compact\s*\{[^}]*display\s*:\s*inline/i);
  });

  it('keeps workspace actions at a touch-ready minimum height', async () => {
    const css = await readCss();
    expect(css).toMatch(/\.configuration-workspace\s+button\s*,\s*\.configuration-workspace\s+a\.text-button\s*\{[^}]*min-height\s*:\s*44px/i);
  });

  it('keeps change review and export content away from card edges and groups target risk', async () => {
    const css = await readCss();
    expect(css).toMatch(/\.workspace-prepared-changes\s*,\s*\.workspace-package-panel\s*\{[^}]*padding\s*:\s*1\.75rem/i);
    expect(css).toMatch(/\.workspace-target-risk\s*\{[^}]*grid-template-columns\s*:\s*repeat\(3\s*,\s*minmax\(0\s*,\s*1fr\)\)/i);
  });
});
