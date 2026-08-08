export interface Ipv4CidrAnalysis {
  cidr: string;
  prefixLength: number;
  netmask: string;
  wildcardMask: string;
  network: string;
  broadcast: string;
  firstUsable: string;
  lastUsable: string;
  totalAddresses: number;
  usableAddresses: number;
}

const IPV4_MAX = 2 ** 32 - 1;

export function parseIpv4(value: string): number | null {
  const components = value.trim().split('.');
  if (components.length !== 4) return null;

  const octets: number[] = [];
  for (const component of components) {
    if (!/^\d+$/.test(component)) return null;
    const octet = Number(component);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    octets.push(octet);
  }

  return ((octets[0]! * 2 ** 24) + (octets[1]! * 2 ** 16) + (octets[2]! * 2 ** 8) + octets[3]!) >>> 0;
}

export function formatIpv4(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > IPV4_MAX) {
    throw new RangeError('IPv4 value must be an unsigned 32-bit integer.');
  }

  return [
    Math.floor(value / 2 ** 24),
    Math.floor(value / 2 ** 16) % 256,
    Math.floor(value / 2 ** 8) % 256,
    value % 256,
  ].join('.');
}

export function analyzeIpv4Cidr(cidr: string): Ipv4CidrAnalysis | null {
  const parts = cidr.trim().split('/');
  if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1] ?? '')) return null;

  const address = parseIpv4(parts[0] ?? '');
  const prefixLength = Number(parts[1]);
  if (address === null || prefixLength < 0 || prefixLength > 32) return null;

  const totalAddresses = 2 ** (32 - prefixLength);
  const netmaskValue = prefixLength === 0 ? 0 : IPV4_MAX - (2 ** (32 - prefixLength) - 1);
  const networkValue = (address & netmaskValue) >>> 0;
  const broadcastValue = networkValue + totalAddresses - 1;
  const usableAddresses = prefixLength <= 30 ? Math.max(0, totalAddresses - 2) : totalAddresses;
  const firstUsableValue = prefixLength <= 30 ? networkValue + 1 : networkValue;
  const lastUsableValue = prefixLength <= 30 ? broadcastValue - 1 : broadcastValue;

  return {
    cidr: `${formatIpv4(networkValue)}/${prefixLength}`,
    prefixLength,
    netmask: formatIpv4(netmaskValue),
    wildcardMask: formatIpv4(IPV4_MAX - netmaskValue),
    network: formatIpv4(networkValue),
    broadcast: formatIpv4(broadcastValue),
    firstUsable: formatIpv4(firstUsableValue),
    lastUsable: formatIpv4(lastUsableValue),
    totalAddresses,
    usableAddresses,
  };
}

export function rangeSize(start: string, end: string): number | null {
  const startValue = parseIpv4(start);
  const endValue = parseIpv4(end);
  if (startValue === null || endValue === null || startValue > endValue) return null;
  return endValue - startValue + 1;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const aStartValue = parseIpv4(aStart);
  const aEndValue = parseIpv4(aEnd);
  const bStartValue = parseIpv4(bStart);
  const bEndValue = parseIpv4(bEnd);
  if (
    aStartValue === null ||
    aEndValue === null ||
    bStartValue === null ||
    bEndValue === null ||
    aStartValue > aEndValue ||
    bStartValue > bEndValue
  ) {
    return false;
  }

  return aStartValue <= bEndValue && bStartValue <= aEndValue;
}
