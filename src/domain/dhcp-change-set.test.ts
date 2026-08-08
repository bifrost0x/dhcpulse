import { describe, expect, it } from 'vitest';
import microsoftXml from '../test/fixtures/microsoft-dhcp.xml?raw';
import { importDhcpConfiguration } from './config-import';
import {
  addChangeOperation,
  createChangeSet,
  removeChangeOperation,
  validateChangeSet,
  type DhcpChangeOperation,
} from './dhcp-change-set';
import { buildMicrosoftWorkspace } from './microsoft-workspace';

function setup() {
  const configuration = importDhcpConfiguration({ text: microsoftXml, format: 'microsoft-xml' }).configuration;
  return { configuration, workspace: buildMicrosoftWorkspace(configuration) };
}

describe('DHCP change sets', () => {
  it('creates an empty versioned set for the imported server', () => {
    const { workspace } = setup();

    expect(createChangeSet(workspace)).toEqual({ version: 1, serverName: 'dhcp01.example.com', operations: [] });
  });

  it('stages scope range and lease changes without mutating the import', () => {
    const { configuration, workspace } = setup();
    const original = JSON.stringify(configuration);
    const scope = configuration.ipv4Scopes[0]!;
    const pool = configuration.pools[0]!;
    let result = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'range-1',
      kind: 'scope-range.set',
      targetId: scope.id,
      before: { start: '192.0.2.20', end: '192.0.2.120' },
      after: { start: '192.0.2.20', end: '192.0.2.200' },
    });
    result = addChangeOperation(workspace, result.changeSet, {
      id: 'lease-1',
      kind: 'scope-lease.set',
      targetId: scope.id,
      beforeSeconds: 28_800,
      afterSeconds: 86_400,
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.preview.ipv4Scopes[0]).toMatchObject({ startRange: '192.0.2.20', endRange: '192.0.2.200', leaseLifetimeSeconds: 86_400 });
    expect(result.preview.pools.find(({ id }) => id === pool.id)).toMatchObject({ start: '192.0.2.20', end: '192.0.2.200' });
    expect(result.diff.summary.changed).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(configuration)).toBe(original);
  });

  it('adds and removes exclusions through typed before and after state', () => {
    const { configuration, workspace } = setup();
    const scope = configuration.ipv4Scopes[0]!;
    const exclusion = configuration.exclusions[0]!;
    const added = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'exclude-add',
      kind: 'exclusion.add',
      targetId: scope.id,
      after: { start: '192.0.2.100', end: '192.0.2.105' },
    });
    const removed = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'exclude-remove',
      kind: 'exclusion.remove',
      targetId: exclusion.id,
      before: { scopeId: scope.id, start: exclusion.start, end: exclusion.end },
    });

    expect(added.valid).toBe(true);
    expect(added.preview.exclusions).toContainEqual(expect.objectContaining({ start: '192.0.2.100', end: '192.0.2.105', scopeId: scope.id }));
    expect(removed.valid).toBe(true);
    expect(removed.preview.exclusions.some(({ id }) => id === exclusion.id)).toBe(false);
  });

  it('adds, updates, and removes reservations with normalized conflict checks', () => {
    const { configuration, workspace } = setup();
    const scope = configuration.ipv4Scopes[0]!;
    const reservation = configuration.reservations[0]!;
    const added = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'reservation-add',
      kind: 'reservation.add',
      targetId: scope.id,
      after: { address: '192.0.2.70', clientId: '02-00-5E-10-00-70', hostname: 'scanner.example.com' },
    });
    const updated = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'reservation-update',
      kind: 'reservation.update',
      targetId: reservation.id,
      before: { address: reservation.address, clientId: reservation.identifier!, hostname: reservation.hostname },
      after: { address: reservation.address, clientId: '02:00:5e:10:00:71', hostname: 'printer-2.example.com' },
    });
    const removed = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'reservation-remove',
      kind: 'reservation.remove',
      targetId: reservation.id,
      before: { address: reservation.address, clientId: reservation.identifier!, hostname: reservation.hostname },
    });

    expect(added.valid).toBe(true);
    expect(added.preview.reservations).toContainEqual(expect.objectContaining({ address: '192.0.2.70', identifier: '02:00:5e:10:00:70' }));
    expect(updated.valid).toBe(true);
    expect(updated.preview.reservations.find(({ id }) => id === reservation.id)).toMatchObject({ identifier: '02:00:5e:10:00:71', hostname: 'printer-2.example.com' });
    expect(removed.valid).toBe(true);
    expect(removed.preview.reservations.some(({ id }) => id === reservation.id)).toBe(false);
  });

  it('sets and removes allowlisted server and scope options', () => {
    const { configuration, workspace } = setup();
    const scope = configuration.ipv4Scopes[0]!;
    const option = configuration.options.find(({ code, scopeId }) => code === 6 && scopeId === scope.id)!;
    const set = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'option-set',
      kind: 'option.set',
      targetId: scope.id,
      before: { optionId: option.id, code: 6, value: option.value, level: 'scope' },
      after: { code: 6, value: ['192.0.2.53', '192.0.2.54'], level: 'scope' },
    });
    const remove = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'option-remove',
      kind: 'option.remove',
      targetId: option.id,
      before: { optionId: option.id, code: 6, value: option.value, level: 'scope', scopeId: scope.id },
    });

    expect(set.issues).toEqual([]);
    expect(set.valid).toBe(true);
    expect(set.preview.options.find(({ id }) => id === option.id)?.value).toEqual(['192.0.2.53', '192.0.2.54']);
    expect(remove.valid).toBe(true);
    expect(remove.preview.options.some(({ id }) => id === option.id)).toBe(false);
  });

  it('clones an IPv4 scope only when translated ranges belong to the new subnet', () => {
    const { configuration, workspace } = setup();
    const source = configuration.ipv4Scopes[0]!;
    const result = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'clone-1',
      kind: 'scope.clone',
      targetId: source.id,
      after: {
        cidr: '198.51.100.0/24',
        name: 'New office VLAN',
        subnetMask: '255.255.255.0',
        start: '198.51.100.20',
        end: '198.51.100.120',
        leaseSeconds: 28_800,
      },
    });

    expect(result.valid).toBe(true);
    expect(result.preview.ipv4Scopes).toContainEqual(expect.objectContaining({ cidr: '198.51.100.0/24', name: 'New office VLAN' }));
    expect(result.preview.pools).toContainEqual(expect.objectContaining({ start: '198.51.100.20', end: '198.51.100.120' }));
  });

  it('rejects no-ops, unsupported options, invalid ranges, conflicts, and duplicate client IDs', () => {
    const { configuration, workspace } = setup();
    const scope = configuration.ipv4Scopes[0]!;
    const operations: DhcpChangeOperation[] = [
      { id: 'noop', kind: 'scope-lease.set', targetId: scope.id, beforeSeconds: 28_800, afterSeconds: 28_800 },
      { id: 'unsupported', kind: 'option.set', targetId: scope.id, after: { code: 121, value: '0.0.0.0/0,192.0.2.1', level: 'scope' } },
      { id: 'outside', kind: 'exclusion.add', targetId: scope.id, after: { start: '198.51.100.1', end: '198.51.100.2' } },
      { id: 'duplicate-client', kind: 'reservation.add', targetId: scope.id, after: { address: '192.0.2.80', clientId: '02-00-5e-10-00-01' } },
      { id: 'range-a', kind: 'scope-range.set', targetId: scope.id, before: { start: '192.0.2.20', end: '192.0.2.120' }, after: { start: '192.0.2.20', end: '192.0.2.180' } },
      { id: 'range-b', kind: 'scope-range.set', targetId: scope.id, before: { start: '192.0.2.20', end: '192.0.2.120' }, after: { start: '192.0.2.20', end: '192.0.2.190' } },
    ];

    const result = validateChangeSet(workspace, { ...createChangeSet(workspace), operations });
    const codes = result.issues.map(({ code }) => code);

    expect(result.valid).toBe(false);
    expect(codes).toEqual(expect.arrayContaining(['no-op', 'unsupported-option', 'range-outside-scope', 'duplicate-reservation-identifier', 'operation-conflict']));
  });

  it('removes an operation and recomputes the immutable preview', () => {
    const { configuration, workspace } = setup();
    const scope = configuration.ipv4Scopes[0]!;
    const added = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'lease-remove-me',
      kind: 'scope-lease.set',
      targetId: scope.id,
      beforeSeconds: 28_800,
      afterSeconds: 86_400,
    });

    const removed = removeChangeOperation(workspace, added.changeSet, 'lease-remove-me');

    expect(removed.changeSet.operations).toEqual([]);
    expect(removed.preview.ipv4Scopes[0]?.leaseLifetimeSeconds).toBe(28_800);
    expect(removed.diff.summary.total).toBe(0);
  });
});
