export type ScenarioType =
  | 'migration'
  | 'serverAddress'
  | 'leaseChange'
  | 'dnsChange'
  | 'emergency';

export type Verdict = 'ready' | 'caution' | 'noGo';
export type Severity = 'info' | 'warning' | 'blocker';
export type LeaseEventKind = 'renewal' | 'rebinding' | 'expiry';

export interface ScenarioInput {
  scenarioType: ScenarioType;
  leaseDurationHours: number;
  newLeaseDurationHours: number;
  t1Percent: number;
  t2Percent: number;
  clientCount: number;
  offlinePercent: number;
  sameServerAddress: boolean;
  usesRelay: boolean;
  relayUpdated: boolean;
  leasesTransferred: boolean;
  samePool: boolean;
  bothServersActive: boolean;
}

export interface ValidationIssue {
  field: keyof ScenarioInput;
  code: 'positive' | 'percentage' | 'timingOrder' | 'nonNegative' | 'range';
}

export interface LeaseEvent {
  kind: LeaseEventKind;
  offsetHours: number;
}

export interface ClientWave {
  kind: LeaseEventKind;
  clientsWithinFirstHour: number;
  startsAfterHours: number;
  allClientsByHours: number;
}

export interface LeaseTimeline {
  events: LeaseEvent[];
  waves: ClientWave[];
}

export interface Finding {
  key: string;
  severity: Severity;
}

export interface ChecklistPhase {
  phase: 'prepare' | 'cutover' | 'validate' | 'rollback';
  actionKeys: string[];
}

export interface PlanResult {
  verdict: Verdict;
  summaryKey: string;
  timeline: LeaseTimeline;
  findings: Finding[];
  checklist: ChecklistPhase[];
  rollbackKeys: string[];
  assumptionKeys: string[];
}
