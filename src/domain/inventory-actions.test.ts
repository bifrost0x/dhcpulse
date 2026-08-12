import { describe, expect, it } from 'vitest';
import microsoftXml from '../test/fixtures/microsoft-dhcp.xml?raw';
import { importDhcpConfiguration } from './config-import';
import { buildConfigurationWorkspace } from './config-workspace';
import { createChangeSet } from './dhcp-change-set';
import { listInventoryActions, prepareInventoryAction } from './inventory-actions';

function workspace() {
  return buildConfigurationWorkspace(importDhcpConfiguration({ text: microsoftXml, fileName: 'export.xml' }).configuration);
}

describe('inventory actions', () => {
  it('exposes actions only for inventory kinds backed by guarded operations', () => {
    const current = workspace();
    const byKind = Object.fromEntries(current.nodes.map((node) => [node.kind, listInventoryActions(current, node).map(({ id }) => id)]));

    expect(byKind.server).toEqual(['set-server-option']);
    expect(byKind.scope).toEqual(['resize-scope-range', 'set-scope-lease', 'clone-scope']);
    expect(byKind.pool).toEqual(['resize-scope-range']);
    expect(byKind.exclusion).toEqual(['remove-exclusion']);
    expect(byKind.reservation).toEqual(['update-reservation', 'remove-reservation']);
    expect(byKind.option).toEqual(['set-option-value', 'remove-option']);
    expect(byKind.policy).toEqual([]);
    expect(byKind.failover).toEqual([]);
    expect(byKind.dhcpv6).toEqual([]);
  });

  it('prepares guarded scope range, lease, and clone operations', () => {
    const current = workspace();
    const scope = current.nodes.find(({ kind }) => kind === 'scope')!;

    const range = prepareInventoryAction(current, scope, 'resize-scope-range', createChangeSet(current), { start: '192.0.2.10', end: '192.0.2.200' });
    const lease = prepareInventoryAction(current, scope, 'set-scope-lease', createChangeSet(current), { leaseSeconds: '14400' });
    const clone = prepareInventoryAction(current, scope, 'clone-scope', createChangeSet(current), {
      cidr: '198.51.100.0/24', name: 'Branch LAN', start: '198.51.100.20', end: '198.51.100.200', leaseSeconds: '28800',
    });

    expect(range.valid).toBe(true);
    expect(range.changeSet.operations[0]).toEqual(expect.objectContaining({ kind: 'scope-range.set', after: { start: '192.0.2.10', end: '192.0.2.200' } }));
    expect(lease.valid).toBe(true);
    expect(lease.changeSet.operations[0]).toEqual(expect.objectContaining({ kind: 'scope-lease.set', afterSeconds: 14400 }));
    expect(clone.valid).toBe(true);
    expect(clone.changeSet.operations[0]).toEqual(expect.objectContaining({ kind: 'scope.clone', after: expect.objectContaining({ cidr: '198.51.100.0/24', subnetMask: '255.255.255.0' }) }));
  });

  it('does not treat one pool as the whole scope when multiple pool ranges exist', () => {
    const current = workspace();
    const pool = current.configuration.pools[0]!;
    const node = current.nodes.find(({ id }) => id === pool.id)!;
    current.configuration.pools.push({ ...pool, id: 'second-pool', start: '192.0.2.150', end: '192.0.2.180' });

    expect(listInventoryActions(current, node)).toEqual([]);
  });

  it('never exposes DHCPv4 PowerShell actions for DHCPv6 inventory objects', () => {
    const current = workspace();
    const objects = [current.configuration.pools[0]!, current.configuration.exclusions[0]!, current.configuration.reservations[0]!, current.configuration.options[0]!];
    for (const object of objects) {
      object.protocol = 'dhcpv6';
      const node = current.nodes.find(({ id }) => id === object.id)!;
      expect(listInventoryActions(current, node)).toEqual([]);
    }
  });

  it('prepares guarded removal and update operations for exclusions, reservations, and options', () => {
    const current = workspace();
    const exclusion = current.nodes.find(({ kind }) => kind === 'exclusion')!;
    const reservation = current.nodes.find(({ kind }) => kind === 'reservation')!;
    const scopeOption = current.configuration.options.find(({ code }) => code === 6)!;
    const option = current.nodes.find(({ id }) => id === scopeOption.id)!;

    const removedExclusion = prepareInventoryAction(current, exclusion, 'remove-exclusion');
    const updatedReservation = prepareInventoryAction(current, reservation, 'update-reservation', createChangeSet(current), { address: '192.0.2.60', clientId: '02-00-5E-10-00-01', hostname: 'printer-2.example.com' });
    const removedReservation = prepareInventoryAction(current, reservation, 'remove-reservation');
    const updatedOption = prepareInventoryAction(current, option, 'set-option-value', createChangeSet(current), { value: '192.0.2.53,192.0.2.54' });
    const removedOption = prepareInventoryAction(current, option, 'remove-option');

    expect(removedExclusion.valid).toBe(true);
    expect(removedExclusion.changeSet.operations[0]?.kind).toBe('exclusion.remove');
    expect(updatedReservation.valid).toBe(true);
    expect(updatedReservation.changeSet.operations[0]).toEqual(expect.objectContaining({ kind: 'reservation.update', after: expect.objectContaining({ address: '192.0.2.60', hostname: 'printer-2.example.com' }) }));
    expect(removedReservation.valid).toBe(true);
    expect(removedReservation.changeSet.operations[0]?.kind).toBe('reservation.remove');
    expect(updatedOption.valid).toBe(true);
    expect(updatedOption.changeSet.operations[0]).toEqual(expect.objectContaining({ kind: 'option.set', after: expect.objectContaining({ value: ['192.0.2.53', '192.0.2.54'] }) }));
    expect(removedOption.valid).toBe(true);
    expect(removedOption.changeSet.operations[0]?.kind).toBe('option.remove');
  });

  it('sets an existing or new server option with explicit values', () => {
    const current = workspace();
    const server = current.nodes.find(({ kind }) => kind === 'server')!;
    const globalV4 = current.configuration.options.find(({ protocol, level, code }) => protocol === 'dhcpv4' && level === 'global' && code === 15)!;
    current.configuration.options.unshift({ ...globalV4, id: 'dhcpv6-global-15', protocol: 'dhcpv6', value: 'wrong-v6-value.example' });

    const existing = prepareInventoryAction(current, server, 'set-server-option', createChangeSet(current), { optionCode: '15', value: 'corp.example' });
    const added = prepareInventoryAction(current, server, 'set-server-option', createChangeSet(current), { optionCode: '6', value: '192.0.2.53,192.0.2.54' });

    expect(existing.valid).toBe(true);
    expect(existing.changeSet.operations[0]).toEqual(expect.objectContaining({ kind: 'option.set', before: expect.objectContaining({ optionId: globalV4.id, code: 15 }), after: expect.objectContaining({ value: 'corp.example', level: 'global' }) }));
    expect(added.valid).toBe(true);
    expect(added.changeSet.operations[0]).toEqual(expect.objectContaining({ kind: 'option.set', after: expect.objectContaining({ code: 6, value: ['192.0.2.53', '192.0.2.54'], level: 'global' }) }));
  });
});
