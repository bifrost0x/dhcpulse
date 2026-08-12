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
import type { ConfigurationWorkspace, WorkspaceActionId } from './config-workspace';
import { FindingActionError, parseOptionValue } from './finding-actions';
import { analyzeIpv4Cidr, parseIpv4 } from './ip-address';
import type { WorkspaceNode } from './microsoft-workspace';
import type { WorkspaceActionDescriptor, WorkspaceActionValues } from './workspace-action';

export type InventoryAction = WorkspaceActionDescriptor;

const automatic = (id: WorkspaceActionId, operationKind: DhcpChangeOperation['kind']): InventoryAction => ({ id, operationKind, mode: 'automatic', fields: [] });
const field = (name: string, type: 'text' | 'ipv4' | 'integer', defaultValue = '') => ({ name, type, required: true, defaultValue });

export function listInventoryActions(workspace: ConfigurationWorkspace, node: WorkspaceNode): InventoryAction[] {
  if (workspace.format !== 'microsoft-xml' || !workspace.capabilities.executableChanges) return [];
  if (node.kind === 'server') return [{
    id: 'set-server-option', operationKind: 'option.set', mode: 'guided',
    fields: [
      { name: 'optionCode', type: 'select', required: true, defaultValue: '6', options: [3, 6, 15, 42, 60, 66, 67].map((code) => ({ value: String(code), label: `Option ${code}` })) },
      field('value', 'text'),
    ],
  }];
  if (node.kind === 'scope') {
    const scope = workspace.configuration.ipv4Scopes.find(({ id }) => id === node.id);
    if (!scope?.startRange || !scope.endRange || !scope.leaseLifetimeSeconds) return [];
    return [
      { id: 'resize-scope-range', operationKind: 'scope-range.set', mode: 'guided', fields: [field('start', 'ipv4', scope.startRange), field('end', 'ipv4', scope.endRange)] },
      { id: 'set-scope-lease', operationKind: 'scope-lease.set', mode: 'guided', fields: [field('leaseSeconds', 'integer', String(scope.leaseLifetimeSeconds))] },
      { id: 'clone-scope', operationKind: 'scope.clone', mode: 'guided', fields: [field('cidr', 'text'), field('name', 'text'), field('start', 'ipv4'), field('end', 'ipv4'), field('leaseSeconds', 'integer', String(scope.leaseLifetimeSeconds))] },
    ];
  }
  if (node.kind === 'pool') {
    const pool = workspace.configuration.pools.find(({ id }) => id === node.id);
    const scope = workspace.configuration.ipv4Scopes.find(({ id }) => id === pool?.scopeId);
    const isCompleteScopeRange = Boolean(pool?.protocol === 'dhcpv4' && scope
      && workspace.configuration.pools.filter(({ scopeId }) => scopeId === scope.id).length === 1
      && scope.startRange === pool.start && scope.endRange === pool.end);
    return isCompleteScopeRange && pool
      ? [{ id: 'resize-scope-range', operationKind: 'scope-range.set', mode: 'guided', fields: [field('start', 'ipv4', pool.start), field('end', 'ipv4', pool.end)] }]
      : [];
  }
  if (node.kind === 'exclusion') return workspace.configuration.exclusions.some(({ id, protocol }) => id === node.id && protocol === 'dhcpv4') ? [automatic('remove-exclusion', 'exclusion.remove')] : [];
  if (node.kind === 'reservation') {
    const reservation = workspace.configuration.reservations.find(({ id }) => id === node.id);
    if (reservation?.protocol !== 'dhcpv4' || !reservation.identifier) return [];
    return [
      { id: 'update-reservation', operationKind: 'reservation.update', mode: 'guided', fields: [field('address', 'ipv4', reservation.address), field('clientId', 'text', reservation.identifier), { ...field('hostname', 'text', reservation.hostname ?? ''), required: false }] },
      automatic('remove-reservation', 'reservation.remove'),
    ];
  }
  if (node.kind === 'option') {
    const option = workspace.configuration.options.find(({ id }) => id === node.id);
    if (option?.protocol !== 'dhcpv4' || option.code === undefined || !allowedOptionCodes.has(option.code)) return [];
    return [
      { id: 'set-option-value', operationKind: 'option.set', mode: 'guided', fields: [field('value', 'text', displayOptionValue(option.value))] },
      automatic('remove-option', 'option.remove'),
    ];
  }
  return [];
}

export function prepareInventoryAction(
  workspace: ConfigurationWorkspace,
  node: WorkspaceNode,
  actionId: WorkspaceActionId,
  set: DhcpChangeSet = createChangeSet(workspace),
  values: WorkspaceActionValues = {},
): ChangeSetResult {
  if (!listInventoryActions(workspace, node).some(({ id }) => id === actionId)) throw new FindingActionError('ACTION_NOT_AVAILABLE');
  const operation = buildOperation(workspace, node, actionId, values);
  const operations = set.operations.some(({ id }) => id === operation.id) ? set.operations : [...set.operations, operation];
  return validateChangeSet(workspace, { ...set, operations });
}

function buildOperation(workspace: ConfigurationWorkspace, node: WorkspaceNode, actionId: WorkspaceActionId, values: WorkspaceActionValues): DhcpChangeOperation {
  if (actionId === 'resize-scope-range' || actionId === 'set-scope-lease' || actionId === 'clone-scope') {
    const scopeId = node.kind === 'pool' ? workspace.configuration.pools.find(({ id }) => id === node.id)?.scopeId : node.id;
    const scope = workspace.configuration.ipv4Scopes.find(({ id }) => id === scopeId);
    if (!scope?.startRange || !scope.endRange || !scope.leaseLifetimeSeconds) throw new FindingActionError('TARGET_NOT_FOUND');
    if (actionId === 'resize-scope-range') return {
      id: operationId(actionId, node.id), kind: 'scope-range.set', targetId: scope.id,
      before: { start: scope.startRange, end: scope.endRange }, after: { start: ipv4(values, 'start'), end: ipv4(values, 'end') },
    };
    if (actionId === 'set-scope-lease') return {
      id: operationId(actionId, node.id), kind: 'scope-lease.set', targetId: scope.id,
      beforeSeconds: scope.leaseLifetimeSeconds, afterSeconds: positiveInteger(values, 'leaseSeconds'),
    };
    const cidr = required(values, 'cidr');
    const analyzed = analyzeIpv4Cidr(cidr);
    if (!analyzed) throw new FindingActionError('INVALID_INPUT', 'cidr');
    return {
      id: operationId(actionId, node.id), kind: 'scope.clone', targetId: scope.id,
      after: { cidr: analyzed.cidr, name: required(values, 'name'), subnetMask: analyzed.netmask, start: ipv4(values, 'start'), end: ipv4(values, 'end'), leaseSeconds: positiveInteger(values, 'leaseSeconds') },
    };
  }
  if (actionId === 'remove-exclusion') {
    const exclusion = workspace.configuration.exclusions.find(({ id }) => id === node.id);
    if (!exclusion?.scopeId) throw new FindingActionError('TARGET_NOT_FOUND');
    return { id: operationId(actionId, node.id), kind: 'exclusion.remove', targetId: exclusion.id, before: { scopeId: exclusion.scopeId, start: exclusion.start, end: exclusion.end } };
  }
  if (actionId === 'update-reservation' || actionId === 'remove-reservation') {
    const reservation = workspace.configuration.reservations.find(({ id }) => id === node.id);
    if (!reservation) throw new FindingActionError('TARGET_NOT_FOUND');
    const before = reservationState(reservation);
    if (actionId === 'remove-reservation') return { id: operationId(actionId, node.id), kind: 'reservation.remove', targetId: reservation.id, before };
    return {
      id: operationId(actionId, node.id), kind: 'reservation.update', targetId: reservation.id, before,
      after: { address: ipv4(values, 'address'), clientId: required(values, 'clientId'), ...(values.hostname?.trim() ? { hostname: values.hostname.trim() } : {}) },
    };
  }
  if (actionId === 'set-option-value' || actionId === 'remove-option') {
    const option = workspace.configuration.options.find(({ id }) => id === node.id);
    if (!option || option.code === undefined) throw new FindingActionError('TARGET_NOT_FOUND');
    const before = optionState(option);
    if (actionId === 'remove-option') return { id: operationId(actionId, node.id), kind: 'option.remove', targetId: option.id, before };
    const targetId = option.level === 'scope' ? option.scopeId : workspace.configuration.servers[0]?.id;
    if (!targetId) throw new FindingActionError('TARGET_NOT_FOUND');
    return { id: operationId(actionId, node.id), kind: 'option.set', targetId, before, after: { ...before, value: parseOptionValue(option.code, required(values, 'value')) } };
  }
  if (actionId === 'set-server-option') {
    const code = positiveInteger(values, 'optionCode');
    if (!allowedOptionCodes.has(code)) throw new FindingActionError('INVALID_INPUT', 'optionCode');
    const existing = workspace.configuration.options.find(({ protocol, level, code: candidate }) => protocol === 'dhcpv4' && level === 'global' && candidate === code);
    const after: OptionState = { code, level: 'global', value: parseOptionValue(code, required(values, 'value')) };
    return { id: operationId(actionId, `${node.id}-${code}`), kind: 'option.set', targetId: node.id, ...(existing ? { before: optionState(existing) } : {}), after };
  }
  throw new FindingActionError('ACTION_NOT_AVAILABLE');
}

const allowedOptionCodes = new Set([3, 6, 15, 42, 60, 66, 67]);

function reservationState(reservation: DhcpReservation): ReservationState {
  if (!reservation.identifier) throw new FindingActionError('INVALID_EVIDENCE');
  return { address: reservation.address, clientId: reservation.identifier, ...(reservation.hostname ? { hostname: reservation.hostname } : {}) };
}

function optionState(option: DhcpOption): OptionState {
  if (option.code === undefined || (option.level !== 'global' && option.level !== 'scope')) throw new FindingActionError('INVALID_EVIDENCE');
  return { optionId: option.id, code: option.code, value: cloneValue(option.value), level: option.level, ...(option.scopeId ? { scopeId: option.scopeId } : {}) };
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

function displayOptionValue(value: DhcpOption['value']) { return Array.isArray(value) ? value.join(', ') : String(value); }
function cloneValue(value: DhcpOption['value']): DhcpOption['value'] { return Array.isArray(value) ? [...value] : value; }
function operationId(actionId: WorkspaceActionId, targetId: string) { return deterministicConfigId('inventory-operation', actionId, targetId); }
