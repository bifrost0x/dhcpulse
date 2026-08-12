import { describe, expect, it } from 'vitest';
import kea from '../test/fixtures/kea.json?raw';
import microsoftXml from '../test/fixtures/microsoft-dhcp.xml?raw';
import { importDhcpConfiguration } from './config-import';
import { buildConfigurationWorkspace } from './config-workspace';
import {
  FindingActionError,
  listFindingActions,
  prepareFindingAction,
} from './finding-actions';
import { createChangeSet } from './dhcp-change-set';
import { evaluatePackageEligibility } from './workspace-view';

function workspace(text: string, fileName: string) {
  return buildConfigurationWorkspace(importDhcpConfiguration({ text, fileName }).configuration);
}

describe('finding actions', () => {
  it('prepares an exclusion for a Microsoft reservation inside a dynamic pool', () => {
    const current = workspace(microsoftXml, 'export.xml');
    const finding = current.findings.find(({ ruleId }) => ruleId === 'reservation-in-dynamic-pool')!;

    expect(listFindingActions(current, finding)).toEqual([
      expect.objectContaining({ id: 'exclude-reserved-address', operationKind: 'exclusion.add' }),
    ]);
    const result = prepareFindingAction(current, finding, 'exclude-reserved-address');

    expect(result.valid).toBe(true);
    expect(result.changeSet.operations).toEqual([
      expect.objectContaining({
        kind: 'exclusion.add',
        targetId: current.configuration.ipv4Scopes[0]!.id,
        rationaleFindingId: finding.id,
        after: { start: '192.0.2.50', end: '192.0.2.50' },
      }),
    ]);
  });

  it('keeps preparing the same finding idempotent', () => {
    const current = workspace(microsoftXml, 'export.xml');
    const finding = current.findings.find(({ ruleId }) => ruleId === 'reservation-in-dynamic-pool')!;
    const first = prepareFindingAction(current, finding, 'exclude-reserved-address');

    const repeated = prepareFindingAction(
      current,
      finding,
      'exclude-reserved-address',
      first.changeSet,
    );

    expect(repeated.valid).toBe(true);
    expect(repeated.changeSet.operations).toHaveLength(1);
    expect(repeated.changeSet.operations[0]?.rationaleFindingId).toBe(finding.id);
  });

  it('preserves operation order when an existing action is prepared again', () => {
    const current = workspace(microsoftXml, 'export.xml');
    const reservation = current.findings.find(({ ruleId }) => ruleId === 'reservation-in-dynamic-pool')!;
    const secondReservation = {
      ...reservation,
      id: `${reservation.id}-second`,
      evidence: { ...reservation.evidence, address: '192.0.2.51' },
    };
    const first = prepareFindingAction(current, reservation, 'exclude-reserved-address');
    const second = prepareFindingAction(current, secondReservation, 'exclude-reserved-address', first.changeSet);

    const repeated = prepareFindingAction(
      current,
      reservation,
      'exclude-reserved-address',
      second.changeSet,
    );

    expect(repeated.changeSet.operations.map(({ id }) => id)).toEqual(
      second.changeSet.operations.map(({ id }) => id),
    );
    expect(repeated.changeSet).toEqual(second.changeSet);
  });

  it('never exposes executable actions for non-Microsoft input', () => {
    const current = workspace(kea, 'kea.json');
    for (const finding of current.findings) expect(listFindingActions(current, finding)).toEqual([]);
  });

  it('rejects unknown, mismatched, and limited-confidence actions with stable codes', () => {
    const current = workspace(microsoftXml, 'export.xml');
    const actionable = current.findings.find(({ ruleId }) => ruleId === 'reservation-in-dynamic-pool')!;
    const limited = current.findings.find(({ ruleId }) => ruleId === 'parser-warning')!;

    expect(() => prepareFindingAction(current, actionable, 'exclude-gateway-address')).toThrowError(
      expect.objectContaining<Partial<FindingActionError>>({ code: 'ACTION_NOT_AVAILABLE' }),
    );
    expect(() => prepareFindingAction(current, limited, 'exclude-reserved-address')).toThrowError(
      expect.objectContaining<Partial<FindingActionError>>({ code: 'ACTION_NOT_AVAILABLE' }),
    );
  });

  it('rejects action evidence that is not a single address string', () => {
    const current = workspace(microsoftXml, 'export.xml');
    const finding = current.findings.find(({ ruleId }) => ruleId === 'reservation-in-dynamic-pool')!;
    const unsafe = { ...finding, evidence: { ...finding.evidence, address: 42 } };

    expect(() => prepareFindingAction(current, unsafe, 'exclude-reserved-address')).toThrowError(
      expect.objectContaining<Partial<FindingActionError>>({ code: 'INVALID_EVIDENCE' }),
    );
  });

  it('lets an administrator keep one duplicate reservation and removes the conflicting records', () => {
    const imported = workspace(microsoftXml, 'export.xml');
    const original = imported.configuration.reservations[0]!;
    const current = buildConfigurationWorkspace({
      ...imported.configuration,
      reservations: [
        original,
        { ...original, id: 'duplicate-reservation', identifier: '02:00:5e:10:00:99', hostname: 'duplicate.example.com' },
      ],
    });
    const finding = current.findings.find(({ ruleId }) => ruleId === 'duplicate-reservation-address')!;

    expect(listFindingActions(current, finding)).toEqual([
      expect.objectContaining({
        id: 'resolve-duplicate-reservations',
        mode: 'guided',
        operationKind: 'reservation.remove',
        fields: [expect.objectContaining({ name: 'keepReservationId', type: 'select', options: expect.arrayContaining([
          expect.objectContaining({ value: original.id }),
          expect.objectContaining({ value: 'duplicate-reservation' }),
        ]) })],
      }),
    ]);

    const result = prepareFindingAction(
      current,
      finding,
      'resolve-duplicate-reservations',
      createChangeSet(current),
      { keepReservationId: original.id },
    );

    expect(result.valid).toBe(true);
    expect(result.changeSet.operations).toEqual([
      expect.objectContaining({
        kind: 'reservation.remove',
        targetId: 'duplicate-reservation',
        rationaleFindingId: finding.id,
      }),
    ]);
    expect(evaluatePackageEligibility(current, result)).toMatchObject({ eligible: true, blockers: [] });
  });

  it('offers duplicate cleanup only when every removed reservation has a rollback identity', () => {
    const imported = workspace(microsoftXml, 'export.xml');
    const original = imported.configuration.reservations[0]!;
    const missingIdentity = { ...original, id: 'missing-identity', identifier: undefined };
    const removable = { ...original, id: 'removable', identifier: '02:00:5e:10:00:99' };
    const current = buildConfigurationWorkspace({
      ...imported.configuration,
      reservations: [missingIdentity, removable],
    });
    const finding = current.findings.find(({ ruleId }) => ruleId === 'duplicate-reservation-address')!;

    expect(listFindingActions(current, finding)[0]?.fields[0]?.options).toEqual([
      expect.objectContaining({ value: missingIdentity.id }),
    ]);
    expect(() => prepareFindingAction(
      current,
      finding,
      'resolve-duplicate-reservations',
      createChangeSet(current),
      { keepReservationId: removable.id },
    )).toThrowError(expect.objectContaining<Partial<FindingActionError>>({
      code: 'INVALID_INPUT',
      fieldName: 'keepReservationId',
    }));

    const safe = prepareFindingAction(
      current,
      finding,
      'resolve-duplicate-reservations',
      createChangeSet(current),
      { keepReservationId: missingIdentity.id },
    );
    expect(safe.valid).toBe(true);
    expect(safe.changeSet.operations).toEqual([
      expect.objectContaining({ kind: 'reservation.remove', targetId: removable.id }),
    ]);
  });

  it('does not advertise duplicate cleanup when no rollback-safe keep choice exists', () => {
    const imported = workspace(microsoftXml, 'export.xml');
    const original = imported.configuration.reservations[0]!;
    const current = buildConfigurationWorkspace({
      ...imported.configuration,
      reservations: [
        { ...original, id: 'missing-one', identifier: undefined },
        { ...original, id: 'missing-two', identifier: undefined },
      ],
    });
    const finding = current.findings.find(({ ruleId }) => ruleId === 'duplicate-reservation-address')!;

    expect(listFindingActions(current, finding)).toEqual([]);
  });

  it('builds a guided reservation address correction from the imported before-state', () => {
    const imported = workspace(microsoftXml, 'export.xml');
    const reservation = imported.configuration.reservations[0]!;
    const current = buildConfigurationWorkspace({
      ...imported.configuration,
      reservations: [{ ...reservation, address: '198.51.100.50' }],
    });
    const finding = current.findings.find(({ ruleId }) => ruleId === 'reservation-outside-scope')!;

    expect(listFindingActions(current, finding)).toEqual([
      expect.objectContaining({ id: 'update-reservation-address', mode: 'guided', operationKind: 'reservation.update' }),
    ]);
    const result = prepareFindingAction(
      current,
      finding,
      'update-reservation-address',
      createChangeSet(current),
      { address: '192.0.2.60' },
    );

    expect(result.valid).toBe(true);
    expect(result.changeSet.operations[0]).toEqual(expect.objectContaining({
      kind: 'reservation.update',
      targetId: reservation.id,
      before: expect.objectContaining({ address: '198.51.100.50' }),
      after: expect.objectContaining({ address: '192.0.2.60' }),
    }));
    expect(evaluatePackageEligibility(current, result)).toMatchObject({ eligible: true, blockers: [] });
  });

  it('offers guided correction for invalid address options', () => {
    const imported = workspace(microsoftXml, 'export.xml');
    const option = imported.configuration.options.find(({ code }) => code === 6)!;
    const current = buildConfigurationWorkspace({
      ...imported.configuration,
      options: imported.configuration.options.map((candidate) => candidate.id === option.id
        ? { ...candidate, value: 'not-an-address' }
        : candidate),
    });
    const finding = current.findings.find(({ ruleId }) => ruleId === 'invalid-address-option')!;

    expect(listFindingActions(current, finding)).toEqual([
      expect.objectContaining({ id: 'set-valid-option-value', mode: 'guided', operationKind: 'option.set' }),
    ]);
    const result = prepareFindingAction(
      current,
      finding,
      'set-valid-option-value',
      createChangeSet(current),
      { value: '192.0.2.53, 192.0.2.54' },
    );

    expect(result.valid).toBe(true);
    expect(result.changeSet.operations[0]).toEqual(expect.objectContaining({
      kind: 'option.set',
      targetId: current.configuration.ipv4Scopes[0]!.id,
      before: expect.objectContaining({ optionId: option.id, value: 'not-an-address' }),
      after: expect.objectContaining({ code: 6, value: ['192.0.2.53', '192.0.2.54'], level: 'scope' }),
    }));
    expect(evaluatePackageEligibility(current, result)).toMatchObject({ eligible: true, blockers: [] });
  });

  it('offers both deterministic ways to resolve a scope option override', () => {
    const imported = workspace(microsoftXml, 'export.xml');
    const scopeOption = imported.configuration.options.find(({ code }) => code === 6)!;
    const server = imported.configuration.servers[0]!;
    const current = buildConfigurationWorkspace({
      ...imported.configuration,
      options: [
        ...imported.configuration.options,
        { ...scopeOption, id: 'server-dns', level: 'global', scopeId: undefined, value: ['192.0.2.54'], provenance: server.provenance },
      ],
    });
    const finding = current.findings.find(({ ruleId }) => ruleId === 'scope-option-overrides-server')!;

    expect(listFindingActions(current, finding).map(({ id, mode }) => ({ id, mode }))).toEqual([
      { id: 'align-option-with-server', mode: 'automatic' },
      { id: 'remove-scope-option', mode: 'automatic' },
    ]);
    const aligned = prepareFindingAction(current, finding, 'align-option-with-server');
    const removed = prepareFindingAction(current, finding, 'remove-scope-option');

    expect(aligned.valid).toBe(true);
    expect(aligned.changeSet.operations[0]).toEqual(expect.objectContaining({
      kind: 'option.set',
      targetId: current.configuration.ipv4Scopes[0]!.id,
      after: expect.objectContaining({ value: ['192.0.2.54'] }),
    }));
    expect(removed.valid).toBe(true);
    expect(removed.changeSet.operations[0]).toEqual(expect.objectContaining({ kind: 'option.remove', targetId: scopeOption.id }));
  });

  it('offers range and lease editors for a capacity finding', () => {
    const imported = workspace(microsoftXml, 'export.xml');
    const scope = imported.configuration.ipv4Scopes[0]!;
    const current = buildConfigurationWorkspace({
      ...imported.configuration,
      ipv4Scopes: [{ ...scope, observedLeaseCount: 85 }],
    });
    const finding = current.findings.find(({ ruleId }) => ruleId === 'scope-capacity-low')!;

    expect(listFindingActions(current, finding).map(({ id, mode }) => ({ id, mode }))).toEqual([
      { id: 'resize-scope-range', mode: 'guided' },
      { id: 'set-scope-lease', mode: 'guided' },
    ]);
    const range = prepareFindingAction(current, finding, 'resize-scope-range', createChangeSet(current), { start: '192.0.2.10', end: '192.0.2.200' });
    const lease = prepareFindingAction(current, finding, 'set-scope-lease', createChangeSet(current), { leaseSeconds: '14400' });

    expect(range.valid).toBe(true);
    expect(range.changeSet.operations[0]).toEqual(expect.objectContaining({ kind: 'scope-range.set', after: { start: '192.0.2.10', end: '192.0.2.200' } }));
    expect(lease.valid).toBe(true);
    expect(lease.changeSet.operations[0]).toEqual(expect.objectContaining({ kind: 'scope-lease.set', afterSeconds: 14400 }));
  });

  it('keeps parser and incomplete failover findings analysis-only', () => {
    const current = workspace(microsoftXml, 'export.xml');
    for (const ruleId of ['parser-warning', 'failover-scope-membership-missing']) {
      const finding = current.findings.find((candidate) => candidate.ruleId === ruleId)!;
      expect(listFindingActions(current, finding)).toEqual([]);
    }
  });

  it('does not advertise a reservation update when rollback identity is missing', () => {
    const imported = workspace(microsoftXml, 'export.xml');
    const reservation = imported.configuration.reservations[0]!;
    const current = buildConfigurationWorkspace({
      ...imported.configuration,
      reservations: [{ ...reservation, address: '198.51.100.50', identifier: undefined }],
    });
    const finding = current.findings.find(({ ruleId }) => ruleId === 'reservation-outside-scope')!;

    expect(listFindingActions(current, finding)).toEqual([]);
  });
});
