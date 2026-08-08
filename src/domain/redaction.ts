import type { DhcpConfiguration, DhcpOption } from './config-model';

export interface Redactor {
  redactHostname(value: string): string;
  redactLabel(value: string): string;
  redactMac(value: string): string;
  redactIdentifier(value: string): string;
  redactIpv4(value: string): string;
  redactIpv6(value: string): string;
  redactText(value: string): string;
}

export interface AssessmentExportOptions {
  format: 'markdown' | 'json';
  redact?: boolean;
  seed?: string;
}

export function createRedactor(seed = 'dhcpulse'): Redactor {
  const caches = {
    hostname: new Map<string, string>(),
    label: new Map<string, string>(),
    mac: new Map<string, string>(),
    identifier: new Map<string, string>(),
    ipv4: new Map<string, string>(),
    ipv6: new Map<string, string>(),
  };

  const cached = (kind: keyof typeof caches, input: string, factory: () => string): string => {
    const key = input.toLowerCase();
    const existing = caches[kind].get(key);
    if (existing) return existing;
    const output = factory();
    caches[kind].set(key, output);
    return output;
  };
  const digest = (kind: string, value: string) => digestHex(`${seed}\u001f${kind}\u001f${value.toLowerCase()}`);

  const redactHostname = (value: string): string => cached('hostname', value, () => {
    const labelCount = Math.max(1, value.replace(/\.$/, '').split('.').filter(Boolean).length - 2);
    const hash = digest('hostname', value);
    const labels = Array.from({ length: labelCount }, (_, index) => `host-${hash.slice(index * 4, index * 4 + 4)}`);
    return `${labels.join('.')}.example.com`;
  });

  const redactLabel = (value: string): string => cached('label', value, () => `label-${digest('label', value).slice(0, 12)}`);

  const redactMac = (value: string): string => cached('mac', value, () => {
    const hash = digest('mac', value).padEnd(10, '0');
    return `02:${hash.match(/.{2}/g)?.slice(0, 5).join(':') ?? '00:00:00:00:01'}`;
  });

  const redactIdentifier = (value: string): string => cached('identifier', value, () => `duid-${digest('identifier', value).slice(0, 12)}`);

  const redactIpv4 = (value: string): string => cached('ipv4', value, () => {
    const [address, prefix] = value.split('/', 2);
    const hash = digest('ipv4', address ?? value);
    const ranges = ['192.0.2', '198.51.100', '203.0.113'];
    const range = ranges[Number.parseInt(hash.slice(0, 2), 16) % ranges.length] ?? ranges[0];
    const host = (Number.parseInt(hash.slice(2, 6), 16) % 254) + 1;
    return `${range}.${host}${prefix ? `/${prefix}` : ''}`;
  });

  const redactIpv6 = (value: string): string => cached('ipv6', value, () => {
    const slash = value.lastIndexOf('/');
    const address = slash >= 0 ? value.slice(0, slash) : value;
    const prefix = slash >= 0 ? value.slice(slash + 1) : undefined;
    const hash = digest('ipv6', address).padEnd(24, '0');
    const groups = hash.match(/.{1,4}/g)?.slice(0, 6) ?? ['1', '2', '3', '4', '5', '6'];
    return `2001:db8:${groups.join(':')}${prefix ? `/${prefix}` : ''}`;
  });

  const redactText = (value: string): string => {
    let output = value;
    output = output.replace(/(?<![0-9a-f])(?:[0-9a-f]{2}[:-]){6,}[0-9a-f]{2}(?![0-9a-f])/gi, (match) => redactIdentifier(match));
    output = output.replace(/(?<![0-9a-f:-])(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}(?![:-][0-9a-f]{2})/gi, (match) => redactMac(match));
    output = output.replace(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?(?![\d.])/g, (match) => redactIpv4(match));
    output = output.replace(/(?<![\w:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?:\/\d{1,3})?(?![\w:])/gi, (match) => redactIpv6(match));
    output = output.replace(/\b(?=[a-z0-9.-]*[a-z])[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/gi, (match) => redactHostname(match));
    return output;
  };

  return { redactHostname, redactLabel, redactMac, redactIdentifier, redactIpv4, redactIpv6, redactText };
}

export function redactConfiguration(configuration: DhcpConfiguration, seed = 'dhcpulse'): DhcpConfiguration {
  const copy = structuredClone(configuration);
  const redactor = createRedactor(seed);

  copy.provenance.location = redactor.redactText(copy.provenance.location);
  if (copy.metadata.source.fileName) copy.metadata.source.fileName = redactFileName(copy.metadata.source.fileName);
  for (const server of copy.servers) {
    if (server.name) server.name = redactor.redactHostname(server.name);
    if (server.address) server.address = redactAddress(server.address, redactor);
    server.provenance.location = redactor.redactText(server.provenance.location);
  }
  for (const scope of [...copy.ipv4Scopes, ...copy.ipv6Scopes]) {
    scope.cidr = scope.protocol === 'dhcpv4' ? redactor.redactIpv4(scope.cidr) : redactor.redactIpv6(scope.cidr);
    if (scope.name) scope.name = redactor.redactLabel(scope.name);
    if (scope.sharedNetwork) scope.sharedNetwork = redactor.redactLabel(scope.sharedNetwork);
  }
  for (const pool of copy.pools) {
    pool.start = redactAddress(pool.start, redactor);
    pool.end = pool.end.startsWith('constructor:') ? pool.end : redactAddress(pool.end, redactor);
    if (pool.tags) pool.tags = pool.tags.map(redactor.redactLabel);
  }
  for (const exclusion of copy.exclusions) {
    exclusion.start = redactAddress(exclusion.start, redactor);
    exclusion.end = redactAddress(exclusion.end, redactor);
  }
  for (const reservation of copy.reservations) {
    reservation.address = redactAddress(reservation.address, redactor);
    if (reservation.identifier) {
      reservation.identifier = reservation.identifierType === 'mac'
        ? redactor.redactMac(reservation.identifier)
        : redactor.redactIdentifier(reservation.identifier);
    }
    if (reservation.hostname) reservation.hostname = redactor.redactHostname(reservation.hostname);
    if (reservation.tags) reservation.tags = reservation.tags.map(redactor.redactLabel);
  }
  for (const option of copy.options) {
    option.value = redactOptionValue(option, redactor);
    if (option.tags) option.tags = option.tags.map(redactor.redactLabel);
  }
  for (const item of [...copy.policies, ...copy.classes]) {
    item.name = redactor.redactLabel(item.name);
    if (item.expression) item.expression = redactTopologyText(item.expression, configuration, redactor);
  }
  for (const relay of copy.relayAddresses) {
    relay.address = redactAddress(relay.address, redactor);
    if (relay.serverAddress) relay.serverAddress = redactAddress(relay.serverAddress, redactor);
    if (relay.interfaceName) relay.interfaceName = redactor.redactLabel(relay.interfaceName);
  }
  for (const relationship of copy.failoverRelationships) {
    relationship.name = redactor.redactLabel(relationship.name);
    if (relationship.partner) relationship.partner = redactHostOrAddress(relationship.partner, redactor);
  }
  for (const settings of copy.dnsUpdateSettings) {
    if (settings.domain) settings.domain = redactor.redactHostname(settings.domain);
  }
  for (const settings of copy.auditSettings) {
    if (settings.path) settings.path = redactPath(settings.path);
  }
  for (const warning of copy.parserWarnings) {
    warning.message = redactor.redactText(warning.message);
    warning.provenance.location = redactor.redactText(warning.provenance.location);
  }
  return copy;
}

export function exportAssessment(
  configuration: DhcpConfiguration,
  findings: unknown[],
  options: AssessmentExportOptions,
): string {
  const shouldRedact = options.redact !== false;
  const seed = options.seed ?? 'dhcpulse';
  const safeConfiguration = shouldRedact ? redactConfiguration(configuration, seed) : structuredClone(configuration);
  const findingsRedactor = createRedactor(seed);
  const replacements = shouldRedact ? sensitiveReplacements(configuration, findingsRedactor) : [];
  const safeFindings = shouldRedact ? redactUnknown(findings, findingsRedactor, replacements) : structuredClone(findings);
  const payload = { configuration: safeConfiguration, findings: safeFindings };
  if (options.format === 'json') return JSON.stringify(payload, null, 2);
  return [
    '# DHCP configuration assessment',
    '',
    `Vendor: ${safeConfiguration.metadata.vendor}`,
    `Source format: ${safeConfiguration.metadata.source.format}`,
    '',
    '## Findings',
    '',
    '```json',
    JSON.stringify(safeFindings, null, 2),
    '```',
    '',
    '## Normalized configuration',
    '',
    '```json',
    JSON.stringify(safeConfiguration, null, 2),
    '```',
    '',
  ].join('\n');
}

interface SensitiveReplacement {
  original: string;
  redacted: string;
}

function redactUnknown(value: unknown, redactor: Redactor, replacements: SensitiveReplacement[]): unknown {
  if (typeof value === 'string') {
    const exactReplaced = replacements.reduce(
      (text, replacement) => text.replace(new RegExp(escapeRegExp(replacement.original), 'gi'), replacement.redacted),
      value,
    );
    return redactor.redactText(exactReplaced);
  }
  if (Array.isArray(value)) return value.map((item) => redactUnknown(item, redactor, replacements));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactUnknown(item, redactor, replacements)]));
  }
  return value;
}

function sensitiveReplacements(configuration: DhcpConfiguration, redactor: Redactor): SensitiveReplacement[] {
  const replacements: SensitiveReplacement[] = [];
  const add = (original: string | undefined, redacted: string | undefined) => {
    if (original && redacted && original !== redacted) replacements.push({ original, redacted });
  };
  for (const server of configuration.servers) {
    add(server.name, server.name ? redactor.redactHostname(server.name) : undefined);
    add(server.address, server.address ? redactAddress(server.address, redactor) : undefined);
  }
  for (const scope of [...configuration.ipv4Scopes, ...configuration.ipv6Scopes]) {
    add(scope.cidr, scope.protocol === 'dhcpv4' ? redactor.redactIpv4(scope.cidr) : redactor.redactIpv6(scope.cidr));
    add(scope.name, scope.name ? redactor.redactLabel(scope.name) : undefined);
    add(scope.sharedNetwork, scope.sharedNetwork ? redactor.redactLabel(scope.sharedNetwork) : undefined);
  }
  for (const pool of configuration.pools) {
    for (const tag of pool.tags ?? []) add(tag, redactor.redactLabel(tag));
  }
  for (const reservation of configuration.reservations) {
    add(reservation.address, redactAddress(reservation.address, redactor));
    add(reservation.hostname, reservation.hostname ? redactor.redactHostname(reservation.hostname) : undefined);
    add(
      reservation.identifier,
      reservation.identifier
        ? reservation.identifierType === 'mac'
          ? redactor.redactMac(reservation.identifier)
          : redactor.redactIdentifier(reservation.identifier)
        : undefined,
    );
    for (const tag of reservation.tags ?? []) add(tag, redactor.redactLabel(tag));
  }
  for (const relay of configuration.relayAddresses) {
    add(relay.address, redactAddress(relay.address, redactor));
    add(relay.serverAddress, relay.serverAddress ? redactAddress(relay.serverAddress, redactor) : undefined);
    add(relay.interfaceName, relay.interfaceName ? redactor.redactLabel(relay.interfaceName) : undefined);
  }
  for (const relationship of configuration.failoverRelationships) {
    add(relationship.name, redactor.redactLabel(relationship.name));
    add(relationship.partner, relationship.partner ? redactHostOrAddress(relationship.partner, redactor) : undefined);
  }
  for (const option of configuration.options) {
    for (const tag of option.tags ?? []) add(tag, redactor.redactLabel(tag));
    if (!isClientIdentifierOption(option)) continue;
    const values = Array.isArray(option.value) ? option.value : typeof option.value === 'string' ? [option.value] : [];
    for (const value of values) add(value, redactor.redactIdentifier(value));
  }
  for (const item of [...configuration.policies, ...configuration.classes]) {
    add(item.name, redactor.redactLabel(item.name));
  }
  return replacements.sort((left, right) => right.original.length - left.original.length);
}

function redactTopologyText(value: string, configuration: DhcpConfiguration, redactor: Redactor): string {
  const replacements = sensitiveReplacements(configuration, redactor);
  const replaced = replacements.reduce(
    (text, replacement) => text.replace(new RegExp(escapeRegExp(replacement.original), 'gi'), replacement.redacted),
    value,
  );
  return redactor.redactText(replaced);
}

function redactOptionValue(option: DhcpOption, redactor: Redactor): DhcpOption['value'] {
  if (isClientIdentifierOption(option)) {
    if (Array.isArray(option.value)) return option.value.map((item) => redactor.redactIdentifier(item));
    return typeof option.value === 'string' ? redactor.redactIdentifier(option.value) : option.value;
  }
  if (Array.isArray(option.value)) return option.value.map((item) => redactor.redactText(item));
  return typeof option.value === 'string' ? redactor.redactText(option.value) : option.value;
}

function isClientIdentifierOption(option: DhcpOption): boolean {
  return (option.protocol === 'dhcpv4' && option.code === 61)
    || /(?:client[- ]?id|client.*identifier)/i.test(option.name ?? '');
}

function redactAddress(value: string, redactor: Redactor): string {
  return value.includes(':') ? redactor.redactIpv6(value) : redactor.redactIpv4(value);
}

function redactHostOrAddress(value: string, redactor: Redactor): string {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return redactor.redactIpv4(value);
  if (value.includes(':')) return redactor.redactIpv6(value);
  return redactor.redactHostname(value);
}

function redactFileName(value: string): string {
  const extension = /\.[^.\\/]+$/.exec(value)?.[0] ?? '';
  return `configuration${extension}`;
}

function redactPath(value: string): string {
  const separator = value.includes('\\') ? '\\' : '/';
  return ['redacted', 'dhcp-audit'].join(separator);
}

function digestHex(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  const a = (first >>> 0).toString(16).padStart(8, '0');
  const b = (second >>> 0).toString(16).padStart(8, '0');
  return `${a}${b}${a.split('').reverse().join('')}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
