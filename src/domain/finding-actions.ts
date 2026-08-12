import {
  createChangeSet,
  validateChangeSet,
  type ChangeSetResult,
  type DhcpChangeOperation,
  type DhcpChangeSet,
  type OptionState,
  type ReservationState,
} from './dhcp-change-set';
import { deterministicConfigId, type DhcpOption, type DhcpReservation } from './config-model';
import type { ConfigurationWorkspace, WorkspaceActionId, WorkspaceFinding } from './config-workspace';
import { parseIpv4 } from './ip-address';
import type { WorkspaceActionDescriptor, WorkspaceActionValues } from './workspace-action';

export type FindingActionErrorCode =
  | 'ACTION_NOT_AVAILABLE'
  | 'INVALID_EVIDENCE'
  | 'INVALID_INPUT'
  | 'TARGET_NOT_FOUND';

export class FindingActionError extends Error {
  constructor(public readonly code: FindingActionErrorCode, public readonly fieldName?: string) {
    super(code);
    this.name = 'FindingActionError';
  }
}

export type FindingAction = WorkspaceActionDescriptor;

const automatic = (
  id: WorkspaceActionId,
  operationKind: DhcpChangeOperation['kind'],
): FindingAction => ({ id, operationKind, mode: 'automatic', fields: [] });

export function listFindingActions(
  workspace: ConfigurationWorkspace,
  finding: WorkspaceFinding,
): FindingAction[] {
  if (workspace.format !== 'microsoft-xml' || !workspace.capabilities.executableChanges) return [];
  if (finding.confidence !== 'certain') return [];
  switch (finding.ruleId) {
    case 'reservation-in-dynamic-pool':
      return [automatic('exclude-reserved-address', 'exclusion.add')];
    case 'gateway-in-dynamic-pool':
      return [automatic('exclude-gateway-address', 'exclusion.add')];
    case 'duplicate-reservation-address':
    case 'duplicate-reservation-identifier': {
      const reservations = findingReservations(workspace, finding);
      if (reservations.length < 2) return [];
      return [{
        id: 'resolve-duplicate-reservations',
        operationKind: 'reservation.remove',
        mode: 'guided',
        fields: [{
          name: 'keepReservationId',
          type: 'select',
          required: true,
          defaultValue: reservations[0]!.id,
          options: reservations.map((reservation) => ({
            value: reservation.id,
            label: reservation.hostname ?? reservation.address,
            detail: reservation.address,
          })),
        }],
      }];
    }
    case 'reservation-outside-scope': {
      const reservation = findingReservations(workspace, finding)[0];
      if (!reservation?.identifier) return [];
      return [{
        id: 'update-reservation-address', operationKind: 'reservation.update', mode: 'guided',
        fields: [{ name: 'address', type: 'ipv4', required: true, defaultValue: reservation.address }],
      }];
    }
    case 'invalid-address-option': {
      const option = findingOptions(workspace, finding)[0];
      if (!option || option.code === undefined || !allowedOptionCodes.has(option.code)) return [];
      return [{
        id: 'set-valid-option-value', operationKind: 'option.set', mode: 'guided',
        fields: [{ name: 'value', type: 'text', required: true, defaultValue: displayOptionValue(option.value) }],
      }];
    }
    case 'scope-option-overrides-server':
      return findingOptions(workspace, finding).length >= 2
        ? [automatic('align-option-with-server', 'option.set'), automatic('remove-scope-option', 'option.remove')]
        : [];
    case 'scope-capacity-low': {
      const scope = findingScope(workspace, finding);
      if (!scope?.startRange || !scope.endRange || !scope.leaseLifetimeSeconds) return [];
      return [
        {
          id: 'resize-scope-range', operationKind: 'scope-range.set', mode: 'guided',
          fields: [
            { name: 'start', type: 'ipv4', required: true, defaultValue: scope.startRange },
            { name: 'end', type: 'ipv4', required: true, defaultValue: scope.endRange },
          ],
        },
        {
          id: 'set-scope-lease', operationKind: 'scope-lease.set', mode: 'guided',
          fields: [{ name: 'leaseSeconds', type: 'integer', required: true, defaultValue: String(scope.leaseLifetimeSeconds) }],
        },
      ];
    }
    default:
      return [];
  }
}

export function prepareFindingAction(
  workspace: ConfigurationWorkspace,
  finding: WorkspaceFinding,
  actionId: WorkspaceActionId,
  set: DhcpChangeSet = createChangeSet(workspace),
  values: WorkspaceActionValues = {},
): ChangeSetResult {
  const available = listFindingActions(workspace, finding);
  if (!available.some(({ id }) => id === actionId)) throw new FindingActionError('ACTION_NOT_AVAILABLE');
  const operations = buildOperations(workspace, finding, actionId, values);
  const existingIds = new Set(set.operations.map(({ id }) => id));
  const additions = operations.filter(({ id }) => !existingIds.has(id));
  return validateChangeSet(workspace, { ...set, operations: [...set.operations, ...additions] });
}

function buildOperations(
  workspace: ConfigurationWorkspace,
  finding: WorkspaceFinding,
  actionId: WorkspaceActionId,
  values: WorkspaceActionValues,
): DhcpChangeOperation[] {
  if (actionId === 'exclude-reserved-address' || actionId === 'exclude-gateway-address') {
    return [buildSingleAddressExclusion(workspace, finding, actionId)];
  }
  if (actionId === 'resolve-duplicate-reservations') {
    const keepId = required(values, 'keepReservationId');
    const reservations = findingReservations(workspace, finding);
    if (!reservations.some(({ id }) => id === keepId)) throw new FindingActionError('INVALID_INPUT', 'keepReservationId');
    return reservations.filter(({ id }) => id !== keepId).map((reservation) => ({
      id: operationId(actionId, finding.id, reservation.id),
      kind: 'reservation.remove',
      targetId: reservation.id,
      rationaleFindingId: finding.id,
      before: reservationState(reservation),
    }));
  }
  if (actionId === 'update-reservation-address') {
    const reservation = findingReservations(workspace, finding)[0];
    if (!reservation) throw new FindingActionError('TARGET_NOT_FOUND');
    const address = ipv4(values, 'address');
    return [{
      id: operationId(actionId, finding.id, reservation.id),
      kind: 'reservation.update', targetId: reservation.id, rationaleFindingId: finding.id,
      before: reservationState(reservation), after: { ...reservationState(reservation), address },
    }];
  }
  if (actionId === 'set-valid-option-value') {
    const option = findingOptions(workspace, finding)[0];
    if (!option?.scopeId || option.code === undefined) throw new FindingActionError('TARGET_NOT_FOUND');
    return [{
      id: operationId(actionId, finding.id, option.id),
      kind: 'option.set', targetId: option.scopeId, rationaleFindingId: finding.id,
      before: optionState(option), after: { ...optionState(option), value: parseOptionValue(option.code, required(values, 'value')) },
    }];
  }
  if (actionId === 'align-option-with-server' || actionId === 'remove-scope-option') {
    const options = findingOptions(workspace, finding);
    const scoped = options.find(({ level }) => level === 'scope');
    const global = options.find(({ level }) => level === 'global');
    if (!scoped?.scopeId || scoped.code === undefined || !global) throw new FindingActionError('TARGET_NOT_FOUND');
    if (actionId === 'remove-scope-option') return [{
      id: operationId(actionId, finding.id, scoped.id),
      kind: 'option.remove', targetId: scoped.id, rationaleFindingId: finding.id, before: optionState(scoped),
    }];
    return [{
      id: operationId(actionId, finding.id, scoped.id),
      kind: 'option.set', targetId: scoped.scopeId, rationaleFindingId: finding.id,
      before: optionState(scoped), after: { ...optionState(scoped), value: cloneValue(global.value) },
    }];
  }
  if (actionId === 'resize-scope-range' || actionId === 'set-scope-lease') {
    const scope = findingScope(workspace, finding);
    if (!scope?.startRange || !scope.endRange || !scope.leaseLifetimeSeconds) throw new FindingActionError('TARGET_NOT_FOUND');
    if (actionId === 'resize-scope-range') return [{
      id: operationId(actionId, finding.id, scope.id),
      kind: 'scope-range.set', targetId: scope.id, rationaleFindingId: finding.id,
      before: { start: scope.startRange, end: scope.endRange },
      after: { start: ipv4(values, 'start'), end: ipv4(values, 'end') },
    }];
    return [{
      id: operationId(actionId, finding.id, scope.id),
      kind: 'scope-lease.set', targetId: scope.id, rationaleFindingId: finding.id,
      beforeSeconds: scope.leaseLifetimeSeconds, afterSeconds: positiveInteger(values, 'leaseSeconds'),
    }];
  }
  throw new FindingActionError('ACTION_NOT_AVAILABLE');
}

function buildSingleAddressExclusion(
  workspace: ConfigurationWorkspace,
  finding: WorkspaceFinding,
  actionId: WorkspaceActionId,
): DhcpChangeOperation {
  const address = finding.evidence.address;
  if (typeof address !== 'string' || parseIpv4(address) === null) throw new FindingActionError('INVALID_EVIDENCE');
  const scope = findingScope(workspace, finding);
  if (!scope) throw new FindingActionError('TARGET_NOT_FOUND');
  return {
    id: operationId(actionId, finding.id, scope.id), kind: 'exclusion.add', targetId: scope.id,
    rationaleFindingId: finding.id, after: { start: address, end: address },
  };
}

function findingReservations(workspace: ConfigurationWorkspace, finding: WorkspaceFinding) {
  return workspace.configuration.reservations.filter(({ id }) => finding.entityIds.includes(id));
}

function findingOptions(workspace: ConfigurationWorkspace, finding: WorkspaceFinding) {
  return workspace.configuration.options.filter(({ id }) => finding.entityIds.includes(id));
}

function findingScope(workspace: ConfigurationWorkspace, finding: WorkspaceFinding) {
  return workspace.configuration.ipv4Scopes.find(({ id }) => finding.entityIds.includes(id));
}

function reservationState(reservation: DhcpReservation): ReservationState {
  if (!reservation.identifier) throw new FindingActionError('INVALID_EVIDENCE');
  return {
    address: reservation.address,
    clientId: reservation.identifier,
    ...(reservation.hostname ? { hostname: reservation.hostname } : {}),
  };
}

function optionState(option: DhcpOption): OptionState {
  if (option.code === undefined || (option.level !== 'global' && option.level !== 'scope')) {
    throw new FindingActionError('INVALID_EVIDENCE');
  }
  return {
    optionId: option.id,
    code: option.code,
    value: cloneValue(option.value),
    level: option.level,
    ...(option.scopeId ? { scopeId: option.scopeId } : {}),
  };
}

const allowedOptionCodes = new Set([3, 6, 15, 42, 60, 66, 67]);

export function parseOptionValue(code: number, value: string): DhcpOption['value'] {
  const trimmed = value.trim();
  if (!trimmed) throw new FindingActionError('INVALID_INPUT', 'value');
  return new Set([3, 6, 42]).has(code)
    ? trimmed.split(',').map((item) => item.trim()).filter(Boolean)
    : trimmed;
}

function required(values: WorkspaceActionValues, name: string): string {
  const value = values[name]?.trim();
  if (!value) throw new FindingActionError('INVALID_INPUT', name);
  return value;
}

function ipv4(values: WorkspaceActionValues, name: string): string {
  const value = required(values, name);
  if (parseIpv4(value) === null) throw new FindingActionError('INVALID_INPUT', name);
  return value;
}

function positiveInteger(values: WorkspaceActionValues, name: string): number {
  const value = Number(required(values, name));
  if (!Number.isSafeInteger(value) || value <= 0) throw new FindingActionError('INVALID_INPUT', name);
  return value;
}

function displayOptionValue(value: DhcpOption['value']): string {
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function cloneValue(value: DhcpOption['value']): DhcpOption['value'] {
  return Array.isArray(value) ? [...value] : value;
}

function operationId(actionId: WorkspaceActionId, findingId: string, targetId: string): string {
  return deterministicConfigId('change-operation', actionId, findingId, targetId);
}
