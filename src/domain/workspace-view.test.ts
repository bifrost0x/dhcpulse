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
    const repeated = groups.find(({ ruleId }) => ruleId === 'scope-option-overrides-server');

    expect(repeated).toMatchObject({ severity: 'info', count: 24 });
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

  it('does not block a validated change because of unrelated findings already present on its target scope', () => {
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

    expect(blocked.valid).toBe(true);
    expect(evaluatePackageEligibility(workspace, blocked)).toMatchObject({ eligible: true, blockers: [] });
    expect(evaluatePackageEligibility(workspace, unaffected)).toMatchObject({ eligible: true, blockers: [] });
    expect(evaluatePackageEligibility(workspace, addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'invalid', kind: 'scope-lease.set', targetId: unaffectedScope.id,
      beforeSeconds: unaffectedScope.leaseLifetimeSeconds!, afterSeconds: 0,
    }))).toMatchObject({ eligible: false });
  });

  it('blocks a validated change that introduces a new blocker on its target scope', () => {
    const workspace = largeWorkspace();
    const scope = workspace.configuration.ipv4Scopes.find(({ name }) => name === 'Management VLAN 111')!;
    const reservation = workspace.configuration.reservations.find(({ scopeId }) => scopeId === scope.id)!;
    const valid = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'management-lease', kind: 'scope-lease.set', targetId: scope.id,
      beforeSeconds: scope.leaseLifetimeSeconds!, afterSeconds: 86400,
    });
    const result = {
      ...valid,
      preview: {
        ...valid.preview,
        reservations: [...valid.preview.reservations, {
          ...reservation,
          id: 'introduced-duplicate-reservation',
          identifier: '02:00:5e:ff:ff:ff',
        }],
      },
    };

    expect(result.valid).toBe(true);
    expect(evaluatePackageEligibility(workspace, result)).toMatchObject({
      eligible: false,
      blockers: ['target-blocker-findings'],
    });
  });

  it('assesses a cloned destination instead of unrelated findings on its source scope', () => {
    const workspace = largeWorkspace();
    const source = workspace.configuration.ipv4Scopes.find(({ name }) => name === 'Office VLAN 100')!;
    const result = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'branch-clone', kind: 'scope.clone', targetId: source.id,
      after: { cidr: '10.44.0.0/24', name: 'Branch VLAN 44', subnetMask: '255.255.255.0', start: '10.44.0.20', end: '10.44.0.200', leaseSeconds: 28800 },
    });

    expect(evaluatePackageEligibility(workspace, result)).toMatchObject({
      eligible: true,
      blockers: [],
      targetScopeIds: [],
      newScopes: [{ cidr: '10.44.0.0/24', name: 'Branch VLAN 44' }],
    });
  });

  it('permits direct package generation when a target has only unrelated pre-existing blockers', async () => {
    const workspace = largeWorkspace();
    const scope = workspace.configuration.ipv4Scopes.find(({ name }) => name === 'Office VLAN 100')!;
    const result = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'blocked-package', kind: 'scope-lease.set', targetId: scope.id,
      beforeSeconds: scope.leaseLifetimeSeconds!, afterSeconds: 86400,
    });

    await expect(generatePowerShellPackage(workspace, result, 'en', new Date('2026-08-09T00:00:00Z'))).resolves.toMatchObject({
      artifacts: expect.any(Array),
    });
  });
});
