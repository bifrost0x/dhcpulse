import { describe, expect, it } from 'vitest';
import largeMicrosoftXml from '../../samples/microsoft-dhcp-realistic-large.xml?raw';
import { importDhcpConfiguration } from './config-import';
import { addChangeOperation, createChangeSet } from './dhcp-change-set';
import { buildMicrosoftWorkspace } from './microsoft-workspace';
import { generatePowerShellPackage } from './powershell-package';
import {
  buildScopeWorkspaceRows,
  evaluatePackageEligibility,
  groupWorkspaceFindings,
  pageWorkspaceItems,
  searchWorkspaceObjects,
} from './workspace-view';

function largeWorkspace() {
  const configuration = importDhcpConfiguration({ text: largeMicrosoftXml, format: 'microsoft-xml', fileName: 'large.xml' }).configuration;
  return buildMicrosoftWorkspace(configuration);
}

describe('scope-first workspace selectors', () => {
  it('summarizes a large estate without emitting object rows', () => {
    const rows = buildScopeWorkspaceRows(largeWorkspace());

    expect(rows).toHaveLength(12);
    expect(rows.reduce((total, row) => total + row.reservations, 0)).toBe(300);
    expect(rows[0]!.findings.blocker).toBeGreaterThan(0);
    expect(rows.at(-1)!.findings.blocker).toBe(0);
  });

  it('groups repeated findings and resolves their affected scopes', () => {
    const groups = groupWorkspaceFindings(largeWorkspace());
    const repeated = groups.find(({ ruleId }) => ruleId === 'reservation-in-dynamic-pool');

    expect(repeated).toMatchObject({ severity: 'warning', count: 298 });
    expect(repeated?.scopeIds).toHaveLength(12);
    expect(groups.filter(({ severity }) => severity === 'blocker').length).toBeGreaterThan(0);
  });

  it('clamps accessible pages to the available item range', () => {
    const items = Array.from({ length: 125 }, (_, index) => index + 1);

    expect(pageWorkspaceItems(items, 1, 50)).toMatchObject({ page: 1, pageCount: 3, total: 125, items: items.slice(0, 50) });
    expect(pageWorkspaceItems(items, 3, 50).items).toEqual(items.slice(100));
    expect(pageWorkspaceItems(items, 99, 50).page).toBe(3);
  });

  it('returns global object matches with their owning scope context', () => {
    const workspace = largeWorkspace();
    const result = searchWorkspaceObjects(workspace, 'device-250');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'reservation', label: 'device-250.lab.example' });
    expect(workspace.configuration.ipv4Scopes.find(({ id }) => id === result[0]!.scopeId)?.name).toBe('Training VLAN 109');
  });

  it('blocks only package targets affected by blocker findings', () => {
    const workspace = largeWorkspace();
    const blockedScope = workspace.configuration.ipv4Scopes.find(({ name }) => name === 'Office VLAN 100')!;
    const unaffectedScope = workspace.configuration.ipv4Scopes.find(({ name }) => name === 'Cameras VLAN 107')!;
    const blocked = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'office-lease', kind: 'scope-lease.set', targetId: blockedScope.id,
      beforeSeconds: blockedScope.leaseLifetimeSeconds!, afterSeconds: 86400,
    });
    const unaffected = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'camera-lease', kind: 'scope-lease.set', targetId: unaffectedScope.id,
      beforeSeconds: unaffectedScope.leaseLifetimeSeconds!, afterSeconds: 86400,
    });

    expect(evaluatePackageEligibility(workspace, blocked)).toMatchObject({ eligible: false });
    expect(evaluatePackageEligibility(workspace, blocked).blockers).toContain('target-blocker-findings');
    expect(evaluatePackageEligibility(workspace, unaffected)).toMatchObject({ eligible: true, blockers: [] });
    expect(evaluatePackageEligibility(workspace, addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'invalid', kind: 'scope-lease.set', targetId: unaffectedScope.id,
      beforeSeconds: unaffectedScope.leaseLifetimeSeconds!, afterSeconds: 0,
    }))).toMatchObject({ eligible: false });
  });

  it('refuses direct package generation for a blocked target', async () => {
    const workspace = largeWorkspace();
    const scope = workspace.configuration.ipv4Scopes.find(({ name }) => name === 'Office VLAN 100')!;
    const result = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'blocked-package', kind: 'scope-lease.set', targetId: scope.id,
      beforeSeconds: scope.leaseLifetimeSeconds!, afterSeconds: 86400,
    });

    await expect(generatePowerShellPackage(workspace, result, 'en', new Date('2026-08-09T00:00:00Z'))).rejects.toThrow('eligible');
  });
});
