import { describe, expect, it } from 'vitest';
import { analyzeIpv4Cidr, formatIpv4, parseIpv4, rangeSize, rangesOverlap } from './ip-address';
import { analyzeMultiPoolScope, analyzeScopeDesign } from './scope-design';
import { toolCatalog } from '../content/tool-catalog';

describe('IPv4 addressing helpers', () => {
  it('analyzes a literal /24 with hand-derived network facts', () => {
    const result = analyzeIpv4Cidr('192.168.10.42/24');

    expect(result).toMatchObject({
      cidr: '192.168.10.0/24',
      prefixLength: 24,
      netmask: '255.255.255.0',
      wildcardMask: '0.0.0.255',
      network: '192.168.10.0',
      broadcast: '192.168.10.255',
      firstUsable: '192.168.10.1',
      lastUsable: '192.168.10.254',
      totalAddresses: 256,
      usableAddresses: 254,
    });
  });

  it('treats point-to-point and host routes as usable special cases', () => {
    expect(analyzeIpv4Cidr('198.51.100.4/31')).toMatchObject({
      firstUsable: '198.51.100.4',
      lastUsable: '198.51.100.5',
      usableAddresses: 2,
    });
    expect(analyzeIpv4Cidr('198.51.100.4/32')).toMatchObject({
      firstUsable: '198.51.100.4',
      lastUsable: '198.51.100.4',
      usableAddresses: 1,
    });
  });

  it.each(['256.1.1.1', '1.2.3', '+1.2.3.4', '-1.2.3.4', '1.2.3.x'])('rejects invalid IPv4 input %s', (value) => {
    expect(parseIpv4(value)).toBeNull();
  });

  it('formats only unsigned 32-bit integers', () => {
    expect(formatIpv4(0xc000020a)).toBe('192.0.2.10');
    expect(() => formatIpv4(-1)).toThrow(RangeError);
    expect(() => formatIpv4(2 ** 32)).toThrow(RangeError);
    expect(() => formatIpv4(1.5)).toThrow(RangeError);
  });

  it('counts inclusive ranges and treats touching ranges as overlapping', () => {
    expect(rangeSize('192.0.2.10', '192.0.2.20')).toBe(11);
    expect(rangeSize('192.0.2.20', '192.0.2.10')).toBeNull();
    expect(rangesOverlap('192.0.2.10', '192.0.2.20', '192.0.2.20', '192.0.2.30')).toBe(true);
  });
});

describe('analyzeScopeDesign', () => {
  it('calculates capacity while reporting reservations separately from leases', () => {
    const result = analyzeScopeDesign({
      scopes: [
        {
          id: 'office',
          cidr: '192.0.2.0/24',
          pool: { start: '192.0.2.10', end: '192.0.2.200' },
          exclusions: [{ start: '192.0.2.50', end: '192.0.2.59' }],
          reservations: [
            { id: 'printer', address: '192.0.2.20' },
            { id: 'camera', address: '192.0.2.21' },
          ],
          leases: 100,
        },
      ],
    });

    expect(result.scopes[0]).toMatchObject({
      scopeId: 'office',
      rawPoolAddresses: 191,
      excludedAddresses: 10,
      effectiveCapacity: 181,
      uniqueInPoolReservations: 2,
      currentlyUsedAddresses: 100,
      remainingAddresses: 81,
    });
    expect(result.scopes[0]?.utilizationPercent).toBeCloseTo(55.25, 2);
  });

  it('reports inter-scope risks deterministically', () => {
    const result = analyzeScopeDesign({
      dailyGrowth: 5,
      scopes: [
        {
          id: 'alpha',
          cidr: '10.0.0.0/24',
          pool: { start: '10.0.0.10', end: '10.0.0.30' },
          gateway: '10.0.0.10',
          reservations: [{ id: 'printer', address: '10.0.0.20' }],
          leases: 15,
        },
        {
          id: 'beta',
          cidr: '10.0.0.0/25',
          pool: { start: '10.0.0.20', end: '10.0.0.35' },
          reservations: [
            { id: 'printer-copy', address: '10.0.0.20' },
            { id: 'printer-copy-2', address: '10.0.0.20' },
          ],
          leases: 10,
        },
      ],
    });

    expect(result.findings.map((finding) => finding.key)).toEqual([
      'overlappingDynamicPools',
      'overlappingDynamicPools',
      'overlappingScopeNetworks',
      'overlappingScopeNetworks',
      'duplicateReservationAddress',
      'exhaustionWithin30Days',
      'exhaustionWithin30Days',
      'gatewayInDynamicPool',
    ]);
    expect(result.findings.map((finding) => finding.scopeId)).toEqual([
      'alpha',
      'beta',
      'alpha',
      'beta',
      'beta',
      'alpha',
      'beta',
      'alpha',
    ]);
  });

  it('reports an out-of-subnet reservation without reducing capacity', () => {
    const result = analyzeScopeDesign({
      scopes: [
        {
          id: 'lab',
          cidr: '203.0.113.0/24',
          pool: { start: '203.0.113.10', end: '203.0.113.20' },
          reservations: [{ id: 'wrong-network', address: '198.51.100.10' }],
          leases: 0,
        },
      ],
    });

    expect(result.scopes[0]).toMatchObject({
      effectiveCapacity: 11,
      uniqueInPoolReservations: 0,
    });
    expect(result.findings).toContainEqual({
      key: 'reservationOutsideSubnet',
      severity: 'warning',
      scopeId: 'lab',
    });
  });

  it('reports invalid boundaries and capacity limits with stable severity order', () => {
    const result = analyzeScopeDesign({
      scopes: [
        {
          id: 'invalid-cidr',
          cidr: 'not-a-cidr',
          pool: { start: '192.0.2.10', end: '192.0.2.20' },
        },
        {
          id: 'invalid-pool',
          cidr: '192.0.2.0/24',
          pool: { start: '192.0.2.20', end: '192.0.2.10' },
        },
        {
          id: 'pool-outside',
          cidr: '203.0.113.0/24',
          pool: { start: '198.51.100.10', end: '198.51.100.20' },
        },
        {
          id: 'full',
          cidr: '203.0.113.0/24',
          pool: { start: '203.0.113.10', end: '203.0.113.20' },
          exclusions: [{ start: '203.0.113.5', end: '203.0.113.11' }],
          leases: 12,
        },
      ],
    });

    expect(result.findings).toEqual([
      { key: 'invalidCidr', severity: 'blocker', scopeId: 'invalid-cidr' },
      { key: 'invalidPoolRange', severity: 'blocker', scopeId: 'invalid-pool' },
      { key: 'overCapacityCurrentLeases', severity: 'blocker', scopeId: 'full' },
      { key: 'overlappingScopeNetworks', severity: 'blocker', scopeId: 'full' },
      { key: 'overlappingScopeNetworks', severity: 'blocker', scopeId: 'pool-outside' },
      { key: 'poolOutsideSubnet', severity: 'blocker', scopeId: 'pool-outside' },
      { key: 'exclusionOutsidePool', severity: 'warning', scopeId: 'full' },
    ]);
    expect(result.scopes.find((scope) => scope.scopeId === 'full')).toMatchObject({
      rawPoolAddresses: 11,
      excludedAddresses: 2,
      effectiveCapacity: 9,
      currentlyUsedAddresses: 12,
      remainingAddresses: 0,
    });
  });
});

describe('analyzeMultiPoolScope', () => {
  const base = {
    id: 'office',
    cidr: '192.0.2.0/24',
    pools: [
      { start: '192.0.2.10', end: '192.0.2.20' },
      { start: '192.0.2.30', end: '192.0.2.40' },
    ],
    leases: 15,
    dailyGrowth: 0,
  };

  it('applies current leases once to the aggregate capacity of every pool', () => {
    const result = analyzeMultiPoolScope(base);

    expect(result.aggregate).toMatchObject({
      effectiveCapacity: 22,
      currentlyUsedAddresses: 15,
      remainingAddresses: 7,
    });
    expect(result.findings.filter(({ severity }) => severity === 'blocker')).toEqual([]);
  });

  it('applies an exclusion only to the pool it intersects', () => {
    const result = analyzeMultiPoolScope({
      ...base,
      exclusions: [{ start: '192.0.2.12', end: '192.0.2.13' }],
    });

    expect(result.aggregate).toMatchObject({
      effectiveCapacity: 20,
      currentlyUsedAddresses: 15,
      remainingAddresses: 5,
    });
    expect(result.findings.map(({ key }) => key).filter((key) => key === 'exclusionOutsidePool')).toEqual([]);
  });
});

describe('toolCatalog', () => {
  it('contains every required stable ID exactly once', () => {
    expect(toolCatalog.map((tool) => tool.id)).toEqual([
      'scope',
      'lease',
      'options',
      'pxe',
      'failover',
      'dhcpv6',
      'diagnostics',
      'security',
      'config-analyzer',
      'config-diff',
    ]);
    expect(new Set(toolCatalog.map((tool) => tool.id)).size).toBe(10);
  });
});
