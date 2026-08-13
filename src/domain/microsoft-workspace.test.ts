import { describe, expect, it } from 'vitest';
import microsoftXml from '../test/fixtures/microsoft-dhcp.xml?raw';
import { importDhcpConfiguration } from './config-import';
import type { DhcpConfiguration } from './config-model';
import { buildMicrosoftWorkspace, searchWorkspace } from './microsoft-workspace';

function importedMicrosoft(): DhcpConfiguration {
  return importDhcpConfiguration({ text: microsoftXml, format: 'microsoft-xml', fileName: 'dhcp.xml' }).configuration;
}

describe('Microsoft DHCP workspace', () => {
  it('projects imported objects into deterministic relationships and capacity facts', () => {
    const configuration = importedMicrosoft();
    const first = buildMicrosoftWorkspace(configuration);
    const second = buildMicrosoftWorkspace(configuration);
    const scope = configuration.ipv4Scopes[0]!;

    expect(first.nodes).toEqual(second.nodes);
    expect(first.serverName).toBe('dhcp01.example.com');
    expect(first.summaries).toMatchObject({
      ipv4Scopes: 1,
      ipv6Scopes: 1,
      pools: 1,
      exclusions: 1,
      reservations: 1,
      options: 2,
    });
    expect(first.scopeSummaries[scope.id]).toMatchObject({
      effectiveCapacity: 91,
      remainingAddresses: 91,
      poolIds: [configuration.pools[0]!.id],
      exclusionIds: [configuration.exclusions[0]!.id],
      reservationIds: [configuration.reservations[0]!.id],
    });
    expect(first.scopeSummaries[scope.id]?.effectiveOptions.map(({ code, sourceLevel }) => ({ code, sourceLevel }))).toEqual([
      { code: 6, sourceLevel: 'scope' },
      { code: 15, sourceLevel: 'global' },
    ]);
    expect(first.nodes.find(({ id }) => id === configuration.pools[0]!.id)?.parentId).toBe(scope.id);
    expect(first.nodes.find(({ id }) => id === configuration.reservations[0]!.id)?.parentId).toBe(scope.id);
  });

  it('searches real object names, addresses, CIDRs, and option identifiers', () => {
    const workspace = buildMicrosoftWorkspace(importedMicrosoft());

    expect(searchWorkspace(workspace, 'printer').map(({ kind }) => kind)).toContain('reservation');
    expect(searchWorkspace(workspace, '192.0.2.53').map(({ kind }) => kind)).toContain('option');
    expect(searchWorkspace(workspace, '192.0.2.0/24').map(({ kind }) => kind)).toContain('scope');
    expect(searchWorkspace(workspace, 'option 6').map(({ kind }) => kind)).toContain('option');
    expect(searchWorkspace(workspace, 'not-present')).toEqual([]);
  });

  it('does not flag a Microsoft reservation merely because it is inside the distribution range', () => {
    const configuration = importedMicrosoft();
    const before = JSON.stringify(configuration);
    const workspace = buildMicrosoftWorkspace(configuration);

    expect(JSON.stringify(configuration)).toBe(before);
    expect(workspace.findings).not.toContainEqual(expect.objectContaining({
      ruleId: 'reservation-in-dynamic-pool',
    }));
  });

  it('flags a Microsoft reservation inside the subnet but outside its distribution range', () => {
    const configuration = importedMicrosoft();
    const reservation = configuration.reservations[0]!;
    reservation.address = '192.0.2.10';

    expect(buildMicrosoftWorkspace(configuration).findings).toContainEqual(expect.objectContaining({
      ruleId: 'reservation-outside-scope',
      entityIds: expect.arrayContaining([reservation.id]),
    }));
  });

  it('derives evidence-backed findings without mutating the imported configuration', () => {
    const configuration = importedMicrosoft();
    const before = JSON.stringify(configuration);
    const workspace = buildMicrosoftWorkspace(configuration);

    expect(JSON.stringify(configuration)).toBe(before);
    expect(workspace.findings).toContainEqual(expect.objectContaining({
      ruleId: 'failover-scope-membership-missing',
      severity: 'warning',
      entityIds: [configuration.failoverRelationships[0]!.id],
    }));
    expect(workspace.findings).toContainEqual(expect.objectContaining({ ruleId: 'parser-warning' }));
    expect(workspace.findings.every(({ source }) => source.startsWith('https://'))).toBe(true);
    expect(workspace.generation).toEqual({ enabled: true, reasons: [] });
  });

  it('detects duplicate identities, out-of-scope reservations, gateway collisions, and malformed address options', () => {
    const configuration = importedMicrosoft();
    const scope = configuration.ipv4Scopes[0]!;
    const reservation = configuration.reservations[0]!;
    configuration.reservations.push(
      { ...reservation, id: 'duplicate-address', identifier: '02:00:5e:10:00:02' },
      { ...reservation, id: 'duplicate-client', address: '192.0.2.51' },
      { ...reservation, id: 'outside', address: '198.51.100.10', identifier: '02:00:5e:10:00:03' },
    );
    configuration.options.push(
      {
        id: 'gateway-in-pool',
        provenance: scope.provenance,
        protocol: 'dhcpv4',
        code: 3,
        value: '192.0.2.60',
        level: 'scope',
        scopeId: scope.id,
      },
      {
        id: 'invalid-dns',
        provenance: scope.provenance,
        protocol: 'dhcpv4',
        code: 6,
        value: ['not-an-ip'],
        level: 'scope',
        scopeId: scope.id,
      },
    );

    const rules = buildMicrosoftWorkspace(configuration).findings.map(({ ruleId }) => ruleId);

    expect(rules).toContain('duplicate-reservation-address');
    expect(rules).toContain('duplicate-reservation-identifier');
    expect(rules).toContain('reservation-outside-scope');
    expect(rules).toContain('gateway-in-dynamic-pool');
    expect(rules).toContain('invalid-address-option');
  });

  it('blocks generation when explicit Microsoft target facts are unavailable', () => {
    const configuration = importedMicrosoft();
    configuration.servers = [];
    delete configuration.ipv4Scopes[0]!.startRange;
    delete configuration.ipv4Scopes[0]!.endRange;

    expect(buildMicrosoftWorkspace(configuration).generation).toEqual({
      enabled: false,
      reasons: ['server-name-missing', `scope-range-missing:${configuration.ipv4Scopes[0]!.id}`],
    });
  });
});
