import type { ScenarioInput } from './types';

export const defaultScenario: ScenarioInput = {
  scenarioType: 'migration',
  leaseDurationHours: 192,
  newLeaseDurationHours: 192,
  t1Percent: 50,
  t2Percent: 87.5,
  clientCount: 250,
  offlinePercent: 0,
  sameServerAddress: true,
  usesRelay: false,
  relayUpdated: true,
  leasesTransferred: true,
  samePool: true,
  bothServersActive: false,
};
