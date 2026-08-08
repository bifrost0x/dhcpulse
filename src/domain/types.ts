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

export type DhcpProtocol = 'dhcpv4' | 'dhcpv6';
export type DhcpOptionValueType =
  | 'ipv4'
  | 'ipv4-list'
  | 'string'
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'boolean'
  | 'domain-search'
  | 'classless-routes'
  | 'message-type'
  | 'hex';

export interface DhcpOptionDefinition {
  protocol: DhcpProtocol;
  code: number;
  name: string;
  aliases: string[];
  valueType: DhcpOptionValueType;
  repeatable: boolean;
  description: string;
  source: string;
}

export interface DhcpOptionEntry {
  protocol: DhcpProtocol;
  code: number;
  value: unknown;
}

export interface DhcpOptionCodecResult {
  hex: string;
  value: unknown;
  displayValue: string;
  warnings: string[];
  definition?: DhcpOptionDefinition;
}

export interface DhcpOptionValidationIssue {
  key:
    | 'duplicateSingleton'
    | 'invalidValue'
    | 't1NotBeforeT2'
    | 't2NotBeforeLease'
    | 'pxeContextMissing'
    | 'classlessRouteWithoutRouter';
  severity: 'error' | 'warning' | 'info';
  protocol: DhcpProtocol;
  code?: number;
  message: string;
}

export type PxeArchitecture = 'bios-x86' | 'uefi-x86' | 'uefi-x64' | 'uefi-arm64' | 'http-x64';
export type PxeDeploymentMode = 'none' | 'wds' | 'mdt' | 'mecm';

export interface PxeAnalysisInput {
  architecture: PxeArchitecture;
  architectures?: PxeArchitecture[];
  vendorClass?: string;
  userClass?: string;
  serverAddress?: string;
  serverName?: string;
  bootFile?: string;
  proxyDhcp?: boolean;
  authoritativeBootOptions?: boolean;
  mode?: PxeDeploymentMode;
  ipxeChainload?: boolean;
  userClassPolicy?: boolean;
  globalBootFile?: boolean;
}

export interface PxeFinding {
  key:
    | 'globalBootFileMixedArchitectures'
    | 'option66Url'
    | 'httpBootRequiresUrl'
    | 'ipxeLoopRisk'
    | 'proxyDhcpWithAuthoritativeOptions'
    | 'missingServer'
    | 'missingBootFile'
    | 'directOptionsWithManagedDeployment';
  severity: 'warning' | 'info';
  message: string;
}

export interface PxeDecisionStep {
  order: number;
  key: string;
  instruction: string;
}

export interface PxeAnalysisResult {
  architectureCode: number;
  architectureCodes: number[];
  recommendedBootFileFamily: string;
  findings: PxeFinding[];
  decisionSteps: PxeDecisionStep[];
  policyExamples: {
    microsoftDhcpPowerShell: string;
    keaJson: string;
  };
  reviewNotice: string;
}
