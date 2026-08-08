import { describe, expect, it } from 'vitest';
import { defaultScenario } from './defaults';
import { buildPlan } from './planner';

describe('buildPlan verdict rules', () => {
  it.each([
    [
      'two active servers sharing a pool',
      { bothServersActive: true, samePool: true },
      'livePoolOverlap',
    ],
    [
      'a relay that still targets the old server',
      { usesRelay: true, relayUpdated: false },
      'relayNotUpdated',
    ],
    [
      'a reused pool without transferred leases',
      { samePool: true, leasesTransferred: false },
      'leasesMissingForSharedPool',
    ],
  ] as const)('blocks %s', (_label, changes, findingKey) => {
    const result = buildPlan({ ...defaultScenario, ...changes });

    expect(result.verdict).toBe('noGo');
    expect(result.findings).toContainEqual({ key: findingKey, severity: 'blocker' });
  });

  it('marks a same-address migration with transferred leases as ready', () => {
    const result = buildPlan(defaultScenario);

    expect(result.verdict).toBe('ready');
    expect(result.findings.some((finding) => finding.severity === 'blocker')).toBe(false);
  });

  it('warns that clients depend on rebinding when the service address changes', () => {
    const result = buildPlan({ ...defaultScenario, sameServerAddress: false });

    expect(result.verdict).toBe('caution');
    expect(result.findings).toContainEqual({ key: 'newServerAddress', severity: 'warning' });
  });

  it('keeps returning offline clients visible as a residual risk', () => {
    const result = buildPlan({ ...defaultScenario, offlinePercent: 30 });

    expect(result.verdict).toBe('caution');
    expect(result.findings).toContainEqual({ key: 'offlineClients', severity: 'warning' });
    expect(result.assumptionKeys).toContain('offlineEstimate');
  });

  it('explains that a shorter target lease does not change existing leases', () => {
    const result = buildPlan({
      ...defaultScenario,
      scenarioType: 'leaseChange',
      newLeaseDurationHours: 24,
    });

    expect(result.findings).toContainEqual({ key: 'leaseChangeNotRetroactive', severity: 'info' });
    expect(result.checklist.find((phase) => phase.phase === 'prepare')?.actionKeys).toContain(
      'stageLeaseReduction',
    );
  });
});

describe('buildPlan actions', () => {
  it('adds relay actions only for relayed networks and never duplicates actions', () => {
    const result = buildPlan({
      ...defaultScenario,
      usesRelay: true,
      relayUpdated: true,
    });
    const allActions = result.checklist.flatMap((phase) => phase.actionKeys);

    expect(allActions).toContain('verifyRelayPath');
    expect(new Set(allActions).size).toBe(allActions.length);
  });

  it('uses a separate-pool warning when leases are not transferred without collision risk', () => {
    const result = buildPlan({
      ...defaultScenario,
      samePool: false,
      leasesTransferred: false,
    });

    expect(result.verdict).toBe('caution');
    expect(result.findings).toContainEqual({ key: 'temporaryPoolCapacity', severity: 'warning' });
  });

  it.each(['dnsChange', 'leaseChange'] as const)(
    'does not apply server replacement blockers or service restart actions to %s',
    (scenarioType) => {
      const result = buildPlan({
        ...defaultScenario,
        scenarioType,
        leasesTransferred: false,
        bothServersActive: true,
        usesRelay: true,
        relayUpdated: false,
      });
      const actions = result.checklist.flatMap((phase) => phase.actionKeys);

      expect(result.findings.some((finding) => finding.severity === 'blocker')).toBe(false);
      expect(actions).not.toContain('stopOldService');
      expect(actions).not.toContain('startTargetService');
      expect(actions).not.toContain('applyRelayTarget');
      expect(result.rollbackKeys).toContain('restorePreviousConfiguration');
      expect(result.rollbackKeys).not.toContain('restoreRelayTarget');
    },
  );
});
