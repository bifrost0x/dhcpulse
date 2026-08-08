export type DhcpConfigFormat =
  | 'microsoft-xml'
  | 'kea-json'
  | 'isc-dhcpd'
  | 'dnsmasq'
  | 'unknown';

export interface ConfigProvenance {
  format: Exclude<DhcpConfigFormat, 'unknown'>;
  location: string;
}

export type ParserWarningCode =
  | 'unsupported-directive'
  | 'partial-parse'
  | 'duplicate-identifier';

export interface ParserWarning {
  code: ParserWarningCode;
  message: string;
  count: number;
  provenance: ConfigProvenance;
}

export interface NormalizedEntity {
  id: string;
  provenance: ConfigProvenance;
}

export interface DhcpServer extends NormalizedEntity {
  name?: string;
  address?: string;
  authoritative?: boolean;
  defaultLeaseTimeSeconds?: number;
  maxLeaseTimeSeconds?: number;
}

export interface DhcpScope extends NormalizedEntity {
  protocol: 'dhcpv4' | 'dhcpv6';
  cidr: string;
  subnetMask?: string;
  startRange?: string;
  endRange?: string;
  name?: string;
  state?: string;
  leaseLifetimeSeconds?: number;
  preferredLifetimeSeconds?: number;
  validLifetimeSeconds?: number;
  observedLeaseCount?: number;
  sharedNetwork?: string;
}

export interface DhcpPool extends NormalizedEntity {
  protocol: 'dhcpv4' | 'dhcpv6';
  scopeId?: string;
  start: string;
  end: string;
  leaseLifetimeSeconds?: number;
  tags?: string[];
}

export interface DhcpExclusion extends NormalizedEntity {
  protocol: 'dhcpv4' | 'dhcpv6';
  scopeId?: string;
  start: string;
  end: string;
}

export type ReservationIdentifierType = 'mac' | 'duid' | 'client-id' | 'hostname' | 'unknown';

export interface DhcpReservation extends NormalizedEntity {
  protocol: 'dhcpv4' | 'dhcpv6';
  scopeId?: string;
  address: string;
  identifier?: string;
  identifierType?: ReservationIdentifierType;
  hostname?: string;
  level: 'global' | 'scope';
  tags?: string[];
}

export type DhcpOptionLevel = 'global' | 'shared-network' | 'scope' | 'pool' | 'reservation' | 'policy' | 'class';

export interface DhcpOption extends NormalizedEntity {
  protocol: 'dhcpv4' | 'dhcpv6';
  code?: number;
  name?: string;
  value: string | number | boolean | string[];
  level: DhcpOptionLevel;
  scopeId?: string;
  poolId?: string;
  reservationId?: string;
  policyId?: string;
  tags?: string[];
}

export interface DhcpPolicyClass extends NormalizedEntity {
  kind: 'policy' | 'class' | 'shared-network' | 'tag';
  name: string;
  scopeId?: string;
  expression?: string;
}

export interface DhcpRelayAddress extends NormalizedEntity {
  protocol: 'dhcpv4' | 'dhcpv6';
  scopeId?: string;
  address: string;
  serverAddress?: string;
  interfaceName?: string;
}

export interface DhcpFailoverRelationship extends NormalizedEntity {
  name: string;
  mode?: string;
  partner?: string;
  scopeIds: string[];
}

export interface DhcpDnsUpdateSettings extends NormalizedEntity {
  scopeId?: string;
  enabled?: boolean;
  domain?: string;
  mode?: string;
  overrideClientUpdate?: boolean;
  overrideNoUpdate?: boolean;
}

export interface DhcpAuditSettings extends NormalizedEntity {
  enabled?: boolean;
  path?: string;
}

export interface DhcpConfiguration {
  provenance: ConfigProvenance;
  metadata: {
    vendor: string;
    version?: string;
    source: {
      format: Exclude<DhcpConfigFormat, 'unknown'>;
      fileName?: string;
    };
  };
  servers: DhcpServer[];
  ipv4Scopes: DhcpScope[];
  ipv6Scopes: DhcpScope[];
  pools: DhcpPool[];
  exclusions: DhcpExclusion[];
  reservations: DhcpReservation[];
  options: DhcpOption[];
  policies: DhcpPolicyClass[];
  classes: DhcpPolicyClass[];
  relayAddresses: DhcpRelayAddress[];
  failoverRelationships: DhcpFailoverRelationship[];
  dnsUpdateSettings: DhcpDnsUpdateSettings[];
  auditSettings: DhcpAuditSettings[];
  parserWarnings: ParserWarning[];
}

export function deterministicConfigId(kind: string, ...identity: Array<string | number | boolean | null | undefined>): string {
  const semanticIdentity = identity
    .map((value) => String(value ?? '').trim().toLowerCase())
    .join('\u001f');
  let hash = 0x811c9dc5;
  const input = `${kind}\u001e${semanticIdentity}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${kind}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function emptyDhcpConfiguration(
  format: Exclude<DhcpConfigFormat, 'unknown'>,
  vendor: string,
  fileName?: string,
): DhcpConfiguration {
  const provenance = { format, location: '$' } satisfies ConfigProvenance;
  return {
    provenance,
    metadata: { vendor, source: { format, ...(fileName ? { fileName } : {}) } },
    servers: [],
    ipv4Scopes: [],
    ipv6Scopes: [],
    pools: [],
    exclusions: [],
    reservations: [],
    options: [],
    policies: [],
    classes: [],
    relayAddresses: [],
    failoverRelationships: [],
    dnsUpdateSettings: [],
    auditSettings: [],
    parserWarnings: [],
  };
}
