import { describe, expect, it } from 'vitest';
import kea from '../test/fixtures/kea.json?raw';
import { importDhcpConfiguration } from './config-import';
import { createRedactor, exportAssessment, redactConfiguration } from './redaction';

describe('createRedactor', () => {
  it('maps sensitive values deterministically while preserving family and prefix shape', () => {
    const first = createRedactor('assessment-a');
    const second = createRedactor('assessment-a');

    expect(first.redactHostname('host.internal.example.com')).toBe(second.redactHostname('host.internal.example.com'));
    expect(first.redactHostname('host.internal.example.com')).toMatch(/\.example\.com$/);
    expect(first.redactMac('0a:11:22:33:44:55')).toMatch(/^02:(?:[0-9a-f]{2}:){4}[0-9a-f]{2}$/);
    expect(first.redactIdentifier('00:04:11:22:33:44:55:66')).toMatch(/^duid-[0-9a-f]{12}$/);
    expect(first.redactText('Client 00:04:11:22:33:44:55:66')).toContain(
      first.redactIdentifier('00:04:11:22:33:44:55:66'),
    );
    expect(first.redactIpv4('10.42.7.15/24')).toMatch(/^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}\/24$/);
    expect(first.redactIpv6('fd00:1234:5678::15/64')).toMatch(/^2001:db8:[0-9a-f:]+\/64$/);
    expect(first.redactIpv4('10.42.7.15')).toBe(first.redactIpv4('10.42.7.15'));
  });
});

describe('redactConfiguration', () => {
  it('returns a deep copy, preserves repeated-value equality, and does not mutate input', () => {
    const configuration = importDhcpConfiguration({ text: kea, fileName: 'kea.json' }).configuration;
    const original = structuredClone(configuration);
    const dnsAddress = configuration.options.find(({ name }) => name === 'domain-name-servers')?.value;
    configuration.servers[0]!.address = String(dnsAddress);

    const redacted = redactConfiguration(configuration, 'deep-copy');

    expect(configuration).toEqual({ ...original, servers: [{ ...original.servers[0], address: dnsAddress }, ...original.servers.slice(1)] });
    expect(redacted).not.toBe(configuration);
    expect(redacted.servers[0]?.address).toBe(
      redacted.options.find(({ name }) => name === 'domain-name-servers')?.value,
    );
    expect(redacted.reservations[0]?.identifier).not.toBe(configuration.reservations[0]?.identifier);
    expect(redacted.ipv4Scopes[0]?.cidr).toMatch(/^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./);
    expect(redacted.ipv6Scopes[0]?.cidr).toMatch(/^2001:db8:/);
  });
});

describe('exportAssessment', () => {
  it.each(['markdown', 'json'] as const)('redacts configuration and finding text by default in %s', (format) => {
    const configuration = importDhcpConfiguration({ text: kea, fileName: 'kea.json' }).configuration;
    const findings = [{
      id: 'example',
      message: 'Review kea-client.example.com at 192.0.2.60 with 02:00:5e:10:00:02 and 00:04:00:01:02:03:04:05.',
    }];

    const exported = exportAssessment(configuration, findings, { format });

    for (const sensitive of [
      'kea-client.example.com',
      '02:00:5e:10:00:02',
      '00:04:00:01:02:03:04:05',
      '192.0.2.60',
      '2001:db8:20::50',
    ]) {
      expect(exported).not.toContain(sensitive);
    }
    expect(exported).toContain('example.com');
  });

  it('removes arbitrary client identifiers repeated in findings', () => {
    const configuration = importDhcpConfiguration({ text: kea, fileName: 'kea.json' }).configuration;
    configuration.reservations[0]!.identifierType = 'client-id';
    configuration.reservations[0]!.identifier = 'client-secret-value';

    const exported = exportAssessment(
      configuration,
      [{ message: 'Investigate client-secret-value before migration.' }],
      { format: 'json' },
    );

    expect(exported).not.toContain('client-secret-value');
    expect(exported).toMatch(/duid-[0-9a-f]{12}/);
  });

  it('redacts opaque client identifiers stored only in DHCP option 61', () => {
    const configuration = importDhcpConfiguration({ text: kea, fileName: 'kea.json' }).configuration;
    configuration.options.push({
      id: 'option-client-id',
      provenance: { format: 'kea-json', location: '$.Dhcp4.option-data[2]' },
      protocol: 'dhcpv4',
      code: 61,
      name: 'dhcp-client-identifier',
      value: 'client-only-opaque-id',
      level: 'global',
    });

    const exported = exportAssessment(configuration, [], { format: 'json' });

    expect(exported).not.toContain('client-only-opaque-id');
    expect(exported).toMatch(/duid-[0-9a-f]{12}/);
  });
});
