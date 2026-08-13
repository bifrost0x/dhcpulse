export type WorkspaceRuleLocale = 'en' | 'de';
export type WorkspaceRuleId =
  | 'parser-warning'
  | 'duplicate-reservation-address'
  | 'duplicate-reservation-identifier'
  | 'reservation-outside-scope'
  | 'invalid-address-option'
  | 'gateway-in-dynamic-pool'
  | 'scope-option-overrides-server'
  | 'scope-capacity-low'
  | 'failover-scope-membership-missing';

interface WorkspaceRuleCopy {
  title: string;
  rationale: string;
  impact: string;
  recommendation: string;
}

interface WorkspaceRuleDefinition {
  source: string;
  copy: Record<WorkspaceRuleLocale, WorkspaceRuleCopy>;
}

export const workspaceSources = {
  dhcp: 'https://www.rfc-editor.org/rfc/rfc2131.html',
  options: 'https://www.iana.org/assignments/bootp-dhcp-parameters/',
  microsoft: 'https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/dhcp-top',
  microsoftReservationRange: 'https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/cant-add-dhcp-reservation',
  imports: 'https://github.com/bifrost0x/dhcpulse/blob/main/docs/configuration-imports.md',
  kea: 'https://kea.readthedocs.io/en/latest/arm/config.html',
  isc: 'https://kb.isc.org/docs/isc-dhcp-44-manual-pages-dhcpdconf',
  dnsmasq: 'https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html',
} as const;

export const workspaceRuleCatalog: Record<WorkspaceRuleId, WorkspaceRuleDefinition> = {
  'parser-warning': {
    source: workspaceSources.imports,
    copy: {
      en: { title: 'The configuration contains unsupported or partially parsed data', rationale: 'The bounded importer reported syntax or vendor-specific content it could not fully interpret.', impact: 'Some configuration objects or relationships may be absent, so the assessment can be incomplete.', recommendation: 'Review the cited source location and validate the original configuration with the vendor tooling.' },
      de: { title: 'Die Konfiguration enthält nicht unterstützte oder nur teilweise analysierte Daten', rationale: 'Der begrenzte Importer hat Syntax oder herstellerspezifische Inhalte gemeldet, die er nicht vollständig interpretieren konnte.', impact: 'Konfigurationsobjekte oder Beziehungen können fehlen; die Bewertung kann daher unvollständig sein.', recommendation: 'Die genannte Quellposition prüfen und die Originalkonfiguration zusätzlich mit dem Herstellerwerkzeug validieren.' },
    },
  },
  'duplicate-reservation-address': {
    source: workspaceSources.dhcp,
    copy: {
      en: { title: 'Reservation address is duplicated', rationale: 'More than one imported reservation uses the same IP address.', impact: 'Different clients can be assigned the same address and lose connectivity.', recommendation: 'Keep the intended reservation and remove or re-address the conflicting mapping.' },
      de: { title: 'Reservierungsadresse ist doppelt vorhanden', rationale: 'Mehrere importierte Reservierungen verwenden dieselbe IP-Adresse.', impact: 'Unterschiedliche Clients können dieselbe Adresse erhalten und ihre Verbindung verlieren.', recommendation: 'Die beabsichtigte Reservierung behalten und die kollidierende Zuordnung entfernen oder neu adressieren.' },
    },
  },
  'duplicate-reservation-identifier': {
    source: workspaceSources.dhcp,
    copy: {
      en: { title: 'Reservation client identifier is duplicated', rationale: 'The same client identifier is attached to more than one reservation.', impact: 'The server can match one client to ambiguous reservation records.', recommendation: 'Give every client a unique identifier and remove the duplicate mapping.' },
      de: { title: 'Client-ID einer Reservierung ist doppelt vorhanden', rationale: 'Dieselbe Client-ID ist mehreren Reservierungen zugeordnet.', impact: 'Der Server kann einen Client nicht eindeutig einer Reservierung zuordnen.', recommendation: 'Jedem Client eine eindeutige Kennung geben und die doppelte Zuordnung entfernen.' },
    },
  },
  'reservation-outside-scope': {
    source: workspaceSources.microsoftReservationRange,
    copy: {
      en: { title: 'Reservation is outside its scope distribution range', rationale: 'Windows Server requires a reservation address to fall inside the configured scope distribution range.', impact: 'The reservation cannot be created or reliably restored with the supported Microsoft DHCP tooling.', recommendation: 'Move the reservation into the scope distribution range, or extend the range and use an exclusion for addresses that must not be offered dynamically.' },
      de: { title: 'Reservierung liegt außerhalb des Scope-Verteilungsbereichs', rationale: 'Windows Server verlangt, dass eine Reservierungsadresse innerhalb des konfigurierten Scope-Verteilungsbereichs liegt.', impact: 'Die Reservierung kann mit den unterstützten Microsoft-DHCP-Werkzeugen nicht erstellt oder zuverlässig wiederhergestellt werden.', recommendation: 'Die Reservierung in den Verteilungsbereich verschieben oder den Bereich erweitern und Adressen, die nicht dynamisch vergeben werden sollen, per Ausschluss schützen.' },
    },
  },
  'invalid-address-option': {
    source: workspaceSources.options,
    copy: {
      en: { title: 'Address option contains an invalid value', rationale: 'An imported router, DNS, or NTP option contains no parseable IPv4 address.', impact: 'Clients can receive unusable network settings and fail name resolution, routing, or time synchronization.', recommendation: 'Replace the option value with valid IPv4 addresses and verify it with the vendor tooling.' },
      de: { title: 'Adressoption enthält einen ungültigen Wert', rationale: 'Eine importierte Router-, DNS- oder NTP-Option enthält keine lesbare IPv4-Adresse.', impact: 'Clients können unbrauchbare Netzwerkeinstellungen erhalten; Routing, Namensauflösung oder Zeitsynchronisierung können ausfallen.', recommendation: 'Den Optionswert durch gültige IPv4-Adressen ersetzen und mit dem Herstellerwerkzeug prüfen.' },
    },
  },
  'gateway-in-dynamic-pool': {
    source: workspaceSources.dhcp,
    copy: {
      en: { title: 'Gateway is inside a dynamic pool', rationale: 'The imported router option points to an address inside the dynamic pool.', impact: 'The gateway address can be offered to a client, which can break connectivity for the affected network.', recommendation: 'Exclude the gateway address from the dynamic pool.' },
      de: { title: 'Gateway liegt in einem dynamischen Pool', rationale: 'Die importierte Router-Option verweist auf eine Adresse im dynamischen Pool.', impact: 'Die Gateway-Adresse kann einem Client angeboten werden und dadurch die Konnektivität im betroffenen Netz unterbrechen.', recommendation: 'Die Gateway-Adresse aus dem dynamischen Pool ausschließen.' },
    },
  },
  'scope-option-overrides-server': {
    source: workspaceSources.microsoft,
    copy: {
      en: { title: 'Scope option overrides the server value', rationale: 'A scope-level option differs from the imported server-level value.', impact: 'Clients in this scope receive different effective settings than the server default.', recommendation: 'Confirm the override is intentional, then align the values or remove the scope override.' },
      de: { title: 'Scope-Option überschreibt den Serverwert', rationale: 'Eine Option auf Scope-Ebene weicht vom importierten Serverwert ab.', impact: 'Clients in diesem Scope erhalten andere wirksame Einstellungen als den Serverstandard.', recommendation: 'Die Abweichung bestätigen und anschließend die Werte angleichen oder die Scope-Überschreibung entfernen.' },
    },
  },
  'scope-capacity-low': {
    source: workspaceSources.microsoft,
    copy: {
      en: { title: 'Scope address capacity is low', rationale: 'Observed leases approach or exceed the usable address capacity after exclusions.', impact: 'New clients may fail to obtain an address during normal demand or short peaks.', recommendation: 'Verify lease observations, then expand or split the pool, shorten leases, or reduce demand.' },
      de: { title: 'Adresskapazität des Scopes wird knapp', rationale: 'Beobachtete Leases nähern sich der nutzbaren Adresskapazität nach Abzug der Ausschlüsse oder überschreiten sie.', impact: 'Neue Clients erhalten bei normaler Last oder kurzen Spitzen möglicherweise keine Adresse.', recommendation: 'Lease-Beobachtung prüfen und danach den Pool erweitern oder teilen, Lease-Zeiten verkürzen oder Bedarf reduzieren.' },
    },
  },
  'failover-scope-membership-missing': {
    source: workspaceSources.microsoft,
    copy: {
      en: { title: 'Failover scope membership is not present in the export', rationale: 'A failover relationship was imported without associated scope identifiers.', impact: 'DHCPulse cannot prove which scopes are protected by that relationship.', recommendation: 'Verify scope membership on both partners with the Microsoft DHCP management tools.' },
      de: { title: 'Failover-Scope-Zuordnung fehlt im Export', rationale: 'Eine Failover-Beziehung wurde ohne zugeordnete Scope-IDs importiert.', impact: 'DHCPulse kann nicht belegen, welche Scopes durch diese Beziehung geschützt sind.', recommendation: 'Die Scope-Zuordnung auf beiden Partnern mit den Microsoft-DHCP-Verwaltungswerkzeugen prüfen.' },
    },
  },
};

export function workspaceRuleCopy(ruleId: string, locale: WorkspaceRuleLocale): WorkspaceRuleCopy | undefined {
  return ruleId in workspaceRuleCatalog
    ? workspaceRuleCatalog[ruleId as WorkspaceRuleId].copy[locale]
    : undefined;
}
