export type ToolGroup = 'plan' | 'build' | 'analyze' | 'troubleshoot' | 'secure';
export type ToolAvailability = 'ready' | 'planned';

export interface ToolCatalogEntry {
  id:
    | 'microsoft-workspace'
    | 'scope'
    | 'lease'
    | 'options'
    | 'pxe'
    | 'failover'
    | 'dhcpv6'
    | 'diagnostics'
    | 'security'
    | 'config-analyzer'
    | 'config-diff';
  group: ToolGroup;
  availability: ToolAvailability;
  name: { en: string; de: string };
  description: { en: string; de: string };
}

export const toolCatalog: ToolCatalogEntry[] = [
  {
    id: 'microsoft-workspace',
    group: 'analyze',
    availability: 'ready',
    name: { en: 'Microsoft DHCP Config Workspace', de: 'Microsoft-DHCP-Konfigurationsarbeitsbereich' },
    description: { en: 'Open a real Microsoft DHCP export, review linked objects, and build a guarded change package.', de: 'Einen echten Microsoft-DHCP-Export öffnen, verknüpfte Objekte prüfen und ein abgesichertes Change-Paket erstellen.' },
  },
  {
    id: 'scope',
    group: 'plan',
    availability: 'ready',
    name: { en: 'Scope and capacity', de: 'Bereich und Kapazität' },
    description: { en: 'Design IPv4 pools and estimate address capacity.', de: 'IPv4-Pools planen und Adresskapazität abschätzen.' },
  },
  {
    id: 'lease',
    group: 'plan',
    availability: 'ready',
    name: { en: 'Lease transition', de: 'Lease-Umstellung' },
    description: { en: 'Plan lease timing for a safe DHCP change.', de: 'Lease-Zeitpunkt für eine sichere DHCP-Änderung planen.' },
  },
  {
    id: 'options',
    group: 'build',
    availability: 'ready',
    name: { en: 'DHCP options', de: 'DHCP-Optionen' },
    description: { en: 'Prepare option sets for common client needs.', de: 'Optionssätze für typische Client-Anforderungen vorbereiten.' },
  },
  {
    id: 'pxe',
    group: 'build',
    availability: 'ready',
    name: { en: 'PXE boot', de: 'PXE-Start' },
    description: { en: 'Configure network boot details for PXE clients.', de: 'Netzwerkstart-Details für PXE-Clients konfigurieren.' },
  },
  {
    id: 'failover',
    group: 'build',
    availability: 'ready',
    name: { en: 'Failover design', de: 'Failover-Entwurf' },
    description: { en: 'Review a resilient DHCP failover design.', de: 'Einen belastbaren DHCP-Failover-Entwurf prüfen.' },
  },
  {
    id: 'dhcpv6',
    group: 'build',
    availability: 'ready',
    name: { en: 'DHCPv6', de: 'DHCPv6' },
    description: { en: 'Plan DHCPv6 addressing and client settings.', de: 'DHCPv6-Adressierung und Client-Einstellungen planen.' },
  },
  {
    id: 'diagnostics',
    group: 'troubleshoot',
    availability: 'ready',
    name: { en: 'Diagnostics', de: 'Diagnose' },
    description: { en: 'Trace common DHCP allocation and renewal issues.', de: 'Typische DHCP-Zuweisungs- und Erneuerungsprobleme eingrenzen.' },
  },
  {
    id: 'security',
    group: 'secure',
    availability: 'ready',
    name: { en: 'DHCP security', de: 'DHCP-Sicherheit' },
    description: { en: 'Review controls that protect DHCP service.', de: 'Schutzmaßnahmen für den DHCP-Dienst prüfen.' },
  },
  {
    id: 'config-analyzer',
    group: 'analyze',
    availability: 'ready',
    name: { en: 'Configuration analyzer', de: 'Konfigurationsanalyse' },
    description: { en: 'Inspect DHCP configuration for common risks.', de: 'DHCP-Konfiguration auf typische Risiken prüfen.' },
  },
  {
    id: 'config-diff',
    group: 'analyze',
    availability: 'ready',
    name: { en: 'Configuration comparison', de: 'Konfigurationsvergleich' },
    description: { en: 'Compare DHCP configurations before a change.', de: 'DHCP-Konfigurationen vor einer Änderung vergleichen.' },
  },
];
