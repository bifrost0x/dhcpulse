import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import type { Locale } from '../../content/copy';
import type { MicrosoftWorkspace, WorkspaceFinding } from '../../domain/microsoft-workspace';

interface WorkspaceFindingsProps {
  locale: Locale;
  workspace: MicrosoftWorkspace;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const titles: Record<Locale, Record<string, string>> = {
  en: {
    'parser-warning': 'The export contains unsupported or partially parsed data',
    'duplicate-reservation-address': 'Reservation address is duplicated',
    'duplicate-reservation-identifier': 'Reservation client identifier is duplicated',
    'reservation-outside-scope': 'Reservation is outside its scope',
    'reservation-in-dynamic-pool': 'Reservation is inside a dynamic pool',
    'invalid-address-option': 'Address option contains an invalid value',
    'gateway-in-dynamic-pool': 'Gateway is inside a dynamic pool',
    'scope-option-overrides-server': 'Scope option overrides the server value',
    'scope-capacity-low': 'Scope address capacity is low',
    'failover-scope-membership-missing': 'Failover scope membership is not present in the export',
  },
  de: {
    'parser-warning': 'Der Export enthält nicht unterstützte oder nur teilweise analysierte Daten',
    'duplicate-reservation-address': 'Reservierungsadresse ist doppelt vorhanden',
    'duplicate-reservation-identifier': 'Client-ID einer Reservierung ist doppelt vorhanden',
    'reservation-outside-scope': 'Reservierung liegt außerhalb ihres Scopes',
    'reservation-in-dynamic-pool': 'Reservierung liegt in einem dynamischen Pool',
    'invalid-address-option': 'Adressoption enthält einen ungültigen Wert',
    'gateway-in-dynamic-pool': 'Gateway liegt in einem dynamischen Pool',
    'scope-option-overrides-server': 'Scope-Option überschreibt den Serverwert',
    'scope-capacity-low': 'Adresskapazität des Scopes wird knapp',
    'failover-scope-membership-missing': 'Failover-Scope-Zuordnung fehlt im Export',
  },
};

export function WorkspaceFindings({ locale, workspace, selectedId, onSelect }: WorkspaceFindingsProps) {
  const findings = selectedId ? workspace.findings.filter(({ entityIds }) => entityIds.includes(selectedId)) : workspace.findings;
  return (
    <aside className="workspace-findings planner-card" aria-labelledby="workspace-findings-heading">
      <header><div><p className="section-kicker">{locale === 'de' ? 'Evidenz' : 'Evidence'}</p><h2 id="workspace-findings-heading">{locale === 'de' ? 'Befunde' : 'Findings'}</h2></div><strong>{findings.length}</strong></header>
      {findings.length === 0 ? <p className="workspace-empty">{locale === 'de' ? 'Keine Befunde für dieses Objekt.' : 'No findings for this object.'}</p> : <ol>{findings.map((finding) => <FindingItem key={finding.id} finding={finding} locale={locale} onSelect={onSelect} />)}</ol>}
    </aside>
  );
}

function FindingItem({ finding, locale, onSelect }: { finding: WorkspaceFinding; locale: Locale; onSelect: (id: string) => void }) {
  const Icon = finding.severity === 'blocker' ? ShieldAlert : finding.severity === 'warning' ? AlertTriangle : Info;
  const target = finding.entityIds[0];
  const severity = locale === 'de' ? { blocker: 'Blocker', warning: 'Warnung', info: 'Hinweis' }[finding.severity] : { blocker: 'Blocker', warning: 'Warning', info: 'Note' }[finding.severity];
  return <li className={`workspace-finding finding-${finding.severity}`}><div className="workspace-finding-title"><Icon size={17} aria-hidden="true" /><span>{severity}</span></div><strong>{titles[locale][finding.ruleId] ?? finding.ruleId}</strong><dl>{Object.entries(finding.evidence).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl><div className="workspace-finding-actions">{target && <button type="button" onClick={() => onSelect(target)}>{locale === 'de' ? 'Objekt öffnen' : 'Open object'}</button>}<a href={finding.source} target="_blank" rel="noreferrer">{locale === 'de' ? 'Quelle' : 'Source'}</a></div></li>;
}
