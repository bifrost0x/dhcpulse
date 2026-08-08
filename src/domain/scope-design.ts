import { analyzeIpv4Cidr, parseIpv4 } from './ip-address';
import type {
  AddressRangeInput,
  ScopeCapacity,
  ScopeDefinition,
  ScopeDesignInput,
  ScopeDesignResult,
  ScopeFinding,
} from './types';

interface NumericRange {
  start: number;
  end: number;
}

const severityRank = { blocker: 0, warning: 1, info: 2 } as const;

export function analyzeScopeDesign(input: ScopeDesignInput): ScopeDesignResult {
  const findings: ScopeFinding[] = [];
  const scopes = input.scopes.map((scope) => analyzeScope(scope, input.dailyGrowth, findings));

  for (let left = 0; left < input.scopes.length; left += 1) {
    for (let right = left + 1; right < input.scopes.length; right += 1) {
      const leftScope = input.scopes[left]!;
      const rightScope = input.scopes[right]!;
      const leftCidr = analyzeIpv4Cidr(leftScope.cidr);
      const rightCidr = analyzeIpv4Cidr(rightScope.cidr);
      if (leftCidr && rightCidr && overlaps(toNumericCidr(leftCidr), toNumericCidr(rightCidr))) {
        addPairFinding(findings, 'overlappingScopeNetworks', 'blocker', leftScope.id, rightScope.id);
      }

      const leftPool = parseRange(leftScope.pool);
      const rightPool = parseRange(rightScope.pool);
      if (leftPool && rightPool && overlaps(leftPool, rightPool)) {
        addPairFinding(findings, 'overlappingDynamicPools', 'blocker', leftScope.id, rightScope.id);
      }
    }
  }

  findings.sort(
    (left, right) =>
      severityRank[left.severity] - severityRank[right.severity] ||
      compareText(left.key, right.key) ||
      compareText(left.scopeId, right.scopeId),
  );

  return { scopes, findings };
}

function analyzeScope(
  scope: ScopeDefinition,
  dailyGrowth: number | undefined,
  findings: ScopeFinding[],
): ScopeCapacity {
  const cidr = analyzeIpv4Cidr(scope.cidr);
  if (!cidr) {
    findings.push({ key: 'invalidCidr', severity: 'blocker', scopeId: scope.id });
    return emptyCapacity(scope.id, dailyGrowth);
  }

  const network = toNumericCidr(cidr);
  const pool = parseRange(scope.pool);
  if (!pool) {
    findings.push({ key: 'invalidPoolRange', severity: 'blocker', scopeId: scope.id });
    return emptyCapacity(scope.id, dailyGrowth, cidr.cidr);
  }
  if (!containsRange(network, pool)) {
    findings.push({ key: 'poolOutsideSubnet', severity: 'blocker', scopeId: scope.id });
  }

  const exclusions: NumericRange[] = [];
  for (const exclusion of scope.exclusions ?? []) {
    const range = parseRange(exclusion);
    if (!range) {
      findings.push({ key: 'invalidExclusionRange', severity: 'blocker', scopeId: scope.id });
      continue;
    }
    if (!containsRange(pool, range)) {
      findings.push({ key: 'exclusionOutsidePool', severity: 'warning', scopeId: scope.id });
    }
    const withinPool = intersection(pool, range);
    if (withinPool) exclusions.push(withinPool);
  }

  const excludedAddresses = countUniqueRangeAddresses(exclusions);
  const rawPoolAddresses = size(pool);
  const effectiveCapacity = Math.max(0, rawPoolAddresses - excludedAddresses);
  const reservationAddresses = new Set<number>();
  const duplicateAddresses = new Set<number>();
  for (const reservation of scope.reservations ?? []) {
    const address = parseIpv4(reservation.address);
    if (address === null) continue;
    if (reservationAddresses.has(address)) duplicateAddresses.add(address);
    reservationAddresses.add(address);
    if (!contains(network, address)) {
      findings.push({ key: 'reservationOutsideSubnet', severity: 'warning', scopeId: scope.id });
    }
  }
  if (duplicateAddresses.size > 0) {
    findings.push({ key: 'duplicateReservationAddress', severity: 'warning', scopeId: scope.id });
  }

  const uniqueInPoolReservations = [...reservationAddresses].filter((address) => contains(pool, address)).length;
  const gateway = scope.gateway ? parseIpv4(scope.gateway) : null;
  if (gateway !== null && contains(pool, gateway)) {
    findings.push({ key: 'gatewayInDynamicPool', severity: 'warning', scopeId: scope.id });
  }

  const currentlyUsedAddresses = normalizeLeaseCount(scope.leases);
  if (currentlyUsedAddresses > effectiveCapacity) {
    findings.push({ key: 'overCapacityCurrentLeases', severity: 'blocker', scopeId: scope.id });
  }
  const remainingAddresses = Math.max(0, effectiveCapacity - currentlyUsedAddresses);
  const exhaustionDays = calculateExhaustionDays(remainingAddresses, dailyGrowth);
  if (exhaustionDays !== null && exhaustionDays <= 30) {
    findings.push({ key: 'exhaustionWithin30Days', severity: 'warning', scopeId: scope.id });
  }

  return {
    scopeId: scope.id,
    cidr: cidr.cidr,
    rawPoolAddresses,
    excludedAddresses,
    effectiveCapacity,
    uniqueInPoolReservations,
    currentlyUsedAddresses,
    utilizationPercent: effectiveCapacity === 0 ? 0 : (currentlyUsedAddresses / effectiveCapacity) * 100,
    remainingAddresses,
    exhaustionDays,
  };
}

function emptyCapacity(scopeId: string, dailyGrowth: number | undefined, cidr: string | null = null): ScopeCapacity {
  return {
    scopeId,
    cidr,
    rawPoolAddresses: 0,
    excludedAddresses: 0,
    effectiveCapacity: 0,
    uniqueInPoolReservations: 0,
    currentlyUsedAddresses: 0,
    utilizationPercent: 0,
    remainingAddresses: 0,
    exhaustionDays: calculateExhaustionDays(0, dailyGrowth),
  };
}

function parseRange(range: AddressRangeInput): NumericRange | null {
  const start = parseIpv4(range.start);
  const end = parseIpv4(range.end);
  if (start === null || end === null || start > end) return null;
  return { start, end };
}

function toNumericCidr(cidr: ReturnType<typeof analyzeIpv4Cidr> & {}): NumericRange {
  return { start: parseIpv4(cidr.network)!, end: parseIpv4(cidr.broadcast)! };
}

function contains(range: NumericRange, value: number): boolean {
  return range.start <= value && value <= range.end;
}

function containsRange(container: NumericRange, candidate: NumericRange): boolean {
  return contains(container, candidate.start) && contains(container, candidate.end);
}

function overlaps(left: NumericRange, right: NumericRange): boolean {
  return left.start <= right.end && right.start <= left.end;
}

function intersection(left: NumericRange, right: NumericRange): NumericRange | null {
  if (!overlaps(left, right)) return null;
  return { start: Math.max(left.start, right.start), end: Math.min(left.end, right.end) };
}

function size(range: NumericRange): number {
  return range.end - range.start + 1;
}

function countUniqueRangeAddresses(ranges: NumericRange[]): number {
  const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
  let count = 0;
  let current: NumericRange | null = null;
  for (const range of sorted) {
    if (!current) {
      current = { ...range };
      continue;
    }
    if (range.start <= current.end + 1) {
      current.end = Math.max(current.end, range.end);
      continue;
    }
    count += size(current);
    current = { ...range };
  }
  return count + (current ? size(current) : 0);
}

function normalizeLeaseCount(leases: number | undefined): number {
  if (!Number.isFinite(leases) || leases === undefined || leases <= 0) return 0;
  return Math.floor(leases);
}

function calculateExhaustionDays(remainingAddresses: number, dailyGrowth: number | undefined): number | null {
  if (!Number.isFinite(dailyGrowth) || dailyGrowth === undefined || dailyGrowth <= 0) return null;
  return remainingAddresses / dailyGrowth;
}

function addPairFinding(
  findings: ScopeFinding[],
  key: 'overlappingScopeNetworks' | 'overlappingDynamicPools',
  severity: ScopeFinding['severity'],
  leftScopeId: string,
  rightScopeId: string,
): void {
  findings.push({ key, severity, scopeId: leftScopeId }, { key, severity, scopeId: rightScopeId });
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
