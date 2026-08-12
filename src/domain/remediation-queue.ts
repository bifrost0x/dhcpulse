import type { ChangeSetResult } from './dhcp-change-set';
import { listFindingActions } from './finding-actions';
import type { ConfigurationWorkspace, WorkspaceFinding } from './config-workspace';
import { buildMicrosoftWorkspace } from './microsoft-workspace';
import { evaluatePackageEligibility, groupWorkspaceFindings } from './workspace-view';

export type RemediationSection = 'act-now' | 'review' | 'observe';

export interface RemediationQueueItem {
  id: string;
  section: RemediationSection;
  severity: WorkspaceFinding['severity'];
  ruleId: string;
  findingIds: string[];
  scopeIds: string[];
  affectedCount: number;
  confidence: WorkspaceFinding['confidence'];
  actionable: boolean;
  preparedCount: number;
}

export interface RemediationQueueModel {
  sections: Record<RemediationSection, RemediationQueueItem[]>;
  totals: Record<RemediationSection, number>;
}

export interface RemediationOccurrenceContext {
  queueItemId: string;
  occurrenceIndex: number;
  occurrenceCount: number;
  finding: WorkspaceFinding;
  scopeId?: string;
  scopeLabel?: string;
  entityIds: string[];
  relatedFindingIds: string[];
}

export interface TargetRiskSummary {
  targetScopeIds: string[];
  newScopes: Array<{ cidr: string; name: string }>;
  blockerRules: Array<{ ruleId: string; count: number }>;
  warningRules: Array<{ ruleId: string; count: number }>;
}

const sectionOrder: RemediationSection[] = ['act-now', 'review', 'observe'];
const severityRank = { blocker: 0, warning: 1, info: 2 } as const;

export function buildRemediationQueue(
  workspace: ConfigurationWorkspace,
  result?: ChangeSetResult | null,
): RemediationQueueModel {
  const preparedFindingIds = new Set(result?.changeSet.operations
    .map(({ rationaleFindingId }) => rationaleFindingId)
    .filter((id): id is string => Boolean(id)) ?? []);
  const sections: RemediationQueueModel['sections'] = { 'act-now': [], review: [], observe: [] };
  const totals: RemediationQueueModel['totals'] = { 'act-now': 0, review: 0, observe: 0 };

  for (const group of groupWorkspaceFindings(workspace)) {
    const actionable = group.findings.some((finding) => listFindingActions(workspace, finding).length > 0);
    const section: RemediationSection = group.severity === 'blocker' || actionable
      ? 'act-now'
      : group.severity === 'warning' ? 'review' : 'observe';
    const item: RemediationQueueItem = {
      id: group.key,
      section,
      severity: group.severity,
      ruleId: group.ruleId,
      findingIds: group.findings.map(({ id }) => id),
      scopeIds: group.scopeIds,
      affectedCount: group.count,
      confidence: weakestConfidence(group.findings),
      actionable,
      preparedCount: group.findings.filter(({ id }) => preparedFindingIds.has(id)).length,
    };
    sections[section].push(item);
    totals[section] += item.affectedCount;
  }

  for (const section of sectionOrder) {
    sections[section] = sections[section]
      .sort((left, right) => severityRank[left.severity] - severityRank[right.severity]
        || right.affectedCount - left.affectedCount
        || left.ruleId.localeCompare(right.ruleId));
  }
  return { sections, totals };
}

export function buildRemediationContext(
  workspace: ConfigurationWorkspace,
  item: RemediationQueueItem,
  requestedIndex: number,
  scopeFilter?: string,
): RemediationOccurrenceContext {
  const findings = item.findingIds
    .map((id) => workspace.findings.find((finding) => finding.id === id))
    .filter((finding): finding is WorkspaceFinding => Boolean(finding))
    .filter((finding) => !scopeFilter || findingScopeIds(workspace, finding).includes(scopeFilter));
  const occurrenceIndex = Math.min(Math.max(0, requestedIndex), Math.max(0, findings.length - 1));
  const finding = findings[occurrenceIndex]!;
  const scopeId = scopeFilter ?? findScopeId(workspace, finding);
  const entitySet = new Set(finding.entityIds);
  const relatedFindingIds = workspace.findings
    .filter((candidate) => candidate.id !== finding.id
      && (scopeId
        ? findingScopeIds(workspace, candidate).includes(scopeId)
        : candidate.entityIds.some((id) => entitySet.has(id))))
    .map(({ id }) => id);
  const scope = workspace.configuration.ipv4Scopes.find(({ id }) => id === scopeId);
  return {
    queueItemId: item.id,
    occurrenceIndex,
    occurrenceCount: findings.length,
    finding,
    ...(scopeId ? { scopeId } : {}),
    ...(scope ? { scopeLabel: scope.name ?? scope.cidr } : {}),
    entityIds: finding.entityIds,
    relatedFindingIds,
  };
}

export function countRemediationOccurrences(
  workspace: ConfigurationWorkspace,
  item: RemediationQueueItem,
  scopeFilter?: string,
): number {
  if (!scopeFilter) return item.findingIds.length;
  return item.findingIds.reduce((count, id) => {
    const finding = workspace.findings.find((candidate) => candidate.id === id);
    return count + (finding && findingScopeIds(workspace, finding).includes(scopeFilter) ? 1 : 0);
  }, 0);
}

export function countPreparedRemediationOccurrences(
  workspace: ConfigurationWorkspace,
  item: RemediationQueueItem,
  result?: ChangeSetResult | null,
  scopeFilter?: string,
): number {
  const prepared = new Set(result?.changeSet.operations
    .map(({ rationaleFindingId }) => rationaleFindingId)
    .filter((id): id is string => Boolean(id)) ?? []);
  return item.findingIds.reduce((count, id) => {
    if (!prepared.has(id)) return count;
    const finding = workspace.findings.find((candidate) => candidate.id === id);
    return count + (finding && (!scopeFilter || findingScopeIds(workspace, finding).includes(scopeFilter)) ? 1 : 0);
  }, 0);
}

export function findRemediationOccurrenceIndex(
  workspace: ConfigurationWorkspace,
  item: RemediationQueueItem,
  findingId: string,
  scopeFilter?: string,
): number {
  return item.findingIds
    .filter((id) => {
      if (!scopeFilter) return true;
      const finding = workspace.findings.find((candidate) => candidate.id === id);
      return Boolean(finding && findingScopeIds(workspace, finding).includes(scopeFilter));
    })
    .indexOf(findingId);
}

export function summarizeTargetRisk(
  workspace: ConfigurationWorkspace,
  result: ChangeSetResult,
): TargetRiskSummary {
  const { targetScopeIds, newScopes } = evaluatePackageEligibility(workspace, result);
  const previewWorkspace = buildMicrosoftWorkspace(result.preview);
  const relevant = groupWorkspaceFindings(previewWorkspace)
    .filter(({ scopeIds }) => scopeIds.some((id) => targetScopeIds.includes(id)));
  const rules = (severity: WorkspaceFinding['severity']) => relevant
    .filter((group) => group.severity === severity)
    .map(({ ruleId, findings }) => ({
      ruleId,
      count: findings.filter((finding) => findingScopeIds(previewWorkspace, finding)
        .some((scopeId) => targetScopeIds.includes(scopeId))).length,
    }))
    .filter(({ count }) => count > 0);
  return { targetScopeIds, newScopes, blockerRules: rules('blocker'), warningRules: rules('warning') };
}

function weakestConfidence(findings: WorkspaceFinding[]): WorkspaceFinding['confidence'] {
  if (findings.some(({ confidence }) => confidence === 'assumption-dependent')) return 'assumption-dependent';
  if (findings.some(({ confidence }) => confidence === 'limited')) return 'limited';
  return 'certain';
}

function findScopeId(workspace: ConfigurationWorkspace, finding: WorkspaceFinding): string | undefined {
  return findingScopeIds(workspace, finding)[0];
}

function findingScopeIds(workspace: Pick<ConfigurationWorkspace, 'configuration'>, finding: WorkspaceFinding): string[] {
  const ids = new Set(workspace.configuration.ipv4Scopes
    .filter(({ id }) => finding.entityIds.includes(id))
    .map(({ id }) => id));
  for (const entity of [
    ...workspace.configuration.pools,
    ...workspace.configuration.exclusions,
    ...workspace.configuration.reservations,
    ...workspace.configuration.options,
    ...workspace.configuration.policies,
  ]) {
    if (finding.entityIds.includes(entity.id) && entity.scopeId) ids.add(entity.scopeId);
  }
  return [...ids];
}
