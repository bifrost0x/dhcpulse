import { describe, expect, it } from 'vitest';

import { analyzeWindowsFailover } from './failover';
import type { WindowsFailoverInput } from './types';

const healthyLoadBalance: WindowsFailoverInput = {
  mode: 'load-balance',
  mcltMinutes: 60,
  stateSwitchoverMinutes: 90,
  partnerReachable: true,
  clientsReachBothPartners: true,
  tcp647Allowed: true,
  clockSkewSeconds: 10,
  sameDnsUpdateCredentials: true,
  configurationReplicated: true,
  duplicateRelayForwarding: false,
  scopeProtocol: 'dhcpv4',
  loadBalancePercentage: 50,
  reservePercentage: 5,
  plannedOutageMinutes: 120,
};

function analyze(overrides: Partial<WindowsFailoverInput> = {}) {
  return analyzeWindowsFailover({ ...healthyLoadBalance, ...overrides });
}

describe('analyzeWindowsFailover', () => {
  it('marks a healthy load-balance relationship ready and explains both active roles', () => {
    const result = analyze();

    expect(result.readiness).toBe('ready');
    expect(result.partnerRoles).toEqual({
      primary: 'active-50-percent',
      secondary: 'active-50-percent',
    });
    expect(result.timeline.map(({ state }) => state)).toEqual([
      'normal',
      'communication-interrupted',
      'partner-down',
      'recovery',
    ]);
    expect(result.findings).toEqual([
      expect.objectContaining({
        id: 'windows-failover-ipv4-only',
        severity: 'info',
        source: expect.stringMatching(/^https:\/\//),
      }),
    ]);
    expect(result.validationChecklist.every(({ passed }) => passed)).toBe(true);
  });

  it('blocks readiness when TCP 647 is unavailable', () => {
    const result = analyze({ tcp647Allowed: false });

    expect(result.readiness).toBe('no-go');
    expect(result.findings[0]).toEqual(
      expect.objectContaining({ id: 'failover-tcp-647-blocked', severity: 'blocker' }),
    );
  });

  it('blocks readiness when clock skew reaches 61 seconds', () => {
    const result = analyze({ clockSkewSeconds: 61 });

    expect(result.readiness).toBe('no-go');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        id: 'failover-clock-skew-over-60-seconds',
        severity: 'blocker',
        evidence: ['clockSkewSeconds=61'],
      }),
    );
  });

  it('marks mismatched DNS credentials and stale replication as caution', () => {
    const result = analyze({
      sameDnsUpdateCredentials: false,
      configurationReplicated: false,
    });

    expect(result.readiness).toBe('caution');
    expect(result.findings.map(({ id, severity }) => `${id}:${severity}`)).toEqual([
      'failover-configuration-not-replicated:warning',
      'failover-dns-credentials-mismatch:warning',
      'windows-failover-ipv4-only:info',
    ]);
  });

  it('rejects a DHCPv6 scope because Windows DHCP failover is DHCPv4-only', () => {
    const result = analyze({ scopeProtocol: 'dhcpv6' });

    expect(result.readiness).toBe('no-go');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        id: 'windows-failover-dhcpv6-unsupported',
        severity: 'blocker',
      }),
    );
    expect(result.findings).toContainEqual(
      expect.objectContaining({ id: 'windows-failover-ipv4-only', severity: 'info' }),
    );
  });

  it('warns on invalid timing, percentages, relay duplication, and modeled outage', () => {
    const loadBalance = analyze({
      mcltMinutes: 0,
      stateSwitchoverMinutes: -1,
      duplicateRelayForwarding: true,
      loadBalancePercentage: 100,
      plannedOutageMinutes: 1,
    });
    const hotStandby = analyze({
      mode: 'hot-standby',
      reservePercentage: 101,
      plannedOutageMinutes: 151,
    });

    expect(loadBalance.findings.map(({ id }) => id)).toEqual([
      'failover-duplicate-relay-forwarding',
      'failover-invalid-load-balance-percentage',
      'failover-mclt-not-positive',
      'failover-outage-exceeds-safe-window',
      'failover-state-switchover-below-mclt',
      'windows-failover-ipv4-only',
    ]);
    expect(hotStandby.partnerRoles.secondary).toBe('standby-reserve-101-percent');
    expect(hotStandby.findings.map(({ id }) => id)).toContain(
      'failover-invalid-reserve-percentage',
    );
    expect(hotStandby.findings.map(({ id }) => id)).toContain(
      'failover-outage-exceeds-safe-window',
    );
  });

  it('blocks missing partner paths and lack of client reachability', () => {
    const result = analyze({ partnerReachable: false, clientsReachBothPartners: false });

    expect(result.readiness).toBe('no-go');
    expect(result.findings.map(({ id }) => id).slice(0, 2)).toEqual([
      'failover-client-reachability-missing',
      'failover-partner-unreachable',
    ]);
  });

  it.each([
    ['mcltMinutes', Number.NaN],
    ['stateSwitchoverMinutes', Number.POSITIVE_INFINITY],
    ['clockSkewSeconds', Number.NaN],
    ['loadBalancePercentage', Number.NaN],
    ['reservePercentage', Number.NEGATIVE_INFINITY],
    ['plannedOutageMinutes', Number.NaN],
  ] as const)('blocks non-finite %s without leaking it into summaries', (field, value) => {
    const result = analyze({ [field]: value });

    expect(result.readiness).toBe('no-go');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        id: 'failover-invalid-numeric-input',
        severity: 'blocker',
        evidence: [`${field}=non-finite`],
      }),
    );
    expect(JSON.stringify({ roles: result.partnerRoles, timeline: result.timeline })).not.toContain(
      'NaN',
    );
    expect(result.timeline.every(({ afterMinutes }) => Number.isFinite(afterMinutes))).toBe(true);
  });
});
