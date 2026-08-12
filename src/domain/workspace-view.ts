import type { ChangeSetResult, DhcpChangeOperation } from './dhcp-change-set';
import type { MicrosoftWorkspace, WorkspaceEntityKind, WorkspaceFinding, WorkspaceNode } from './microsoft-workspace';

export interface ScopeWorkspaceRow {
  scopeId: string;
  name: string;
  cidr: string;
  state?: string;
  capacity: number;
  reservations: number;
  options: number;
  findings: { blocker: number; warning: number; info: number };
}

export interface GroupedWorkspaceFinding {
  key: string;
  ruleId: string;
  severity: WorkspaceFinding['severity'];
  titleKey: string;
  rationaleKey: string;
  count: number;
  scopeIds: string[];
  findings: WorkspaceFinding[];
}

export interface WorkspaceSearchResult {
  id: string;
  kind: WorkspaceEntityKind;
  label: string;
  secondary?: string;
  scopeId?: string;
}

export interface WorkspacePage<T> {
  items: T[];
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

export interface PackageEligibility {
  eligible: boolean;
  blockers: string[];
  warnings: string[];
  targetScopeIds: string[];
  newScopes: Array<{ cidr: string; name: string }>;
}

const severityRank = { blocker: 0, warning: 1, info: 2 } as const;

export function buildScopeWorkspaceRows(workspace: MicrosoftWorkspace): ScopeWorkspaceRow[] {
  const ownership = buildOwnership(workspace);
  return workspace.configuration.ipv4Scopes.map((scope) => {
    const summary = workspace.scopeSummaries[scope.id];
    const findings = { blocker: 0, warning: 0, info: 0 };
    for (const finding of workspace.findings) {
      if (findingScopeIds(finding, ownership).includes(scope.id)) findings[finding.severity] += 1;
    }
    return {
      scopeId: scope.id,
      name: scope.name ?? scope.cidr,
      cidr: scope.cidr,
      ...(scope.state ? { state: scope.state } : {}),
      capacity: summary?.effectiveCapacity ?? 0,
      reservations: summary?.reservationIds.length ?? 0,
      options: summary?.effectiveOptions.length ?? 0,
      findings,
    };
  }).sort((left, right) => right.findings.blocker - left.findings.blocker
    || right.findings.warning - left.findings.warning
    || left.name.localeCompare(right.name));
}

export function groupWorkspaceFindings(workspace: MicrosoftWorkspace, scopeId?: string): GroupedWorkspaceFinding[] {
  const ownership = buildOwnership(workspace);
  const groups = new Map<string, GroupedWorkspaceFinding>();
  for (const finding of workspace.findings) {
    const scopeIds = findingScopeIds(finding, ownership);
    if (scopeId && !scopeIds.includes(scopeId)) continue;
    const key = `${finding.severity}:${finding.ruleId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.findings.push(finding);
      existing.count += 1;
      existing.scopeIds = [...new Set([...existing.scopeIds, ...scopeIds])].sort();
    } else {
      groups.set(key, {
        key,
        ruleId: finding.ruleId,
        severity: finding.severity,
        titleKey: finding.titleKey,
        rationaleKey: finding.rationaleKey,
        count: 1,
        scopeIds: [...scopeIds].sort(),
        findings: [finding],
      });
    }
  }
  return [...groups.values()].sort((left, right) => severityRank[left.severity] - severityRank[right.severity]
    || right.count - left.count
    || left.ruleId.localeCompare(right.ruleId));
}

export function searchWorkspaceObjects(workspace: MicrosoftWorkspace, query: string): WorkspaceSearchResult[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  const ownership = buildOwnership(workspace);
  return workspace.nodes.filter(({ searchableText }) => searchableText.includes(normalized)).map((node) => ({
    id: node.id,
    kind: node.kind,
    label: node.label,
    ...(node.secondary ? { secondary: node.secondary } : {}),
    ...(scopeForNode(node, ownership) ? { scopeId: scopeForNode(node, ownership) } : {}),
  })).sort((left, right) => left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label));
}

export function pageWorkspaceItems<T>(items: T[], requestedPage: number, pageSize = 50): WorkspacePage<T> {
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 50;
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const page = Math.min(pageCount, Math.max(1, Number.isInteger(requestedPage) ? requestedPage : 1));
  const start = (page - 1) * safePageSize;
  return { items: items.slice(start, start + safePageSize), page, pageSize: safePageSize, pageCount, total: items.length };
}

export function evaluatePackageEligibility(workspace: MicrosoftWorkspace, result: ChangeSetResult): PackageEligibility {
  const blockers: string[] = [];
  const targetScopeIds = [...new Set(result.changeSet.operations.flatMap((operation) => operationScopeIds(workspace, operation)))].sort();
  const newScopes = result.changeSet.operations
    .filter((operation): operation is Extract<DhcpChangeOperation, { kind: 'scope.clone' }> => operation.kind === 'scope.clone')
    .map(({ after }) => ({ cidr: after.cidr, name: after.name }))
    .sort((left, right) => left.cidr.localeCompare(right.cidr));
  if (result.changeSet.operations.length === 0) blockers.push('change-set-empty');
  if (!result.valid) blockers.push('change-set-invalid');
  if (!workspace.serverName) blockers.push('server-name-missing');
  if (targetScopeIds.some((scopeId) => {
    const scope = workspace.configuration.ipv4Scopes.find(({ id }) => id === scopeId);
    return !scope?.startRange || !scope.endRange;
  })) blockers.push('target-facts-missing');
  const grouped = groupWorkspaceFindings(workspace);
  if (grouped.some(({ severity, scopeIds }) => severity === 'blocker' && scopeIds.some((scopeId) => targetScopeIds.includes(scopeId)))) blockers.push('target-blocker-findings');
  const warningCount = workspace.findings.filter((finding) => finding.severity === 'warning'
    && findingScopeIds(finding, buildOwnership(workspace)).some((scopeId) => targetScopeIds.includes(scopeId))).length;
  return {
    eligible: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings: warningCount > 0 ? [`target-warning-findings:${warningCount}`] : [],
    targetScopeIds,
    newScopes,
  };
}

function buildOwnership(workspace: MicrosoftWorkspace): Map<string, string> {
  const ownership = new Map<string, string>();
  for (const scope of workspace.configuration.ipv4Scopes) ownership.set(scope.id, scope.id);
  for (const item of [
    ...workspace.configuration.pools,
    ...workspace.configuration.exclusions,
    ...workspace.configuration.reservations,
    ...workspace.configuration.options,
    ...workspace.configuration.policies,
  ]) if (item.scopeId) ownership.set(item.id, item.scopeId);
  return ownership;
}

function findingScopeIds(finding: WorkspaceFinding, ownership: Map<string, string>): string[] {
  return [...new Set(finding.entityIds.map((id) => ownership.get(id)).filter((value): value is string => Boolean(value)))].sort();
}

function scopeForNode(node: WorkspaceNode, ownership: Map<string, string>): string | undefined {
  return node.kind === 'scope' ? node.id : ownership.get(node.id) ?? (node.parentId ? ownership.get(node.parentId) : undefined);
}

function operationScopeIds(workspace: MicrosoftWorkspace, operation: DhcpChangeOperation): string[] {
  switch (operation.kind) {
    case 'scope-range.set':
    case 'scope-lease.set':
    case 'exclusion.add':
    case 'reservation.add':
      return [operation.targetId];
    case 'scope.clone':
      return [];
    case 'exclusion.remove':
      return [operation.before.scopeId];
    case 'reservation.update':
    case 'reservation.remove': {
      const scopeId = workspace.configuration.reservations.find(({ id }) => id === operation.targetId)?.scopeId;
      return scopeId ? [scopeId] : [];
    }
    case 'option.set':
      return operation.after.level === 'scope' && operation.after.scopeId ? [operation.after.scopeId] : [];
    case 'option.remove':
      return operation.before.level === 'scope' && operation.before.scopeId ? [operation.before.scopeId] : [];
  }
}
