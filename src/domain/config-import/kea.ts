import {
  deterministicConfigId,
  emptyDhcpConfiguration,
  type DhcpConfiguration,
  type DhcpOptionLevel,
  type DhcpReservation,
  type DhcpScope,
  type ReservationIdentifierType,
} from '../config-model';
import {
  addWarning,
  array,
  assertStructureBounds,
  booleanFromUnknown,
  ConfigImportError,
  numberValue,
  normalizeReservationIdentifier,
  optional,
  optionalBoolean,
  optionalNumber,
  primitiveOptionValue,
  provenance,
  reservationConfigId,
  record,
  stringArray,
  stringValue,
  valueKey,
} from './shared';

export function importKeaJson(text: string, fileName?: string): DhcpConfiguration {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripKeaComments(text));
  } catch {
    throw new ConfigImportError('MALFORMED_JSON', 'Kea JSON is malformed after supported comments are removed.');
  }
  assertStructureBounds(parsed);
  const root = record(parsed);
  if (!root) throw new ConfigImportError('MALFORMED_JSON', 'Kea JSON root must be an object.');
  const configuration = emptyDhcpConfiguration('kea-json', 'ISC Kea', fileName);
  const version = stringValue(root.version ?? root['config-version']);
  if (version) configuration.metadata.version = version;
  const unknownCount = countUnknownKeys(root);

  for (const serviceName of ['Dhcp4', 'Dhcp6'] as const) {
    const service = record(root[serviceName]);
    if (!service) continue;
    const protocol = serviceName === 'Dhcp4' ? 'dhcpv4' as const : 'dhcpv6' as const;
    const servicePath = `$.${serviceName}`;
    configuration.servers.push({
      id: deterministicConfigId('server', serviceName),
      provenance: provenance('kea-json', servicePath),
      ...optionalNumber('defaultLeaseTimeSeconds', numberValue(service['valid-lifetime'])),
      ...optionalNumber('maxLeaseTimeSeconds', numberValue(service['max-valid-lifetime'])),
    });

    importOptions(configuration, array(service['option-data']), protocol, 'global', servicePath);
    importReservations(configuration, array(service.reservations), protocol, undefined, `${servicePath}.reservations`);
    importRelay(configuration, record(service.relay), protocol, undefined, `${servicePath}.relay`);
    importClasses(configuration, array(service['client-classes']), `${servicePath}.client-classes`);

    const directSubnets = array(service[protocol === 'dhcpv4' ? 'subnet4' : 'subnet6']);
    directSubnets.forEach((subnet, index) => importSubnet(configuration, subnet, protocol, `${servicePath}.${protocol === 'dhcpv4' ? 'subnet4' : 'subnet6'}[${index}]`));
    array(service['shared-networks']).forEach((sharedValue, sharedIndex) => {
      const shared = record(sharedValue);
      if (!shared) return;
      const sharedPath = `${servicePath}.shared-networks[${sharedIndex}]`;
      const name = stringValue(shared.name) ?? `shared-${sharedIndex}`;
      configuration.policies.push({
        id: deterministicConfigId('shared-network', protocol, name),
        provenance: provenance('kea-json', sharedPath),
        kind: 'shared-network',
        name,
      });
      importOptions(configuration, array(shared['option-data']), protocol, 'shared-network', sharedPath);
      array(shared[protocol === 'dhcpv4' ? 'subnet4' : 'subnet6']).forEach((subnet, subnetIndex) => {
        importSubnet(configuration, subnet, protocol, `${sharedPath}.${protocol === 'dhcpv4' ? 'subnet4' : 'subnet6'}[${subnetIndex}]`, name);
      });
    });

    const servicePreferredLifetime = numberValue(service['preferred-lifetime']);
    const serviceValidLifetime = numberValue(service['valid-lifetime']);
    const serviceScopes = protocol === 'dhcpv4' ? configuration.ipv4Scopes : configuration.ipv6Scopes;
    for (const scope of serviceScopes) {
      if (scope.preferredLifetimeSeconds === undefined && servicePreferredLifetime !== undefined) scope.preferredLifetimeSeconds = servicePreferredLifetime;
      if (scope.validLifetimeSeconds === undefined && serviceValidLifetime !== undefined) scope.validLifetimeSeconds = serviceValidLifetime;
      if (scope.leaseLifetimeSeconds === undefined && serviceValidLifetime !== undefined) scope.leaseLifetimeSeconds = serviceValidLifetime;
    }

    const sendUpdates = booleanFromUnknown(service['ddns-send-updates']);
    const dhcpDdns = record(service['dhcp-ddns']);
    if (sendUpdates !== undefined || dhcpDdns) {
      const domain = dhcpDdns ? stringValue(dhcpDdns['qualifying-suffix']) : undefined;
      configuration.dnsUpdateSettings.push({
        id: deterministicConfigId('dns-update', protocol, sendUpdates, domain),
        provenance: provenance('kea-json', `${servicePath}.ddns-send-updates`),
        ...(sendUpdates !== undefined ? { enabled: sendUpdates } : {}),
        ...(domain ? { domain } : {}),
        ...optionalBoolean('overrideClientUpdate', booleanFromUnknown(service['ddns-override-client-update'])),
        ...optionalBoolean('overrideNoUpdate', booleanFromUnknown(service['ddns-override-no-update'])),
      });
    }
    importHighAvailability(configuration, array(service['hooks-libraries']), servicePath);
  }

  addWarning(configuration, 'unsupported-directive', unknownCount, '$', 'Kea JSON contains unsupported keys; their values were omitted.');
  if (unknownCount === 0) addWarning(configuration, 'partial-parse', 1, '$', 'Kea JSON import supports documented analysis fields, not every Kea extension.');
  return configuration;
}

function importSubnet(
  configuration: DhcpConfiguration,
  value: unknown,
  protocol: 'dhcpv4' | 'dhcpv6',
  path: string,
  sharedNetwork?: string,
): void {
  const subnet = record(value);
  if (!subnet) return;
  const cidr = stringValue(subnet.subnet);
  if (!cidr) return;
  const scope: DhcpScope = {
    id: deterministicConfigId('scope', protocol, cidr),
    provenance: provenance('kea-json', path),
    protocol,
    cidr,
    ...optional('name', stringValue(subnet['user-context']) ?? undefined),
    ...optionalNumber('leaseLifetimeSeconds', numberValue(subnet['valid-lifetime'])),
    ...optionalNumber('preferredLifetimeSeconds', numberValue(subnet['preferred-lifetime'])),
    ...optionalNumber('validLifetimeSeconds', numberValue(subnet['valid-lifetime'])),
    ...(sharedNetwork ? { sharedNetwork } : {}),
  };
  (protocol === 'dhcpv4' ? configuration.ipv4Scopes : configuration.ipv6Scopes).push(scope);

  array(subnet.pools).forEach((poolValue, index) => {
    const pool = record(poolValue);
    const range = pool ? stringValue(pool.pool) : undefined;
    if (!range) return;
    const rangeParts = range.split(/\s*-\s*/, 2);
    const start = rangeParts[0];
    if (!start) return;
    const end = rangeParts[1] ?? start;
    const poolId = deterministicConfigId('pool', cidr, start, end);
    configuration.pools.push({
      id: poolId,
      provenance: provenance('kea-json', `${path}.pools[${index}]`),
      protocol,
      scopeId: scope.id,
      start,
      end,
      ...optionalNumber('leaseLifetimeSeconds', numberValue(pool?.['valid-lifetime'])),
    });
    if (pool) importOptions(configuration, array(pool['option-data']), protocol, 'pool', `${path}.pools[${index}]`, scope.id, poolId);
  });

  array(subnet['excluded-prefixes']).forEach((excludedValue, index) => {
    const excluded = record(excludedValue);
    const prefix = excluded ? stringValue(excluded['excluded-prefix']) : undefined;
    if (!prefix) return;
    configuration.exclusions.push({
      id: deterministicConfigId('exclusion', cidr, prefix),
      provenance: provenance('kea-json', `${path}.excluded-prefixes[${index}]`),
      protocol,
      scopeId: scope.id,
      start: prefix,
      end: prefix,
    });
  });
  importReservations(configuration, array(subnet.reservations), protocol, scope, `${path}.reservations`);
  importOptions(configuration, array(subnet['option-data']), protocol, 'scope', `${path}.option-data`, scope.id);
  importRelay(configuration, record(subnet.relay), protocol, scope.id, `${path}.relay`);
}

function importOptions(
  configuration: DhcpConfiguration,
  values: unknown[],
  protocol: 'dhcpv4' | 'dhcpv6',
  level: DhcpOptionLevel,
  path: string,
  scopeId?: string,
  poolId?: string,
  reservationId?: string,
): void {
  values.forEach((value, index) => {
    const option = record(value);
    if (!option) return;
    const code = numberValue(option.code);
    const name = stringValue(option.name);
    const data = primitiveOptionValue(option.data);
    if (data === undefined) return;
    configuration.options.push({
      id: deterministicConfigId('option', protocol, code, name, level, scopeId, poolId, reservationId, valueKey(data)),
      provenance: provenance('kea-json', `${path}[${index}]`),
      protocol,
      ...(code !== undefined ? { code } : {}),
      ...(name ? { name } : {}),
      value: data,
      level,
      ...(scopeId ? { scopeId } : {}),
      ...(poolId ? { poolId } : {}),
      ...(reservationId ? { reservationId } : {}),
    });
  });
}

function importReservations(
  configuration: DhcpConfiguration,
  values: unknown[],
  protocol: 'dhcpv4' | 'dhcpv6',
  scope: DhcpScope | undefined,
  path: string,
): void {
  values.forEach((value, index) => {
    const reservation = record(value);
    if (!reservation) return;
    const address = stringValue(reservation['ip-address']) ?? stringArray(reservation['ip-addresses'])[0];
    if (!address) return;
    const identifiers: Array<[ReservationIdentifierType, string | undefined]> = [
      ['mac', stringValue(reservation['hw-address'])],
      ['duid', stringValue(reservation.duid)],
      ['client-id', stringValue(reservation['client-id'])],
      ['hostname', stringValue(reservation.hostname)],
    ];
    const selected = identifiers.find(([, identifier]) => identifier);
    const normalizedIdentifier = normalizeReservationIdentifier(selected?.[1], selected?.[0]);
    const identifierType = normalizedIdentifier.identifierType;
    const identifier = normalizedIdentifier.identifier;
    const hostname = stringValue(reservation.hostname);
    const normalized: DhcpReservation = {
      id: reservationConfigId(protocol, identifier, identifierType, hostname, address, scope?.id),
      provenance: provenance('kea-json', `${path}[${index}]`),
      protocol,
      ...(scope ? { scopeId: scope.id } : {}),
      address,
      ...(identifier ? { identifier } : {}),
      ...(identifierType ? { identifierType } : {}),
      ...(hostname ? { hostname } : {}),
      level: scope ? 'scope' : 'global',
    };
    configuration.reservations.push(normalized);
    importOptions(configuration, array(reservation['option-data']), protocol, 'reservation', `${path}[${index}].option-data`, scope?.id, undefined, normalized.id);
  });
}

function importRelay(
  configuration: DhcpConfiguration,
  relay: Record<string, unknown> | null,
  protocol: 'dhcpv4' | 'dhcpv6',
  scopeId: string | undefined,
  path: string,
): void {
  if (!relay) return;
  const addresses = [...stringArray(relay['ip-addresses']), ...stringArray(relay.addresses)];
  addresses.forEach((address, index) => configuration.relayAddresses.push({
    id: deterministicConfigId('relay', protocol, scopeId, address),
    provenance: provenance('kea-json', `${path}.ip-addresses[${index}]`),
    protocol,
    ...(scopeId ? { scopeId } : {}),
    address,
  }));
}

function importClasses(configuration: DhcpConfiguration, values: unknown[], path: string): void {
  values.forEach((value, index) => {
    const item = record(value);
    const name = item ? stringValue(item.name) : undefined;
    if (!name) return;
    configuration.classes.push({
      id: deterministicConfigId('class', name),
      provenance: provenance('kea-json', `${path}[${index}]`),
      kind: 'class',
      name,
      ...optional('expression', stringValue(item?.test)),
    });
  });
}

function importHighAvailability(configuration: DhcpConfiguration, hooks: unknown[], servicePath: string): void {
  hooks.forEach((hookValue, hookIndex) => {
    const hook = record(hookValue);
    const parameters = hook ? record(hook.parameters) : null;
    const relationships = parameters ? array(parameters['high-availability']) : [];
    relationships.forEach((relationshipValue, relationshipIndex) => {
      const relationship = record(relationshipValue);
      if (!relationship) return;
      const name = stringValue(relationship['this-server-name']) ?? `kea-ha-${hookIndex}-${relationshipIndex}`;
      const peers = array(relationship.peers).map(record).filter((peer): peer is Record<string, unknown> => peer !== null);
      const partner = peers.map((peer) => stringValue(peer.name)).find((peerName) => peerName && peerName !== name);
      configuration.failoverRelationships.push({
        id: deterministicConfigId('failover', name),
        provenance: provenance('kea-json', `${servicePath}.hooks-libraries[${hookIndex}].parameters.high-availability[${relationshipIndex}]`),
        name,
        ...optional('mode', stringValue(relationship.mode)),
        ...(partner ? { partner } : {}),
        scopeIds: [],
      });
    });
  });
}

export function stripKeaComments(text: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index] ?? '';
    const next = text[index + 1] ?? '';
    if (lineComment) {
      if (current === '\n' || current === '\r') {
        lineComment = false;
        result += current;
      } else result += ' ';
      continue;
    }
    if (blockComment) {
      if (current === '*' && next === '/') {
        result += '  ';
        blockComment = false;
        index += 1;
      } else result += current === '\n' || current === '\r' ? current : ' ';
      continue;
    }
    if (inString) {
      result += current;
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      result += current;
    } else if (current === '/' && next === '/') {
      lineComment = true;
      result += '  ';
      index += 1;
    } else if (current === '/' && next === '*') {
      blockComment = true;
      result += '  ';
      index += 1;
    } else if (current === '#') {
      lineComment = true;
      result += ' ';
    } else result += current;
  }
  return result;
}

const KEA_PARSED_KEYS = new Set([
  'Dhcp4', 'Dhcp6', 'version', 'config-version', 'valid-lifetime', 'max-valid-lifetime',
  'preferred-lifetime', 'subnet4', 'subnet6', 'shared-networks', 'option-data',
  'reservations', 'relay', 'hooks-libraries', 'dhcp-ddns', 'ddns-send-updates',
  'ddns-override-client-update', 'ddns-override-no-update', 'client-classes', 'subnet',
  'id', 'name', 'pools', 'pool', 'excluded-prefixes', 'excluded-prefix', 'ip-addresses',
  'addresses', 'ip-address', 'hw-address', 'duid', 'client-id', 'hostname', 'code',
  'data', 'parameters', 'high-availability', 'this-server-name', 'mode', 'peers',
  'qualifying-suffix', 'user-context',
]);

function countUnknownKeys(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((count, item) => count + countUnknownKeys(item), 0);
  const item = record(value);
  if (!item) return 0;
  return Object.entries(item).reduce((count, [key, child]) => {
    return count + (KEA_PARSED_KEYS.has(key) ? 0 : 1) + countUnknownKeys(child);
  }, 0);
}
