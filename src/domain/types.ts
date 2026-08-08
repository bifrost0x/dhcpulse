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

export interface ExplainableFinding<Id extends string = string> {
  id: Id;
  severity: Severity;
  rationale: string;
  evidence: string[];
  source: string;
}

export type WindowsFailoverMode = 'load-balance' | 'hot-standby';
export type Readiness = 'ready' | 'caution' | 'no-go';

export interface WindowsFailoverInput {
  mode: WindowsFailoverMode;
  mcltMinutes: number;
  stateSwitchoverMinutes: number;
  partnerReachable: boolean;
  clientsReachBothPartners: boolean;
  tcp647Allowed: boolean;
  clockSkewSeconds: number;
  sameDnsUpdateCredentials: boolean;
  configurationReplicated: boolean;
  duplicateRelayForwarding: boolean;
  scopeProtocol: DhcpProtocol;
  loadBalancePercentage: number;
  reservePercentage: number;
  plannedOutageMinutes: number;
}

export type WindowsFailoverFindingId =
  | 'failover-invalid-numeric-input'
  | 'failover-partner-unreachable'
  | 'failover-tcp-647-blocked'
  | 'failover-client-reachability-missing'
  | 'failover-clock-skew-over-60-seconds'
  | 'windows-failover-dhcpv6-unsupported'
  | 'failover-dns-credentials-mismatch'
  | 'failover-configuration-not-replicated'
  | 'failover-mclt-not-positive'
  | 'failover-state-switchover-below-mclt'
  | 'failover-invalid-load-balance-percentage'
  | 'failover-invalid-reserve-percentage'
  | 'failover-duplicate-relay-forwarding'
  | 'failover-outage-exceeds-safe-window'
  | 'windows-failover-ipv4-only';

export type WindowsFailoverFinding = ExplainableFinding<WindowsFailoverFindingId>;

export interface FailoverPartnerRoles {
  primary: string;
  secondary: string;
}

export interface FailoverTimelineStep {
  state:
    | 'normal'
    | 'communication-interrupted'
    | 'partner-down'
    | 'mclt-full-pool-eligible';
  afterMinutes: number;
  rationale: string;
}

export interface ValidationChecklistItem {
  key: string;
  passed: boolean;
  rationale: string;
}

export interface WindowsFailoverResult {
  partnerRoles: FailoverPartnerRoles;
  timeline: FailoverTimelineStep[];
  readiness: Readiness;
  findings: WindowsFailoverFinding[];
  validationChecklist: ValidationChecklistItem[];
}

export type Dhcpv6Mode = 'slaac-only' | 'stateless' | 'stateful' | 'prefix-delegation';
export type Dhcpv6Platform = 'windows' | 'kea' | 'router';

export interface Dhcpv6RaFlags {
  m: boolean;
  o: boolean;
  a: boolean;
  p: boolean;
}

export interface Dhcpv6Input {
  mode: Dhcpv6Mode;
  raFlags: Dhcpv6RaFlags;
  onLinkPrefixLength: number;
  delegatedPoolPrefix: number;
  delegatedSize: number;
  preferredLifetimeSeconds: number;
  validLifetimeSeconds: number;
  t1Seconds: number;
  t2Seconds: number;
  relayUsed: boolean;
  relayLinkAddress: string | null;
  duidPresent: boolean;
  iaidPresent: boolean;
  dnsOptionPresent: boolean;
  platform: Dhcpv6Platform;
  windowsFailoverAssumed: boolean;
}

export type Dhcpv6FindingId =
  | 'dhcpv6-invalid-prefix-length'
  | 'dhcpv6-invalid-time-value'
  | 'dhcpv6-preferred-lifetime-exceeds-valid'
  | 'dhcpv6-delegated-prefix-longer-than-request'
  | 'dhcpv6-slash64-capacity-unavailable'
  | 'dhcpv6-stateful-m-flag-missing'
  | 'dhcpv6-stateless-o-flag-missing'
  | 'dhcpv6-slaac-a-flag-missing'
  | 'dhcpv6-p-flag-without-prefix-delegation'
  | 'dhcpv6-prefix-delegation-signal-missing'
  | 'dhcpv6-client-identity-missing'
  | 'dhcpv6-relay-link-address-missing'
  | 'dhcpv6-windows-failover-assumed'
  | 'dhcpv6-t1-not-before-t2'
  | 'dhcpv6-t2-not-before-valid-lifetime';

export type Dhcpv6Finding = ExplainableFinding<Dhcpv6FindingId>;

export interface DelegatedPrefixCapacity {
  exact: string;
  display: string;
  numeric: number | null;
}

export interface Dhcpv6Result {
  readiness: Readiness;
  findings: Dhcpv6Finding[];
  delegatedPrefixCapacity: DelegatedPrefixCapacity | null;
  defaultRouteExplanation: string;
  validationChecklist: ValidationChecklistItem[];
}

export type DhcpDiagnosticSymptom =
  | 'apipa'
  | 'no-offer'
  | 'wrong-subnet'
  | 'wrong-options'
  | 'renewal-failure'
  | 'relay-failure'
  | 'pxe-failure'
  | 'dns-registration'
  | 'duplicate-address'
  | 'pool-exhaustion'
  | 'failover-state'
  | 'rogue-server'
  | 'dhcpv6-ra';

export interface DhcpSecurityEvidence {
  dhcpSnoopingEnabled: boolean;
  serverFacingPortsTrusted: boolean;
  option82Trusted: boolean;
  dnsUpdateCredentialsAligned: boolean;
  auditLoggingEnabled: boolean;
  windowsDhcpAuthorized: boolean;
  raGuardEnabled: boolean;
  backupRestoreTested: boolean;
  secretExposureDetected: boolean;
}

export interface DhcpDiagnosticInput {
  symptoms: DhcpDiagnosticSymptom[];
  path: 'direct' | 'relay';
  affectedVlans: 'all' | 'some';
  existingClientsAffected: boolean;
  newClientsAffected: boolean;
  serverPlatform: Dhcpv6Platform;
  recentChange: boolean;
  offerSeen: boolean;
  requestSeen: boolean;
  ackSeen: boolean;
  nakSeen: boolean;
  declineSeen: boolean;
  relayGiaddr: string | null;
  relayLinkAddress: string | null;
  serverIds: string[];
  freePoolPercentage: number;
  dnsQueueSymptoms: boolean;
  failoverState: string | null;
  security: DhcpSecurityEvidence;
}

export type DiagnosticCauseId =
  | 'relay-path-unreachable'
  | 'dhcp-server-unreachable'
  | 'rogue-or-duplicate-server'
  | 'address-pool-exhaustion'
  | 'dns-update-failure'
  | 'failover-state-degraded'
  | 'scope-or-relay-selection-mismatch'
  | 'option-delivery-mismatch'
  | 'renewal-path-failure'
  | 'pxe-policy-mismatch'
  | 'dhcpv6-ra-mismatch'
  | 'duplicate-address-detection';

export interface RankedDiagnosticCause {
  id: DiagnosticCauseId;
  title: string;
  score: number;
  rationale: string;
  matchedEvidence: string[];
  contributions: DiagnosticScoreContribution[];
  source: string;
}

export interface DiagnosticScoreContribution {
  evidence: string;
  weight: number;
}

export interface DiagnosticEvidenceStep {
  id: string;
  instruction: string;
  source: string;
}

export type DhcpSecurityFindingId =
  | 'security-dhcp-snooping-disabled'
  | 'security-trusted-port-misconfigured'
  | 'security-rogue-dhcp-server'
  | 'security-starvation-or-exhaustion'
  | 'security-option-82-trust-missing'
  | 'security-dns-credential-mismatch'
  | 'security-audit-logging-disabled'
  | 'security-windows-dhcp-unauthorized'
  | 'security-ra-guard-disabled'
  | 'security-backup-restore-unverified'
  | 'security-secret-exposure';

export type DhcpSecurityFinding = ExplainableFinding<DhcpSecurityFindingId>;

export type DiagnosticValidationFinding = ExplainableFinding<
  'diagnostics-invalid-free-pool-percentage'
>;

export interface DhcpDiagnosticResult {
  rankedCauses: RankedDiagnosticCause[];
  evidenceSteps: DiagnosticEvidenceStep[];
  wiresharkFilters: string[];
  commands: string[];
  securityFindings: DhcpSecurityFinding[];
  validationFindings: DiagnosticValidationFinding[];
}
