import type { DhcpOptionDefinition, DhcpOptionValueType } from '../domain/types';

type DefinitionSeed = [code: number, name: string, aliases: string[], valueType: DhcpOptionValueType, repeatable: boolean, description: string, source: string];

const v4: DefinitionSeed[] = [
  [1, 'Subnet Mask', ['netmask'], 'ipv4', false, 'IPv4 subnet mask assigned to the client.', 'RFC 2132 section 3.3'],
  [3, 'Router', ['gateway', 'default route'], 'ipv4-list', false, 'Ordered list of IPv4 default gateways.', 'RFC 2132 section 3.5'],
  [6, 'Domain Name Server', ['dns', 'name server'], 'ipv4-list', false, 'Ordered list of IPv4 DNS resolvers.', 'RFC 2132 section 3.8'],
  [12, 'Host Name', ['hostname'], 'string', false, 'Client host name.', 'RFC 2132 section 3.14'],
  [15, 'Domain Name', ['domain suffix'], 'string', false, 'Domain name used by the client.', 'RFC 2132 section 3.17'],
  [42, 'Network Time Protocol Servers', ['ntp'], 'ipv4-list', false, 'Ordered list of NTP server addresses.', 'RFC 2132 section 8.3'],
  [43, 'Vendor-Specific Information', ['vendor option'], 'hex', false, 'Vendor-defined opaque option data.', 'RFC 2132 section 8.4'],
  [50, 'Requested IP Address', ['requested address'], 'ipv4', false, 'IPv4 address requested by the client.', 'RFC 2132 section 9.1'],
  [51, 'IP Address Lease Time', ['lease', 'lease time'], 'uint32', false, 'Lease duration in seconds.', 'RFC 2132 section 9.2'],
  [53, 'DHCP Message Type', ['message type'], 'message-type', false, 'DHCP message discriminator.', 'RFC 2132 section 9.6'],
  [54, 'Server Identifier', ['dhcp server'], 'ipv4', false, 'Selected DHCP server identifier.', 'RFC 2132 section 9.7'],
  [58, 'Renewal Time Value', ['t1', 'renewal'], 'uint32', false, 'T1 renewal interval in seconds.', 'RFC 2132 section 9.11'],
  [59, 'Rebinding Time Value', ['t2', 'rebinding'], 'uint32', false, 'T2 rebinding interval in seconds.', 'RFC 2132 section 9.12'],
  [60, 'Vendor Class Identifier', ['vendor class'], 'string', false, 'Client vendor class identifier.', 'RFC 2132 section 9.13'],
  [66, 'TFTP Server Name', ['boot server', 'next server'], 'string', false, 'Boot server host name or address text.', 'RFC 2132 section 9.4'],
  [67, 'Bootfile Name', ['boot file'], 'string', false, 'Boot file path supplied to a client.', 'RFC 2132 section 9.5'],
  [77, 'User Class', ['user-class'], 'string', true, 'Client user-class identification.', 'RFC 3004'],
  [81, 'Client FQDN', ['fqdn'], 'hex', false, 'Client FQDN flags and encoded name.', 'RFC 4702'],
  [82, 'Relay Agent Information', ['relay information'], 'hex', false, 'Relay-agent supplied suboptions.', 'RFC 3046'],
  [119, 'Domain Search', ['search list'], 'domain-search', false, 'DNS suffix search list.', 'RFC 3397'],
  [121, 'Classless Static Route', ['classless route', 'static routes'], 'classless-routes', false, 'Classless IPv4 destination and router pairs.', 'RFC 3442'],
  [125, 'Vendor-Identifying Vendor-Specific Information', ['vivso'], 'hex', false, 'Enterprise-number scoped vendor data.', 'RFC 3925'],
  [150, 'TFTP Server Address', ['tftp addresses'], 'ipv4-list', false, 'Cisco-compatible TFTP server address list.', 'RFC 5859'],
  [252, 'Web Proxy Auto-Discovery', ['wpad'], 'string', false, 'Proxy auto-discovery URL used by some clients.', 'https://learn.microsoft.com/openspecs/windows_protocols/ms-dhcpe/'],
];

const v6: DefinitionSeed[] = [
  [1, 'Client Identifier', ['client duid'], 'hex', false, 'DHCPv6 client DUID.', 'RFC 8415 section 21.2'],
  [2, 'Server Identifier', ['server duid'], 'hex', false, 'DHCPv6 server DUID.', 'RFC 8415 section 21.3'],
  [3, 'Identity Association for Non-temporary Addresses', ['ia-na'], 'hex', true, 'Non-temporary address association.', 'RFC 8415 section 21.4'],
  [5, 'IA Address', ['iaaddr'], 'hex', true, 'IPv6 address and lifetimes in an identity association.', 'RFC 8415 section 21.6'],
  [6, 'Option Request Option', ['oro'], 'hex', false, 'List of requested DHCPv6 option codes.', 'RFC 8415 section 21.7'],
  [7, 'Preference', ['server preference'], 'uint8', false, 'Server preference value.', 'RFC 8415 section 21.8'],
  [8, 'Elapsed Time', ['elapsed'], 'uint16', false, 'Elapsed centiseconds since solicitation began.', 'RFC 8415 section 21.9'],
  [13, 'Status Code', ['status'], 'hex', true, 'DHCPv6 status code and message.', 'RFC 8415 section 21.13'],
  [23, 'DNS Recursive Name Server', ['dns', 'recursive resolver'], 'hex', false, 'IPv6 recursive resolver address list.', 'RFC 3646 section 3'],
  [24, 'Domain Search List', ['search list'], 'domain-search', false, 'DHCPv6 DNS suffix search list.', 'RFC 3646 section 4'],
  [25, 'Identity Association for Prefix Delegation', ['ia-pd'], 'hex', true, 'Delegated-prefix identity association.', 'RFC 8415 section 21.21'],
  [26, 'IA Prefix', ['iaprefix'], 'hex', true, 'Delegated IPv6 prefix and lifetimes.', 'RFC 8415 section 21.22'],
  [39, 'Client FQDN', ['fqdn'], 'hex', false, 'DHCPv6 client FQDN flags and name.', 'RFC 4704'],
];

function materialize(protocol: DhcpOptionDefinition['protocol'], seed: DefinitionSeed): DhcpOptionDefinition {
  const [code, name, aliases, valueType, repeatable, description, source] = seed;
  return { protocol, code, name, aliases, valueType, repeatable, description, source };
}

export const dhcpOptionDefinitions: DhcpOptionDefinition[] = [
  ...v4.map((seed) => materialize('dhcpv4', seed)),
  ...v6.map((seed) => materialize('dhcpv6', seed)),
];
