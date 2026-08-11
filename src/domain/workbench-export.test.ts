import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWorkbenchReport, downloadWorkbenchReport } from './workbench-export';

const reportInput = {
  toolId: 'config-analyzer',
  toolName: 'Configuration analyzer',
  generatedAt: '2026-08-08T10:00:00.000Z',
  inputs: { scopes: 1, auditLoggingConfigured: false },
  findings: [
    { severity: 'warning' as const, title: 'Review reservation', detail: 'lab-sensitive.example.test' },
  ],
  assumptions: ['Static review only'],
  sources: [{ label: 'Kea ARM', url: 'https://kea.readthedocs.io/' }],
  sensitiveValues: ['lab-sensitive.example.test'],
};

describe('buildWorkbenchReport', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('builds deterministic Markdown and JSON with redaction and a privacy note', () => {
    const first = buildWorkbenchReport(reportInput);
    const second = buildWorkbenchReport({ ...reportInput, inputs: { auditLoggingConfigured: false, scopes: 1 } });

    expect(first).toEqual(second);
    expect(first.markdown).toContain('# Configuration analyzer');
    expect(first.markdown).toContain('Redaction: enabled');
    expect(first.markdown).toContain('Processed locally; no data was uploaded.');
    expect(first.markdown).not.toContain('lab-sensitive.example.test');
    expect(JSON.parse(first.json)).toMatchObject({ tool: { id: 'config-analyzer' }, redaction: 'enabled' });
    expect(first.json).not.toContain('lab-sensitive.example.test');
  });

  it('redacts opaque caller-designated values from every output field', () => {
    const opaque = 'PXE_CLASS_Q7Z-private-value';
    const report = buildWorkbenchReport({
      ...reportInput,
      inputs: { architectureCount: 2 },
      findings: [{ severity: 'warning', title: `Review ${opaque}`, detail: opaque }],
      assumptions: [`Do not expose ${opaque}`],
      sensitiveValues: [opaque],
    });

    expect(report.markdown).not.toContain(opaque);
    expect(report.json).not.toContain(opaque);
    expect(report.markdown).toContain('[redacted]');
  });

  it('never exports an arbitrary raw DHCPv6 input string even when a JavaScript caller omits it from sensitive values', () => {
    const opaque = 'DHCPV6_PRIVATE_Q7Z_VALUE';
    const report = buildWorkbenchReport({
      ...reportInput,
      inputs: { relayLinkAddress: opaque } as never,
      findings: [],
      sensitiveValues: [],
    });

    expect(report.markdown).not.toContain(opaque);
    expect(report.json).not.toContain(opaque);
    expect(report.markdown).toContain('[redacted]');
  });

  it('localizes report headings and the privacy declaration in German', () => {
    const report = buildWorkbenchReport({ ...reportInput, locale: 'de' });

    expect(report.markdown).toContain('## Eingabezusammenfassung');
    expect(report.markdown).toContain('## Datenschutz');
    expect(report.markdown).toContain('Lokal verarbeitet; es wurden keine Daten hochgeladen.');
    expect(report.markdown).toContain('[WARNUNG]');
    expect(report.markdown).not.toContain('[WARNING]');
    expect(JSON.parse(report.json).privacy).toContain('keine Daten hochgeladen');
  });

  it('creates and clicks one object URL before deferring revocation', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:workbench-report');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    downloadWorkbenchReport('report', 'report.md', 'text/markdown');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:workbench-report');
  });
});
