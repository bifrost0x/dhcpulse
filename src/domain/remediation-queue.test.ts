import { describe, expect, it } from 'vitest';
import largeMicrosoftXml from '../../samples/microsoft-dhcp-realistic-large.xml?raw';
import { importDhcpConfiguration } from './config-import';
import { buildConfigurationWorkspace } from './config-workspace';
import { addChangeOperation, createChangeSet } from './dhcp-change-set';
import { prepareFindingAction } from './finding-actions';
import {
  buildRemediationContext,
  buildRemediationQueue,
  countPreparedRemediationOccurrences,
  summarizeTargetRisk,
} from './remediation-queue';

function largeWorkspace() {
  return buildConfigurationWorkspace(importDhcpConfiguration({
    text: largeMicrosoftXml,
    format: 'microsoft-xml',
    fileName: 'large.xml',
  }).configuration);
}

describe('remediation queue', () => {
  it('turns repeated findings into a complete, operationally ordered work queue', () => {
    const workspace = largeWorkspace();
    const queue = buildRemediationQueue(workspace);

    expect(queue.sections['act-now'].map(({ ruleId }) => ruleId)).toEqual([
      'reservation-outside-scope',
      'duplicate-reservation-address',
      'duplicate-reservation-identifier',
      'invalid-address-option',
      'reservation-in-dynamic-pool',
      'gateway-in-dynamic-pool',
      'scope-option-overrides-server',
    ]);
    expect(queue.sections.review.map(({ ruleId }) => ruleId)).toContain('failover-scope-membership-missing');
    expect(queue.sections.observe.map(({ ruleId }) => ruleId)).not.toContain('scope-option-overrides-server');
    expect(queue.totals['act-now']).toBeGreaterThan(queue.sections['act-now'].length);
  });

  it('preserves more than one UI page of distinct work groups', () => {
    const workspace = largeWorkspace();
    const seed = workspace.findings.find(({ severity }) => severity === 'warning')!;
    const expanded = {
      ...workspace,
      findings: Array.from({ length: 60 }, (_, index) => ({ ...seed, id: `page-${index}`, ruleId: `page-rule-${index}` })),
    };

    expect(buildRemediationQueue(expanded).sections.review).toHaveLength(60);
  });

  it('tracks prepared occurrences without hiding the remaining work', () => {
    const workspace = largeWorkspace();
    const finding = workspace.findings.find(({ ruleId }) => ruleId === 'reservation-in-dynamic-pool')!;
    const result = prepareFindingAction(workspace, finding, finding.actionId!, createChangeSet(workspace));
    const item = buildRemediationQueue(workspace, result).sections['act-now']
      .find(({ ruleId }) => ruleId === finding.ruleId)!;

    expect(item).toMatchObject({ affectedCount: 298, preparedCount: 1, actionable: true });
    const preparedScopeId = workspace.configuration.reservations.find(({ id }) => finding.entityIds.includes(id))?.scopeId;
    const otherScopeId = workspace.configuration.ipv4Scopes.find(({ id }) => id !== preparedScopeId)!.id;
    expect(countPreparedRemediationOccurrences(workspace, item, result, preparedScopeId)).toBe(1);
    expect(countPreparedRemediationOccurrences(workspace, item, result, otherScopeId)).toBe(0);
  });

  it('preserves occurrence, scope, relationship, and provenance context', () => {
    const workspace = largeWorkspace();
    const item = buildRemediationQueue(workspace).sections['act-now']
      .find(({ ruleId }) => ruleId === 'reservation-in-dynamic-pool')!;
    const context = buildRemediationContext(workspace, item, 0);

    expect(context.occurrenceCount).toBe(298);
    expect(context.scopeId).toBeTruthy();
    expect(context.scopeLabel).toBeTruthy();
    expect(context.entityIds.length).toBeGreaterThan(0);
    expect(context.finding.sources[0]).toMatch(/^https:/);
    expect(context.relatedFindingIds).not.toContain(context.finding.id);
  });

  it('limits occurrence context to the selected scope', () => {
    const workspace = largeWorkspace();
    const office = workspace.configuration.ipv4Scopes.find(({ name }) => name === 'Office VLAN 100')!;
    const item = buildRemediationQueue(workspace).sections['act-now']
      .find(({ ruleId }) => ruleId === 'reservation-in-dynamic-pool')!;
    const context = buildRemediationContext(workspace, item, 0, office.id);

    expect(context.scopeId).toBe(office.id);
    expect(context.scopeLabel).toBe('Office VLAN 100');
    expect(context.occurrenceCount).toBe(24);
    expect(context.relatedFindingIds.length).toBeGreaterThan(0);
  });

  it('summarizes exact package risk by target scope and rule', () => {
    const workspace = largeWorkspace();
    const finding = workspace.findings.find(({ ruleId }) => ruleId === 'reservation-in-dynamic-pool')!;
    const result = prepareFindingAction(workspace, finding, finding.actionId!, createChangeSet(workspace));
    const risk = summarizeTargetRisk(workspace, result);

    expect(risk.targetScopeIds).toHaveLength(1);
    expect(risk.warningRules).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: 'reservation-in-dynamic-pool', count: expect.any(Number) }),
    ]));
    expect(risk.blockerRules.every(({ count }) => count > 0)).toBe(true);
  });

  it('attributes a multi-scope finding to every affected package target', () => {
    const workspace = largeWorkspace();
    const duplicate = workspace.findings.find(({ ruleId }) => ruleId === 'duplicate-reservation-identifier')!;
    const affectedScopes = duplicate.entityIds.flatMap((id) => {
      const reservation = workspace.configuration.reservations.find((item) => item.id === id);
      return reservation?.scopeId ? [reservation.scopeId] : [];
    });
    const target = workspace.configuration.ipv4Scopes.find(({ id }) => id === affectedScopes.at(-1))!;
    const result = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'target-second-scope', kind: 'scope-lease.set', targetId: target.id,
      beforeSeconds: target.leaseLifetimeSeconds!, afterSeconds: 86400,
    });

    expect(summarizeTargetRisk(workspace, result).blockerRules).toContainEqual({
      ruleId: 'duplicate-reservation-identifier', count: 1,
    });
  });
});
