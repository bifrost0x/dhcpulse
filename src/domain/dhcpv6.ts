import type {
  DelegatedPrefixCapacity,
  Dhcpv6Finding,
  Dhcpv6FindingId,
  Dhcpv6Input,
  Dhcpv6Result,
  Severity,
  ValidationChecklistItem,
} from './types';

const RFC_9915 = 'https://www.rfc-editor.org/rfc/rfc9915';
const RFC_4861 = 'https://www.rfc-editor.org/rfc/rfc4861';
const RFC_4862 = 'https://www.rfc-editor.org/rfc/rfc4862';
const WINDOWS_FAILOVER_SOURCE =
  'https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/dhcp-failover';
const severityRank: Record<Severity, number> = { blocker: 0, warning: 1, info: 2 };
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export function analyzeDhcpv6(input: Dhcpv6Input): Dhcpv6Result {
  const findings: Dhcpv6Finding[] = [];
  const invalidPrefixEvidence = [
    ['onLinkPrefixLength', input.onLinkPrefixLength],
    ['delegatedPoolPrefix', input.delegatedPoolPrefix],
    ['delegatedSize', input.delegatedSize],
  ]
    .filter(([, value]) => !isValidPrefixLength(value as number))
    .map(([field, value]) => `${field}=${String(value)}`);
  const prefixLengthsValid = invalidPrefixEvidence.length === 0;
  if (!prefixLengthsValid) {
    findings.push(
      finding(
        'dhcpv6-invalid-prefix-length',
        'blocker',
        'IPv6 prefix lengths must be finite integers from 0 through 128.',
        invalidPrefixEvidence,
        RFC_9915,
      ),
    );
  }

  if (input.preferredLifetimeSeconds > input.validLifetimeSeconds) {
    findings.push(
      finding(
        'dhcpv6-preferred-lifetime-exceeds-valid',
        'blocker',
        'An IPv6 prefix preferred lifetime cannot exceed its valid lifetime.',
        [
          `preferredLifetimeSeconds=${input.preferredLifetimeSeconds}`,
          `validLifetimeSeconds=${input.validLifetimeSeconds}`,
        ],
        RFC_4862,
      ),
    );
  }
  if (
    input.mode === 'prefix-delegation' &&
    prefixLengthsValid &&
    input.delegatedPoolPrefix > input.delegatedSize
  ) {
    findings.push(
      finding(
        'dhcpv6-delegated-prefix-longer-than-request',
        'blocker',
        'A pool with a longer prefix cannot allocate the requested shorter delegated prefix.',
        [
          `delegatedPoolPrefix=/${input.delegatedPoolPrefix}`,
          `delegatedSize=/${input.delegatedSize}`,
        ],
        RFC_9915,
      ),
    );
  }
  if (
    input.mode === 'prefix-delegation' &&
    prefixLengthsValid &&
    input.delegatedSize > 64
  ) {
    findings.push(
      finding(
        'dhcpv6-slash64-capacity-unavailable',
        'blocker',
        'A delegated prefix longer than /64 contains no complete /64 subnet.',
        [`delegatedSize=/${input.delegatedSize}`],
        RFC_9915,
      ),
    );
  }
  if (input.mode === 'stateful' && !input.raFlags.m) {
    findings.push(
      finding(
        'dhcpv6-stateful-m-flag-missing',
        'blocker',
        'Stateful address configuration requires the RA Managed flag.',
        ['mode=stateful', 'raFlagM=false'],
        RFC_4861,
      ),
    );
  }

  if (input.mode === 'stateless' && !input.raFlags.o) {
    findings.push(
      finding(
        'dhcpv6-stateless-o-flag-missing',
        'warning',
        'Stateless DHCPv6 depends on the RA Other Configuration flag.',
        ['mode=stateless', 'raFlagO=false'],
        RFC_4861,
      ),
    );
  }
  if (input.mode === 'slaac-only' && !input.raFlags.a) {
    findings.push(
      finding(
        'dhcpv6-slaac-a-flag-missing',
        'warning',
        'SLAAC requires an autonomous prefix advertisement.',
        ['mode=slaac-only', 'raFlagA=false'],
        RFC_4862,
      ),
    );
  }
  if (input.raFlags.p && input.mode !== 'prefix-delegation') {
    findings.push(
      finding(
        'dhcpv6-p-flag-without-prefix-delegation',
        'warning',
        'The modeled P signal contradicts a mode that does not use prefix delegation.',
        [`mode=${input.mode}`, 'raFlagP=true'],
        RFC_9915,
      ),
    );
  }
  if (
    input.mode === 'prefix-delegation' &&
    !input.raFlags.p &&
    !input.raFlags.m &&
    !input.raFlags.o
  ) {
    findings.push(
      finding(
        'dhcpv6-prefix-delegation-signal-missing',
        'warning',
        'Prefix delegation has neither the modeled P signal nor an M/O compatibility signal.',
        ['mode=prefix-delegation', 'raFlagP=false', 'raFlagM=false', 'raFlagO=false'],
        RFC_9915,
      ),
    );
  }
  if (input.mode !== 'slaac-only' && (!input.duidPresent || !input.iaidPresent)) {
    findings.push(
      finding(
        'dhcpv6-client-identity-missing',
        'warning',
        'A DHCPv6 exchange needs the client DUID and an IAID for the requested identity association.',
        [`duidPresent=${input.duidPresent}`, `iaidPresent=${input.iaidPresent}`],
        RFC_9915,
      ),
    );
  }
  if (input.relayUsed && !input.relayLinkAddress?.trim()) {
    findings.push(
      finding(
        'dhcpv6-relay-link-address-missing',
        'warning',
        'A relay link-address is needed to select the correct downstream link.',
        ['relayUsed=true', 'relayLinkAddress=missing'],
        RFC_9915,
      ),
    );
  }
  if (input.windowsFailoverAssumed) {
    findings.push(
      finding(
        'dhcpv6-windows-failover-assumed',
        'warning',
        'Windows DHCP failover does not protect DHCPv6 service.',
        [`platform=${input.platform}`, 'windowsFailoverAssumed=true'],
        WINDOWS_FAILOVER_SOURCE,
      ),
    );
  }
  if (input.t1Seconds !== 0 && input.t2Seconds !== 0 && input.t1Seconds >= input.t2Seconds) {
    findings.push(
      finding(
        'dhcpv6-t1-not-before-t2',
        'warning',
        'T1 should occur before T2 so renewal precedes rebinding.',
        [`t1Seconds=${input.t1Seconds}`, `t2Seconds=${input.t2Seconds}`],
        RFC_9915,
      ),
    );
  }
  if (input.t2Seconds !== 0 && input.t2Seconds >= input.validLifetimeSeconds) {
    findings.push(
      finding(
        'dhcpv6-t2-not-before-valid-lifetime',
        'warning',
        'T2 should occur before the valid lifetime expires.',
        [
          `t2Seconds=${input.t2Seconds}`,
          `validLifetimeSeconds=${input.validLifetimeSeconds}`,
        ],
        RFC_9915,
      ),
    );
  }

  findings.sort(
    (left, right) => severityRank[left.severity] - severityRank[right.severity],
  );

  return {
    readiness: findings.some(({ severity }) => severity === 'blocker')
      ? 'no-go'
      : findings.some(({ severity }) => severity === 'warning')
        ? 'caution'
        : 'ready',
    findings,
    delegatedPrefixCapacity:
      input.mode === 'prefix-delegation' && prefixLengthsValid ? prefixCapacity(input) : null,
    defaultRouteExplanation:
      'Router Advertisements supply the IPv6 default route; DHCPv6 does not.',
    validationChecklist: checklist(input),
  };
}

function prefixCapacity(input: Dhcpv6Input): DelegatedPrefixCapacity | null {
  const difference = input.delegatedSize - input.delegatedPoolPrefix;
  if (difference < 0 || difference > 128) return null;

  const exactValue = 1n << BigInt(difference);
  return {
    exact: exactValue.toString(),
    display:
      exactValue > MAX_SAFE_BIGINT ? '>9,007,199,254,740,991' : exactValue.toString(),
    numeric: exactValue > MAX_SAFE_BIGINT ? null : Number(exactValue),
  };
}

function isValidPrefixLength(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 128;
}

function checklist(input: Dhcpv6Input): ValidationChecklistItem[] {
  return [
    item(
      'preferred-valid-lifetimes',
      input.preferredLifetimeSeconds <= input.validLifetimeSeconds,
      'Preferred lifetime does not exceed valid lifetime.',
    ),
    item(
      't1-t2-order',
      input.t1Seconds === 0 || input.t2Seconds === 0 || input.t1Seconds < input.t2Seconds,
      'T1 occurs before T2 when both server timer hints are nonzero.',
    ),
    item(
      't2-valid-lifetime',
      input.t2Seconds === 0 || input.t2Seconds < input.validLifetimeSeconds,
      'T2 occurs before the valid lifetime when the server timer hint is nonzero.',
    ),
    item('on-link-prefix', input.onLinkPrefixLength >= 0 && input.onLinkPrefixLength <= 128, 'On-link prefix length is within IPv6 bounds.'),
    item('client-duid', input.mode === 'slaac-only' || input.duidPresent, 'DUID is present when DHCPv6 is expected.'),
    item('client-iaid', input.mode === 'slaac-only' || input.iaidPresent, 'IAID is present when DHCPv6 is expected.'),
    item('dns-option', input.mode === 'slaac-only' || input.dnsOptionPresent, 'DNS option is present when DHCPv6 is expected.'),
    item('relay-link-address', !input.relayUsed || Boolean(input.relayLinkAddress?.trim()), 'Relay link-address is present when relaying is used.'),
  ];
}

function item(key: string, passed: boolean, rationale: string): ValidationChecklistItem {
  return { key, passed, rationale };
}

function finding(
  id: Dhcpv6FindingId,
  severity: Severity,
  rationale: string,
  evidence: string[],
  source: string,
): Dhcpv6Finding {
  return { id, severity, rationale, evidence, source };
}
