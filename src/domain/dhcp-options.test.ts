import { describe, expect, it } from 'vitest';
import { dhcpOptionDefinitions } from '../content/dhcp-options';
import {
  decodeDhcpOption,
  encodeDhcpOption,
  searchDhcpOptions,
  validateDhcpOptions,
} from './dhcp-options';

describe('DHCP option catalog', () => {
  it('contains exactly the curated unique protocol/code pairs with authoritative sources', () => {
    const pairs = dhcpOptionDefinitions.map(({ protocol, code }) => `${protocol}:${code}`);
    expect(pairs).toEqual([
      ...[1, 3, 6, 12, 15, 42, 43, 50, 51, 53, 54, 58, 59, 60, 66, 67, 77, 81, 82, 119, 121, 125, 150, 252].map(
        (code) => `dhcpv4:${code}`,
      ),
      ...[1, 2, 3, 5, 6, 7, 8, 13, 23, 24, 25, 26, 39].map((code) => `dhcpv6:${code}`),
    ]);
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(dhcpOptionDefinitions.every((definition) => /^(https:\/\/|RFC\s?\d+)/i.test(definition.source))).toBe(true);
  });

  it('searches aliases and descriptions case-insensitively and filters blank queries by protocol', () => {
    expect(searchDhcpOptions('ROUTER').map(({ code }) => code)).toContain(3);
    expect(searchDhcpOptions('classless').map(({ code }) => code)).toContain(121);
    expect(searchDhcpOptions('dns', 'dhcpv6').map(({ code }) => code)).toEqual([23, 24]);
    expect(searchDhcpOptions('', 'dhcpv6')).toHaveLength(13);
  });

  it('models DHCPv6 option 23 as a typed IPv6 address list', () => {
    expect(
      dhcpOptionDefinitions.find(
        ({ protocol, code }) => protocol === 'dhcpv6' && code === 23,
      ),
    ).toMatchObject({ valueType: 'ipv6-list', source: 'RFC 3646 section 3' });
  });
});

describe('DHCP option codecs', () => {
  it('round-trips an IPv4 list and normalizes separated hex', () => {
    const encoded = encodeDhcpOption({ protocol: 'dhcpv4', code: 6, value: '192.0.2.1, 198.51.100.2' });
    expect(encoded.hex).toBe('c0000201c6336402');
    expect(decodeDhcpOption({ protocol: 'dhcpv4', code: 6, hex: 'c0:00-02 01 c6 33 64 02' })).toMatchObject({
      hex: 'c0000201c6336402',
      value: ['192.0.2.1', '198.51.100.2'],
      displayValue: '192.0.2.1, 198.51.100.2',
      warnings: [],
    });
  });

  it('encodes and decodes RFC 3646 recursive DNS servers with canonical IPv6 output', () => {
    const value = '2001:0DB8:0:0:0:0:0:53, 2001:db8:0:1::53';
    const hex =
      '20010db8000000000000000000000053' +
      '20010db8000000010000000000000053';

    expect(encodeDhcpOption({ protocol: 'dhcpv6', code: 23, value })).toMatchObject({
      hex,
      warnings: [],
      definition: { valueType: 'ipv6-list' },
    });
    expect(decodeDhcpOption({ protocol: 'dhcpv6', code: 23, hex })).toMatchObject({
      value: ['2001:db8::53', '2001:db8:0:1::53'],
      displayValue: '2001:db8::53, 2001:db8:0:1::53',
      warnings: [],
    });
  });

  it.each([
    ['IPv4 is not an IPv6 literal', '192.0.2.1'],
    ['multiple compression markers', '2001:db8::1::53'],
    ['too many groups', '2001:db8:0:0:0:0:0:0:53'],
    ['zone identifiers are not option literals', 'fe80::1%eth0'],
    ['empty list item', '2001:db8::53,'],
  ])('rejects malformed RFC 3646 address lists: %s', (_case, value) => {
    expect(() => encodeDhcpOption({ protocol: 'dhcpv6', code: 23, value })).toThrow(/IPv6|empty item/i);
  });

  it.each(['', '20010db80000000000000000000000'])('rejects incomplete RFC 3646 wire data: %s', (hex) => {
    expect(() => decodeDhcpOption({ protocol: 'dhcpv6', code: 23, hex })).toThrow(
      /complete sixteen-octet addresses/i,
    );
  });

  it('encodes uint32 leases and DHCP message types with literal wire values', () => {
    expect(encodeDhcpOption({ protocol: 'dhcpv4', code: 51, value: 3600 }).hex).toBe('00000e10');
    expect(encodeDhcpOption({ protocol: 'dhcpv4', code: 53, value: 'Offer' }).hex).toBe('02');
    expect(decodeDhcpOption({ protocol: 'dhcpv4', code: 53, hex: '02' })).toMatchObject({
      value: 'DHCPOFFER',
      displayValue: 'DHCPOFFER',
    });
  });

  it('encodes RFC 3397 domain search data without compression', () => {
    const value = 'example.com, lab.example.com';
    const hex = '076578616d706c6503636f6d00036c6162076578616d706c6503636f6d00';
    expect(encodeDhcpOption({ protocol: 'dhcpv4', code: 119, value }).hex).toBe(hex);
    expect(decodeDhcpOption({ protocol: 'dhcpv4', code: 119, hex }).value).toEqual([
      'example.com',
      'lab.example.com',
    ]);
  });

  it('encodes and decodes RFC 3442 classless routes with canonical destinations', () => {
    const value = '0.0.0.0/0 via 192.0.2.1; 10.20.99.1/16 via 192.0.2.254';
    const hex = '00c0000201100a14c00002fe';
    expect(encodeDhcpOption({ protocol: 'dhcpv4', code: 121, value })).toMatchObject({
      hex,
      warnings: ['Destination 10.20.99.1/16 was canonicalized to 10.20.0.0/16.'],
    });
    expect(decodeDhcpOption({ protocol: 'dhcpv4', code: 121, hex }).displayValue).toBe(
      '0.0.0.0/0 via 192.0.2.1; 10.20.0.0/16 via 192.0.2.254',
    );
  });

  it.each([
    ['01ffc0000201', '128.0.0.0/1 via 192.0.2.1'],
    ['110a14ffc0000201', '10.20.128.0/17 via 192.0.2.1'],
    ['1fc00002ffc0000201', '192.0.2.254/31 via 192.0.2.1'],
  ])('masks host bits while decoding non-octet-aligned route %s', (hex, expected) => {
    expect(decodeDhcpOption({ protocol: 'dhcpv4', code: 121, hex }).displayValue).toBe(expected);
  });

  it('rejects malformed hex and invalid typed values', () => {
    expect(() => decodeDhcpOption({ protocol: 'dhcpv4', code: 1, hex: 'abc' })).toThrow(/even/i);
    expect(() => decodeDhcpOption({ protocol: 'dhcpv4', code: 1, hex: 'zz' })).toThrow(/hex/i);
    expect(() => decodeDhcpOption({ protocol: 'dhcpv4', code: 121, hex: '10c0' })).toThrow(/truncated/i);
    expect(() => encodeDhcpOption({ protocol: 'dhcpv4', code: 3, value: '999.0.2.1' })).toThrow(/IPv4/i);
  });

  it('rejects invalid RFC 3397 names with clear errors', () => {
    expect(() => encodeDhcpOption({ protocol: 'dhcpv4', code: 119, value: 'münchen.example' })).toThrow(/ASCII/i);
    expect(() => encodeDhcpOption({ protocol: 'dhcpv4', code: 119, value: 'example..com' })).toThrow(/empty label/i);
    expect(() => encodeDhcpOption({ protocol: 'dhcpv4', code: 119, value: `${'a'.repeat(64)}.com` })).toThrow(
      /63 octets/i,
    );
    expect(() =>
      encodeDhcpOption({ protocol: 'dhcpv4', code: 119, value: Array(128).fill('a').join('.') }),
    ).toThrow(/255 octets/i);
  });

  it('supports the remaining declared value types', () => {
    expect(encodeDhcpOption({ protocol: 'dhcpv4', code: 43, value: 'de ad be ef' }).hex).toBe('deadbeef');
    expect(encodeDhcpOption({ protocol: 'dhcpv6', code: 7, value: 255 }).hex).toBe('ff');
    expect(encodeDhcpOption({ protocol: 'dhcpv6', code: 8, value: 65535 }).hex).toBe('ffff');
    expect(encodeDhcpOption({ protocol: 'dhcpv4', code: 12, value: 'host-a' }).hex).toBe('686f73742d61');
    expect(encodeDhcpOption({ protocol: 'dhcpv6', code: 999, value: true }).hex).toBe('01');
  });

  it('accepts exact integer and RFC 3397 boundaries while rejecting values immediately outside them', () => {
    expect(encodeDhcpOption({ protocol: 'dhcpv4', code: 51, value: 0 }).hex).toBe('00000000');
    expect(encodeDhcpOption({ protocol: 'dhcpv4', code: 51, value: 4_294_967_295 }).hex).toBe('ffffffff');
    expect(() => encodeDhcpOption({ protocol: 'dhcpv4', code: 51, value: -1 })).toThrow(/32-bit/i);
    expect(() => encodeDhcpOption({ protocol: 'dhcpv4', code: 51, value: 4_294_967_296 })).toThrow(/32-bit/i);

    const longestName = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(61)].join('.');
    expect(encodeDhcpOption({ protocol: 'dhcpv4', code: 119, value: longestName }).hex).toHaveLength(510);
    expect(() => encodeDhcpOption({ protocol: 'dhcpv4', code: 121, value: '10.0.0.0/33 via 192.0.2.1' })).toThrow(
      /between 0 and 32/i,
    );
  });
});

describe('validateDhcpOptions', () => {
  it('reports duplicate singletons, timer ordering, PXE context, and route interoperability', () => {
    const issues = validateDhcpOptions([
      { protocol: 'dhcpv4', code: 51, value: 3600 },
      { protocol: 'dhcpv4', code: 58, value: 3200 },
      { protocol: 'dhcpv4', code: 59, value: 3000 },
      { protocol: 'dhcpv4', code: 66, value: 'boot.example.test' },
      { protocol: 'dhcpv4', code: 121, value: '0.0.0.0/0 via 192.0.2.1' },
      { protocol: 'dhcpv4', code: 6, value: '192.0.2.1' },
      { protocol: 'dhcpv4', code: 6, value: '198.51.100.2' },
    ]);

    expect(issues.map(({ key, severity }) => `${key}:${severity}`)).toEqual([
      'duplicateSingleton:error',
      't1NotBeforeT2:error',
      'pxeContextMissing:info',
      'classlessRouteWithoutRouter:warning',
    ]);
  });

  it('reports invalid values instead of throwing and suppresses PXE context info when provided', () => {
    const issues = validateDhcpOptions(
      [{ protocol: 'dhcpv4', code: 67, value: 'bootx64.efi' }, { protocol: 'dhcpv4', code: 3, value: 'bad-ip' }],
      { pxe: true },
    );
    expect(issues.map(({ key }) => ({ key }))).toEqual([{ key: 'invalidValue' }]);
  });

  it('rejects T2 values at or beyond the lease duration', () => {
    expect(
      validateDhcpOptions([
        { protocol: 'dhcpv4', code: 51, value: 3600 },
        { protocol: 'dhcpv4', code: 59, value: 3600 },
      ]).map(({ key }) => key),
    ).toEqual(['t2NotBeforeLease']);
  });

  it('explains the option 121 warning as a legacy-client interoperability risk', () => {
    const issue = validateDhcpOptions([
      { protocol: 'dhcpv4', code: 121, value: '0.0.0.0/0 via 192.0.2.1' },
    ]).find(({ key }) => key === 'classlessRouteWithoutRouter');
    expect(issue?.message).toBe(
      'Clients that do not support option 121 may need option 3 to receive a default gateway.',
    );
  });
});
