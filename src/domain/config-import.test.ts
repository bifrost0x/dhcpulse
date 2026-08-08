import { describe, expect, it } from 'vitest';
import dnsmasq from '../test/fixtures/dnsmasq.conf?raw';
import iscDhcpd from '../test/fixtures/isc-dhcpd.conf?raw';
import kea from '../test/fixtures/kea.json?raw';
import microsoftXml from '../test/fixtures/microsoft-dhcp.xml?raw';
import {
  ConfigImportError,
  detectDhcpConfigFormat,
  importDhcpConfiguration,
} from './config-import';

const fixtures = [
  ['microsoft-xml', 'export.xml', microsoftXml],
  ['kea-json', 'kea.json', kea],
  ['isc-dhcpd', 'dhcpd.conf', iscDhcpd],
  ['dnsmasq', 'dnsmasq.conf', dnsmasq],
] as const;

describe('detectDhcpConfigFormat', () => {
  it.each(fixtures)('detects %s from content', (format, fileName, text) => {
    expect(detectDhcpConfigFormat(text, fileName)).toBe(format);
  });

  it('prefers recognizable content over a misleading extension', () => {
    expect(detectDhcpConfigFormat(kea, 'misleading.xml')).toBe('kea-json');
  });
});

describe('importDhcpConfiguration', () => {
  it.each(fixtures)('imports a bounded %s subset with provenance and visible warnings', (format, fileName, text) => {
    const first = importDhcpConfiguration({ text, fileName });
    const second = importDhcpConfiguration({ text, fileName });

    expect(first.configuration.metadata.source.format).toBe(format);
    expect(first.configuration.ipv4Scopes.length + first.configuration.ipv6Scopes.length).toBeGreaterThan(0);
    expect(first.configuration.pools.length).toBeGreaterThan(0);
    expect(first.configuration.options.length).toBeGreaterThan(0);
    expect(first.configuration.reservations.length).toBeGreaterThan(0);
    expect(first.configuration.pools[0]?.provenance.location).toBeTruthy();
    expect(first.configuration.pools.map(({ id }) => id)).toEqual(
      second.configuration.pools.map(({ id }) => id),
    );
    expect(first.warnings.some(({ code }) => code === 'unsupported-directive')).toBe(true);
    expect(first.warnings.map(({ message }) => message).join(' ')).not.toContain('opaque.example.com');
    expect(first.configuration.parserWarnings).toEqual(first.warnings);
  });

  it('keeps comment markers inside Kea JSON strings', () => {
    const { configuration } = importDhcpConfiguration({ text: kea, fileName: 'kea.json' });

    expect(configuration.options).toContainEqual(
      expect.objectContaining({ name: 'example-url', value: 'https://example.com/#fragment' }),
    );
  });

  it('extracts recognizable vendor-specific settings without requiring lease data', () => {
    const microsoft = importDhcpConfiguration({ text: microsoftXml, format: 'microsoft-xml' }).configuration;
    const keaConfig = importDhcpConfiguration({ text: kea, format: 'kea-json' }).configuration;
    const isc = importDhcpConfiguration({ text: iscDhcpd, format: 'isc-dhcpd' }).configuration;
    const dnsmasqConfig = importDhcpConfiguration({ text: dnsmasq, format: 'dnsmasq' }).configuration;

    expect(microsoft.ipv6Scopes[0]?.cidr).toBe('2001:db8:10::/64');
    expect(microsoft.exclusions[0]).toMatchObject({ start: '192.0.2.30', end: '192.0.2.39' });
    expect(microsoft.failoverRelationships[0]).toMatchObject({ name: 'example-ha', partner: 'dhcp02.example.com' });
    expect(microsoft.dnsUpdateSettings[0]).toMatchObject({ enabled: true, domain: 'example.com' });
    expect(microsoft.auditSettings[0]).toMatchObject({ enabled: true });

    expect(keaConfig.relayAddresses[0]?.address).toBe('192.0.2.1');
    expect(keaConfig.failoverRelationships[0]).toMatchObject({ name: 'kea-a', mode: 'hot-standby' });
    expect(keaConfig.dnsUpdateSettings[0]).toMatchObject({ enabled: true });
    expect(keaConfig.ipv6Scopes[0]?.preferredLifetimeSeconds).toBe(3600);

    expect(isc.classes.some(({ name }) => name === 'documentation-clients')).toBe(true);
    expect(isc.failoverRelationships[0]?.name).toBe('example-ha');
    expect(isc.ipv4Scopes[0]?.leaseLifetimeSeconds).toBe(28800);

    expect(dnsmasqConfig.servers[0]?.authoritative).toBe(true);
    expect(dnsmasqConfig.relayAddresses[0]).toMatchObject({ address: '203.0.113.1', serverAddress: '203.0.113.2' });
    expect(dnsmasqConfig.ipv6Scopes[0]?.cidr).toBe('2001:db8:30::100/64');
    expect(dnsmasqConfig.policies.some(({ name }) => name === 'docs')).toBe(true);
  });

  it('counts arbitrary unsupported XML elements and nested Kea keys without echoing values', () => {
    const xml = microsoftXml.replaceAll('UnsupportedSetting', 'VendorOpaqueSetting');
    const nestedKea = `{
      "Dhcp4": {
        "subnet4": [{
          "subnet": "192.0.2.0/24",
          "vendor-opaque": "opaque.example.com"
        }]
      }
    }`;

    const xmlWarning = importDhcpConfiguration({ text: xml, format: 'microsoft-xml' }).warnings.find(
      ({ code }) => code === 'unsupported-directive',
    );
    const keaWarning = importDhcpConfiguration({ text: nestedKea, format: 'kea-json' }).warnings.find(
      ({ code }) => code === 'unsupported-directive',
    );

    expect(xmlWarning?.count).toBeGreaterThan(0);
    expect(keaWarning?.count).toBeGreaterThan(0);
    expect(`${xmlWarning?.message} ${keaWarning?.message}`).not.toContain('opaque.example.com');
  });

  it('resolves ISC failover peer references independent of declaration order', () => {
    const text = `
      subnet 198.51.100.0 netmask 255.255.255.0 {
        pool {
          failover peer "late-peer";
          range 198.51.100.20 198.51.100.40;
        }
      }
      failover peer "late-peer" {
        primary;
        address 198.51.100.2;
        peer address 198.51.100.3;
      }
    `;

    const { configuration } = importDhcpConfiguration({ text, format: 'isc-dhcpd' });

    expect(configuration.failoverRelationships[0]?.scopeIds).toEqual([configuration.ipv4Scopes[0]?.id]);
  });

  it('records the owning pool or reservation for repeated Kea and ISC options', () => {
    const keaOwners = `{"Dhcp4":{"subnet4":[{"subnet":"192.0.2.0/24","pools":[
      {"pool":"192.0.2.10 - 192.0.2.20","option-data":[{"code":222,"data":"same"}]},
      {"pool":"192.0.2.30 - 192.0.2.40","option-data":[{"code":222,"data":"same"}]}
    ],"reservations":[
      {"hw-address":"02:00:5e:10:00:10","ip-address":"192.0.2.50","option-data":[{"code":223,"data":"same"}]},
      {"hw-address":"02:00:5e:10:00:11","ip-address":"192.0.2.51","option-data":[{"code":223,"data":"same"}]}
    ]}]}}`;
    const iscOwners = `subnet 198.51.100.0 netmask 255.255.255.0 {
      pool { range 198.51.100.10 198.51.100.20; option unknown-222 same; }
      pool { range 198.51.100.30 198.51.100.40; option unknown-222 same; }
    }`;

    const keaConfig = importDhcpConfiguration({ text: keaOwners, format: 'kea-json' }).configuration;
    const iscConfig = importDhcpConfiguration({ text: iscOwners, format: 'isc-dhcpd' }).configuration;
    const keaPoolOptions = keaConfig.options.filter(({ level }) => level === 'pool');
    const keaReservationOptions = keaConfig.options.filter(({ level }) => level === 'reservation');
    const iscPoolOptions = iscConfig.options.filter(({ level }) => level === 'pool');

    expect(new Set(keaPoolOptions.map(({ poolId }) => poolId)).size).toBe(2);
    expect(new Set(keaPoolOptions.map(({ id }) => id)).size).toBe(2);
    expect(new Set(keaReservationOptions.map(({ reservationId }) => reservationId)).size).toBe(2);
    expect(new Set(keaReservationOptions.map(({ id }) => id)).size).toBe(2);
    expect(new Set(iscPoolOptions.map(({ poolId }) => poolId)).size).toBe(2);
    expect(new Set(iscPoolOptions.map(({ id }) => id)).size).toBe(2);
  });

  it('does not mistake a dnsmasq broadcast address for a subnet mask', () => {
    const text = 'dhcp-range=192.0.2.10,192.0.2.20,255.255.255.0,192.0.2.255,1h';

    const { configuration, warnings } = importDhcpConfiguration({ text, format: 'dnsmasq' });

    expect(configuration.ipv4Scopes[0]?.cidr).toBe('192.0.2.0/24');
    expect(warnings).toContainEqual(expect.objectContaining({ code: 'unsupported-directive' }));
  });

  it.each([
    ['UNSAFE_XML', '<!DOCTYPE x [<!ENTITY y "z">]><DhcpServerExport/>', 'export.xml'],
    ['MALFORMED_XML', '<DhcpServerExport><Scope></DhcpServerExport>', 'export.xml'],
    ['MALFORMED_JSON', '{"Dhcp4": { broken } }', 'kea.json'],
    ['UNKNOWN_FORMAT', 'not a recognizable DHCP configuration', 'notes.txt'],
  ] as const)('fails with stable code %s', (code, text, fileName) => {
    expectImportError(text, fileName, code);
  });

  it('rejects UTF-8 input larger than 2 MiB before parsing', () => {
    expectImportError(`{"Dhcp4":"${'x'.repeat(2 * 1024 * 1024)}"}`, 'kea.json', 'INPUT_TOO_LARGE');
  });
});

function expectImportError(text: string, fileName: string, code: ConfigImportError['code']): void {
  try {
    importDhcpConfiguration({ text, fileName });
    throw new Error('Expected import to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigImportError);
    expect((error as ConfigImportError).code).toBe(code);
  }
}
