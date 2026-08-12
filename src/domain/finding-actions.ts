import {
  addChangeOperation,
  createChangeSet,
  validateChangeSet,
  type ChangeSetResult,
  type DhcpChangeOperation,
  type DhcpChangeSet,
} from './dhcp-change-set';
import { deterministicConfigId } from './config-model';
import type {
  ConfigurationWorkspace,
  WorkspaceActionId,
  WorkspaceFinding,
} from './config-workspace';
import { parseIpv4 } from './ip-address';

export type FindingActionErrorCode =
  | 'ACTION_NOT_AVAILABLE'
  | 'INVALID_EVIDENCE'
  | 'TARGET_NOT_FOUND';

export class FindingActionError extends Error {
  constructor(public readonly code: FindingActionErrorCode) {
    super(code);
    this.name = 'FindingActionError';
  }
}

export interface FindingAction {
  id: WorkspaceActionId;
  operationKind: DhcpChangeOperation['kind'];
}

interface FindingActionDefinition extends FindingAction {
  ruleId: 'reservation-in-dynamic-pool' | 'gateway-in-dynamic-pool';
  build: (workspace: ConfigurationWorkspace, finding: WorkspaceFinding) => DhcpChangeOperation;
}

const definitions: readonly FindingActionDefinition[] = [
  {
    id: 'exclude-reserved-address',
    ruleId: 'reservation-in-dynamic-pool',
    operationKind: 'exclusion.add',
    build: buildSingleAddressExclusion,
  },
  {
    id: 'exclude-gateway-address',
    ruleId: 'gateway-in-dynamic-pool',
    operationKind: 'exclusion.add',
    build: buildSingleAddressExclusion,
  },
];

export function listFindingActions(
  workspace: ConfigurationWorkspace,
  finding: WorkspaceFinding,
): FindingAction[] {
  if (workspace.format !== 'microsoft-xml' || !workspace.capabilities.executableChanges) return [];
  if (finding.confidence !== 'certain' || !finding.actionId) return [];
  return definitions
    .filter(({ id, ruleId }) => id === finding.actionId && ruleId === finding.ruleId)
    .map(({ id, operationKind }) => ({ id, operationKind }));
}

export function prepareFindingAction(
  workspace: ConfigurationWorkspace,
  finding: WorkspaceFinding,
  actionId: WorkspaceActionId,
  set: DhcpChangeSet = createChangeSet(workspace),
): ChangeSetResult {
  const available = listFindingActions(workspace, finding);
  if (!available.some(({ id }) => id === actionId)) throw new FindingActionError('ACTION_NOT_AVAILABLE');
  const definition = definitions.find(({ id, ruleId }) => id === actionId && ruleId === finding.ruleId);
  if (!definition) throw new FindingActionError('ACTION_NOT_AVAILABLE');
  const operation = definition.build(workspace, finding);
  const existing = set.operations.find(({ id }) => id === operation.id);
  if (existing) return validateChangeSet(workspace, set);
  return addChangeOperation(workspace, set, operation);
}

function buildSingleAddressExclusion(
  workspace: ConfigurationWorkspace,
  finding: WorkspaceFinding,
): DhcpChangeOperation {
  const address = finding.evidence.address;
  if (typeof address !== 'string' || parseIpv4(address) === null) {
    throw new FindingActionError('INVALID_EVIDENCE');
  }
  const scope = workspace.configuration.ipv4Scopes.find(({ id }) => finding.entityIds.includes(id));
  if (!scope) throw new FindingActionError('TARGET_NOT_FOUND');
  return {
    id: deterministicConfigId('change-operation', finding.actionId, finding.id),
    kind: 'exclusion.add',
    targetId: scope.id,
    rationaleFindingId: finding.id,
    after: { start: address, end: address },
  };
}
