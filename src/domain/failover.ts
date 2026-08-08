import type {
  FailoverPartnerRoles,
  Severity,
  ValidationChecklistItem,
  WindowsFailoverFinding,
  WindowsFailoverFindingId,
  WindowsFailoverInput,
  WindowsFailoverResult,
} from './types';

const MICROSOFT_FAILOVER_SOURCE =
  'https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/dhcp-failover';
const MICROSOFT_FAILOVER_DEPLOYMENT_SOURCE =
  'https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/manage-dhcp-failover-relationships';
const severityRank: Record<Severity, number> = { blocker: 0, warning: 1, info: 2 };

export function analyzeWindowsFailover(input: WindowsFailoverInput): WindowsFailoverResult {
  const findings: WindowsFailoverFinding[] = [];
  const timingEntries = [
    ['mcltMinutes', input.mcltMinutes],
    ['stateSwitchoverMinutes', input.stateSwitchoverMinutes],
    ['clockSkewSeconds', input.clockSkewSeconds],
    ['plannedOutageMinutes', input.plannedOutageMinutes],
  ] as const;
  const numericEntries = [
    ['mcltMinutes', input.mcltMinutes, isNonNegativeSafeInteger],
    ['stateSwitchoverMinutes', input.stateSwitchoverMinutes, isNonNegativeSafeInteger],
    ['clockSkewSeconds', input.clockSkewSeconds, isNonNegativeSafeInteger],
    ['loadBalancePercentage', input.loadBalancePercentage, isPercentage],
    ['reservePercentage', input.reservePercentage, isPercentage],
    ['plannedOutageMinutes', input.plannedOutageMinutes, isNonNegativeSafeInteger],
  ] as const;
  const invalidNumericEvidence = numericEntries
    .filter(([, value, isValid]) => !isValid(value))
    .map(([field, value]) =>
      Number.isFinite(value) ? `${field}=${value}` : `${field}=non-finite`,
    );
  const transitionOperandsValid =
    isNonNegativeSafeInteger(input.stateSwitchoverMinutes) &&
    isNonNegativeSafeInteger(input.mcltMinutes);
  const fullPoolEligibilityCandidate = transitionOperandsValid
    ? input.stateSwitchoverMinutes + input.mcltMinutes
    : 0;
  const fullPoolEligibilitySumSafe =
    transitionOperandsValid && Number.isSafeInteger(fullPoolEligibilityCandidate);
  if (transitionOperandsValid && !fullPoolEligibilitySumSafe) {
    invalidNumericEvidence.push('fullPoolEligibilityMinutes=unsafe-sum');
  }
  const timingInputsValid =
    timingEntries.every(([, value]) => isNonNegativeSafeInteger(value)) &&
    fullPoolEligibilitySumSafe;
  const numericInputsValid = invalidNumericEvidence.length === 0;
  if (!numericInputsValid) {
    findings.push(
      finding(
        'failover-invalid-numeric-input',
        'blocker',
        'Failover timing values must be nonnegative safe integers, their full-pool eligibility sum must remain safe, and percentages must be integers from 0 through 100.',
        invalidNumericEvidence,
      ),
    );
  }
  const safeInput: WindowsFailoverInput = {
    ...input,
    mcltMinutes: nonNegativeSafeIntegerOrZero(input.mcltMinutes),
    stateSwitchoverMinutes: nonNegativeSafeIntegerOrZero(input.stateSwitchoverMinutes),
    clockSkewSeconds: nonNegativeSafeIntegerOrZero(input.clockSkewSeconds),
    loadBalancePercentage: percentageOrZero(input.loadBalancePercentage),
    reservePercentage: percentageOrZero(input.reservePercentage),
    plannedOutageMinutes: nonNegativeSafeIntegerOrZero(input.plannedOutageMinutes),
  };

  if (!input.partnerReachable) {
    findings.push(
      finding(
        'failover-partner-unreachable',
        'blocker',
        'The failover partners need a working replication path before the relationship is ready.',
        ['partnerReachable=false'],
      ),
    );
  }
  if (!input.tcp647Allowed) {
    findings.push(
      finding(
        'failover-tcp-647-blocked',
        'blocker',
        'Windows DHCP failover partners exchange state over TCP 647.',
        ['tcp647Allowed=false'],
      ),
    );
  }
  if (!input.clientsReachBothPartners) {
    findings.push(
      finding(
        'failover-client-reachability-missing',
        'blocker',
        'Clients or relays must be able to reach both partners for service continuity.',
        ['clientsReachBothPartners=false'],
      ),
    );
  }
  if (isNonNegativeSafeInteger(input.clockSkewSeconds) && input.clockSkewSeconds > 60) {
    findings.push(
      finding(
        'failover-clock-skew-over-60-seconds',
        'blocker',
        'Clock skew above 60 seconds can invalidate failover timing assumptions.',
        [`clockSkewSeconds=${input.clockSkewSeconds}`],
      ),
    );
  }
  if (input.scopeProtocol === 'dhcpv6') {
    findings.push(
      finding(
        'windows-failover-dhcpv6-unsupported',
        'blocker',
        'Windows DHCP failover applies to DHCPv4 scopes and cannot protect this DHCPv6 scope.',
        ['scopeProtocol=dhcpv6'],
      ),
    );
  }

  if (!input.sameDnsUpdateCredentials) {
    findings.push(
      finding(
        'failover-dns-credentials-mismatch',
        'warning',
        'Both partners should use the same DNS update credentials to keep registrations consistent.',
        ['sameDnsUpdateCredentials=false'],
      ),
    );
  }
  if (!input.configurationReplicated) {
    findings.push(
      finding(
        'failover-configuration-not-replicated',
        'warning',
        'Failover does not make every scope setting identical; stale configuration must be reconciled.',
        ['configurationReplicated=false'],
      ),
    );
  }
  if (isNonNegativeSafeInteger(input.mcltMinutes) && input.mcltMinutes === 0) {
    findings.push(
      finding(
        'failover-mclt-not-positive',
        'warning',
        'MCLT must be positive to model lease ownership safely.',
        [`mcltMinutes=${input.mcltMinutes}`],
      ),
    );
  }
  if (
    isNonNegativeSafeInteger(input.stateSwitchoverMinutes) &&
    isNonNegativeSafeInteger(input.mcltMinutes) &&
    input.stateSwitchoverMinutes < input.mcltMinutes
  ) {
    findings.push(
      finding(
        'failover-state-switchover-below-mclt',
        'warning',
        'The automatic state-switchover interval should not undercut the MCLT transition period.',
        [
          `stateSwitchoverMinutes=${input.stateSwitchoverMinutes}`,
          `mcltMinutes=${input.mcltMinutes}`,
        ],
      ),
    );
  }
  if (input.duplicateRelayForwarding) {
    findings.push(
      finding(
        'failover-duplicate-relay-forwarding',
        'warning',
        'Duplicate relay forwarding can cause redundant requests and obscure the intended server path.',
        ['duplicateRelayForwarding=true'],
      ),
    );
  }

  const fullPoolEligibilityMinutes = fullPoolEligibilitySumSafe
    ? fullPoolEligibilityCandidate
    : 0;

  findings.push(
    finding(
      'windows-failover-ipv4-only',
      'info',
      'Windows DHCP failover protects DHCPv4 scopes only; DHCPv6 needs a separate availability design.',
      [`scopeProtocol=${input.scopeProtocol}`],
    ),
  );
  findings.sort(
    (left, right) =>
      severityRank[left.severity] - severityRank[right.severity] ||
      left.id.localeCompare(right.id),
  );

  return {
    partnerRoles: partnerRoles(safeInput),
    timeline: timingInputsValid
      ? [
          {
            state: 'normal',
            afterMinutes: 0,
            rationale: 'Both partners serve their configured roles.',
          },
          {
            state: 'communication-interrupted',
            afterMinutes: 0,
            rationale: 'A lost partner path starts the communication-interrupted state.',
          },
          {
            state: 'partner-down',
            afterMinutes: safeInput.stateSwitchoverMinutes,
            rationale:
              'Automatic transition is modeled after the configured state-switchover interval.',
          },
          {
            state: 'mclt-full-pool-eligible',
            afterMinutes: fullPoolEligibilityMinutes,
            rationale:
              'If the partner remains unavailable, this conditional milestone marks state switchover plus MCLT, when full-pool ownership may become eligible; it does not imply recovery.',
          },
        ]
      : [],
    readiness: findings.some(({ severity }) => severity === 'blocker')
      ? 'no-go'
      : findings.some(({ severity }) => severity === 'warning')
        ? 'caution'
        : 'ready',
    findings,
    validationChecklist: validationChecklist(
      safeInput,
      fullPoolEligibilityMinutes,
      numericInputsValid,
    ),
  };
}

function partnerRoles(input: WindowsFailoverInput): FailoverPartnerRoles {
  if (input.mode === 'load-balance') {
    const primaryState = input.loadBalancePercentage === 0 ? 'inactive' : 'active';
    const secondaryPercentage = 100 - input.loadBalancePercentage;
    const secondaryState = secondaryPercentage === 0 ? 'inactive' : 'active';
    return {
      primary: `${primaryState}-${input.loadBalancePercentage}-percent`,
      secondary: `${secondaryState}-${secondaryPercentage}-percent`,
    };
  }
  return {
    primary: 'active',
    secondary: `standby-reserve-${input.reservePercentage}-percent`,
  };
}

function validationChecklist(
  input: WindowsFailoverInput,
  fullPoolEligibilityMinutes: number,
  numericInputsValid: boolean,
): ValidationChecklistItem[] {
  const preTakeoverCapacityPercent = input.mode === 'load-balance'
    ? Math.min(input.loadBalancePercentage, 100 - input.loadBalancePercentage)
    : input.reservePercentage;
  const capacityRationale = input.mode === 'load-balance'
    ? `the surviving load-balance partner has a modeled ${preTakeoverCapacityPercent}% share`
    : `the surviving hot-standby partner has a modeled ${preTakeoverCapacityPercent}% reserve`;
  return [
    item(
      'numeric-inputs',
      numericInputsValid,
      'Timing values are nonnegative and percentages are integers from 0 through 100.',
    ),
    item('partner-path', input.partnerReachable, 'Partner replication path is reachable.'),
    item('tcp-647', input.tcp647Allowed, 'TCP 647 is allowed between partners.'),
    item('client-paths', input.clientsReachBothPartners, 'Clients or relays reach both partners.'),
    item('clock-skew', input.clockSkewSeconds <= 60, 'Clock skew is at most 60 seconds.'),
    item('dns-credentials', input.sameDnsUpdateCredentials, 'DNS update credentials match.'),
    item('configuration', input.configurationReplicated, 'Scope configuration is replicated.'),
    item('relay-forwarding', !input.duplicateRelayForwarding, 'Relay forwarding is not duplicated.'),
    item('mclt', input.mcltMinutes > 0, 'MCLT is positive.'),
    item(
      'state-switchover',
      input.stateSwitchoverMinutes >= input.mcltMinutes,
      'State switchover is not below MCLT.',
    ),
    item(
      'pre-takeover-capacity',
      input.plannedOutageMinutes === 0 || preTakeoverCapacityPercent > 0,
      `Before full-pool eligibility at ${fullPoolEligibilityMinutes} minutes, ${capacityRationale}; verify that this capacity tolerates the planned demand.`,
    ),
    item('dhcpv4-scope', input.scopeProtocol === 'dhcpv4', 'Scope uses DHCPv4.'),
  ];
}

function item(key: string, passed: boolean, rationale: string): ValidationChecklistItem {
  return { key, passed, rationale };
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPercentage(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100;
}

function nonNegativeSafeIntegerOrZero(value: number): number {
  return isNonNegativeSafeInteger(value) ? value : 0;
}

function percentageOrZero(value: number): number {
  return isPercentage(value) ? value : 0;
}

function finding(
  id: WindowsFailoverFindingId,
  severity: Severity,
  rationale: string,
  evidence: string[],
): WindowsFailoverFinding {
  return {
    id,
    severity,
    rationale,
    evidence,
    source:
      id === 'failover-tcp-647-blocked'
        ? MICROSOFT_FAILOVER_DEPLOYMENT_SOURCE
        : MICROSOFT_FAILOVER_SOURCE,
  };
}
