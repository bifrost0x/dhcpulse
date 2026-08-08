import { compareDhcpConfigurations, type ConfigurationDiff } from './config-diff';
import {
  deterministicConfigId,
  type DhcpConfiguration,
  type DhcpOption,
  type DhcpReservation,
} from './config-model';
import { normalizeReservationIdentifier, reservationConfigId } from './config-import/shared';
import { encodeDhcpOption } from './dhcp-options';
import { analyzeIpv4Cidr, parseIpv4 } from './ip-address';
import type { MicrosoftWorkspace } from './microsoft-workspace';

interface ChangeBase<Kind extends string> {
  id: string;
  kind: Kind;
  targetId: string;
  rationaleFindingId?: string;
}

export interface ScopeRangeSet extends ChangeBase<'scope-range.set'> {
  before: { start: string; end: string };
  after: { start: string; end: string };
}

export interface ScopeLeaseSet extends ChangeBase<'scope-lease.set'> {
  beforeSeconds: number;
  afterSeconds: number;
}

export interface ExclusionAdd extends ChangeBase<'exclusion.add'> {
  after: { start: string; end: string };
}

export interface ExclusionRemove extends ChangeBase<'exclusion.remove'> {
  before: { scopeId: string; start: string; end: string };
}

export interface ReservationState {
  address: string;
  clientId: string;
  hostname?: string;
}

export interface ReservationAdd extends ChangeBase<'reservation.add'> {
  after: ReservationState;
}

export interface ReservationUpdate extends ChangeBase<'reservation.update'> {
  before: ReservationState;
  after: ReservationState;
}

export interface ReservationRemove extends ChangeBase<'reservation.remove'> {
  before: ReservationState;
}

export interface OptionState {
  optionId?: string;
  code: number;
  value: DhcpOption['value'];
  level: 'global' | 'scope';
  scopeId?: string;
}

export interface OptionSet extends ChangeBase<'option.set'> {
  before?: OptionState;
  after: OptionState;
}

export interface OptionRemove extends ChangeBase<'option.remove'> {
  before: OptionState;
}

export interface ScopeClone extends ChangeBase<'scope.clone'> {
  after: {
    cidr: string;
    name: string;
    subnetMask: string;
    start: string;
    end: string;
    leaseSeconds: number;
  };
}

export type DhcpChangeOperation =
  | ScopeRangeSet
  | ScopeLeaseSet
  | ExclusionAdd
  | ExclusionRemove
  | ReservationAdd
  | ReservationUpdate
  | ReservationRemove
  | OptionSet
  | OptionRemove
  | ScopeClone;

export interface DhcpChangeSet {
  version: 1;
  serverName: string;
  operations: DhcpChangeOperation[];
}

export interface ChangeSetIssue {
  operationId?: string;
  code: string;
  severity: 'error' | 'warning';
  evidence: Record<string, string | number | boolean>;
}

export interface ChangeSetResult {
  changeSet: DhcpChangeSet;
  preview: DhcpConfiguration;
  diff: ConfigurationDiff;
  issues: ChangeSetIssue[];
  valid: boolean;
}

const allowedOptionCodes = new Set([3, 6, 15, 42, 60, 66, 67]);

export function createChangeSet(workspace: MicrosoftWorkspace): DhcpChangeSet {
  return { version: 1, serverName: workspace.serverName ?? '', operations: [] };
}

export function addChangeOperation(
  workspace: MicrosoftWorkspace,
  set: DhcpChangeSet,
  operation: DhcpChangeOperation,
): ChangeSetResult {
  return validateChangeSet(workspace, { ...set, operations: [...set.operations, operation] });
}

export function removeChangeOperation(
  workspace: MicrosoftWorkspace,
  set: DhcpChangeSet,
  operationId: string,
): ChangeSetResult {
  return validateChangeSet(workspace, { ...set, operations: set.operations.filter(({ id }) => id !== operationId) });
}

export function validateChangeSet(workspace: MicrosoftWorkspace, set: DhcpChangeSet): ChangeSetResult {
  const issues: ChangeSetIssue[] = [];
  if (!workspace.generation.enabled) addIssue(issues, undefined, 'workspace-generation-disabled', { reasonCount: workspace.generation.reasons.length });
  if (set.serverName !== workspace.serverName) addIssue(issues, undefined, 'server-mismatch', {});
  const ids = new Set<string>();
  const conflicts = new Map<string, string>();
  for (const operation of set.operations) {
    if (ids.has(operation.id)) addIssue(issues, operation.id, 'duplicate-operation-id', {});
    ids.add(operation.id);
    const conflictKey = operationConflictKey(operation);
    const earlier = conflicts.get(conflictKey);
    if (earlier) {
      addIssue(issues, earlier, 'operation-conflict', { targetId: operation.targetId });
      addIssue(issues, operation.id, 'operation-conflict', { targetId: operation.targetId });
    } else {
      conflicts.set(conflictKey, operation.id);
    }
    validateOperation(workspace.configuration, operation, issues);
  }
  issues.sort((left, right) => compareText(left.operationId ?? '', right.operationId ?? '') || compareText(left.code, right.code));
  const valid = issues.every(({ severity }) => severity !== 'error');
  const preview = valid ? applyOperations(workspace.configuration, set.operations) : cloneConfiguration(workspace.configuration);
  return {
    changeSet: { ...set, operations: [...set.operations] },
    preview,
    diff: compareDhcpConfigurations(workspace.configuration, preview),
    issues,
    valid,
  };
}

function validateOperation(configuration: DhcpConfiguration, operation: DhcpChangeOperation, issues: ChangeSetIssue[]): void {
  switch (operation.kind) {
    case 'scope-range.set': {
      const scope = configuration.ipv4Scopes.find(({ id }) => id === operation.targetId);
      if (!scope) return addIssue(issues, operation.id, 'target-not-found', {});
      if (scope.startRange !== operation.before.start || scope.endRange !== operation.before.end) addIssue(issues, operation.id, 'before-state-mismatch', {});
      if (operation.before.start === operation.after.start && operation.before.end === operation.after.end) addIssue(issues, operation.id, 'no-op', {});
      validateRangeInScope(scope.cidr, operation.after.start, operation.after.end, operation.id, issues);
      for (const exclusion of configuration.exclusions.filter(({ scopeId }) => scopeId === scope.id)) {
        if (!rangeContains(operation.after.start, operation.after.end, exclusion.start, exclusion.end)) addIssue(issues, operation.id, 'exclusion-outside-new-range', { exclusionId: exclusion.id });
      }
      break;
    }
    case 'scope-lease.set': {
      const scope = configuration.ipv4Scopes.find(({ id }) => id === operation.targetId);
      if (!scope) return addIssue(issues, operation.id, 'target-not-found', {});
      if (scope.leaseLifetimeSeconds !== operation.beforeSeconds) addIssue(issues, operation.id, 'before-state-mismatch', {});
      if (operation.beforeSeconds === operation.afterSeconds) addIssue(issues, operation.id, 'no-op', {});
      if (!positiveInteger(operation.afterSeconds)) addIssue(issues, operation.id, 'invalid-lease-duration', { value: operation.afterSeconds });
      break;
    }
    case 'exclusion.add': {
      const scope = configuration.ipv4Scopes.find(({ id }) => id === operation.targetId);
      if (!scope) return addIssue(issues, operation.id, 'target-not-found', {});
      validateRangeInScope(scope.cidr, operation.after.start, operation.after.end, operation.id, issues);
      if (!scope.startRange || !scope.endRange || !rangeContains(scope.startRange, scope.endRange, operation.after.start, operation.after.end)) addIssue(issues, operation.id, 'range-outside-scope', {});
      if (configuration.exclusions.some(({ scopeId, start, end }) => scopeId === scope.id && rangesOverlap(start, end, operation.after.start, operation.after.end))) addIssue(issues, operation.id, 'exclusion-overlap', {});
      break;
    }
    case 'exclusion.remove': {
      const exclusion = configuration.exclusions.find(({ id }) => id === operation.targetId);
      if (!exclusion) return addIssue(issues, operation.id, 'target-not-found', {});
      if (exclusion.scopeId !== operation.before.scopeId || exclusion.start !== operation.before.start || exclusion.end !== operation.before.end) addIssue(issues, operation.id, 'before-state-mismatch', {});
      break;
    }
    case 'reservation.add': {
      const scope = configuration.ipv4Scopes.find(({ id }) => id === operation.targetId);
      if (!scope) return addIssue(issues, operation.id, 'target-not-found', {});
      validateReservation(configuration, scope.id, operation.after, operation.id, issues);
      break;
    }
    case 'reservation.update': {
      const reservation = configuration.reservations.find(({ id }) => id === operation.targetId);
      if (!reservation?.scopeId) return addIssue(issues, operation.id, 'target-not-found', {});
      if (!reservationMatches(reservation, operation.before)) addIssue(issues, operation.id, 'before-state-mismatch', {});
      if (reservationMatches(reservation, operation.after)) addIssue(issues, operation.id, 'no-op', {});
      validateReservation(configuration, reservation.scopeId, operation.after, operation.id, issues, reservation.id);
      break;
    }
    case 'reservation.remove': {
      const reservation = configuration.reservations.find(({ id }) => id === operation.targetId);
      if (!reservation) return addIssue(issues, operation.id, 'target-not-found', {});
      if (!reservationMatches(reservation, operation.before)) addIssue(issues, operation.id, 'before-state-mismatch', {});
      break;
    }
    case 'option.set': {
      validateOptionTarget(configuration, operation.targetId, operation.after, operation.id, issues);
      if (operation.before) {
        const existing = configuration.options.find(({ id }) => id === operation.before?.optionId);
        if (!existing || !optionMatches(existing, operation.before)) addIssue(issues, operation.id, 'before-state-mismatch', {});
        if (existing && optionMatches(existing, operation.after)) addIssue(issues, operation.id, 'no-op', {});
      }
      validateOptionValue(operation.after, operation.id, issues);
      break;
    }
    case 'option.remove': {
      const existing = configuration.options.find(({ id }) => id === operation.targetId);
      if (!existing) return addIssue(issues, operation.id, 'target-not-found', {});
      if (!optionMatches(existing, operation.before)) addIssue(issues, operation.id, 'before-state-mismatch', {});
      if (!allowedOptionCodes.has(operation.before.code)) addIssue(issues, operation.id, 'unsupported-option', { optionCode: operation.before.code });
      break;
    }
    case 'scope.clone': {
      const source = configuration.ipv4Scopes.find(({ id }) => id === operation.targetId);
      if (!source) return addIssue(issues, operation.id, 'target-not-found', {});
      const cidr = analyzeIpv4Cidr(operation.after.cidr);
      if (!cidr || cidr.netmask !== operation.after.subnetMask) addIssue(issues, operation.id, 'invalid-clone-subnet', {});
      else validateRangeInScope(cidr.cidr, operation.after.start, operation.after.end, operation.id, issues);
      if (!operation.after.name.trim()) addIssue(issues, operation.id, 'clone-name-missing', {});
      if (!positiveInteger(operation.after.leaseSeconds)) addIssue(issues, operation.id, 'invalid-lease-duration', { value: operation.after.leaseSeconds });
      if (configuration.ipv4Scopes.some(({ cidr: existing }) => analyzeIpv4Cidr(existing)?.cidr === cidr?.cidr)) addIssue(issues, operation.id, 'duplicate-scope', {});
      break;
    }
  }
}

function validateReservation(
  configuration: DhcpConfiguration,
  scopeId: string,
  state: ReservationState,
  operationId: string,
  issues: ChangeSetIssue[],
  ignoredReservationId?: string,
): void {
  const scope = configuration.ipv4Scopes.find(({ id }) => id === scopeId);
  if (!scope || !addressInCidr(state.address, scope.cidr)) addIssue(issues, operationId, 'reservation-outside-scope', { address: state.address });
  const normalized = normalizeReservationIdentifier(state.clientId, 'client-id', true).identifier;
  if (!normalized) addIssue(issues, operationId, 'reservation-identifier-missing', {});
  for (const reservation of configuration.reservations.filter(({ id }) => id !== ignoredReservationId)) {
    if (reservation.address === state.address) addIssue(issues, operationId, 'duplicate-reservation-address', { address: state.address });
    if (normalized && reservation.identifier?.toLocaleLowerCase() === normalized.toLocaleLowerCase()) addIssue(issues, operationId, 'duplicate-reservation-identifier', {});
  }
}

function validateOptionTarget(configuration: DhcpConfiguration, targetId: string, state: OptionState, operationId: string, issues: ChangeSetIssue[]): void {
  if (state.level === 'global') {
    if (!configuration.servers.some(({ id }) => id === targetId)) addIssue(issues, operationId, 'target-not-found', {});
  } else if (!configuration.ipv4Scopes.some(({ id }) => id === targetId)) {
    addIssue(issues, operationId, 'target-not-found', {});
  }
}

function validateOptionValue(state: OptionState, operationId: string, issues: ChangeSetIssue[]): void {
  if (!allowedOptionCodes.has(state.code)) {
    addIssue(issues, operationId, 'unsupported-option', { optionCode: state.code });
    return;
  }
  try {
    encodeDhcpOption({
      protocol: 'dhcpv4',
      code: state.code,
      value: Array.isArray(state.value) ? state.value.join(',') : state.value,
    });
  } catch {
    addIssue(issues, operationId, 'invalid-option-value', { optionCode: state.code });
  }
}

function applyOperations(configuration: DhcpConfiguration, operations: DhcpChangeOperation[]): DhcpConfiguration {
  const preview = cloneConfiguration(configuration);
  for (const operation of operations) {
    const generatedProvenance = { format: 'microsoft-xml' as const, location: `/generated/change-set/${operation.id}` };
    switch (operation.kind) {
      case 'scope-range.set': {
        const scope = preview.ipv4Scopes.find(({ id }) => id === operation.targetId)!;
        scope.startRange = operation.after.start;
        scope.endRange = operation.after.end;
        const pool = preview.pools.find(({ scopeId, start, end }) => scopeId === scope.id && start === operation.before.start && end === operation.before.end);
        if (pool) {
          pool.start = operation.after.start;
          pool.end = operation.after.end;
        }
        break;
      }
      case 'scope-lease.set':
        preview.ipv4Scopes.find(({ id }) => id === operation.targetId)!.leaseLifetimeSeconds = operation.afterSeconds;
        break;
      case 'exclusion.add':
        preview.exclusions.push({
          id: deterministicConfigId('exclusion', operation.targetId, operation.after.start, operation.after.end),
          provenance: generatedProvenance,
          protocol: 'dhcpv4',
          scopeId: operation.targetId,
          ...operation.after,
        });
        break;
      case 'exclusion.remove':
        preview.exclusions = preview.exclusions.filter(({ id }) => id !== operation.targetId);
        break;
      case 'reservation.add': {
        const normalized = normalizeReservationIdentifier(operation.after.clientId, 'client-id', true);
        preview.reservations.push({
          id: reservationConfigId('dhcpv4', normalized.identifier, normalized.identifierType, operation.after.hostname, operation.after.address, operation.targetId),
          provenance: generatedProvenance,
          protocol: 'dhcpv4',
          scopeId: operation.targetId,
          address: operation.after.address,
          identifier: normalized.identifier,
          identifierType: normalized.identifierType,
          ...(operation.after.hostname ? { hostname: operation.after.hostname } : {}),
          level: 'scope',
        });
        break;
      }
      case 'reservation.update': {
        const reservation = preview.reservations.find(({ id }) => id === operation.targetId)!;
        const normalized = normalizeReservationIdentifier(operation.after.clientId, 'client-id', true);
        reservation.address = operation.after.address;
        reservation.identifier = normalized.identifier;
        reservation.identifierType = normalized.identifierType;
        if (operation.after.hostname) reservation.hostname = operation.after.hostname;
        else delete reservation.hostname;
        break;
      }
      case 'reservation.remove':
        preview.reservations = preview.reservations.filter(({ id }) => id !== operation.targetId);
        break;
      case 'option.set': {
        const existing = operation.before?.optionId ? preview.options.find(({ id }) => id === operation.before?.optionId) : undefined;
        if (existing) existing.value = cloneValue(operation.after.value);
        else preview.options.push({
          id: deterministicConfigId('option', 'dhcpv4', operation.after.code, operation.after.level, operation.targetId),
          provenance: generatedProvenance,
          protocol: 'dhcpv4',
          code: operation.after.code,
          value: cloneValue(operation.after.value),
          level: operation.after.level,
          ...(operation.after.level === 'scope' ? { scopeId: operation.targetId } : {}),
        });
        break;
      }
      case 'option.remove':
        preview.options = preview.options.filter(({ id }) => id !== operation.targetId);
        break;
      case 'scope.clone': {
        const scopeId = deterministicConfigId('scope', 'dhcpv4', operation.after.cidr);
        preview.ipv4Scopes.push({
          id: scopeId,
          provenance: generatedProvenance,
          protocol: 'dhcpv4',
          cidr: operation.after.cidr,
          name: operation.after.name,
          subnetMask: operation.after.subnetMask,
          startRange: operation.after.start,
          endRange: operation.after.end,
          leaseLifetimeSeconds: operation.after.leaseSeconds,
          state: 'Inactive',
        });
        preview.pools.push({
          id: deterministicConfigId('pool', operation.after.cidr, operation.after.start, operation.after.end),
          provenance: generatedProvenance,
          protocol: 'dhcpv4',
          scopeId,
          start: operation.after.start,
          end: operation.after.end,
        });
        break;
      }
    }
  }
  return preview;
}

function operationConflictKey(operation: DhcpChangeOperation): string {
  if (operation.kind === 'option.set') return `${operation.kind}:${operation.targetId}:${operation.after.level}:${operation.after.code}`;
  return `${operation.kind}:${operation.targetId}`;
}

function reservationMatches(reservation: DhcpReservation, state: ReservationState): boolean {
  const normalized = normalizeReservationIdentifier(state.clientId, 'client-id', true).identifier;
  return reservation.address === state.address && reservation.identifier === normalized && (reservation.hostname ?? '') === (state.hostname ?? '');
}

function optionMatches(option: DhcpOption, state: OptionState): boolean {
  return option.code === state.code && option.level === state.level && JSON.stringify(option.value) === JSON.stringify(state.value);
}

function validateRangeInScope(cidrValue: string, startValue: string, endValue: string, operationId: string, issues: ChangeSetIssue[]): void {
  const cidr = analyzeIpv4Cidr(cidrValue);
  const start = parseIpv4(startValue);
  const end = parseIpv4(endValue);
  if (!cidr || start === null || end === null || start > end) return addIssue(issues, operationId, 'invalid-range', {});
  const network = parseIpv4(cidr.network)!;
  const broadcast = parseIpv4(cidr.broadcast)!;
  if (start < network || end > broadcast) addIssue(issues, operationId, 'range-outside-scope', {});
}

function rangeContains(containerStart: string, containerEnd: string, candidateStart: string, candidateEnd: string): boolean {
  const start = parseIpv4(containerStart);
  const end = parseIpv4(containerEnd);
  const candidateLower = parseIpv4(candidateStart);
  const candidateUpper = parseIpv4(candidateEnd);
  return start !== null && end !== null && candidateLower !== null && candidateUpper !== null && start <= candidateLower && candidateUpper <= end;
}

function rangesOverlap(leftStart: string, leftEnd: string, rightStart: string, rightEnd: string): boolean {
  const leftLower = parseIpv4(leftStart);
  const leftUpper = parseIpv4(leftEnd);
  const rightLower = parseIpv4(rightStart);
  const rightUpper = parseIpv4(rightEnd);
  return leftLower !== null && leftUpper !== null && rightLower !== null && rightUpper !== null && leftLower <= rightUpper && rightLower <= leftUpper;
}

function addressInCidr(addressValue: string, cidrValue: string): boolean {
  const address = parseIpv4(addressValue);
  const cidr = analyzeIpv4Cidr(cidrValue);
  return address !== null && cidr !== null && parseIpv4(cidr.network)! <= address && address <= parseIpv4(cidr.broadcast)!;
}

function positiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function addIssue(
  issues: ChangeSetIssue[],
  operationId: string | undefined,
  code: string,
  evidence: ChangeSetIssue['evidence'],
): void {
  issues.push({ ...(operationId ? { operationId } : {}), code, severity: 'error', evidence });
}

function cloneConfiguration(configuration: DhcpConfiguration): DhcpConfiguration {
  return JSON.parse(JSON.stringify(configuration)) as DhcpConfiguration;
}

function cloneValue(value: DhcpOption['value']): DhcpOption['value'] {
  return Array.isArray(value) ? [...value] : value;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, 'en');
}
