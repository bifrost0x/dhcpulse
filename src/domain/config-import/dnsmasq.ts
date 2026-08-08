import {
  deterministicConfigId,
  emptyDhcpConfiguration,
  type DhcpConfiguration,
  type DhcpScope,
  type DhcpServer,
  type ReservationIdentifierType,
} from '../config-model';
import {
  addWarning,
  assignReservationsToScopes,
  isLeaseValue,
  maskToPrefix,
  networkAddress,
  optionCode,
  optional,
  parseLeaseSeconds,
  provenance,
  splitDnsmasq,
  takeTags,
  valueKey,
} from './shared';

export function importDnsmasq(text: string, fileName?: string): DhcpConfiguration {
  const configuration = emptyDhcpConfiguration('dnsmasq', 'dnsmasq', fileName);
  const server: DhcpServer = {
    id: deterministicConfigId('server', 'dnsmasq'),
    provenance: provenance('dnsmasq', 'line 1'),
  };
  configuration.servers.push(server);
  const unsupported = { count: 0 };
  const tags = new Set<string>();

  text.split(/\r?\n/).forEach((rawLine, zeroIndex) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const withoutPrefix = line.startsWith('--') ? line.slice(2) : line;
    const equals = withoutPrefix.indexOf('=');
    const directive = (equals < 0 ? withoutPrefix : withoutPrefix.slice(0, equals)).trim().toLowerCase();
    const rawValue = equals < 0 ? '' : withoutPrefix.slice(equals + 1).trim();
    const location = `line ${zeroIndex + 1}`;

    if (directive === 'dhcp-authoritative') server.authoritative = true;
    else if (directive === 'dhcp-range') unsupported.count += importRange(configuration, splitDnsmasq(rawValue), location, tags);
    else if (directive === 'dhcp-host') importHost(configuration, splitDnsmasq(rawValue), location, tags);
    else if (directive === 'dhcp-option') importOption(configuration, splitDnsmasq(rawValue), location, tags);
    else if (directive === 'dhcp-relay') {
      const parts = splitDnsmasq(rawValue);
      const address = parts[0];
      if (!address) return;
      configuration.relayAddresses.push({
        id: deterministicConfigId('relay', address, parts[1], parts[2]),
        provenance: provenance('dnsmasq', location),
        protocol: address.includes(':') ? 'dhcpv6' : 'dhcpv4',
        address,
        ...optional('serverAddress', parts[1]),
        ...optional('interfaceName', parts[2]),
      });
    } else unsupported.count += 1;
  });

  for (const tag of [...tags].sort()) {
    configuration.policies.push({
      id: deterministicConfigId('tag', tag),
      provenance: provenance('dnsmasq', '$'),
      kind: 'tag',
      name: tag,
    });
  }
  assignReservationsToScopes(configuration);
  addWarning(configuration, 'unsupported-directive', unsupported.count, '$', 'dnsmasq contains unsupported directives; their values were omitted.');
  if (unsupported.count === 0) addWarning(configuration, 'partial-parse', 1, '$', 'dnsmasq import supports documented DHCP directives, not the complete dnsmasq configuration language.');
  return configuration;
}

function importRange(configuration: DhcpConfiguration, parts: string[], location: string, tags: Set<string>): number {
  const remaining = [...parts];
  const rangeTags = takeTags(remaining, tags);
  const start = remaining.shift();
  if (!start) return 1;
  const protocol = start.includes(':') ? 'dhcpv6' as const : 'dhcpv4' as const;
  const endOrConstructor = remaining.shift();
  if (!endOrConstructor) return 1;
  let end = endOrConstructor;
  let prefixLength: number | undefined;
  let mask: string | undefined;
  let leaseLifetimeSeconds: number | undefined;
  let unsupportedParts = 0;
  for (const part of remaining) {
    if (protocol === 'dhcpv4' && isContiguousIpv4Mask(part) && mask === undefined) mask = part;
    else if (protocol === 'dhcpv4' && /^\d+\.\d+\.\d+\.\d+$/.test(part)) unsupportedParts += 1;
    else if (/^\d+$/.test(part)) prefixLength = Number(part);
    else if (parseLeaseSeconds(part) !== undefined) leaseLifetimeSeconds = parseLeaseSeconds(part);
  }
  if (endOrConstructor.startsWith('constructor:')) end = endOrConstructor;
  const cidr = protocol === 'dhcpv4'
    ? `${networkAddress(start, mask ?? '255.255.255.0')}/${maskToPrefix(mask ?? '255.255.255.0')}`
    : `${start}/${prefixLength ?? 64}`;
  const scope: DhcpScope = {
    id: deterministicConfigId('scope', protocol, cidr),
    provenance: provenance('dnsmasq', location),
    protocol,
    cidr,
    ...(leaseLifetimeSeconds !== undefined ? { leaseLifetimeSeconds } : {}),
  };
  const target = protocol === 'dhcpv4' ? configuration.ipv4Scopes : configuration.ipv6Scopes;
  const existing = target.find((item) => item.cidr === cidr);
  const selectedScope = existing ?? scope;
  if (!existing) target.push(scope);
  configuration.pools.push({
    id: deterministicConfigId('pool', cidr, start, end),
    provenance: provenance('dnsmasq', location),
    protocol,
    scopeId: selectedScope.id,
    start,
    end,
    ...(leaseLifetimeSeconds !== undefined ? { leaseLifetimeSeconds } : {}),
    ...(rangeTags.length ? { tags: rangeTags } : {}),
  });
  return unsupportedParts;
}

function isContiguousIpv4Mask(value: string): boolean {
  const octets = value.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const bits = octets.map((octet) => octet.toString(2).padStart(8, '0')).join('');
  return /^1*0*$/.test(bits);
}

function importHost(configuration: DhcpConfiguration, parts: string[], location: string, tags: Set<string>): void {
  const remaining = [...parts];
  const hostTags = takeTags(remaining, tags);
  const mac = remaining.find((part) => /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(part));
  const duid = remaining.find((part) => /^(?:[0-9a-f]{2}:){6,}[0-9a-f]{2}$/i.test(part));
  const rawAddress = remaining.find((part) => /^\[?[0-9a-f:.]+\]?(?:\/\d+)?$/i.test(part) && (part.includes('.') || part.includes(':')) && part !== mac && part !== duid);
  if (!rawAddress) return;
  const address = rawAddress.replace(/^\[|\]$/g, '');
  const protocol = address.includes(':') ? 'dhcpv6' as const : 'dhcpv4' as const;
  const hostname = remaining.find((part) => part !== mac && part !== duid && part !== rawAddress && !isLeaseValue(part) && !part.startsWith('id:'));
  const identifier = mac ?? duid ?? remaining.find((part) => part.startsWith('id:'))?.slice(3);
  const identifierType: ReservationIdentifierType | undefined = mac ? 'mac' : duid ? 'duid' : identifier ? 'client-id' : hostname ? 'hostname' : undefined;
  configuration.reservations.push({
    id: deterministicConfigId('reservation', protocol, identifier, hostname, address),
    provenance: provenance('dnsmasq', location),
    protocol,
    address,
    ...(identifier ? { identifier } : {}),
    ...(identifierType ? { identifierType } : {}),
    ...(hostname ? { hostname } : {}),
    level: 'global',
    ...(hostTags.length ? { tags: hostTags } : {}),
  });
}

function importOption(configuration: DhcpConfiguration, parts: string[], location: string, tags: Set<string>): void {
  const remaining = [...parts];
  const optionTags = takeTags(remaining, tags);
  const descriptor = remaining.shift();
  if (!descriptor) return;
  const protocol = descriptor.startsWith('option6:') ? 'dhcpv6' as const : 'dhcpv4' as const;
  const rawName = descriptor.replace(/^option6?:/, '');
  const code = /^\d+$/.test(rawName) ? Number(rawName) : optionCode(rawName);
  const value = remaining.length === 1 ? remaining[0] ?? '' : remaining;
  configuration.options.push({
    id: deterministicConfigId('option', protocol, code, rawName, optionTags.join(','), valueKey(value)),
    provenance: provenance('dnsmasq', location),
    protocol,
    ...(code !== undefined ? { code } : {}),
    name: rawName,
    value,
    level: optionTags.length ? 'policy' : 'global',
    ...(optionTags.length ? { tags: optionTags } : {}),
  });
}
