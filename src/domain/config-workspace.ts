import type { DhcpConfigFormat, DhcpConfiguration } from './config-model';
import {
  buildMicrosoftWorkspace,
  type MicrosoftWorkspace,
  type WorkspaceActionId,
  type WorkspaceFinding,
} from './microsoft-workspace';

export type { WorkspaceActionId, WorkspaceFinding } from './microsoft-workspace';

export interface WorkspaceCapability {
  analysis: true;
  executableChanges: boolean;
  reason?: 'microsoft-export-required' | 'server-name-missing' | 'required-facts-missing';
}

export interface ConfigurationWorkspace extends MicrosoftWorkspace {
  format: Exclude<DhcpConfigFormat, 'unknown'>;
  vendor: string;
  summary: MicrosoftWorkspace['summaries'];
  capabilities: WorkspaceCapability;
  coverage: {
    bounded: true;
    parserWarnings: number;
    supportedObjects: number;
  };
}

export function buildConfigurationWorkspace(configuration: DhcpConfiguration): ConfigurationWorkspace {
  const base = buildMicrosoftWorkspace(configuration);
  const format = configuration.metadata.source.format;
  const capability = changeCapability(format, base);
  return {
    ...base,
    format,
    vendor: configuration.metadata.vendor,
    summary: base.summaries,
    capabilities: capability,
    coverage: {
      bounded: true,
      parserWarnings: configuration.parserWarnings.length,
      supportedObjects: base.nodes.length,
    },
  };
}

function changeCapability(
  format: ConfigurationWorkspace['format'],
  workspace: MicrosoftWorkspace,
): WorkspaceCapability {
  if (format !== 'microsoft-xml') {
    return { analysis: true, executableChanges: false, reason: 'microsoft-export-required' };
  }
  if (!workspace.serverName) {
    return { analysis: true, executableChanges: false, reason: 'server-name-missing' };
  }
  if (!workspace.generation.enabled) {
    return { analysis: true, executableChanges: false, reason: 'required-facts-missing' };
  }
  return { analysis: true, executableChanges: true };
}

export function isMicrosoftWorkspace(
  workspace: ConfigurationWorkspace,
): workspace is ConfigurationWorkspace & { format: 'microsoft-xml'; capabilities: WorkspaceCapability & { executableChanges: true } } {
  return workspace.format === 'microsoft-xml' && workspace.capabilities.executableChanges;
}

export type WorkspaceAction = WorkspaceActionId;
export type ConfigurationFinding = WorkspaceFinding;
