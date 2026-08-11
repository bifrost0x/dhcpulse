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
});
