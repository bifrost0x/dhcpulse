import type {
  ConfigProvenance,
  DhcpConfiguration,
  DhcpOption,
  DhcpScope,
} from './config-model';
import { deterministicConfigId } from './config-model';
import { analyzeIpv4Cidr, parseIpv4 } from './ip-address';
import { analyzeMultiPoolScope } from './scope-design';

export type WorkspaceEntityKind =
  | 'server'
  | 'scope'
  | 'pool'
  | 'exclusion'
  | 'reservation'
  | 'option'
  | 'policy'
  | 'failover'
  | 'dhcpv6';

export interface WorkspaceNode {
  id: string;
  kind: WorkspaceEntityKind;
  label: string;
  secondary?: string;
  parentId?: string;
  searchableText: string;
  provenance: ConfigProvenance;
  relatedIds: string[];
}

export type WorkspaceRemediationKind =
  | 'scope-range.set'
  | 'scope-lease.set'
  | 'exclusion.add'
  | 'reservation.update'
  | 'option.set';

export type WorkspaceActionId =
  | 'exclude-reserved-address'
  | 'exclude-gateway-address';

export interface WorkspaceRemediation {
  kind: WorkspaceRemediationKind;
  targetId: string;
}

export interface WorkspaceFinding {
  id: string;
  ruleId: string;
  severity: 'blocker' | 'warning' | 'info';
  entityIds: string[];
  titleKey: string;
  rationaleKey: string;
  impactKey: string;
  recommendationKey: string;
  evidence: Record<string, string | number | boolean>;
  source: string;
  sources: string[];
  confidence: 'certain' | 'limited' | 'assumption-dependent';
  actionId?: WorkspaceActionId;
  remediation?: WorkspaceRemediation;
}

export interface EffectiveWorkspaceOption {
  optionId: string;
  code?: number;
  name?: string;
  value: DhcpOption['value'];
  sourceLevel: 'global' | 'scope';
}

export interface WorkspaceScopeSummary {
  scopeId: string;
  poolIds: string[];
  exclusionIds: string[];
  reservationIds: string[];
  optionIds: string[];
  effectiveOptions: EffectiveWorkspaceOption[];
  rawPoolAddresses: number;
  excludedAddresses: number;
  effectiveCapacity: number;
  currentlyUsedAddresses: number;
  remainingAddresses: number;
  utilizationPercent: number;
}

export interface WorkspaceSummary {
  servers: number;
  ipv4Scopes: number;
  ipv6Scopes: number;
  pools: number;
  exclusions: number;
  reservations: number;
  options: number;
  policies: number;
  failoverRelationships: number;
}

export interface MicrosoftWorkspace {
  configuration: DhcpConfiguration;
  serverName: string | null;
  nodes: WorkspaceNode[];
  findings: WorkspaceFinding[];
  summaries: WorkspaceSummary;
  scopeSummaries: Record<string, WorkspaceScopeSummary>;
  generation: { enabled: boolean; reasons: string[] };
}

const SOURCES = {
  dhcp: 'https://www.rfc-editor.org/rfc/rfc2131.html',
  options: 'https://www.iana.org/assignments/bootp-dhcp-parameters/',
  microsoft: 'https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/dhcp-top',
  kea: 'https://kea.readthedocs.io/en/latest/arm/config.html',
  isc: 'https://kb.isc.org/docs/isc-dhcp-44-manual-pages-dhcpdconf',
  dnsmasq: 'https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html',
} as const;

const severityRank = { blocker: 0, warning: 1, info: 2 } as const;

export function buildMicrosoftWorkspace(configuration: DhcpConfiguration): MicrosoftWorkspace {
  const nodes = buildNodes(configuration);
  const scopeSummaries = buildScopeSummaries(configuration);
  const findings = buildFindings(configuration, scopeSummaries);
  const reasons = generationReasons(configuration);

  return {
    configuration,
    serverName: configuration.servers[0]?.name ?? null,
    nodes,
    findings,
    summaries: {
      servers: configuration.servers.length,
      ipv4Scopes: configuration.ipv4Scopes.length,
      ipv6Scopes: configuration.ipv6Scopes.length,
      pools: configuration.pools.length,
      exclusions: configuration.exclusions.length,
      reservations: configuration.reservations.length,
      options: configuration.options.length,
      policies: configuration.policies.length,
      failoverRelationships: configuration.failoverRelationships.length,
    },
    scopeSummaries,
    generation: { enabled: reasons.length === 0, reasons },
  };
}

export function searchWorkspace(workspace: MicrosoftWorkspace, query: string): WorkspaceNode[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return workspace.nodes;
  return workspace.nodes.filter(({ searchableText }) => searchableText.includes(normalized));
}

function buildNodes(configuration: DhcpConfiguration): WorkspaceNode[] {
  const nodes: WorkspaceNode[] = [];
  for (const server of configuration.servers) {
    nodes.push(node(server.id, 'server', server.name ?? server.address ?? 'Microsoft DHCP Server', server.provenance, [server.address]));
  }
  for (const scope of configuration.ipv4Scopes) {
    nodes.push(node(scope.id, 'scope', scope.name ?? scope.cidr, scope.provenance, [scope.cidr, scope.name, scope.startRange, scope.endRange]));
  }
  for (const scope of configuration.ipv6Scopes) {
    nodes.push(node(scope.id, 'dhcpv6', scope.name ?? scope.cidr, scope.provenance, [scope.cidr, scope.name]));
  }
  for (const pool of configuration.pools) {
    nodes.push(node(pool.id, 'pool', `${pool.start} – ${pool.end}`, pool.provenance, [pool.start, pool.end], pool.scopeId));
  }
  for (const exclusion of configuration.exclusions) {
    nodes.push(node(exclusion.id, 'exclusion', `${exclusion.start} – ${exclusion.end}`, exclusion.provenance, [exclusion.start, exclusion.end], exclusion.scopeId));
  }
  for (const reservation of configuration.reservations) {
    nodes.push(node(
      reservation.id,
      'reservation',
      reservation.hostname ?? reservation.address,
      reservation.provenance,
      [reservation.address, reservation.hostname, reservation.identifier],
      reservation.scopeId,
      reservation.address,
    ));
  }
  for (const option of configuration.options) {
    const label = option.code !== undefined ? `Option ${option.code}${option.name ? ` · ${option.name}` : ''}` : option.name ?? 'DHCP option';
    nodes.push(node(
      option.id,
      'option',
      label,
      option.provenance,
      [`option ${option.code ?? ''}`, option.name, displayOptionValue(option.value)],
      option.scopeId,
      displayOptionValue(option.value),
    ));
  }
  for (const policy of configuration.policies) {
    nodes.push(node(policy.id, 'policy', policy.name, policy.provenance, [policy.name, policy.expression], policy.scopeId));
  }
  for (const relationship of configuration.failoverRelationships) {
    nodes.push(node(relationship.id, 'failover', relationship.name, relationship.provenance, [relationship.name, relationship.partner, relationship.mode]));
  }
  return nodes.sort((left, right) => compareText(left.kind, right.kind) || compareText(left.label, right.label) || compareText(left.id, right.id));
}

function node(
  id: string,
  kind: WorkspaceEntityKind,
  label: string,
  provenance: ConfigProvenance,
  searchable: Array<string | undefined>,
  parentId?: string,
  secondary?: string,
): WorkspaceNode {
  return {
    id,
    kind,
    label,
    ...(secondary ? { secondary } : {}),
    ...(parentId ? { parentId } : {}),
    searchableText: [label, kind, ...searchable].filter(Boolean).join(' ').toLocaleLowerCase(),
    provenance,
    relatedIds: parentId ? [parentId] : [],
  };
}

function buildScopeSummaries(configuration: DhcpConfiguration): Record<string, WorkspaceScopeSummary> {
  return Object.fromEntries(configuration.ipv4Scopes.map((scope) => {
    const pools = configuration.pools.filter(({ protocol, scopeId }) => protocol === 'dhcpv4' && scopeId === scope.id);
    const exclusions = configuration.exclusions.filter(({ protocol, scopeId }) => protocol === 'dhcpv4' && scopeId === scope.id);
    const reservations = configuration.reservations.filter(({ protocol, scopeId }) => protocol === 'dhcpv4' && scopeId === scope.id);
    const options = configuration.options.filter(({ protocol, scopeId }) => protocol === 'dhcpv4' && scopeId === scope.id);
    const capacity = analyzeMultiPoolScope({
      id: scope.id,
      cidr: scope.cidr,
      pools: pools.map(({ start, end }) => ({ start, end })),
      exclusions: exclusions.map(({ start, end }) => ({ start, end })),
      reservations: reservations.map(({ id, address }) => ({ id, address })),
      leases: scope.observedLeaseCount,
      gateway: optionAddresses(options.find(({ code }) => code === 3)?.value)[0],
    }).aggregate;
    return [scope.id, {
      scopeId: scope.id,
      poolIds: pools.map(({ id }) => id),
      exclusionIds: exclusions.map(({ id }) => id),
      reservationIds: reservations.map(({ id }) => id),
      optionIds: options.map(({ id }) => id),
      effectiveOptions: effectiveOptions(configuration, scope),
      rawPoolAddresses: capacity.rawPoolAddresses,
      excludedAddresses: capacity.excludedAddresses,
      effectiveCapacity: capacity.effectiveCapacity,
      currentlyUsedAddresses: capacity.currentlyUsedAddresses,
      remainingAddresses: capacity.remainingAddresses,
      utilizationPercent: capacity.utilizationPercent,
    } satisfies WorkspaceScopeSummary];
  }));
}

function effectiveOptions(configuration: DhcpConfiguration, scope: DhcpScope): EffectiveWorkspaceOption[] {
  const selected = new Map<string, DhcpOption>();
  for (const option of configuration.options.filter(({ protocol, level }) => protocol === 'dhcpv4' && level === 'global')) {
    selected.set(optionKey(option), option);
  }
  for (const option of configuration.options.filter(({ protocol, scopeId }) => protocol === 'dhcpv4' && scopeId === scope.id)) {
    selected.set(optionKey(option), option);
  }
  return [...selected.values()].map((option) => ({
    optionId: option.id,
    ...(option.code !== undefined ? { code: option.code } : {}),
    ...(option.name ? { name: option.name } : {}),
    value: option.value,
    sourceLevel: option.scopeId === scope.id ? 'scope' as const : 'global' as const,
  })).sort((left, right) => (left.code ?? Number.MAX_SAFE_INTEGER) - (right.code ?? Number.MAX_SAFE_INTEGER) || compareText(left.name ?? '', right.name ?? ''));
}

function buildFindings(
  configuration: DhcpConfiguration,
  scopeSummaries: Record<string, WorkspaceScopeSummary>,
): WorkspaceFinding[] {
  const findings: WorkspaceFinding[] = [];
  const vendorSource = sourceForFormat(configuration.metadata.source.format);
  for (const warning of configuration.parserWarnings) {
    addFinding(findings, 'parser-warning', 'warning', [], { code: warning.code, count: warning.count, location: warning.provenance.location }, vendorSource, undefined, undefined, 'limited');
  }

  const reservationsByAddress = groupBy(configuration.reservations.filter(({ protocol }) => protocol === 'dhcpv4'), ({ address }) => address.toLocaleLowerCase());
  for (const duplicates of reservationsByAddress.values()) {
    if (duplicates.length > 1) addFinding(findings, 'duplicate-reservation-address', 'blocker', duplicates.map(({ id }) => id), { address: duplicates[0]!.address, count: duplicates.length }, SOURCES.dhcp);
  }
  const reservationsByIdentifier = groupBy(
    configuration.reservations.filter(({ protocol, identifier }) => protocol === 'dhcpv4' && Boolean(identifier)),
    ({ identifier }) => identifier!.toLocaleLowerCase(),
  );
  for (const duplicates of reservationsByIdentifier.values()) {
    if (duplicates.length > 1) addFinding(findings, 'duplicate-reservation-identifier', 'blocker', duplicates.map(({ id }) => id), { count: duplicates.length }, SOURCES.dhcp);
  }

  for (const scope of configuration.ipv4Scopes) {
    const cidr = analyzeIpv4Cidr(scope.cidr);
    const pools = configuration.pools.filter(({ protocol, scopeId }) => protocol === 'dhcpv4' && scopeId === scope.id);
    const reservations = configuration.reservations.filter(({ protocol, scopeId }) => protocol === 'dhcpv4' && scopeId === scope.id);
    for (const reservation of reservations) {
      const address = parseIpv4(reservation.address);
      const insideScope = cidr && address !== null && address >= parseIpv4(cidr.network)! && address <= parseIpv4(cidr.broadcast)!;
      if (!insideScope) {
        addFinding(findings, 'reservation-outside-scope', 'blocker', [reservation.id, scope.id], { address: reservation.address, cidr: scope.cidr }, SOURCES.dhcp, { kind: 'reservation.update', targetId: reservation.id });
      }
      const pool = pools.find((candidate) => addressInRange(reservation.address, candidate.start, candidate.end));
      if (pool) {
        addFinding(findings, 'reservation-in-dynamic-pool', 'warning', [reservation.id, scope.id], { address: reservation.address, poolStart: pool.start, poolEnd: pool.end }, vendorSource, { kind: 'exclusion.add', targetId: scope.id }, 'exclude-reserved-address');
      }
    }

    const scopeOptions = configuration.options.filter(({ protocol, scopeId }) => protocol === 'dhcpv4' && scopeId === scope.id);
    for (const option of scopeOptions.filter(({ code }) => code === 3 || code === 6 || code === 42)) {
      const addresses = optionAddresses(option.value);
      if (addresses.length === 0 || addresses.some((address) => parseIpv4(address) === null)) {
        addFinding(findings, 'invalid-address-option', 'blocker', [option.id, scope.id], { optionCode: option.code ?? 0 }, SOURCES.options, { kind: 'option.set', targetId: option.id });
      }
      if (option.code === 3) {
        for (const address of addresses) {
          const pool = pools.find((candidate) => addressInRange(address, candidate.start, candidate.end));
          if (pool) addFinding(findings, 'gateway-in-dynamic-pool', 'warning', [option.id, scope.id], { address, poolStart: pool.start, poolEnd: pool.end }, SOURCES.dhcp, { kind: 'exclusion.add', targetId: scope.id }, 'exclude-gateway-address');
        }
      }
    }

    const globalByKey = new Map(configuration.options.filter(({ protocol, level }) => protocol === 'dhcpv4' && level === 'global').map((option) => [optionKey(option), option]));
    for (const option of scopeOptions) {
      const inherited = globalByKey.get(optionKey(option));
      if (inherited && displayOptionValue(inherited.value) !== displayOptionValue(option.value)) {
        addFinding(findings, 'scope-option-overrides-server', 'info', [option.id, inherited.id, scope.id], { optionCode: option.code ?? 0 }, SOURCES.microsoft);
      }
    }

    const summary = scopeSummaries[scope.id];
    if (scope.observedLeaseCount !== undefined && summary && summary.utilizationPercent >= 80) {
      addFinding(findings, 'scope-capacity-low', summary.utilizationPercent >= 100 ? 'blocker' : 'warning', [scope.id], { used: summary.currentlyUsedAddresses, capacity: summary.effectiveCapacity, utilizationPercent: Math.round(summary.utilizationPercent) }, SOURCES.microsoft, { kind: 'scope-range.set', targetId: scope.id });
    }
  }

  for (const relationship of configuration.failoverRelationships) {
    if (relationship.scopeIds.length === 0) addFinding(findings, 'failover-scope-membership-missing', 'warning', [relationship.id], { relationship: relationship.name }, SOURCES.microsoft);
  }

  return findings.sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || compareText(left.ruleId, right.ruleId) || compareText(left.id, right.id));
}

function addFinding(
  findings: WorkspaceFinding[],
  ruleId: string,
  severity: WorkspaceFinding['severity'],
  entityIds: string[],
  evidence: WorkspaceFinding['evidence'],
  source: string,
  remediation?: WorkspaceRemediation,
  actionId?: WorkspaceActionId,
  confidence: WorkspaceFinding['confidence'] = 'certain',
): void {
  findings.push({
    id: deterministicConfigId('workspace-finding', ruleId, ...entityIds),
    ruleId,
    severity,
    entityIds,
    titleKey: `workspace.finding.${ruleId}.title`,
    rationaleKey: `workspace.finding.${ruleId}.rationale`,
    impactKey: `workspace.finding.${ruleId}.impact`,
    recommendationKey: `workspace.finding.${ruleId}.recommendation`,
    evidence,
    source,
    sources: [source],
    confidence,
    ...(actionId ? { actionId } : {}),
    ...(remediation ? { remediation } : {}),
  });
}

function sourceForFormat(format: DhcpConfiguration['metadata']['source']['format']): string {
  switch (format) {
    case 'microsoft-xml': return SOURCES.microsoft;
    case 'kea-json': return SOURCES.kea;
    case 'isc-dhcpd': return SOURCES.isc;
    case 'dnsmasq': return SOURCES.dnsmasq;
  }
}

function generationReasons(configuration: DhcpConfiguration): string[] {
  const reasons: string[] = [];
  if (configuration.metadata.source.format !== 'microsoft-xml') reasons.push('microsoft-export-required');
  if (!configuration.servers[0]?.name) reasons.push('server-name-missing');
  for (const scope of configuration.ipv4Scopes) {
    if (!scope.subnetMask || !scope.startRange || !scope.endRange) reasons.push(`scope-range-missing:${scope.id}`);
  }
  return reasons;
}

function optionKey(option: DhcpOption): string {
  return option.code !== undefined ? `code:${option.code}` : `name:${option.name?.toLocaleLowerCase() ?? option.id}`;
}

function displayOptionValue(value: DhcpOption['value']): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function optionAddresses(value: DhcpOption['value'] | undefined): string[] {
  if (value === undefined || typeof value === 'number' || typeof value === 'boolean') return [];
  return (Array.isArray(value) ? value : value.split(/[;,]/)).map((item) => item.trim()).filter(Boolean);
}

function addressInRange(address: string, start: string, end: string): boolean {
  const value = parseIpv4(address);
  const lower = parseIpv4(start);
  const upper = parseIpv4(end);
  return value !== null && lower !== null && upper !== null && lower <= value && value <= upper;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  return groups;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en');
}
