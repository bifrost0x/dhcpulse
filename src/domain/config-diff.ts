import {
  deterministicConfigId,
  type DhcpConfiguration,
  type DhcpOption,
  type DhcpPool,
  type DhcpReservation,
  type DhcpScope,
  type NormalizedEntity,
} from './config-model';
import { createRedactor, type Redactor } from './redaction';

export type ConfigurationChangeKind = 'added' | 'removed' | 'changed';
export type ConfigurationChangeImpact = 'blocker' | 'warning' | 'info';
export type ConfigurationEntityType =
  | 'server'
  | 'scope'
  | 'pool'
  | 'exclusion'
  | 'reservation'
  | 'option'
  | 'policy'
  | 'class'
  | 'relay'
  | 'failover'
  | 'dns-update'
  | 'audit'
  | 'capability'
  | 'duplicate-identifier';

export type RedactionSafeValue = null | boolean | number | string | RedactionSafeValue[] | { [key: string]: RedactionSafeValue };

export interface ConfigurationChange {
  id: string;
  kind: ConfigurationChangeKind;
  entityType: ConfigurationEntityType;
  semanticPath: string;
  before: RedactionSafeValue | null;
  after: RedactionSafeValue | null;
  impact: ConfigurationChangeImpact;
  explanation: string;
}

export interface ConfigurationDiff {
  summary: {
    total: number;
    added: number;
    removed: number;
    changed: number;
    blockers: number;
    warnings: number;
    infos: number;
  };
  changes: ConfigurationChange[];
}

interface EntityComparison<T extends NormalizedEntity> {
  entityType: ConfigurationEntityType;
  before: T[];
  after: T[];
  key: (entity: T) => string;
  path: (key: string, index: number, entity: T) => string;
  comparable: (entity: T) => RedactionSafeValue;
  assess: (kind: ConfigurationChangeKind, before: T | undefined, after: T | undefined) => Pick<ConfigurationChange, 'impact' | 'explanation'>;
}

export function compareDhcpConfigurations(before: DhcpConfiguration, after: DhcpConfiguration): ConfigurationDiff {
  const changes: ConfigurationChange[] = [];
  const redactor = createRedactor('dhcpulse-diff');
  const scopesBefore = [...before.ipv4Scopes, ...before.ipv6Scopes];
  const scopesAfter = [...after.ipv4Scopes, ...after.ipv6Scopes];

  compareEntities(changes, redactor, {
    entityType: 'server',
    before: before.servers,
    after: after.servers,
    key: (entity) => entity.name ?? entity.address ?? entity.id,
    path: (key, index) => semanticPath('servers', key, index, redactor),
    comparable: stripMetadata,
    assess: (kind) => ({ impact: kind === 'removed' ? 'warning' : 'info', explanation: 'Server settings or lease lifetimes changed.' }),
  });
  compareEntities(changes, redactor, {
    entityType: 'scope',
    before: scopesBefore,
    after: scopesAfter,
    key: (entity) => `${entity.protocol}:${entity.cidr}`,
    path: (key, index) => semanticPath('scopes', key, index, redactor),
    comparable: stripMetadata,
    assess: (kind) => ({ impact: kind === 'removed' ? 'warning' : 'info', explanation: `A DHCP scope was ${kind}.` }),
  });
  compareEntities(changes, redactor, {
    entityType: 'pool',
    before: before.pools,
    after: after.pools,
    key: (entity) => `${entity.protocol}:${entity.scopeId ?? 'global'}`,
    path: (key, index) => semanticPath('pools', key, index, redactor),
    comparable: stripMetadata,
    assess: (kind, previous, next) => assessPool(kind, previous, next, scopesBefore, scopesAfter),
  });
  compareEntities(changes, redactor, {
    entityType: 'exclusion',
    before: before.exclusions,
    after: after.exclusions,
    key: (entity) => `${entity.protocol}:${entity.scopeId ?? 'global'}`,
    path: (key, index) => semanticPath('exclusions', key, index, redactor),
    comparable: stripMetadata,
    assess: (kind) => ({ impact: 'warning', explanation: `A DHCP exclusion was ${kind}.` }),
  });
  compareEntities(changes, redactor, {
    entityType: 'reservation',
    before: before.reservations,
    after: after.reservations,
    key: reservationKey,
    path: (key, index) => semanticPath('reservations', key, index, redactor),
    comparable: stripMetadata,
    assess: assessReservation,
  });
  compareEntities(changes, redactor, {
    entityType: 'option',
    before: before.options,
    after: after.options,
    key: optionKey,
    path: (key, index) => semanticPath('options', key, index, redactor),
    comparable: stripMetadata,
    assess: assessOption,
  });
  compareEntities(changes, redactor, {
    entityType: 'policy',
    before: before.policies,
    after: after.policies,
    key: (entity) => `${entity.kind}:${entity.name}`,
    path: (key, index) => semanticPath('policies', key, index, redactor),
    comparable: stripMetadata,
    assess: (kind) => ({ impact: 'warning', explanation: `A DHCP policy, tag, or shared network was ${kind}.` }),
  });
  compareEntities(changes, redactor, {
    entityType: 'class',
    before: before.classes,
    after: after.classes,
    key: (entity) => entity.name,
    path: (key, index) => semanticPath('classes', key, index, redactor),
    comparable: stripMetadata,
    assess: (kind) => ({ impact: 'warning', explanation: `A DHCP client class was ${kind}.` }),
  });
  compareEntities(changes, redactor, {
    entityType: 'relay',
    before: before.relayAddresses,
    after: after.relayAddresses,
    key: (entity) => `${entity.protocol}:${entity.scopeId ?? 'global'}:${entity.address}`,
    path: (key, index) => semanticPath('relay-addresses', key, index, redactor),
    comparable: stripMetadata,
    assess: (kind) => ({ impact: kind === 'added' ? 'info' : 'warning', explanation: `DHCP relay forwarding was ${kind}.` }),
  });
  compareEntities(changes, redactor, {
    entityType: 'failover',
    before: before.failoverRelationships,
    after: after.failoverRelationships,
    key: (entity) => entity.name,
    path: (key, index) => semanticPath('failover', key, index, redactor),
    comparable: stripMetadata,
    assess: (kind) => ({
      impact: kind === 'removed' ? 'blocker' : 'warning',
      explanation: kind === 'removed'
        ? 'A source failover relationship is not represented in the target configuration.'
        : `A failover relationship was ${kind}.`,
    }),
  });
  compareEntities(changes, redactor, {
    entityType: 'dns-update',
    before: before.dnsUpdateSettings,
    after: after.dnsUpdateSettings,
    key: (entity) => entity.scopeId ?? 'global',
    path: (key, index) => semanticPath('dns-update', key, index, redactor),
    comparable: stripMetadata,
    assess: () => ({ impact: 'warning', explanation: 'Dynamic DNS update behavior changed and requires migration review.' }),
  });
  compareEntities(changes, redactor, {
    entityType: 'audit',
    before: before.auditSettings,
    after: after.auditSettings,
    key: () => 'server',
    path: (key, index) => semanticPath('audit', key, index, redactor),
    comparable: stripMetadata,
    assess: (kind) => ({ impact: kind === 'added' ? 'info' : 'warning', explanation: `DHCP audit settings were ${kind}.` }),
  });

  if (before.ipv6Scopes.length > 0 && after.ipv6Scopes.length === 0) {
    pushChange(changes, redactor, {
      kind: 'removed',
      entityType: 'capability',
      semanticPath: 'capabilities/dhcpv6',
      before: { available: true },
      after: { available: false },
      impact: 'blocker',
      explanation: 'The target configuration no longer represents DHCPv6 capability.',
    });
  }

  detectDuplicateIds(before, after, changes, redactor);
  changes.sort((left, right) => {
    return left.semanticPath.localeCompare(right.semanticPath)
      || left.entityType.localeCompare(right.entityType)
      || left.kind.localeCompare(right.kind)
      || left.id.localeCompare(right.id);
  });
  return {
    summary: {
      total: changes.length,
      added: changes.filter(({ kind }) => kind === 'added').length,
      removed: changes.filter(({ kind }) => kind === 'removed').length,
      changed: changes.filter(({ kind }) => kind === 'changed').length,
      blockers: changes.filter(({ impact }) => impact === 'blocker').length,
      warnings: changes.filter(({ impact }) => impact === 'warning').length,
      infos: changes.filter(({ impact }) => impact === 'info').length,
    },
    changes,
  };
}

function compareEntities<T extends NormalizedEntity>(
  changes: ConfigurationChange[],
  redactor: Redactor,
  comparison: EntityComparison<T>,
): void {
  const beforeGroups = groupBy(comparison.before, comparison.key);
  const afterGroups = groupBy(comparison.after, comparison.key);
  const keys = [...new Set([...beforeGroups.keys(), ...afterGroups.keys()])].sort();
  for (const key of keys) {
    const previousCandidates = [...(beforeGroups.get(key) ?? [])];
    const nextCandidates = [...(afterGroups.get(key) ?? [])];
    const previousItems: T[] = [];
    for (const previous of previousCandidates) {
      const comparable = stableStringify(comparison.comparable(previous));
      const exactIndex = nextCandidates.findIndex((next) => stableStringify(comparison.comparable(next)) === comparable);
      if (exactIndex >= 0) nextCandidates.splice(exactIndex, 1);
      else previousItems.push(previous);
    }
    previousItems.sort((left, right) => compareStable(comparison.comparable(left), comparison.comparable(right)));
    const nextItems = nextCandidates.sort((left, right) => compareStable(comparison.comparable(left), comparison.comparable(right)));
    const length = Math.max(previousItems.length, nextItems.length);
    for (let index = 0; index < length; index += 1) {
      const previous = previousItems[index];
      const next = nextItems[index];
      const kind: ConfigurationChangeKind = previous && next ? 'changed' : previous ? 'removed' : 'added';
      if (previous && next && stableStringify(comparison.comparable(previous)) === stableStringify(comparison.comparable(next))) continue;
      const assessment = comparison.assess(kind, previous, next);
      pushChange(changes, redactor, {
        kind,
        entityType: comparison.entityType,
        semanticPath: comparison.path(key, index, previous ?? next!),
        before: previous ? comparison.comparable(previous) : null,
        after: next ? comparison.comparable(next) : null,
        ...assessment,
      });
    }
  }
}

function assessPool(
  kind: ConfigurationChangeKind,
  previous: DhcpPool | undefined,
  next: DhcpPool | undefined,
  scopesBefore: DhcpScope[],
  scopesAfter: DhcpScope[],
): Pick<ConfigurationChange, 'impact' | 'explanation'> {
  if (kind === 'changed' && previous && next) {
    const previousCapacity = ipv4RangeSize(previous.start, previous.end);
    const nextCapacity = ipv4RangeSize(next.start, next.end);
    const scope = scopesAfter.find(({ id }) => id === next.scopeId) ?? scopesBefore.find(({ id }) => id === previous.scopeId);
    if (previousCapacity !== undefined && nextCapacity !== undefined && nextCapacity < previousCapacity) {
      if (scope?.observedLeaseCount !== undefined && nextCapacity < scope.observedLeaseCount) {
        return { impact: 'blocker', explanation: 'The pool shrank below the observed lease count.' };
      }
      return { impact: 'warning', explanation: 'The dynamic address pool shrank.' };
    }
  }
  return { impact: kind === 'added' ? 'info' : 'warning', explanation: `A dynamic address pool was ${kind}.` };
}

function assessReservation(
  kind: ConfigurationChangeKind,
  previous: DhcpReservation | undefined,
  next: DhcpReservation | undefined,
): Pick<ConfigurationChange, 'impact' | 'explanation'> {
  if (kind === 'changed' && previous && next && (previous.level !== next.level || previous.scopeId !== next.scopeId)) {
    return { impact: 'warning', explanation: 'A reservation\'s global/scope placement or specific scope changed.' };
  }
  return { impact: kind === 'added' ? 'info' : 'warning', explanation: `A DHCP reservation was ${kind}.` };
}

function assessOption(
  kind: ConfigurationChangeKind,
  previous: DhcpOption | undefined,
  next: DhcpOption | undefined,
): Pick<ConfigurationChange, 'impact' | 'explanation'> {
  if (kind === 'changed' && previous && next && (
    previous.level !== next.level
    || previous.scopeId !== next.scopeId
    || previous.poolId !== next.poolId
    || previous.reservationId !== next.reservationId
    || previous.policyId !== next.policyId
  )) {
    return { impact: 'warning', explanation: 'DHCP option inheritance changed between configuration levels.' };
  }
  const option = previous ?? next;
  const dns = option?.code === 6 || option?.code === 23 || /dns|domain-name-servers/i.test(option?.name ?? '');
  return {
    impact: dns ? 'warning' : kind === 'added' ? 'info' : 'warning',
    explanation: dns ? 'A DNS-related DHCP option changed.' : `A DHCP option was ${kind}.`,
  };
}

function detectDuplicateIds(
  before: DhcpConfiguration,
  after: DhcpConfiguration,
  changes: ConfigurationChange[],
  redactor: Redactor,
): void {
  const beforeCounts = identifierCounts(allEntities(before));
  const afterCounts = identifierCounts(allEntities(after));
  const identifiers = [...new Set([...beforeCounts.keys(), ...afterCounts.keys()])].sort();
  for (const identifier of identifiers) {
    const previous = beforeCounts.get(identifier) ?? 0;
    const next = afterCounts.get(identifier) ?? 0;
    if (previous <= 1 && next <= 1) continue;
    pushChange(changes, redactor, {
      kind: 'changed',
      entityType: 'duplicate-identifier',
      semanticPath: `duplicates/${identifier}`,
      before: previous,
      after: next,
      impact: 'warning',
      explanation: 'Duplicate normalized identifiers can make migration matching ambiguous.',
    });
  }
}

function allEntities(configuration: DhcpConfiguration): NormalizedEntity[] {
  return [
    ...configuration.servers,
    ...configuration.ipv4Scopes,
    ...configuration.ipv6Scopes,
    ...configuration.pools,
    ...configuration.exclusions,
    ...configuration.reservations,
    ...configuration.options,
    ...configuration.policies,
    ...configuration.classes,
    ...configuration.relayAddresses,
    ...configuration.failoverRelationships,
    ...configuration.dnsUpdateSettings,
    ...configuration.auditSettings,
  ];
}

function identifierCounts(entities: NormalizedEntity[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { id } of entities) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

function pushChange(
  changes: ConfigurationChange[],
  redactor: Redactor,
  change: Omit<ConfigurationChange, 'id' | 'before' | 'after'> & { before: unknown; after: unknown },
): void {
  changes.push({
    id: deterministicConfigId('change', change.kind, change.entityType, change.semanticPath),
    ...change,
    before: redactSafe(change.before, redactor),
    after: redactSafe(change.after, redactor),
  });
}

function stripMetadata<T extends NormalizedEntity>(entity: T): RedactionSafeValue {
  return Object.fromEntries(
    Object.entries(entity).filter(([key]) => key !== 'id' && key !== 'provenance'),
  ) as RedactionSafeValue;
}

function redactSafe(value: unknown, redactor: Redactor): RedactionSafeValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return redactor.redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => redactSafe(item, redactor));
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(item).map(([key, child]) => {
      if (key === 'identifier' && typeof child === 'string') {
        return [key, item.identifierType === 'mac' ? redactor.redactMac(child) : redactor.redactIdentifier(child)];
      }
      if ((key === 'hostname' || key === 'domain') && typeof child === 'string') {
        return [key, redactor.redactHostname(child)];
      }
      return [key, redactSafe(child, redactor)];
    }));
  }
  return String(value);
}

function reservationKey(entity: DhcpReservation): string {
  return `${entity.protocol}:${entity.identifierType ?? 'address'}:${entity.identifier ?? entity.hostname ?? entity.address}`.toLowerCase();
}

function optionKey(entity: DhcpOption): string {
  return `${entity.protocol}:${entity.code ?? entity.name ?? 'unknown'}`.toLowerCase();
}

function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const semanticKey = key(value);
    const group = groups.get(semanticKey) ?? [];
    group.push(value);
    groups.set(semanticKey, group);
  }
  return groups;
}

function semanticPath(prefix: string, key: string, index: number, redactor: Redactor): string {
  const safePrefix = redactor.redactText(prefix);
  const safeKey = deterministicConfigId('identity', key);
  return `${safePrefix}/${safeKey}${index > 0 ? `/${index}` : ''}`;
}

function compareStable(left: unknown, right: unknown): number {
  return stableStringify(left).localeCompare(stableStringify(right));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function ipv4RangeSize(start: string, end: string): number | undefined {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(start) || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(end)) return undefined;
  const first = ipv4Number(start);
  const last = ipv4Number(end);
  return last >= first ? last - first + 1 : undefined;
}

function ipv4Number(address: string): number {
  return address.split('.').reduce((total, part) => ((total << 8) | Number(part)) >>> 0, 0);
}
