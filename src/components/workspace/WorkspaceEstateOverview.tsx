import { Search } from 'lucide-react';
import { useMemo, useState, type Ref } from 'react';
import type { Locale } from '../../content/copy';
import type { MicrosoftWorkspace } from '../../domain/microsoft-workspace';
import { buildScopeWorkspaceRows, groupWorkspaceFindings, searchWorkspaceObjects } from '../../domain/workspace-view';

interface Props {
  locale: Locale;
  workspace: MicrosoftWorkspace;
  headingRef?: Ref<HTMLHeadingElement>;
  onOpenScope: (scopeId: string, objectId?: string) => void;
}

const findingTitles: Record<Locale, Record<string, string>> = {
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

export function WorkspaceEstateOverview({ locale, workspace, headingRef, onOpenScope }: Props) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => buildScopeWorkspaceRows(workspace), [workspace]);
  const groups = useMemo(() => groupWorkspaceFindings(workspace).slice(0, 5), [workspace]);
  const results = useMemo(() => searchWorkspaceObjects(workspace, query).filter(({ scopeId }) => scopeId).slice(0, 50), [query, workspace]);
  const c = locale === 'de' ? {
    title: 'Umgebungsübersicht', scopes: 'IPv4-Scopes', reservations: 'Reservierungen', options: 'Optionen', findings: 'Befunde',
    search: 'Umgebung durchsuchen', searchHint: 'Scope, Hostname, Adresse, Option oder Client-ID', noResults: 'Keine Treffer.',
    estate: 'Scope-Bestand', scope: 'Scope', network: 'Netz', capacity: 'Kapazität', state: 'Status', issues: 'Befunde', open: 'Öffnen',
    coverage: 'Importabdeckung', assessment: 'Bewertung', package: 'Paketerzeugung', imported: 'Microsoft-XML lokal importiert',
    review: 'Befunde müssen vor Änderungen geprüft werden', target: 'Wird für den gewählten Ziel-Scope geprüft', top: 'Wichtigste Befundgruppen',
  } : {
    title: 'Environment overview', scopes: 'IPv4 scopes', reservations: 'Reservations', options: 'Options', findings: 'Findings',
    search: 'Search environment', searchHint: 'Scope, hostname, address, option, or client ID', noResults: 'No results.',
    estate: 'Scope estate', scope: 'Scope', network: 'Network', capacity: 'Capacity', state: 'State', issues: 'Findings', open: 'Open',
    coverage: 'Import coverage', assessment: 'Assessment', package: 'Package generation', imported: 'Microsoft XML imported locally',
    review: 'Findings require review before changes', target: 'Evaluated for the selected target scope', top: 'Top finding groups',
  };
  const blockers = workspace.findings.filter(({ severity }) => severity === 'blocker').length;
  const warnings = workspace.findings.filter(({ severity }) => severity === 'warning').length;

  return <section className="workspace-estate planner-card" aria-labelledby="workspace-overview-heading">
    <div className="workspace-estate-heading"><div><p className="section-kicker">Microsoft DHCP</p><h2 id="workspace-overview-heading" ref={headingRef} tabIndex={-1}>{c.title}</h2><p className="workspace-server-name">{workspace.serverName ?? '—'}</p></div></div>
    <div className="workspace-metrics workspace-estate-metrics">
      <Metric label={c.scopes} value={workspace.summaries.ipv4Scopes} name="ipv4-scopes" />
      <Metric label={c.reservations} value={workspace.summaries.reservations} name="reservations" />
      <Metric label={c.options} value={workspace.summaries.options} name="options" />
      <Metric label={c.findings} value={workspace.findings.length} name="findings" />
    </div>
    <div className="workspace-status-grid">
      <Status label={c.coverage} value={c.imported} tone="ok" />
      <Status label={c.assessment} value={`${blockers} Blocker · ${warnings} ${locale === 'de' ? 'Warnungen' : 'warnings'}`} tone={blockers ? 'danger' : warnings ? 'warning' : 'ok'} />
      <Status label={c.package} value={c.target} tone="neutral" />
    </div>
    <div className="workspace-estate-grid">
      <div>
        <label className="workspace-search workspace-global-search"><Search size={16} aria-hidden="true" /><span className="sr-only">{c.search}</span><input type="search" aria-label={c.search} placeholder={c.searchHint} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {query.trim() && <div className="workspace-search-results" aria-live="polite">{results.length ? <ul>{results.map((result) => {
          const scopeName = rows.find(({ scopeId }) => scopeId === result.scopeId)?.name ?? result.scopeId;
          return <li key={result.id}><button type="button" onClick={() => onOpenScope(result.scopeId!, result.id)} aria-label={`${result.label} · ${scopeName}`}><strong>{result.label}</strong><span>{result.secondary ?? result.kind}</span><small>{scopeName}</small></button></li>;
        })}</ul> : <p>{c.noResults}</p>}</div>}
        <div className="workspace-table-wrap"><table className="workspace-table"><caption>{c.estate}</caption><thead><tr><th>{c.scope}</th><th>{c.network}</th><th>{c.capacity}</th><th>{c.state}</th><th>{c.issues}</th><th><span className="sr-only">{c.open}</span></th></tr></thead><tbody>{rows.map((row) => <tr key={row.scopeId} className={row.findings.blocker ? 'has-blocker' : row.findings.warning ? 'has-warning' : ''}><td><strong>{row.name}</strong><small>{row.reservations} {c.reservations.toLocaleLowerCase()}</small></td><td><code>{row.cidr}</code></td><td>{row.capacity}</td><td>{row.state ?? '—'}</td><td><span className="workspace-severity-count blocker">{row.findings.blocker}</span><span className="workspace-severity-count warning">{row.findings.warning}</span></td><td><button type="button" className="text-button" aria-label={`${c.open} ${row.name}`} onClick={() => onOpenScope(row.scopeId)}>{c.open}</button></td></tr>)}</tbody></table></div>
      </div>
      <aside className="workspace-group-summary" aria-labelledby="workspace-top-findings"><h3 id="workspace-top-findings">{c.top}</h3><ol>{groups.map((group) => <li key={group.key} className={`finding-${group.severity}`}><span>{group.severity}</span><strong>{findingTitles[locale][group.ruleId] ?? group.ruleId}</strong><b>{group.count}</b></li>)}</ol></aside>
    </div>
  </section>;
}

function Metric({ label, value, name }: { label: string; value: number; name: string }) { return <div><span>{label}</span><strong data-workspace-metric={name}>{value}</strong></div>; }
function Status({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className={`workspace-summary-status ${tone}`}><span>{label}</span><strong>{value}</strong></div>; }
