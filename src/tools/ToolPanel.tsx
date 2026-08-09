import { interpolate, translate, type Locale } from '../content/copy';
import type { ToolCatalogEntry } from '../content/tool-catalog';

export interface ToolPanelProps {
  locale: Locale;
  tool: ToolCatalogEntry;
}

const guidance: Record<ToolCatalogEntry['id'], { en: string; de: string }> = {
  'microsoft-workspace': {
    en: 'Open a Microsoft DHCP export, inspect the actual environment, and stage reviewable changes.',
    de: 'Öffne einen Microsoft-DHCP-Export, prüfe die reale Umgebung und plane nachvollziehbare Änderungen.',
  },
  scope: {
    en: 'Shape address pools, exclusions, reservations, and capacity before rollout.',
    de: 'Plane Adresspools, Ausschlüsse, Reservierungen und Kapazität vor der Einführung.',
  },
  lease: {
    en: 'Model renewals, rebinding, expiry, and rollback before a change window.',
    de: 'Modelliere Renewal, Rebinding, Ablauf und Rollback vor dem Change-Fenster.',
  },
  options: {
    en: 'Prepare and validate DHCP option values for common client requirements.',
    de: 'Bereite DHCP-Optionswerte für typische Client-Anforderungen vor und prüfe sie.',
  },
  pxe: {
    en: 'Review architecture matching and boot details for network deployment.',
    de: 'Prüfe Architekturzuordnung und Boot-Details für die Netzwerkbereitstellung.',
  },
  failover: {
    en: 'Review partner roles, timing, reachability, and operational readiness.',
    de: 'Prüfe Partnerrollen, Zeiten, Erreichbarkeit und Betriebsbereitschaft.',
  },
  dhcpv6: {
    en: 'Align addressing mode, router advertisements, prefixes, and relay context.',
    de: 'Stimme Adressierungsmodus, Router Advertisements, Präfixe und Relay-Kontext ab.',
  },
  diagnostics: {
    en: 'Work from symptoms to ordered evidence checks and likely causes.',
    de: 'Arbeite dich von Symptomen über geordnete Prüfungen zu wahrscheinlichen Ursachen vor.',
  },
  security: {
    en: 'Review preventive, detective, and recovery controls for DHCP service.',
    de: 'Prüfe präventive, detektive und wiederherstellende Schutzmaßnahmen für DHCP-Dienste.',
  },
  'config-analyzer': {
    en: 'Inspect a DHCP configuration locally and organize findings by operational impact.',
    de: 'Prüfe eine DHCP-Konfiguration lokal und ordne Hinweise nach betrieblicher Auswirkung.',
  },
  'config-diff': {
    en: 'Compare source and target configurations before a migration or change.',
    de: 'Vergleiche Quell- und Zielkonfiguration vor einer Migration oder Änderung.',
  },
};

export function ToolPanel({ locale, tool }: ToolPanelProps) {
  const headingId = `tool-panel-title-${tool.id}`;
  return (
    <section className="planner-card tool-panel" data-testid={`tool-panel-${tool.id}`} aria-labelledby={headingId}>
      <p className="section-kicker">{translate(locale, 'panel.ready')}</p>
      <h2 id={headingId}>{interpolate(translate(locale, 'panel.workspace'), { name: tool.name[locale] })}</h2>
      <p>{guidance[tool.id][locale]}</p>
    </section>
  );
}
