import { calculateLeaseTimeline } from './lease-model';
import type {
  ChecklistPhase,
  Finding,
  PlanResult,
  ScenarioInput,
  Severity,
  Verdict,
} from './types';

const severityRank: Record<Severity, number> = {
  blocker: 0,
  warning: 1,
  info: 2,
};

export function buildPlan(input: ScenarioInput): PlanResult {
  const findings: Finding[] = [];
  const assumptions = new Set<string>(['uniformRenewalSchedule', 'clientBehaviorVaries']);
  const replacesServer = ['migration', 'serverAddress', 'emergency'].includes(input.scenarioType);

  if (replacesServer && input.bothServersActive && input.samePool) {
    findings.push({ key: 'livePoolOverlap', severity: 'blocker' });
  }
  if (replacesServer && input.usesRelay && !input.relayUpdated) {
    findings.push({ key: 'relayNotUpdated', severity: 'blocker' });
  }
  if (replacesServer && !input.leasesTransferred && input.samePool) {
    findings.push({ key: 'leasesMissingForSharedPool', severity: 'blocker' });
  }
  if (replacesServer && !input.sameServerAddress) {
    findings.push({ key: 'newServerAddress', severity: 'warning' });
  }
  if (replacesServer && !input.samePool && !input.leasesTransferred) {
    findings.push({ key: 'temporaryPoolCapacity', severity: 'warning' });
  }
  if (input.offlinePercent > 0) {
    findings.push({ key: 'offlineClients', severity: 'warning' });
    assumptions.add('offlineEstimate');
  }
  if (input.scenarioType === 'leaseChange') {
    findings.push({ key: 'leaseChangeNotRetroactive', severity: 'info' });
  }
  if (input.scenarioType === 'dnsChange') {
    findings.push({ key: 'optionChangeOnRenewal', severity: 'info' });
  }
  if (input.scenarioType === 'emergency') {
    findings.push({ key: 'emergencyRecovery', severity: 'warning' });
  }

  findings.sort((left, right) => severityRank[left.severity] - severityRank[right.severity]);

  const verdict = resolveVerdict(findings);
  const checklist = buildChecklist(input);

  return {
    verdict,
    summaryKey: `summary.${verdict}`,
    timeline: calculateLeaseTimeline(input),
    findings,
    checklist,
    rollbackKeys: replacesServer
      ? ['keepOldServiceRecoverable', 'restoreRelayTarget', 'validateRollbackClients']
      : ['restorePreviousConfiguration', 'validateRollbackClients'],
    assumptionKeys: [...assumptions],
  };
}

function resolveVerdict(findings: Finding[]): Verdict {
  if (findings.some((finding) => finding.severity === 'blocker')) return 'noGo';
  if (findings.some((finding) => finding.severity === 'warning')) return 'caution';
  return 'ready';
}

function buildChecklist(input: ScenarioInput): ChecklistPhase[] {
  const used = new Set<string>();
  const unique = (keys: string[]) =>
    keys.filter((key) => {
      if (used.has(key)) return false;
      used.add(key);
      return true;
    });

  const replacesServer = ['migration', 'serverAddress', 'emergency'].includes(input.scenarioType);
  const prepare = ['captureScopeOptions', 'backupConfiguration'];
  const cutover = ['freezeDhcpChanges'];

  if (replacesServer) {
    prepare.push('verifyTargetService');
    if (input.leasesTransferred) prepare.push('verifyLeaseTransfer');
    if (input.usesRelay) prepare.push('verifyRelayPath');
    cutover.push('stopOldService', 'startTargetService');
    if (input.usesRelay) cutover.push('applyRelayTarget');
  } else if (input.scenarioType === 'leaseChange') {
    prepare.push('stageLeaseReduction');
    cutover.push('applyLeaseChange');
  } else {
    cutover.push('applyOptionChange');
  }

  return [
    { phase: 'prepare', actionKeys: unique(prepare) },
    { phase: 'cutover', actionKeys: unique(cutover) },
    {
      phase: 'validate',
      actionKeys: unique(['testRenewal', 'testNewClient', 'monitorDhcpTraffic', 'verifyOptions']),
    },
    {
      phase: 'rollback',
      actionKeys: unique(['defineRollbackTrigger', replacesServer ? 'retainOldServiceState' : 'retainPreviousConfiguration']),
    },
  ];
}
