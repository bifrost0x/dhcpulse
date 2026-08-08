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

  it('accepts Microsoft XML with leading comments and processing instructions', () => {
    const body = microsoftXml.replace(/^<\?xml[^>]*\?>/, '');
    const text = `<?xml version="1.0"?>\n<!-- synthetic documentation -->\n<?dhcp-test bounded?>\n${body}`;

    expect(detectDhcpConfigFormat(text, 'export.xml')).toBe('microsoft-xml');
    expect(importDhcpConfiguration({ text }).configuration.ipv4Scopes.length).toBeGreaterThan(0);
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
    expect(dnsmasqConfig.ipv6Scopes[0]?.cidr).toBe('2001:db8:30::/64');
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

  it('normalizes the same MAC reservation identity across Microsoft, Kea, ISC, and dnsmasq', () => {
    const microsoft = `<DhcpServerExport><IPv4><Scopes><Scope><ScopeId>192.0.2.0</ScopeId><SubnetMask>255.255.255.0</SubnetMask><Reservations><Reservation><IPAddress>192.0.2.50</IPAddress><ClientId>02-00-5E-10-00-AA</ClientId><Name>ms-host</Name></Reservation></Reservations></Scope></Scopes></IPv4></DhcpServerExport>`;
    const keaMac = `{"Dhcp4":{"subnet4":[{"subnet":"192.0.2.0/24","reservations":[{"hw-address":"02:00:5e:10:00:aa","ip-address":"192.0.2.50","hostname":"kea-host"}]}]}}`;
    const iscMac = `subnet 192.0.2.0 netmask 255.255.255.0 { host isc-host { hardware ethernet 02:00:5E:10:00:AA; fixed-address 192.0.2.50; } }`;
    const dnsmasqMac = `dhcp-range=192.0.2.10,192.0.2.20,255.255.255.0\ndhcp-host=02-00-5e-10-00-aa,dnsmasq-host,192.0.2.50`;
    const configurations = [
      importDhcpConfiguration({ text: microsoft, format: 'microsoft-xml' }).configuration,
      importDhcpConfiguration({ text: keaMac, format: 'kea-json' }).configuration,
      importDhcpConfiguration({ text: iscMac, format: 'isc-dhcpd' }).configuration,
      importDhcpConfiguration({ text: dnsmasqMac, format: 'dnsmasq' }).configuration,
    ];
    const reservations = configurations.map((configuration) => configuration.reservations[0]!);

    expect(reservations.map(({ identifier }) => identifier)).toEqual(Array(4).fill('02:00:5e:10:00:aa'));
    expect(reservations.map(({ identifierType }) => identifierType)).toEqual(Array(4).fill('mac'));
    expect(new Set(reservations.map(({ id }) => id)).size).toBe(1);
  });

  it('keeps repeated MAC reservations and their options unique across scopes', () => {
    const text = `{"Dhcp4":{"subnet4":[
      {"subnet":"192.0.2.0/24","reservations":[{"hw-address":"02:00:5e:10:00:aa","ip-address":"192.0.2.50","option-data":[{"code":223,"data":"first"}]}]},
      {"subnet":"198.51.100.0/24","reservations":[{"hw-address":"02:00:5e:10:00:aa","ip-address":"198.51.100.50","option-data":[{"code":223,"data":"second"}]}]}
    ]}}`;

    const configuration = importDhcpConfiguration({ text, format: 'kea-json' }).configuration;
    const reservationIds = configuration.reservations.map(({ id }) => id);
    const ownerIds = configuration.options.filter(({ code }) => code === 223).map(({ reservationId }) => reservationId);

    expect(new Set(reservationIds).size).toBe(2);
    expect(new Set(ownerIds).size).toBe(2);
    expect(new Set(ownerIds)).toEqual(new Set(reservationIds));
    expect(new Set(configuration.options.filter(({ code }) => code === 223).map(({ id }) => id)).size).toBe(2);
  });

  it('preserves explicit 12-hex client identifiers in Kea and dnsmasq', () => {
    const configurations = [
      importDhcpConfiguration({
        text: `{"Dhcp4":{"reservations":[{"client-id":"02005e1000aa","ip-address":"192.0.2.50"}]}}`,
        format: 'kea-json',
      }).configuration,
      importDhcpConfiguration({ text: 'dhcp-host=id:02005e1000aa,192.0.2.50', format: 'dnsmasq' }).configuration,
    ];

    for (const configuration of configurations) {
      expect(configuration.reservations[0]).toMatchObject({
        identifier: '02005e1000aa',
        identifierType: 'client-id',
      });
    }
  });

  it.each([
    '192.0.2.10-192.0.2.20',
    '192.0.2.10 -192.0.2.20',
    '192.0.2.10- 192.0.2.20',
  ])('accepts Kea pool ranges with optional whitespace: %s', (pool) => {
    const text = `{"Dhcp4":{"subnet4":[{"subnet":"192.0.2.0/24","pools":[{"pool":"${pool}"}]}]}}`;

    const imported = importDhcpConfiguration({ text, format: 'kea-json' }).configuration.pools[0];

    expect(imported).toMatchObject({ start: '192.0.2.10', end: '192.0.2.20' });
  });

  it('imports ISC dynamic-bootp and single-address ranges without shifting operands', () => {
    const text = `subnet 198.51.100.0 netmask 255.255.255.0 {
      range dynamic-bootp 198.51.100.10 198.51.100.20;
      range 198.51.100.30;
    }`;

    const pools = importDhcpConfiguration({ text, format: 'isc-dhcpd' }).configuration.pools;

    expect(pools).toEqual(expect.arrayContaining([
      expect.objectContaining({ start: '198.51.100.10', end: '198.51.100.20' }),
      expect.objectContaining({ start: '198.51.100.30', end: '198.51.100.30' }),
    ]));
  });

  it('warns and omits dnsmasq static and proxy ranges instead of modeling dynamic pools', () => {
    const text = `dhcp-range=192.0.2.0,static,255.255.255.0\ndhcp-range=198.51.100.0,proxy`;

    const { configuration, warnings } = importDhcpConfiguration({ text, format: 'dnsmasq' });

    expect(configuration.pools).toEqual([]);
    expect(warnings).toContainEqual(expect.objectContaining({ code: 'unsupported-directive', count: 2 }));
  });

  it('rejects unrelated XML roots during detection and explicit Microsoft import', () => {
    const unrelated = '<?xml version="1.0"?><inventory><item>example</item></inventory>';

    expect(detectDhcpConfigFormat(unrelated, 'inventory.xml')).toBe('unknown');
    try {
      importDhcpConfiguration({ text: unrelated, format: 'microsoft-xml' });
      throw new Error('Expected import to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigImportError);
      expect((error as ConfigImportError).code).toBe('UNKNOWN_FORMAT');
    }
  });

  it.each([
    ['UNSAFE_XML', '<!DOCTYPE x [<!ENTITY y "z">]><DhcpServerExport/>', 'export.xml'],
    ['MALFORMED_XML', '<DhcpServerExport><Scope></DhcpServerExport>', 'export.xml'],
    ['MALFORMED_JSON', '{"Dhcp4": { broken } }', 'kea.json'],
    ['UNKNOWN_FORMAT', 'not a recognizable DHCP configuration', 'notes.txt'],
  ] as const)('fails with stable code %s', (code, text, fileName) => {
    expectImportError(text, fileName, code);
  });

  it.each([
    ['unterminated string', 'subnet 192.0.2.0 netmask 255.255.255.0 { option domain-name "example.test; }'],
    ['unterminated block comment', 'subnet 192.0.2.0 netmask 255.255.255.0 { /* unfinished'],
    ['unmatched opening brace', 'subnet 192.0.2.0 netmask 255.255.255.0 { range 192.0.2.10 192.0.2.20;'],
    ['premature EOF', 'default-lease-time 3600'],
    ['closing brace before statement terminator', 'subnet 192.0.2.0 netmask 255.255.255.0 { range 192.0.2.10 192.0.2.20 }'],
    ['opening brace without a block header', '{ authoritative; }'],
    ['unexpected closing brace', 'subnet 192.0.2.0 netmask 255.255.255.0 { } }'],
  ] as const)('rejects malformed ISC with stable code: %s', (_case, text) => {
    expectImportErrorWithFormat(text, 'isc-dhcpd', 'MALFORMED_ISC');
  });

  it('rejects UTF-8 input larger than 2 MiB before parsing', () => {
    expectImportError(`{"Dhcp4":"${'x'.repeat(2 * 1024 * 1024)}"}`, 'kea.json', 'INPUT_TOO_LARGE');
  });

  it.each([
    ['kea-json', `{"Dhcp4":{"nested":${'['.repeat(70)}0${']'.repeat(70)}}}`],
    ['isc-dhcpd', `${'group documentation {'.repeat(70)}${'}'.repeat(70)}`],
  ] as const)('rejects excessively deep %s structures with a stable code', (format, text) => {
    expectImportErrorWithFormat(text, format, 'STRUCTURE_TOO_COMPLEX');
  });

  it.each([
    ['kea-json', `{"Dhcp4":{"values":[${Array.from({ length: 20_100 }, () => '0').join(',')}]}}`],
    ['isc-dhcpd', 'unknown-directive;\n'.repeat(20_100)],
  ] as const)('rejects excessively complex %s structures with a stable code', (format, text) => {
    expectImportErrorWithFormat(text, format, 'STRUCTURE_TOO_COMPLEX');
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

function expectImportErrorWithFormat(
  text: string,
  format: 'kea-json' | 'isc-dhcpd',
  code: ConfigImportError['code'],
): void {
  try {
    importDhcpConfiguration({ text, format });
    throw new Error('Expected import to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigImportError);
    expect((error as ConfigImportError).code).toBe(code);
  }
}
