import type { DhcpChangeOperation } from './dhcp-change-set';
import type { WorkspaceActionId } from './config-workspace';

export type WorkspaceActionMode = 'automatic' | 'guided';
export type WorkspaceActionFieldType = 'text' | 'ipv4' | 'integer' | 'select';

export interface WorkspaceActionOption {
  value: string;
  label: string;
  detail?: string;
}

export interface WorkspaceActionField {
  name: string;
  type: WorkspaceActionFieldType;
  required: boolean;
  defaultValue: string;
  options?: WorkspaceActionOption[];
}

export interface WorkspaceActionDescriptor {
  id: WorkspaceActionId;
  operationKind: DhcpChangeOperation['kind'];
  mode: WorkspaceActionMode;
  fields: WorkspaceActionField[];
}

export type WorkspaceActionValues = Record<string, string>;
