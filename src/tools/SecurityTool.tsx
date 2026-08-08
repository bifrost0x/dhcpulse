import { useMemo, useState } from 'react';
import { securityRuleCatalog } from '../content/diagnostic-rules';
import { diagnoseDhcp } from '../domain/diagnostics';
import type { DhcpDiagnosticInput, DhcpSecurityEvidence, DhcpSecurityFinding, DhcpSecurityFindingId } from '../domain/types';
import { buildWorkbenchReport } from '../domain/workbench-export';
import { ReportDownloadActions } from './ReportDownloadActions';
import type { ToolPanelProps } from './ToolPanel';

const defaults: DhcpSecurityEvidence = { dhcpSnoopingEnabled: false, serverFacingPortsTrusted: false, option82Trusted: false, dnsUpdateCredentialsAligned: false, auditLoggingEnabled: false, windowsDhcpAuthorized: false, raGuardEnabled: false, backupRestoreTested: false, secretExposureDetected: false };
const base: Omit<DhcpDiagnosticInput, 'security'> = { symptoms: [], path: 'direct', affectedVlans: 'all', existingClientsAffected: false, newClientsAffected: false, serverPlatform: 'windows', recentChange: false, offerSeen: false, requestSeen: false, ackSeen: false, nakSeen: false, declineSeen: false, relayGiaddr: null, relayLinkAddress: null, serverIds: [], freePoolPercentage: 50, dnsQueueSymptoms: false, failoverState: 'normal' };
const copy = { en: { title: 'Defensive DHCP controls', description: 'Select controls that are implemented and verified. Gaps remain explainable and grouped by defensive purpose.', reset: 'Reset', download: 'Download report', gaps: 'Configuration gaps', prevent: 'Prevent', detect: 'Detect', recover: 'Recover', none: 'No gap in this group.', assumptions: 'Assumptions and limitations', sources: 'Authoritative sources', source: 'Source' }, de: { title: 'Defensive DHCP-Schutzmaßnahmen', description: 'Wähle implementierte und geprüfte Maßnahmen. Lücken bleiben nachvollziehbar und sind nach Schutzzweck gruppiert.', reset: 'Zurücksetzen', download: 'Bericht herunterladen', gaps: 'Konfigurationslücken', prevent: 'Verhindern', detect: 'Erkennen', recover: 'Wiederherstellen', none: 'Keine Lücke in dieser Gruppe.', assumptions: 'Annahmen und Grenzen', sources: 'Maßgebliche Quellen', source: 'Quelle' } } as const;
const controls: [keyof DhcpSecurityEvidence, string, string][] = [['dhcpSnoopingEnabled', 'DHCP snooping enabled', 'DHCP Snooping aktiviert'], ['serverFacingPortsTrusted', 'Only server/relay-facing ports trusted', 'Nur Server-/Relay-Ports vertrauenswürdig'], ['option82Trusted', 'Option 82 trust boundary defined', 'Option-82-Vertrauensgrenze definiert'], ['raGuardEnabled', 'RA Guard enabled', 'RA Guard aktiviert'], ['windowsDhcpAuthorized', 'Windows DHCP authorized', 'Windows DHCP autorisiert'], ['auditLoggingEnabled', 'DHCP audit logging enabled', 'DHCP-Auditprotokollierung aktiviert'], ['dnsUpdateCredentialsAligned', 'DNS update credentials aligned', 'DNS-Update-Anmeldedaten abgestimmt'], ['backupRestoreTested', 'Backup restore tested', 'Wiederherstellung getestet'], ['secretExposureDetected', 'API/config secret exposure detected', 'API-/Konfigurationsgeheimnis offengelegt']];
const groups: Record<'prevent' | 'detect' | 'recover', DhcpSecurityFindingId[]> = { prevent: ['security-dhcp-snooping-disabled', 'security-trusted-port-misconfigured', 'security-option-82-trust-missing', 'security-windows-dhcp-unauthorized', 'security-ra-guard-disabled', 'security-secret-exposure'], detect: ['security-rogue-dhcp-server', 'security-starvation-or-exhaustion', 'security-audit-logging-disabled', 'security-dns-credential-mismatch'], recover: ['security-backup-restore-unverified'] };
type ServerPlatform = 'windows' | 'kea' | 'isc' | 'dnsmasq' | 'other';
type DirectoryContext = 'domain-joined' | 'standalone' | 'not-applicable';
const platformOptions: [ServerPlatform, string][] = [['windows', 'Windows Server'], ['kea', 'Kea'], ['isc', 'ISC DHCP'], ['dnsmasq', 'dnsmasq'], ['other', 'Other']];
const contextCopy = {
  en: { platform: 'Server platform', directoryContext: 'Active Directory context', domainJoined: 'Domain joined', standalone: 'Standalone', notApplicable: 'Not applicable', authorizationNotApplicable: 'Windows DHCP authorization is not applicable in this context.' },
  de: { platform: 'Serverplattform', directoryContext: 'Active-Directory-Kontext', domainJoined: 'Dom\u00e4nenmitglied', standalone: 'Eigenst\u00e4ndig', notApplicable: 'Nicht anwendbar', authorizationNotApplicable: 'Die Windows-DHCP-Autorisierung ist in diesem Kontext nicht anwendbar.' },
} as const;

export function SecurityTool({ locale }: ToolPanelProps) {
  const [state, setState] = useState(defaults);
  const [platform, setPlatform] = useState<ServerPlatform>('windows');
  const [directoryContext, setDirectoryContext] = useState<DirectoryContext>('domain-joined');
  const c = copy[locale];
  const context = contextCopy[locale];
  const authorizationApplicable = platform === 'windows' && directoryContext === 'domain-joined';
  const visibleControls = controls.filter(([key]) => key !== 'windowsDhcpAuthorized' || authorizationApplicable);
  const result = useMemo(
    () => diagnoseDhcp({ ...base, serverPlatform: enginePlatform(platform, directoryContext), security: state }),
    [directoryContext, platform, state],
  );
  const report = () => buildWorkbenchReport({
      toolId: 'security',
      toolName: locale === 'de' ? 'DHCP-Sicherheit' : 'DHCP security',
      generatedAt: new Date().toISOString(),
      locale,
      inputs: {
        ...Object.fromEntries(visibleControls.map(([key, en, de]) => [locale === 'de' ? de : en, state[key]])),
        [locale === 'de' ? 'Windows-Plattform' : 'Windows platform']: platform === 'windows',
        [locale === 'de' ? 'Dom\u00e4nenmitglied' : 'Domain joined']: directoryContext === 'domain-joined',
        [locale === 'de' ? 'Autorisierung anwendbar' : 'Authorization applicable']: authorizationApplicable,
      },
      findings: result.securityFindings.map((finding) => ({ severity: finding.severity, title: findingTitle(finding, locale), detail: findingRationale(finding, locale) })),
      assumptions: [locale === 'de' ? 'Die Checkliste best\u00e4tigt keine technische Umsetzung; Nachweise sind separat zu pr\u00fcfen.' : 'The checklist does not prove implementation; validate evidence separately.'],
      sources: [...new Map(result.securityFindings.map((finding) => [finding.source, { label: findingTitle(finding, locale), url: finding.source }])).values()],
      sensitiveValues: [],
    });
  const selectPlatform = (value: ServerPlatform) => {
    setPlatform(value);
    setDirectoryContext(value === 'windows' ? 'domain-joined' : 'not-applicable');
  };
  const reset = () => { setState(defaults); setPlatform('windows'); setDirectoryContext('domain-joined'); };

  return <div className="workbench-grid" data-testid="tool-panel-security"><section className="planner-card workbench-form" aria-labelledby="security-title"><h2 id="security-title">{c.title}</h2><p>{c.description}</p><div className="workbench-fields"><label className="workbench-field"><span>{context.platform}</span><select value={platform} onChange={(event) => selectPlatform(event.target.value as ServerPlatform)}>{platformOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="workbench-field"><span>{context.directoryContext}</span><select value={directoryContext} disabled={platform !== 'windows'} onChange={(event) => setDirectoryContext(event.target.value as DirectoryContext)}><option value="domain-joined">{context.domainJoined}</option><option value="standalone">{context.standalone}</option><option value="not-applicable">{context.notApplicable}</option></select></label></div>{!authorizationApplicable && <p className="field-help">{context.authorizationNotApplicable}</p>}<div className="security-checklist">{visibleControls.map(([key, en, de]) => <label className="check-row" key={key}><input type="checkbox" checked={state[key]} onChange={(event) => setState((current) => ({ ...current, [key]: event.target.checked }))} />{locale === 'de' ? de : en}</label>)}</div><div className="workbench-actions"><button type="button" className="secondary-button" onClick={reset}>{c.reset}</button><ReportDownloadActions createReport={report} filename="dhcpulse-security-report" locale={locale} /></div></section><section className="planner-card workbench-results" role="region" aria-labelledby="security-result"><h2 id="security-result">{c.gaps}</h2>{(Object.keys(groups) as (keyof typeof groups)[]).map((group) => <section className="workbench-section" key={group}><h3>{c[group]}</h3>{findings(group, result.securityFindings).length ? <ul className="finding-list-compact">{findings(group, result.securityFindings).map((finding) => <li key={finding.id} className={`finding-${finding.severity}`}><span className="severity">{severity(finding.severity, locale)}</span><div><strong>{findingTitle(finding, locale)}</strong><p>{findingRationale(finding, locale)}</p><a href={finding.source} target="_blank" rel="noreferrer">{c.source}</a></div></li>)}</ul> : <p>{c.none}</p>}</section>)}<details className="workbench-section"><summary>{c.assumptions}</summary><p>{locale === 'de' ? 'Die Bewertung basiert ausschlie\u00dflich auf den ausgew\u00e4hlten Kontrollnachweisen.' : 'Assessment uses only the selected control evidence.'}</p></details><section className="workbench-section"><h3>{c.sources}</h3><a href="https://www.rfc-editor.org/rfc/rfc3046.html" target="_blank" rel="noreferrer">RFC 3046</a> \u00b7 <a href="https://www.rfc-editor.org/rfc/rfc7113.html" target="_blank" rel="noreferrer">RFC 7113</a></section></section></div>;
}

function enginePlatform(platform: ServerPlatform, directoryContext: DirectoryContext): DhcpDiagnosticInput['serverPlatform'] {
  if (platform === 'windows' && directoryContext === 'domain-joined') return 'windows';
  return platform === 'kea' ? 'kea' : 'router';
}

function findings(group: keyof typeof groups, values: ReturnType<typeof diagnoseDhcp>['securityFindings']) { return values.filter((value) => groups[group].includes(value.id)); }
const securityDe: Record<DhcpSecurityFindingId, [string, string]> = { 'security-dhcp-snooping-disabled': ['DHCP Snooping ist deaktiviert', 'DHCP Snooping beschränkt Serverantworten auf ausdrücklich vertrauenswürdige Netzpfade.'], 'security-trusted-port-misconfigured': ['DHCP-Vertrauensports sind inkonsistent', 'Nur vorgesehene Server- oder Relay-Ports dürfen die Vertrauensgrenze bilden.'], 'security-rogue-dhcp-server': ['Mehrere DHCP-Server beobachtet', 'Unerwartete Server-Kennungen können auf einen fremden oder doppelten Dienst hinweisen.'], 'security-starvation-or-exhaustion': ['Signal für Pool-Blockierung oder Erschöpfung', 'Sehr geringe freie Kapazität und DECLINE-Aktivität erfordern eine Missbrauchs- und Konfliktprüfung.'], 'security-option-82-trust-missing': ['Option-82-Vertrauen fehlt', 'Relay-Agent-Informationen dürfen nur an einer definierten Vertrauensgrenze angenommen werden.'], 'security-dns-credential-mismatch': ['DNS-Update-Anmeldedaten stimmen nicht überein', 'Gemeinsame kontrollierte Anmeldedaten reduzieren inkonsistente Registrierungen.'], 'security-audit-logging-disabled': ['DHCP-Auditprotokollierung ist deaktiviert', 'Auditprotokolle werden zur Rekonstruktion von Lease- und Administrationsereignissen benötigt.'], 'security-windows-dhcp-unauthorized': ['Windows-DHCP-Server ist nicht autorisiert', 'Ein domänengebundener Windows-DHCP-Server sollte vor dem Dienststart autorisiert sein.'], 'security-ra-guard-disabled': ['RA Guard ist deaktiviert', 'RA Guard beschränkt nicht autorisierte Router Advertisements an Zugangsports.'], 'security-backup-restore-unverified': ['Sicherung und Wiederherstellung sind ungeprüft', 'Ein wiederherstellbarer DHCP-Dienst benötigt eine aktuelle Sicherung und einen getesteten Restore.'], 'security-secret-exposure': ['DHCP- oder DNS-Geheimnis ist offengelegt', 'Offengelegte Anmeldedaten oder Konfigurationsgeheimnisse müssen eingedämmt und rotiert werden.'] };
function findingTitle(finding: DhcpSecurityFinding, locale: 'en' | 'de') { return locale === 'de' ? securityDe[finding.id][0] : securityRuleCatalog[finding.id].title; }
function findingRationale(finding: DhcpSecurityFinding, locale: 'en' | 'de') { return locale === 'de' ? securityDe[finding.id][1] : finding.rationale; }
function severity(value: DhcpSecurityFinding['severity'], locale: 'en' | 'de') { const labels = locale === 'de' ? { blocker: 'Blocker', warning: 'Warnung', info: 'Hinweis' } : { blocker: 'Blocker', warning: 'Warning', info: 'Info' }; return labels[value]; }
