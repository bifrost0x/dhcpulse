import {
  deterministicConfigId,
  emptyDhcpConfiguration,
  type DhcpConfiguration,
  type DhcpScope,
  type ReservationIdentifierType,
} from '../config-model';
import {
  addWarning,
  booleanValue,
  ConfigImportError,
  durationSeconds,
  maskToPrefix,
  numberOr,
  normalizeReservationIdentifier,
  numeric,
  optional,
  optionalNumber,
  provenance,
  reservationConfigId,
  valueKey,
} from './shared';

export function importMicrosoftXml(text: string, fileName?: string): DhcpConfiguration {
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(text)) {
    throw new ConfigImportError('UNSAFE_XML', 'XML declarations that can define external or custom entities are not allowed.');
  }
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0 || !document.documentElement) {
    throw new ConfigImportError('MALFORMED_XML', 'Microsoft DHCP XML is malformed.');
  }
  const format = 'microsoft-xml' as const;
  const root = document.documentElement;
  if (!['dhcpserverexport', 'dhcpserver'].includes(localName(root))) {
    throw new ConfigImportError('UNKNOWN_FORMAT', 'XML root is not a supported Microsoft DHCP export root.');
  }
  const configuration = emptyDhcpConfiguration(format, 'Microsoft DHCP Server', fileName);
  configuration.metadata.version = attribute(root, 'version') ?? firstText(root, ['version']);

  const serverElement = elements(root, ['server'])[0];
  if (serverElement) {
    const name = firstText(serverElement, ['name', 'servername', 'computername']);
    const address = firstText(serverElement, ['address', 'ipaddress']);
    configuration.servers.push({
      id: deterministicConfigId('server', name, address),
      provenance: provenance(format, xmlPath(serverElement)),
      ...(name ? { name } : {}),
      ...(address ? { address } : {}),
    });
  }

  const scopeElements = elements(root, ['scope', 'scopev4', 'scopev6']).filter((element) => {
    return Boolean(firstText(element, ['scopeid', 'subnetaddress', 'prefix']));
  });
  const scopeByElement = new Map<Element, DhcpScope>();
  for (const element of scopeElements) {
    const scopeAddress = firstText(element, ['scopeid', 'subnetaddress', 'prefix']);
    if (!scopeAddress) continue;
    const protocol = scopeAddress.includes(':') || ancestryNames(element).some((name) => /ipv6|v6/.test(name))
      ? 'dhcpv6'
      : 'dhcpv4';
    const prefixLength = firstText(element, ['prefixlength']);
    const mask = firstText(element, ['subnetmask']);
    const explicitRange = elements(element, ['iprange', 'range', 'addressrange']).find(
      (candidate) => !ancestryNames(candidate).some((name) => name.includes('exclusion')),
    );
    const startRange = explicitRange ? firstText(explicitRange, ['startrange', 'startaddress', 'start']) : undefined;
    const endRange = explicitRange ? firstText(explicitRange, ['endrange', 'endaddress', 'end']) : undefined;
    const cidr = scopeAddress.includes('/')
      ? scopeAddress
      : `${scopeAddress}/${protocol === 'dhcpv4' ? maskToPrefix(mask) : numberOr(prefixLength, 64)}`;
    const scope: DhcpScope = {
      id: deterministicConfigId('scope', protocol, cidr),
      provenance: provenance(format, xmlPath(element)),
      protocol,
      cidr,
      ...(protocol === 'dhcpv4' ? optional('subnetMask', mask) : {}),
      ...(protocol === 'dhcpv4' ? optional('startRange', startRange) : {}),
      ...(protocol === 'dhcpv4' ? optional('endRange', endRange) : {}),
      ...optional('name', firstText(element, ['name'])),
      ...optional('state', firstText(element, ['state'])),
      ...optionalNumber('leaseLifetimeSeconds', durationSeconds(firstText(element, ['leaseduration']))),
    };
    (protocol === 'dhcpv4' ? configuration.ipv4Scopes : configuration.ipv6Scopes).push(scope);
    scopeByElement.set(element, scope);
  }

  for (const element of elements(root, ['iprange', 'range', 'addressrange'])) {
    if (ancestryNames(element).some((name) => name.includes('exclusion'))) continue;
    const start = firstText(element, ['startrange', 'startaddress', 'start']);
    const end = firstText(element, ['endrange', 'endaddress', 'end']);
    if (!start || !end) continue;
    const scope = nearestScope(element, scopeByElement);
    const protocol = start.includes(':') ? 'dhcpv6' : 'dhcpv4';
    configuration.pools.push({
      id: deterministicConfigId('pool', scope?.cidr, start, end),
      provenance: provenance(format, xmlPath(element)),
      protocol,
      ...(scope ? { scopeId: scope.id } : {}),
      start,
      end,
    });
  }

  for (const element of elements(root, ['exclusionrange', 'excludedrange'])) {
    const start = firstText(element, ['startrange', 'startaddress', 'start']);
    const end = firstText(element, ['endrange', 'endaddress', 'end']);
    if (!start || !end) continue;
    const scope = nearestScope(element, scopeByElement);
    const protocol = start.includes(':') ? 'dhcpv6' : 'dhcpv4';
    configuration.exclusions.push({
      id: deterministicConfigId('exclusion', scope?.cidr, start, end),
      provenance: provenance(format, xmlPath(element)),
      protocol,
      ...(scope ? { scopeId: scope.id } : {}),
      start,
      end,
    });
  }

  for (const element of elements(root, ['reservation'])) {
    const address = firstText(element, ['ipaddress', 'reservedip', 'address']);
    if (!address) continue;
    const clientId = firstText(element, ['clientid']);
    const duid = firstText(element, ['duid']);
    const macAddress = firstText(element, ['macaddress']);
    const rawIdentifier = macAddress ?? duid ?? clientId;
    const hostname = firstText(element, ['name', 'hostname']);
    const scope = nearestScope(element, scopeByElement);
    const protocol = address.includes(':') ? 'dhcpv6' : 'dhcpv4';
    const hintedIdentifierType: ReservationIdentifierType | undefined = rawIdentifier
      ? macAddress ? 'mac' : duid ? 'duid' : protocol === 'dhcpv6' ? 'duid' : 'client-id'
      : hostname ? 'hostname' : undefined;
    const { identifier, identifierType } = normalizeReservationIdentifier(
      rawIdentifier,
      hintedIdentifierType,
      Boolean(clientId && protocol === 'dhcpv4'),
    );
    configuration.reservations.push({
      id: reservationConfigId(protocol, identifier, identifierType, hostname, address, scope?.id),
      provenance: provenance(format, xmlPath(element)),
      protocol,
      ...(scope ? { scopeId: scope.id } : {}),
      address,
      ...(identifier ? { identifier } : {}),
      ...(identifierType ? { identifierType } : {}),
      ...(hostname ? { hostname } : {}),
      level: scope ? 'scope' : 'global',
    });
  }

  for (const element of elements(root, ['optionvalue'])) {
    const rawCode = firstText(element, ['optionid', 'code']);
    const name = firstText(element, ['name']);
    const valueElements = directElements(element, ['value', 'valuestring', 'data']);
    const value = valueElements.length > 1
      ? valueElements.map((node) => node.textContent?.trim() ?? '').filter(Boolean)
      : valueElements[0]?.textContent?.trim() ?? firstText(element, ['value', 'valuestring', 'data']);
    if (value === undefined || value === '') continue;
    const scope = nearestScope(element, scopeByElement);
    const protocol = scope?.protocol ?? (ancestryNames(element).some((item) => /ipv6|v6/.test(item)) ? 'dhcpv6' : 'dhcpv4');
    const code = numeric(rawCode);
    configuration.options.push({
      id: deterministicConfigId('option', protocol, code, name, scope?.cidr, valueKey(value)),
      provenance: provenance(format, xmlPath(element)),
      protocol,
      ...(code !== undefined ? { code } : {}),
      ...(name ? { name } : {}),
      value,
      level: scope ? 'scope' : 'global',
      ...(scope ? { scopeId: scope.id } : {}),
    });
  }

  for (const element of elements(root, ['policy'])) {
    const name = firstText(element, ['name', 'policyname']);
    if (!name) continue;
    const scope = nearestScope(element, scopeByElement);
    configuration.policies.push({
      id: deterministicConfigId('policy', name, scope?.cidr),
      provenance: provenance(format, xmlPath(element)),
      kind: 'policy',
      name,
      ...(scope ? { scopeId: scope.id } : {}),
      ...optional('expression', firstText(element, ['condition', 'conditions'])),
    });
  }

  for (const element of elements(root, ['failoverrelationship', 'failover'])) {
    const name = firstText(element, ['name', 'relationshipname']);
    if (!name) continue;
    configuration.failoverRelationships.push({
      id: deterministicConfigId('failover', name),
      provenance: provenance(format, xmlPath(element)),
      name,
      ...optional('mode', firstText(element, ['mode'])),
      ...optional('partner', firstText(element, ['partnerserver', 'partner'])),
      scopeIds: [],
    });
  }

  for (const element of elements(root, ['dynamicdnsupdate', 'dnsupdatesettings'])) {
    const scope = nearestScope(element, scopeByElement);
    const enabled = booleanValue(firstText(element, ['enabled', 'dynamicupdates']));
    const domain = firstText(element, ['domainname', 'domain']);
    configuration.dnsUpdateSettings.push({
      id: deterministicConfigId('dns-update', scope?.cidr, enabled, domain),
      provenance: provenance(format, xmlPath(element)),
      ...(scope ? { scopeId: scope.id } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(domain ? { domain } : {}),
    });
  }

  for (const element of elements(root, ['auditlog', 'auditsettings'])) {
    const enabled = booleanValue(firstText(element, ['enable', 'enabled']));
    const path = firstText(element, ['path', 'logfilepath']);
    configuration.auditSettings.push({
      id: deterministicConfigId('audit', enabled, path),
      provenance: provenance(format, xmlPath(element)),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(path ? { path } : {}),
    });
  }

  const supportedElementNames = new Set([
    'dhcpserverexport', 'dhcpserver', 'server', 'name', 'servername', 'computername',
    'address', 'ipaddress', 'version', 'ipv4', 'ipv6', 'scopes', 'scope', 'scopev4',
    'scopev6', 'scopeid', 'subnetaddress', 'prefix', 'prefixlength', 'subnetmask',
    'state', 'leaseduration', 'ipranges', 'iprange', 'range', 'addressrange',
    'startrange', 'startaddress', 'start', 'endrange', 'endaddress', 'end',
    'exclusionranges', 'exclusionrange', 'excludedrange', 'reservations', 'reservation',
    'reservedip', 'clientid', 'duid', 'macaddress', 'hostname', 'optionvalues',
    'optionvalue', 'optionid', 'code', 'value', 'valuestring', 'data', 'policies',
    'policy', 'policyname', 'condition', 'conditions', 'failoverrelationships',
    'failoverrelationship', 'failover', 'relationshipname', 'mode', 'partnerserver',
    'partner', 'dynamicdnsupdate', 'dnsupdatesettings', 'enabled', 'dynamicupdates',
    'domainname', 'domain', 'auditlog', 'auditsettings', 'enable', 'path', 'logfilepath',
  ]);
  const unsupportedCount = Array.from(root.querySelectorAll('*')).filter(
    (element) => !supportedElementNames.has(localName(element)),
  ).length;
  addWarning(configuration, 'unsupported-directive', unsupportedCount, '$', 'Microsoft XML contains unsupported element groups; values were omitted.');
  if (unsupportedCount === 0) {
    addWarning(configuration, 'partial-parse', 1, '$', 'Microsoft XML import is a bounded subset and does not claim complete schema fidelity.');
  }
  return configuration;
}

function elements(root: ParentNode, names: string[]): Element[] {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return Array.from(root.querySelectorAll('*')).filter((element) => wanted.has(localName(element)));
}

function directElements(root: Element, names: string[]): Element[] {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return Array.from(root.children).filter((element) => wanted.has(localName(element)));
}

function localName(element: Element): string {
  return (element.localName || element.tagName.split(':').at(-1) || '').toLowerCase();
}

function firstText(root: Element, names: string[]): string | undefined {
  const direct = directElements(root, names)[0];
  if (direct?.textContent?.trim()) return direct.textContent.trim();
  const descendant = elements(root, names)[0];
  return descendant?.textContent?.trim() || undefined;
}

function attribute(element: Element, name: string): string | undefined {
  return Array.from(element.attributes).find((item) => item.localName.toLowerCase() === name.toLowerCase())?.value;
}

function xmlPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current) {
    const name = localName(current);
    const siblings = current.parentElement ? Array.from(current.parentElement.children).filter((item) => localName(item) === name) : [];
    const index = siblings.indexOf(current);
    parts.unshift(`${name}${siblings.length > 1 ? `[${index}]` : ''}`);
    current = current.parentElement;
  }
  return `/${parts.join('/')}`;
}

function ancestryNames(element: Element): string[] {
  const names: string[] = [];
  let current = element.parentElement;
  while (current) {
    names.push(localName(current));
    current = current.parentElement;
  }
  return names;
}

function nearestScope(element: Element, scopes: Map<Element, DhcpScope>): DhcpScope | undefined {
  let current = element.parentElement;
  while (current) {
    const scope = scopes.get(current);
    if (scope) return scope;
    current = current.parentElement;
  }
  return undefined;
}
