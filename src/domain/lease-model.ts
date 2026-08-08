import type {
  ClientWave,
  LeaseEvent,
  LeaseEventKind,
  LeaseTimeline,
  ScenarioInput,
  ValidationIssue,
} from './types';

const eventKinds: LeaseEventKind[] = ['renewal', 'rebinding', 'expiry'];

export function validateScenario(input: ScenarioInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!Number.isFinite(input.leaseDurationHours) || input.leaseDurationHours <= 0) {
    issues.push({ field: 'leaseDurationHours', code: 'positive' });
  }
  if (!Number.isFinite(input.newLeaseDurationHours) || input.newLeaseDurationHours <= 0) {
    issues.push({ field: 'newLeaseDurationHours', code: 'positive' });
  }
  if (!Number.isFinite(input.t1Percent) || input.t1Percent <= 0 || input.t1Percent >= 100) {
    issues.push({ field: 't1Percent', code: 'percentage' });
  }
  if (!Number.isFinite(input.t2Percent) || input.t2Percent <= 0 || input.t2Percent >= 100) {
    issues.push({ field: 't2Percent', code: 'percentage' });
  }
  if (
    Number.isFinite(input.t1Percent) &&
    Number.isFinite(input.t2Percent) &&
    input.t1Percent >= input.t2Percent
  ) {
    issues.push({ field: 't1Percent', code: 'timingOrder' });
  }
  if (!Number.isFinite(input.clientCount) || input.clientCount < 0) {
    issues.push({ field: 'clientCount', code: 'nonNegative' });
  }
  if (!Number.isFinite(input.offlinePercent) || input.offlinePercent < 0 || input.offlinePercent > 100) {
    issues.push({ field: 'offlinePercent', code: 'range' });
  }

  return issues;
}

export function calculateLeaseTimeline(input: ScenarioInput): LeaseTimeline {
  const offsets = [
    input.leaseDurationHours * (input.t1Percent / 100),
    input.leaseDurationHours * (input.t2Percent / 100),
    input.leaseDurationHours,
  ];
  const t1Hours = offsets[0] ?? 0;
  const startsAfter = [0, (offsets[1] ?? 0) - t1Hours, input.leaseDurationHours - t1Hours];

  const events: LeaseEvent[] = eventKinds.map((kind, index) => ({
    kind,
    offsetHours: normalizeNumber(offsets[index] ?? 0),
  }));

  const waves: ClientWave[] = eventKinds.map((kind, index) => ({
    kind,
    clientsWithinFirstHour: estimateClientsWithinFirstHour(
      input.clientCount,
      startsAfter[index] ?? 0,
      t1Hours,
    ),
    startsAfterHours: normalizeNumber(startsAfter[index] ?? 0),
    allClientsByHours: normalizeNumber(offsets[index] ?? 0),
  }));

  return { events, waves };
}

function estimateClientsWithinFirstHour(
  clientCount: number,
  startsAfterHours: number,
  renewalWindowHours: number,
): number {
  if (clientCount <= 0 || renewalWindowHours <= 0 || startsAfterHours >= 1) return 0;
  const fraction = Math.min(1, Math.max(0, (1 - startsAfterHours) / renewalWindowHours));
  return Math.round(clientCount * fraction);
}

function normalizeNumber(value: number): number {
  return Number(value.toFixed(6));
}
