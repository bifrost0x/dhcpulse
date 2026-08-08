import { describe, expect, it } from 'vitest';
import { defaultScenario } from './defaults';
import { calculateLeaseTimeline, validateScenario } from './lease-model';

describe('calculateLeaseTimeline', () => {
  it('places standard renewal and rebinding events within an eight-day lease', () => {
    const result = calculateLeaseTimeline({
      ...defaultScenario,
      leaseDurationHours: 192,
      t1Percent: 50,
      t2Percent: 87.5,
      clientCount: 200,
    });

    expect(result.events).toEqual([
      { kind: 'renewal', offsetHours: 96 },
      { kind: 'rebinding', offsetHours: 168 },
      { kind: 'expiry', offsetHours: 192 },
    ]);
    expect(result.waves).toEqual([
      { kind: 'renewal', clientsWithinFirstHour: 2, startsAfterHours: 0, allClientsByHours: 96 },
      { kind: 'rebinding', clientsWithinFirstHour: 0, startsAfterHours: 72, allClientsByHours: 168 },
      { kind: 'expiry', clientsWithinFirstHour: 0, startsAfterHours: 96, allClientsByHours: 192 },
    ]);
  });

  it('uses custom T1 and T2 values without rounding event offsets', () => {
    const result = calculateLeaseTimeline({
      ...defaultScenario,
      leaseDurationHours: 24,
      t1Percent: 40,
      t2Percent: 75,
      clientCount: 10,
    });

    expect(result.events).toEqual([
      { kind: 'renewal', offsetHours: 9.6 },
      { kind: 'rebinding', offsetHours: 18 },
      { kind: 'expiry', offsetHours: 24 },
    ]);
    expect(result.waves[0]).toEqual({
      kind: 'renewal',
      clientsWithinFirstHour: 1,
      startsAfterHours: 0,
      allClientsByHours: 9.6,
    });
  });

  it('returns zero-sized waves when the scenario has no estimated clients', () => {
    const result = calculateLeaseTimeline({
      ...defaultScenario,
      clientCount: 0,
    });

    expect(result.waves.every((wave) => wave.clientsWithinFirstHour === 0)).toBe(true);
  });
});

describe('validateScenario', () => {
  it('rejects a renewal boundary that does not precede rebinding', () => {
    const issues = validateScenario({
      ...defaultScenario,
      t1Percent: 90,
      t2Percent: 80,
    });

    expect(issues).toContainEqual({ field: 't1Percent', code: 'timingOrder' });
  });

  it.each([
    ['leaseDurationHours', 0, 'positive'],
    ['t1Percent', 0, 'percentage'],
    ['t2Percent', 100, 'percentage'],
    ['clientCount', -1, 'nonNegative'],
    ['offlinePercent', 101, 'range'],
  ] as const)('rejects %s value %s', (field, value, code) => {
    const issues = validateScenario({ ...defaultScenario, [field]: value });

    expect(issues).toContainEqual({ field, code });
  });
});
