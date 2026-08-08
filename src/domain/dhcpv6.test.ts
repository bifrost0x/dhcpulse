import { describe, expect, it } from 'vitest';

import { analyzeDhcpv6 } from './dhcpv6';
import type { Dhcpv6Input } from './types';

const validStateless: Dhcpv6Input = {
  mode: 'stateless',
  raFlags: { m: false, o: true, a: true, p: false },
  onLinkPrefixLength: 64,
  delegatedPoolPrefix: 56,
  delegatedSize: 64,
  preferredLifetimeSeconds: 3600,
  validLifetimeSeconds: 7200,
  t1Seconds: 1800,
  t2Seconds: 3150,
  relayUsed: false,
  relayLinkAddress: null,
  duidPresent: true,
  iaidPresent: true,
  dnsOptionPresent: true,
  platform: 'kea',
  windowsFailoverAssumed: false,
};

function analyze(overrides: Partial<Dhcpv6Input> = {}) {
  return analyzeDhcpv6({ ...validStateless, ...overrides });
}

describe('analyzeDhcpv6', () => {
  it('accepts stateless DHCPv6 when O=1 and explains that RA supplies the default route', () => {
    const result = analyze();

    expect(result.readiness).toBe('ready');
    expect(result.findings).toEqual([]);
    expect(result.defaultRouteExplanation).toBe(
      'Router Advertisements supply the IPv6 default route; DHCPv6 does not.',
    );
  });

  it('accepts stateful DHCPv6 when M=1', () => {
    const result = analyze({
      mode: 'stateful',
      raFlags: { m: true, o: true, a: false, p: false },
    });

    expect(result.readiness).toBe('ready');
    expect(result.findings).toEqual([]);
  });

  it('accepts zero T1 and T2 hints without imposing server timers', () => {
    const result = analyze({ t1Seconds: 0, t2Seconds: 0 });

    expect(result.readiness).toBe('ready');
    expect(result.findings).toEqual([]);
  });

  it('accepts equal nonzero T1/T2 and T2/valid-lifetime boundaries', () => {
    const result = analyze({
      preferredLifetimeSeconds: 3000,
      t1Seconds: 3000,
      t2Seconds: 3000,
      validLifetimeSeconds: 3000,
    });

    expect(result.readiness).toBe('ready');
    expect(result.findings).toEqual([]);
    expect(
      result.validationChecklist
        .filter(({ key }) => ['t1-t2-order', 't2-valid-lifetime'].includes(key))
        .every(({ passed }) => passed),
    ).toBe(true);
  });

  it.each([
    { delegatedPoolPrefix: 56, delegatedSize: 64, exact: '256', numeric: 256 },
    { delegatedPoolPrefix: 60, delegatedSize: 64, exact: '16', numeric: 16 },
  ])(
    'computes /$delegatedPoolPrefix delegated as /$delegatedSize exactly',
    ({ delegatedPoolPrefix, delegatedSize, exact, numeric }) => {
      const result = analyze({
        mode: 'prefix-delegation',
        raFlags: { m: false, o: false, a: true, p: true },
        delegatedPoolPrefix,
        delegatedSize,
      });

      expect(result.readiness).toBe('ready');
      expect(result.delegatedPrefixCapacity).toEqual({
        exact,
        display: exact,
        numeric,
      });
    },
  );

  it('blocks preferred lifetimes longer than valid lifetimes', () => {
    const result = analyze({ preferredLifetimeSeconds: 7201, validLifetimeSeconds: 7200 });

    expect(result.readiness).toBe('no-go');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        id: 'dhcpv6-preferred-lifetime-exceeds-valid',
        severity: 'blocker',
        evidence: ['preferredLifetimeSeconds=7201', 'validLifetimeSeconds=7200'],
      }),
    );
  });

  it('blocks stateful mode without M and unavailable delegated prefix ranges', () => {
    const stateful = analyze({
      mode: 'stateful',
      raFlags: { m: false, o: true, a: false, p: false },
    });
    const impossiblePool = analyze({
      mode: 'prefix-delegation',
      raFlags: { m: false, o: false, a: true, p: true },
      delegatedPoolPrefix: 64,
      delegatedSize: 56,
    });
    const noSlash64s = analyze({
      mode: 'prefix-delegation',
      raFlags: { m: false, o: false, a: true, p: true },
      delegatedPoolPrefix: 64,
      delegatedSize: 65,
    });

    expect(stateful.findings).toContainEqual(
      expect.objectContaining({ id: 'dhcpv6-stateful-m-flag-missing', severity: 'blocker' }),
    );
    expect(impossiblePool.findings).toContainEqual(
      expect.objectContaining({ id: 'dhcpv6-delegated-prefix-longer-than-request' }),
    );
    expect(noSlash64s.findings).toContainEqual(
      expect.objectContaining({ id: 'dhcpv6-slash64-capacity-unavailable' }),
    );
  });

  it('warns on P flag contradictions and missing compatibility signals', () => {
    const pWithoutPd = analyze({ raFlags: { m: false, o: true, a: true, p: true } });
    const pdWithoutSignal = analyze({
      mode: 'prefix-delegation',
      raFlags: { m: false, o: false, a: true, p: false },
    });

    expect(pWithoutPd.findings).toContainEqual(
      expect.objectContaining({
        id: 'dhcpv6-p-flag-without-prefix-delegation',
        source: 'https://www.rfc-editor.org/rfc/rfc9762',
      }),
    );
    expect(pdWithoutSignal.findings).toContainEqual(
      expect.objectContaining({
        id: 'dhcpv6-prefix-delegation-signal-missing',
        source: 'https://www.rfc-editor.org/rfc/rfc9762',
      }),
    );
  });

  it('does not require DUID or IAID for stateless Information-request', () => {
    const result = analyze({ duidPresent: false, iaidPresent: false });

    expect(result.readiness).toBe('ready');
    expect(result.findings.map(({ id }) => id)).not.toContain(
      'dhcpv6-client-identity-missing',
    );
  });

  it('marks required stateless DNS delivery as caution when option 23 is absent', () => {
    const result = analyze({ dnsOptionPresent: false });

    expect(result.readiness).toBe('caution');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        id: 'dhcpv6-dns-option-missing',
        severity: 'warning',
        evidence: ['mode=stateless', 'raFlagO=true', 'dnsOptionPresent=false'],
        source: 'https://www.rfc-editor.org/rfc/rfc3646',
      }),
    );
    expect(
      result.validationChecklist.find(({ key }) => key === 'dns-option'),
    ).toMatchObject({ passed: false });
  });

  it('does not require DHCPv6 DNS delivery for SLAAC-only mode without O', () => {
    const result = analyze({
      mode: 'slaac-only',
      raFlags: { m: false, o: false, a: true, p: false },
      duidPresent: false,
      iaidPresent: false,
      dnsOptionPresent: false,
    });

    expect(result.readiness).toBe('ready');
    expect(result.findings.map(({ id }) => id)).not.toContain('dhcpv6-dns-option-missing');
    expect(
      result.validationChecklist.find(({ key }) => key === 'dns-option'),
    ).toMatchObject({ passed: true });
  });

  it('warns when stateless and SLAAC modes lack their required RA signals', () => {
    const stateless = analyze({ raFlags: { m: false, o: false, a: true, p: false } });
    const slaac = analyze({
      mode: 'slaac-only',
      raFlags: { m: false, o: false, a: false, p: false },
      duidPresent: false,
      iaidPresent: false,
    });

    expect(stateless.findings).toContainEqual(
      expect.objectContaining({ id: 'dhcpv6-stateless-o-flag-missing' }),
    );
    expect(slaac.findings.map(({ id }) => id)).toEqual(['dhcpv6-slaac-a-flag-missing']);
  });

  it('warns when T1 and T2 do not precede each other and the valid lifetime', () => {
    const result = analyze({
      preferredLifetimeSeconds: 2000,
      t1Seconds: 4000,
      t2Seconds: 3000,
      validLifetimeSeconds: 2999,
    });

    expect(result.findings.map(({ id }) => id)).toEqual([
      'dhcpv6-t1-not-before-t2',
      'dhcpv6-t2-not-before-valid-lifetime',
    ]);
  });

  it('warns when a relay has no link address', () => {
    const result = analyze({ relayUsed: true, relayLinkAddress: '   ' });

    expect(result.readiness).toBe('caution');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        id: 'dhcpv6-relay-link-address-missing',
        severity: 'warning',
      }),
    );
  });

  it('warns on missing client identity and an assumed Windows failover relationship', () => {
    const result = analyze({
      mode: 'stateful',
      raFlags: { m: true, o: true, a: false, p: false },
      duidPresent: false,
      iaidPresent: false,
      platform: 'windows',
      windowsFailoverAssumed: true,
    });

    expect(result.findings.map(({ id }) => id)).toEqual([
      'dhcpv6-client-identity-missing',
      'dhcpv6-windows-failover-assumed',
    ]);
    expect(result.findings.at(0)?.source).toBe('https://www.rfc-editor.org/rfc/rfc9915');
  });

  it('uses an exact capped display for impractically large prefix counts', () => {
    const result = analyze({
      mode: 'prefix-delegation',
      raFlags: { m: false, o: false, a: true, p: true },
      delegatedPoolPrefix: 0,
      delegatedSize: 64,
    });

    expect(result.delegatedPrefixCapacity).toEqual({
      exact: '18446744073709551616',
      display: '>9,007,199,254,740,991',
      numeric: null,
    });
  });

  it.each([
    ['onLinkPrefixLength', Number.NaN],
    ['delegatedPoolPrefix', 56.5],
    ['delegatedSize', -1],
    ['delegatedSize', 129],
  ] as const)('blocks invalid %s without throwing during capacity arithmetic', (field, value) => {
    const result = analyze({
      mode: 'prefix-delegation',
      raFlags: { m: false, o: false, a: true, p: true },
      [field]: value,
    });

    expect(result.readiness).toBe('no-go');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        id: 'dhcpv6-invalid-prefix-length',
        severity: 'blocker',
        evidence: [`${field}=${String(value)}`],
      }),
    );
    expect(result.delegatedPrefixCapacity).toBeNull();
  });

  it.each([
    ['preferredLifetimeSeconds', Number.NaN],
    ['validLifetimeSeconds', Number.POSITIVE_INFINITY],
    ['t1Seconds', -1],
    ['t2Seconds', 1.5],
    ['preferredLifetimeSeconds', 0x1_0000_0000],
  ] as const)('blocks invalid unsigned 32-bit timer %s', (field, value) => {
    const result = analyze({ [field]: value });

    expect(result.readiness).toBe('no-go');
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        id: 'dhcpv6-invalid-time-value',
        severity: 'blocker',
        evidence: [`${field}=${String(value)}`],
      }),
    );
  });
});
