import { describe, expect, it } from 'vitest';
import dnsmasq from '../test/fixtures/dnsmasq.conf?raw';
import iscDhcpd from '../test/fixtures/isc-dhcpd.conf?raw';
import kea from '../test/fixtures/kea.json?raw';
import microsoftXml from '../test/fixtures/microsoft-dhcp.xml?raw';
import { importDhcpConfiguration } from './config-import';
import { buildConfigurationWorkspace } from './config-workspace';

const fixtures = [
  ['microsoft.xml', microsoftXml, 'microsoft-xml'],
  ['kea.json', kea, 'kea-json'],
  ['dhcpd.conf', iscDhcpd, 'isc-dhcpd'],
  ['dnsmasq.conf', dnsmasq, 'dnsmasq'],
] as const;

describe('configuration workspace', () => {
  it.each(fixtures)('builds a navigable workspace for %s', (fileName, text, format) => {
    const configuration = importDhcpConfiguration({ text, fileName }).configuration;
    const workspace = buildConfigurationWorkspace(configuration);

    expect(workspace.format).toBe(format);
    expect(workspace.vendor).toBe(configuration.metadata.vendor);
    expect(workspace.nodes.length).toBeGreaterThan(0);
    expect(workspace.summary.ipv4Scopes).toBe(configuration.ipv4Scopes.length);
    expect(workspace.coverage).toEqual({
      bounded: true,
      parserWarnings: configuration.parserWarnings.length,
      supportedObjects: workspace.nodes.length,
    });
    expect(workspace.capabilities.analysis).toBe(true);
    expect(workspace.capabilities.executableChanges).toBe(format === 'microsoft-xml');
  });

  it('builds deterministic, evidence-backed, actionable finding records', () => {
    const configuration = importDhcpConfiguration({ text: microsoftXml, fileName: 'microsoft.xml' }).configuration;
    const first = buildConfigurationWorkspace(configuration);
    const second = buildConfigurationWorkspace(configuration);

    expect(first.findings).toEqual(second.findings);
    expect(first.findings.length).toBeGreaterThan(0);
    for (const finding of first.findings) {
      expect(finding.id).toBeTruthy();
      expect(Object.keys(finding.evidence).length).toBeGreaterThan(0);
      expect(finding.impactKey).toBe(`workspace.finding.${finding.ruleId}.impact`);
      expect(finding.recommendationKey).toBe(`workspace.finding.${finding.ruleId}.recommendation`);
      expect(finding.sources.length).toBeGreaterThan(0);
      expect(finding.sources.every((source) => source.startsWith('https://'))).toBe(true);
    }
  });

  it('marks parser coverage findings as limited and uses vendor-specific sources', () => {
    const configuration = importDhcpConfiguration({ text: kea, fileName: 'kea.json' }).configuration;
    const workspace = buildConfigurationWorkspace(configuration);
    const parserFinding = workspace.findings.find(({ ruleId }) => ruleId === 'parser-warning');

    expect(parserFinding).toMatchObject({ confidence: 'limited' });
    expect(parserFinding?.sources.join(' ')).toContain('kea.readthedocs.io');
    expect(parserFinding?.sources.join(' ')).not.toContain('learn.microsoft.com');
  });

  it('sorts findings by severity and exposes a precise change capability reason', () => {
    const configuration = importDhcpConfiguration({ text: iscDhcpd, fileName: 'dhcpd.conf' }).configuration;
    const workspace = buildConfigurationWorkspace(configuration);
    const rank = { blocker: 0, warning: 1, info: 2 } as const;

    expect(workspace.findings.map(({ severity }) => rank[severity])).toEqual(
      [...workspace.findings].map(({ severity }) => rank[severity]).sort((left, right) => left - right),
    );
    expect(workspace.capabilities).toEqual({
      analysis: true,
      executableChanges: false,
      reason: 'microsoft-export-required',
    });
  });
});
