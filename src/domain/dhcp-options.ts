import { dhcpOptionDefinitions } from '../content/dhcp-options';
import { formatIpv4, parseIpv4 } from './ip-address';
import type {
  DhcpOptionCodecResult,
  DhcpOptionDefinition,
  DhcpOptionEntry,
  DhcpOptionValidationIssue,
  DhcpOptionValueType,
  DhcpProtocol,
} from './types';

const messageTypes = new Map<number, string>([
  [1, 'DHCPDISCOVER'],
  [2, 'DHCPOFFER'],
  [3, 'DHCPREQUEST'],
  [4, 'DHCPDECLINE'],
  [5, 'DHCPACK'],
  [6, 'DHCPNAK'],
  [7, 'DHCPRELEASE'],
  [8, 'DHCPINFORM'],
  [9, 'DHCPFORCERENEW'],
  [10, 'DHCPLEASEQUERY'],
  [11, 'DHCPLEASEUNASSIGNED'],
  [12, 'DHCPLEASEUNKNOWN'],
  [13, 'DHCPLEASEACTIVE'],
  [14, 'DHCPBULKLEASEQUERY'],
  [15, 'DHCPLEASEQUERYDONE'],
]);

const messageTypeValues = new Map(
  [...messageTypes].flatMap(([code, name]) => [
    [name, code] as const,
    [name.replace(/^DHCP/, ''), code] as const,
  ]),
);

export function searchDhcpOptions(query: string, protocol?: DhcpProtocol): DhcpOptionDefinition[] {
  const needle = query.trim().toLocaleLowerCase('en-US');
  return dhcpOptionDefinitions.filter((definition) => {
    if (protocol && definition.protocol !== protocol) return false;
    if (!needle) return true;
    return [String(definition.code), definition.name, definition.description, ...definition.aliases].some((value) =>
      value.toLocaleLowerCase('en-US').includes(needle),
    );
  });
}

export function decodeDhcpOption(input: {
  protocol: DhcpProtocol;
  code: number;
  hex: string;
}): DhcpOptionCodecResult {
  const hex = normalizeHex(input.hex);
  const bytes = hexToBytes(hex);
  const definition = findDefinition(input.protocol, input.code);
  const warnings: string[] = [];
  const valueType = definition?.valueType ?? 'hex';
  if (!definition) warnings.push(`Unknown ${input.protocol} option ${input.code}; decoded as hexadecimal data.`);
  const value = decodeValue(valueType, bytes, warnings);
  return { hex, value, displayValue: display(valueType, value), warnings, ...(definition ? { definition } : {}) };
}

export function encodeDhcpOption(input: {
  protocol: DhcpProtocol;
  code: number;
  value: unknown;
}): { hex: string; warnings: string[]; definition?: DhcpOptionDefinition } {
  const definition = findDefinition(input.protocol, input.code);
  const warnings: string[] = [];
  const valueType = definition?.valueType ?? inferValueType(input.value);
  if (!definition) warnings.push(`Unknown ${input.protocol} option ${input.code}; review the inferred ${valueType} encoding.`);
  const bytes = encodeValue(valueType, input.value, warnings);
  return { hex: bytesToHex(bytes), warnings, ...(definition ? { definition } : {}) };
}

export function validateDhcpOptions(
  entries: DhcpOptionEntry[],
  context: { pxe?: boolean } = {},
): DhcpOptionValidationIssue[] {
  const issues: DhcpOptionValidationIssue[] = [];
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const definition = findDefinition(entry.protocol, entry.code);
    const key = `${entry.protocol}:${entry.code}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (definition && !definition.repeatable && counts.get(key) === 2) {
      issues.push(issue('duplicateSingleton', 'error', entry, `Option ${entry.code} cannot be repeated.`));
    }
  }

  for (const entry of entries) {
    try {
      encodeDhcpOption(entry);
    } catch (error) {
      issues.push(issue('invalidValue', 'error', entry, errorMessage(error)));
    }
  }

  const lease = numericEntry(entries, 'dhcpv4', 51);
  const t1 = numericEntry(entries, 'dhcpv4', 58);
  const t2 = numericEntry(entries, 'dhcpv4', 59);
  if (t1 !== undefined && t2 !== undefined && t1 >= t2) {
    issues.push(issue('t1NotBeforeT2', 'error', { protocol: 'dhcpv4', code: 58, value: t1 }, 'T1 must be less than T2.'));
  }
  if (t2 !== undefined && lease !== undefined && t2 >= lease) {
    issues.push(issue('t2NotBeforeLease', 'error', { protocol: 'dhcpv4', code: 59, value: t2 }, 'T2 must be less than the lease time.'));
  }
  const pxeEntry = entries.find((entry) => entry.protocol === 'dhcpv4' && (entry.code === 66 || entry.code === 67));
  if (pxeEntry && !context.pxe) {
    issues.push(issue('pxeContextMissing', 'info', pxeEntry, 'Review option 66/67 together with the PXE environment.'));
  }
  const routeEntry = entries.find((entry) => entry.protocol === 'dhcpv4' && entry.code === 121);
  const hasRouter = entries.some((entry) => entry.protocol === 'dhcpv4' && entry.code === 3);
  if (routeEntry && !hasRouter) {
    issues.push(
      issue(
        'classlessRouteWithoutRouter',
        'warning',
        routeEntry,
        'Clients that do not support option 121 may need option 3 to receive a default gateway.',
      ),
    );
  }
  return issues;
}

function issue(
  key: DhcpOptionValidationIssue['key'],
  severity: DhcpOptionValidationIssue['severity'],
  entry: DhcpOptionEntry,
  message: string,
): DhcpOptionValidationIssue {
  return { key, severity, protocol: entry.protocol, code: entry.code, message };
}

function findDefinition(protocol: DhcpProtocol, code: number): DhcpOptionDefinition | undefined {
  return dhcpOptionDefinitions.find((definition) => definition.protocol === protocol && definition.code === code);
}

function normalizeHex(value: string): string {
  const normalized = value.replace(/[\s:-]/g, '').toLowerCase();
  if (!/^[0-9a-f]*$/.test(normalized)) throw new Error('Value contains non-hexadecimal characters.');
  if (normalized.length % 2 !== 0) throw new Error('Hexadecimal data must contain an even number of digits.');
  return normalized;
}

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let offset = 0; offset < hex.length; offset += 2) bytes.push(Number.parseInt(hex.slice(offset, offset + 2), 16));
  return bytes;
}

function bytesToHex(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function inferValueType(value: unknown): DhcpOptionValueType {
  if (typeof value === 'boolean') return 'boolean';
  return 'hex';
}

function encodeValue(type: DhcpOptionValueType, value: unknown, warnings: string[]): number[] {
  switch (type) {
    case 'ipv4':
      return ipv4Bytes(requireString(value));
    case 'ipv4-list':
      return splitList(value, ',').flatMap(ipv4Bytes);
    case 'string':
      return [...new TextEncoder().encode(requireString(value))];
    case 'uint8':
      return integerBytes(value, 1);
    case 'uint16':
      return integerBytes(value, 2);
    case 'uint32':
      return integerBytes(value, 4);
    case 'boolean':
      if (typeof value !== 'boolean') throw new TypeError('Boolean option value must be true or false.');
      return [value ? 1 : 0];
    case 'domain-search':
      return encodeDomainSearch(value);
    case 'classless-routes':
      return encodeRoutes(value, warnings);
    case 'message-type':
      return [encodeMessageType(value)];
    case 'hex':
      return hexToBytes(normalizeHex(requireString(value)));
  }
}

function decodeValue(type: DhcpOptionValueType, bytes: number[], warnings: string[]): unknown {
  switch (type) {
    case 'ipv4':
      requireLength(bytes, 4, 'IPv4');
      return bytesToIpv4(bytes);
    case 'ipv4-list':
      if (bytes.length === 0 || bytes.length % 4 !== 0) throw new Error('IPv4 list data must contain complete four-octet addresses.');
      return chunks(bytes, 4).map(bytesToIpv4);
    case 'string':
      return new TextDecoder().decode(Uint8Array.from(bytes));
    case 'uint8':
      requireLength(bytes, 1, 'uint8');
      return bytes[0]!;
    case 'uint16':
      requireLength(bytes, 2, 'uint16');
      return readInteger(bytes);
    case 'uint32':
      requireLength(bytes, 4, 'uint32');
      return readInteger(bytes);
    case 'boolean':
      requireLength(bytes, 1, 'boolean');
      if (bytes[0] !== 0 && bytes[0] !== 1) warnings.push('Non-canonical boolean value was interpreted as true.');
      return bytes[0] !== 0;
    case 'domain-search':
      return decodeDomainSearch(bytes);
    case 'classless-routes':
      return decodeRoutes(bytes);
    case 'message-type': {
      requireLength(bytes, 1, 'DHCP message type');
      const name = messageTypes.get(bytes[0]!);
      if (!name) warnings.push(`Unknown DHCP message type ${bytes[0]}.`);
      return name ?? bytes[0]!;
    }
    case 'hex':
      return bytesToHex(bytes);
  }
}

function display(type: DhcpOptionValueType, value: unknown): string {
  if (type === 'ipv4-list' || type === 'domain-search') return (value as string[]).join(', ');
  if (type === 'classless-routes') return (value as string[]).join('; ');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function ipv4Bytes(value: string): number[] {
  const address = parseIpv4(value.trim());
  if (address === null) throw new Error(`Invalid IPv4 address: ${value}`);
  return [address >>> 24, (address >>> 16) & 255, (address >>> 8) & 255, address & 255];
}

function bytesToIpv4(bytes: number[]): string {
  requireLength(bytes, 4, 'IPv4');
  return bytes.join('.');
}

function integerBytes(value: unknown, length: number): number[] {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= 2 ** (length * 8)) {
    throw new RangeError(`Value must be an unsigned ${length * 8}-bit integer.`);
  }
  const bytes = new Array<number>(length).fill(0);
  let remaining = value;
  for (let index = length - 1; index >= 0; index -= 1) {
    bytes[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  return bytes;
}

function readInteger(bytes: number[]): number {
  return bytes.reduce((total, byte) => total * 256 + byte, 0);
}

function encodeMessageType(value: unknown): number {
  if (typeof value === 'number') return integerBytes(value, 1)[0]!;
  const normalized = requireString(value).trim().toUpperCase().replace(/[\s_-]/g, '');
  const code = messageTypeValues.get(normalized);
  if (code === undefined) throw new Error(`Unknown DHCP message type: ${String(value)}`);
  return code;
}

function encodeDomainSearch(value: unknown): number[] {
  const names = splitList(value, ',');
  return names.flatMap((name) => {
    if ([...name].some((character) => character.charCodeAt(0) > 127)) {
      throw new Error(`Domain names must contain ASCII characters only: ${name}`);
    }
    const labels = name.split('.');
    if (labels.some((label) => label.length === 0)) throw new Error(`Domain name contains an empty label: ${name}`);
    const encoded = labels.flatMap((label) => {
      const bytes = [...new TextEncoder().encode(label)];
      if (bytes.length > 63) throw new Error(`Domain labels cannot exceed 63 octets: ${label}`);
      return [bytes.length, ...bytes];
    });
    encoded.push(0);
    if (encoded.length > 255) throw new Error(`Encoded domain names cannot exceed 255 octets: ${name}`);
    return encoded;
  });
}

function decodeDomainSearch(bytes: number[]): string[] {
  const names: string[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const labels: string[] = [];
    let encodedLength = 1;
    while (true) {
      if (offset >= bytes.length) throw new Error('Truncated domain-search data.');
      const length = bytes[offset++]!;
      if ((length & 0xc0) !== 0) throw new Error('Compressed domain-search labels are not supported.');
      if (length === 0) break;
      if (length > 63) throw new Error('Domain-search label exceeds 63 octets.');
      if (offset + length > bytes.length) throw new Error('Truncated domain-search label.');
      const labelBytes = bytes.slice(offset, offset + length);
      if (labelBytes.some((byte) => byte > 127)) throw new Error('Domain-search labels must contain ASCII data.');
      labels.push(String.fromCharCode(...labelBytes));
      offset += length;
      encodedLength += length + 1;
    }
    if (labels.length === 0) throw new Error('Domain-search data contains an empty name.');
    if (encodedLength > 255) throw new Error('Encoded domain name exceeds 255 octets.');
    names.push(labels.join('.'));
  }
  return names;
}

function encodeRoutes(value: unknown, warnings: string[]): number[] {
  return splitList(value, ';').flatMap((route) => {
    const match = /^(.+)\/(\d{1,2})\s+via\s+(.+)$/i.exec(route);
    if (!match) throw new Error(`Invalid classless route: ${route}`);
    const destinationText = match[1]!.trim();
    const width = Number(match[2]);
    const destination = parseIpv4(destinationText);
    if (destination === null) throw new Error(`Invalid IPv4 destination: ${destinationText}`);
    if (!Number.isInteger(width) || width < 0 || width > 32) throw new Error(`Route width must be between 0 and 32: ${width}`);
    const gateway = ipv4Bytes(match[3]!.trim());
    const significantOctets = Math.ceil(width / 8);
    const mask = width === 0 ? 0 : (0xffffffff << (32 - width)) >>> 0;
    const canonical = (destination & mask) >>> 0;
    const canonicalText = formatIpv4(canonical);
    if (canonical !== destination) warnings.push(`Destination ${destinationText}/${width} was canonicalized to ${canonicalText}/${width}.`);
    return [width, ...ipv4Bytes(canonicalText).slice(0, significantOctets), ...gateway];
  });
}

function decodeRoutes(bytes: number[]): string[] {
  const routes: string[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const width = bytes[offset++]!;
    if (width > 32) throw new Error(`Invalid classless route width: ${width}`);
    const significantOctets = Math.ceil(width / 8);
    if (offset + significantOctets + 4 > bytes.length) throw new Error('Truncated classless route data.');
    const destinationBytes = [...bytes.slice(offset, offset + significantOctets), ...new Array<number>(4 - significantOctets).fill(0)];
    offset += significantOctets;
    const gatewayBytes = bytes.slice(offset, offset + 4);
    offset += 4;
    const mask = width === 0 ? 0 : (0xffffffff << (32 - width)) >>> 0;
    const canonicalDestination = (readInteger(destinationBytes) & mask) >>> 0;
    routes.push(`${formatIpv4(canonicalDestination)}/${width} via ${bytesToIpv4(gatewayBytes)}`);
  }
  return routes;
}

function chunks(values: number[], size: number): number[][] {
  const result: number[][] = [];
  for (let offset = 0; offset < values.length; offset += size) result.push(values.slice(offset, offset + size));
  return result;
}

function splitList(value: unknown, separator: ',' | ';'): string[] {
  const values = requireString(value)
    .split(separator)
    .map((part) => part.trim());
  if (values.length === 0 || values.some((part) => part.length === 0)) throw new Error('Option value contains an empty item.');
  return values;
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Option value must be a string.');
  return value;
}

function requireLength(bytes: number[], length: number, label: string): void {
  if (bytes.length !== length) throw new Error(`${label} data must contain exactly ${length} octets.`);
}

function numericEntry(entries: DhcpOptionEntry[], protocol: DhcpProtocol, code: number): number | undefined {
  const value = entries.find((entry) => entry.protocol === protocol && entry.code === code)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
