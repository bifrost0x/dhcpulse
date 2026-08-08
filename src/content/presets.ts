import { defaultScenario } from '../domain/defaults';
import type { ScenarioInput } from '../domain/types';
import type { CopyKey } from './copy';

export interface ScenarioPreset {
  id: string;
  labelKey: CopyKey;
  descriptionKey: CopyKey;
  input: ScenarioInput;
}

export const presets: ScenarioPreset[] = [
  {
    id: 'safe-migration',
    labelKey: 'preset.safeMigration',
    descriptionKey: 'preset.safeMigration.detail',
    input: { ...defaultScenario },
  },
  {
    id: 'new-address',
    labelKey: 'preset.newAddress',
    descriptionKey: 'preset.newAddress.detail',
    input: {
      ...defaultScenario,
      scenarioType: 'serverAddress',
      sameServerAddress: false,
      usesRelay: true,
      relayUpdated: true,
      offlinePercent: 10,
    },
  },
  {
    id: 'dns-option',
    labelKey: 'preset.dnsOption',
    descriptionKey: 'preset.dnsOption.detail',
    input: {
      ...defaultScenario,
      scenarioType: 'dnsChange',
      leaseDurationHours: 24,
      newLeaseDurationHours: 24,
      clientCount: 80,
    },
  },
  {
    id: 'collision',
    labelKey: 'preset.collision',
    descriptionKey: 'preset.collision.detail',
    input: {
      ...defaultScenario,
      leasesTransferred: false,
      bothServersActive: true,
    },
  },
];
