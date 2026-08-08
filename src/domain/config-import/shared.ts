import type {
  ConfigProvenance,
  DhcpConfigFormat,
  DhcpConfiguration,
  ParserWarning,
  ReservationIdentifierType,
} from '../config-model';
import { deterministicConfigId } from '../config-model';

export type ImportFormat = Exclude<DhcpConfigFormat, 'unknown'>;
export type ConfigImportErrorCode =
  | 'INPUT_TOO_LARGE'
  | 'UNSAFE_XML'
  | 'MALFORMED_XML'
  | 'MALFORMED_JSON'
  | 'STRUCTURE_TOO_COMPLEX'
  | 'UNKNOWN_FORMAT';

export const MAX_STRUCTURE_DEPTH = 64;
export const MAX_STRUCTURE_NODES = 20_000;

export class ConfigImportError extends Error {
  readonly code: ConfigImportErrorCode;

  constructor(code: ConfigImportErrorCode, message: string) {
    super(message);
    this.name = 'ConfigImportError';
    this.code = code;
  }
}

export function assertStructureBounds(value: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > MAX_STRUCTURE_NODES || current.depth > MAX_STRUCTURE_DEPTH) {
      throw new ConfigImportError(
        'STRUCTURE_TOO_COMPLEX',
        'DHCP configuration structure exceeds the supported depth or complexity limit.',
      );
    }
    if (Array.isArray(current.value)) {
      for (const child of current.value) pending.push({ value: child, depth: current.depth + 1 });
    } else if (typeof current.value === 'object' && current.value !== null) {
      for (const child of Object.values(current.value)) pending.push({ value: child, depth: current.depth + 1 });
    }
  }
}

export function provenance(format: ImportFormat, location: string): ConfigProvenance {
  return { format, location };
}

export function addWarning(
  configuration: DhcpConfiguration,
  code: ParserWarning['code'],
  count: number,
  location: string,
  message: string,
): void {
  if (count <= 0) return;
  configuration.parserWarnings.push({
    code,
    count,
    message,
    provenance: provenance(configuration.metadata.source.format, location),
  });
}

export function maskToPrefix(mask: string | undefined): number {
  if (!mask) return 24;
  const bits = mask.split('.').map(Number).map((octet) => octet.toString(2).padStart(8, '0')).join('');
  return bits.split('').filter((bit) => bit === '1').length;
}

export function networkAddress(address: string, mask: string): string {
  const addressParts = address.split('.').map(Number);
  const maskParts = mask.split('.').map(Number);
  return addressParts.map((part, index) => part & (maskParts[index] ?? 0)).join('.');
}

export function ipv6NetworkAddress(address: string, prefixLength: number): string {
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > 128) return address;
  const halves = address.replace(/^\[|\]$/g, '').split('::');
  if (halves.length > 2) return address;
  const leading = halves[0] ? halves[0].split(':') : [];
  const trailing = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - leading.length - trailing.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return address;
  const groups = [...leading, ...Array.from({ length: missing }, () => '0'), ...trailing];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/i.test(group))) return address;
  const value = groups.reduce((total, group) => (total << 16n) | BigInt(`0x${group}`), 0n);
  const hostBits = BigInt(128 - prefixLength);
  const network = prefixLength === 0 ? 0n : (value >> hostBits) << hostBits;
  const networkGroups = Array.from({ length: 8 }, (_, index) => {
    const shift = BigInt((7 - index) * 16);
    return Number((network >> shift) & 0xffffn).toString(16);
  });
  return compressIpv6(networkGroups);
}

function compressIpv6(groups: string[]): string {
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < groups.length;) {
    if (groups[index] !== '0') {
      index += 1;
      continue;
    }
    let end = index;
    while (end < groups.length && groups[end] === '0') end += 1;
    if (end - index > bestLength) {
      bestStart = index;
      bestLength = end - index;
    }
    index = end;
  }
  if (bestLength < 2) return groups.join(':');
  const compressed = [...groups];
  compressed.splice(bestStart, bestLength, '');
  if (bestStart === 0) compressed.unshift('');
  if (bestStart + bestLength === groups.length) compressed.push('');
  return compressed.join(':');
}

export function assignReservationsToScopes(configuration: DhcpConfiguration): void {
  for (const reservation of configuration.reservations) {
    if (reservation.scopeId) continue;
    const scopes = reservation.protocol === 'dhcpv4' ? configuration.ipv4Scopes : configuration.ipv6Scopes;
    const scope = scopes.find((item) => addressInCidr(reservation.address, item.cidr));
    if (scope) {
      reservation.scopeId = scope.id;
      reservation.level = 'scope';
    }
  }
}

export function normalizeReservationIdentifier(
  value: string | undefined,
  hintedType: ReservationIdentifierType | undefined,
): { identifier?: string; identifierType?: ReservationIdentifierType } {
  if (!value) return hintedType ? { identifierType: hintedType } : {};
  const compactMac = value.replace(/[:-]/g, '');
  if (/^[0-9a-f]{12}$/i.test(compactMac)) {
    return {
      identifier: compactMac.toLowerCase().match(/.{2}/g)?.join(':'),
      identifierType: 'mac',
    };
  }
  return { identifier: value, ...(hintedType ? { identifierType: hintedType } : {}) };
}

export function reservationConfigId(
  protocol: 'dhcpv4' | 'dhcpv6',
  identifier: string | undefined,
  identifierType: ReservationIdentifierType | undefined,
  hostname: string | undefined,
  address: string,
): string {
  return deterministicConfigId(
    'reservation',
    protocol,
    identifierType,
    identifier ?? hostname ?? address,
  );
}

function addressInCidr(address: string, cidr: string): boolean {
  if (address.includes(':')) {
    const [prefix, lengthText] = cidr.split('/');
    const length = Number(lengthText);
    if (!prefix || !Number.isInteger(length) || length % 16 !== 0) return false;
    return address.toLowerCase().split(':').slice(0, length / 16).join(':') === prefix.toLowerCase().split(':').slice(0, length / 16).join(':');
  }
  const [network, prefixText] = cidr.split('/');
  const prefix = Number(prefixText);
  if (!network || !Number.isInteger(prefix)) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(network) & mask);
}

function ipv4Number(address: string): number {
  return address.split('.').reduce((total, part) => ((total << 8) | Number(part)) >>> 0, 0);
}

export function splitDnsmasq(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let bracketDepth = 0;
  for (const character of value) {
    if (character === '[') bracketDepth += 1;
    if (character === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    if (character === ',' && bracketDepth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += character;
  }
  parts.push(current.trim());
  return parts.filter((part) => part.length > 0);
}

export function takeTags(parts: string[], tags: Set<string>): string[] {
  const result: string[] = [];
  while (parts[0]?.match(/^(?:set|tag|net):(.+)$/)) {
    const part = parts.shift();
    const tag = part?.replace(/^(?:set|tag|net):/, '');
    if (tag) {
      result.push(tag);
      tags.add(tag);
    }
  }
  return result;
}

export function optionCode(name: string): number | undefined {
  const normalized = name.toLowerCase();
  const codes: Record<string, number> = {
    routers: 3,
    router: 3,
    'domain-name-servers': 6,
    'dns-server': 6,
    'domain-name': 15,
    'domain-search': 119,
    'dhcp6.name-servers': 23,
    'dns-servers': 23,
  };
  return codes[normalized];
}

export function parseLeaseSeconds(value: string): number | undefined {
  if (value === 'infinite') return undefined;
  const match = /^(\d+)([smhdw]?)$/i.exec(value);
  if (!match?.[1]) return undefined;
  const multipliers: Record<string, number> = { '': 1, s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return Number(match[1]) * (multipliers[match[2]?.toLowerCase() ?? ''] ?? 1);
}

export function isLeaseValue(value: string): boolean {
  return value === 'infinite' || /^(\d+)([smhdw]?)$/i.test(value);
}

export function durationSeconds(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const match = /^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  return Number(match[1] ?? 0) * 86400 + Number(match[2]) * 3600 + Number(match[3]) * 60 + Number(match[4]);
}

export function booleanValue(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  if (/^(true|yes|enabled|1)$/i.test(value)) return true;
  if (/^(false|no|disabled|0)$/i.test(value)) return false;
  return undefined;
}

export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function booleanFromUnknown(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function primitiveOptionValue(value: unknown): string | number | boolean | string[] | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  const values = stringArray(value);
  return values.length ? values : undefined;
}

export function numeric(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

export function numberOr(value: string | undefined, fallback: number): number {
  return numeric(value) ?? fallback;
}

export function optional<Key extends string>(key: Key, value: string | undefined): { [Property in Key]?: string } {
  return value === undefined ? {} : { [key]: value } as { [Property in Key]?: string };
}

export function optionalNumber<Key extends string>(key: Key, value: number | undefined): { [Property in Key]?: number } {
  return value === undefined ? {} : { [key]: value } as { [Property in Key]?: number };
}

export function optionalBoolean<Key extends string>(key: Key, value: boolean | undefined): { [Property in Key]?: boolean } {
  return value === undefined ? {} : { [key]: value } as { [Property in Key]?: boolean };
}

export function valueKey(value: string | number | boolean | string[]): string {
  return Array.isArray(value) ? value.join('\u001f') : String(value);
}
