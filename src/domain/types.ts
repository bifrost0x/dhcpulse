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

export interface AddressRangeInput {
  start: string;
  end: string;
}

export interface ReservationInput {
  id: string;
  address: string;
}

export interface ScopeDefinition {
  id: string;
  cidr: string;
  pool: AddressRangeInput;
  exclusions?: AddressRangeInput[];
  reservations?: ReservationInput[];
  gateway?: string;
  leases?: number;
}

export interface ScopeDesignInput {
  scopes: ScopeDefinition[];
  dailyGrowth?: number;
}

export interface ScopeFinding {
  key:
    | 'invalidCidr'
    | 'invalidPoolRange'
    | 'poolOutsideSubnet'
    | 'invalidExclusionRange'
    | 'exclusionOutsidePool'
    | 'reservationOutsideSubnet'
    | 'duplicateReservationAddress'
    | 'gatewayInDynamicPool'
    | 'overlappingScopeNetworks'
    | 'overlappingDynamicPools'
    | 'overCapacityCurrentLeases'
    | 'exhaustionWithin30Days';
  severity: Severity;
  scopeId: string;
}

export interface ScopeCapacity {
  scopeId: string;
  cidr: string | null;
  rawPoolAddresses: number;
  excludedAddresses: number;
  effectiveCapacity: number;
  uniqueInPoolReservations: number;
  currentlyUsedAddresses: number;
  utilizationPercent: number;
  remainingAddresses: number;
  exhaustionDays: number | null;
}

export interface ScopeDesignResult {
  scopes: ScopeCapacity[];
  findings: ScopeFinding[];
}
