import { describe, expect, it } from 'vitest';
import microsoftXml from '../test/fixtures/microsoft-dhcp.xml?raw';
import { importDhcpConfiguration } from './config-import';
import { deterministicConfigId, type DhcpConfiguration } from './config-model';
import { compareDhcpConfigurations } from './config-diff';

describe('compareDhcpConfigurations', () => {
  it('detects migration-specific scope, pool, option, failover, and reservation changes', () => {
    const before = sourceConfiguration();
    const after = structuredClone(before);
    const originalScope = after.ipv4Scopes[0]!;
    originalScope.observedLeaseCount = 30;
    after.ipv4Scopes.push({
      id: deterministicConfigId('scope', 'dhcpv4', '198.51.100.0/24'),
      provenance: { format: 'microsoft-xml', location: '/synthetic/scope[1]' },
      protocol: 'dhcpv4',
      cidr: '198.51.100.0/24',
    });
    after.pools[0]!.end = '192.0.2.40';
    after.options.find(({ code }) => code === 6)!.value = '192.0.2.54';
    after.failoverRelationships = [];
    after.reservations[0]!.scopeId = undefined;
    after.reservations[0]!.level = 'global';

    const result = compareDhcpConfigurations(before, after);

    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'added', entityType: 'scope', impact: 'info' }),
      expect.objectContaining({ kind: 'changed', entityType: 'pool', impact: 'blocker' }),
      expect.objectContaining({ kind: 'changed', entityType: 'option', impact: 'warning' }),
      expect.objectContaining({ kind: 'removed', entityType: 'failover', impact: 'blocker' }),
      expect.objectContaining({ kind: 'changed', entityType: 'reservation', impact: 'warning' }),
    ]));
    expect(result.changes.find(({ entityType }) => entityType === 'pool')?.explanation).toMatch(/observed lease count/i);
    expect(result.changes.find(({ entityType }) => entityType === 'reservation')?.explanation).toMatch(/global.*scope|scope.*global/i);
    expect(result.summary).toMatchObject({ added: 1, blockers: 2 });
  });

  it('detects lost DHCPv6 capability, changed option inheritance, DDNS behavior, and duplicate IDs', () => {
    const before = sourceConfiguration();
    const after = structuredClone(before);
    after.ipv6Scopes = [];
    const option = after.options.find(({ code }) => code === 15)!;
    option.level = 'scope';
    option.scopeId = after.ipv4Scopes[0]!.id;
    after.dnsUpdateSettings[0]!.enabled = false;
    after.ipv4Scopes.push({ ...after.ipv4Scopes[0]! });

    const result = compareDhcpConfigurations(before, after);

    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ semanticPath: 'capabilities/dhcpv6', impact: 'blocker' }),
      expect.objectContaining({ entityType: 'option', impact: 'warning', explanation: expect.stringMatching(/inheritance/i) }),
      expect.objectContaining({ entityType: 'dns-update', impact: 'warning' }),
      expect.objectContaining({ entityType: 'duplicate-identifier', impact: 'warning' }),
    ]));
  });

  it('returns deterministic ordering and redaction-safe before/after values', () => {
    const before = sourceConfiguration();
    const after = structuredClone(before);
    before.reservations[0]!.identifier = 'client-opaque-identifier';
    before.reservations[0]!.identifierType = 'client-id';
    after.reservations[0]!.identifier = 'client-opaque-identifier';
    after.reservations[0]!.identifierType = 'client-id';
    after.options.find(({ code }) => code === 6)!.value = '192.0.2.99';
    after.reservations[0]!.hostname = 'changed-sensitive.example.com';

    const first = compareDhcpConfigurations(before, after);
    const second = compareDhcpConfigurations(before, after);
    const serialized = JSON.stringify(first);

    expect(first).toEqual(second);
    expect(serialized).not.toContain('changed-sensitive.example.com');
    expect(serialized).not.toContain('printer.example.com');
    expect(serialized).not.toContain('02-00-5E-10-00-01');
    expect(serialized).not.toContain('192.0.2.99');
    expect(serialized).not.toContain('client-opaque-identifier');
  });

  it('matches repeated semantic entities as a multiset instead of by adapter metadata', () => {
    const before = sourceConfiguration();
    before.options = [
      { id: 'option-a', provenance: { format: 'microsoft-xml', location: '/a' }, protocol: 'dhcpv4', code: 222, value: 'alpha', level: 'global' },
      { id: 'option-b', provenance: { format: 'microsoft-xml', location: '/b' }, protocol: 'dhcpv4', code: 222, value: 'beta', level: 'global' },
    ];
    const after = structuredClone(before);
    after.options = [
      { ...after.options[0]!, value: 'beta' },
      { ...after.options[1]!, value: 'alpha' },
    ];

    const result = compareDhcpConfigurations(before, after);

    expect(result.changes.filter(({ entityType }) => entityType === 'option')).toEqual([]);
  });

  it('reports duplicate normalized IDs even when the duplicate count is unchanged', () => {
    const before = sourceConfiguration();
    before.ipv4Scopes.push({ ...before.ipv4Scopes[0]! });
    const after = structuredClone(before);

    const result = compareDhcpConfigurations(before, after);

    expect(result.changes).toContainEqual(expect.objectContaining({ entityType: 'duplicate-identifier' }));
  });
});

function sourceConfiguration(): DhcpConfiguration {
  return importDhcpConfiguration({ text: microsoftXml, fileName: 'export.xml' }).configuration;
}
