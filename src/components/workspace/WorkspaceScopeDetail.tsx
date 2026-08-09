import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Locale } from '../../content/copy';
import type { MicrosoftWorkspace, WorkspaceNode } from '../../domain/microsoft-workspace';
import { groupWorkspaceFindings, pageWorkspaceItems } from '../../domain/workspace-view';

type Tab = 'overview' | 'reservations' | 'options' | 'findings' | 'changes';
interface Props { locale: Locale; workspace: MicrosoftWorkspace; scopeId: string; selectedObjectId: string | null; onBack: () => void; onSelectObject: (node: WorkspaceNode) => void; }

const titles: Record<Locale, Record<string, string>> = {
  en: { 'reservation-in-dynamic-pool': 'Reservation is inside a dynamic pool', 'reservation-outside-scope': 'Reservation is outside its scope', 'duplicate-reservation-address': 'Reservation address is duplicated', 'duplicate-reservation-identifier': 'Reservation client identifier is duplicated', 'scope-option-overrides-server': 'Scope option overrides the server value', 'gateway-in-dynamic-pool': 'Gateway is inside a dynamic pool', 'invalid-address-option': 'Address option contains an invalid value', 'scope-capacity-low': 'Scope address capacity is low', 'failover-scope-membership-missing': 'Failover scope membership is not present in the export', 'parser-warning': 'The export contains unsupported or partially parsed data' },
  de: { 'reservation-in-dynamic-pool': 'Reservierung liegt in einem dynamischen Pool', 'reservation-outside-scope': 'Reservierung liegt außerhalb ihres Scopes', 'duplicate-reservation-address': 'Reservierungsadresse ist doppelt vorhanden', 'duplicate-reservation-identifier': 'Client-ID einer Reservierung ist doppelt vorhanden', 'scope-option-overrides-server': 'Scope-Option überschreibt den Serverwert', 'gateway-in-dynamic-pool': 'Gateway liegt in einem dynamischen Pool', 'invalid-address-option': 'Adressoption enthält einen ungültigen Wert', 'scope-capacity-low': 'Adresskapazität des Scopes wird knapp', 'failover-scope-membership-missing': 'Failover-Scope-Zuordnung fehlt im Export', 'parser-warning': 'Der Export enthält nicht unterstützte oder nur teilweise analysierte Daten' },
};

export function WorkspaceScopeDetail({ locale, workspace, scopeId, selectedObjectId, onBack, onSelectObject }: Props) {
  const initialKind = workspace.nodes.find(({ id }) => id === selectedObjectId)?.kind;
  const [tab, setTab] = useState<Tab>(initialKind === 'reservation' ? 'reservations' : initialKind === 'option' ? 'options' : 'overview');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scope = workspace.configuration.ipv4Scopes.find(({ id }) => id === scopeId);
  const summary = workspace.scopeSummaries[scopeId];
  const reservations = useMemo(() => workspace.configuration.reservations.filter((item) => item.scopeId === scopeId && `${item.hostname ?? ''} ${item.address} ${item.identifier ?? ''}`.toLowerCase().includes(filter.toLowerCase())), [filter, scopeId, workspace]);
  const options = workspace.configuration.options.filter((item) => item.scopeId === scopeId || item.level === 'global');
  const exclusions = workspace.configuration.exclusions.filter((item) => item.scopeId === scopeId);
  const groups = useMemo(() => groupWorkspaceFindings(workspace, scopeId), [scopeId, workspace]);
  const reservationPage = pageWorkspaceItems(reservations, page);
  useEffect(() => { headingRef.current?.focus(); }, [scopeId]);
  if (!scope || !summary) return null;
  const c = locale === 'de' ? { back: 'Alle Scopes', overview: 'Übersicht', reservations: 'Reservierungen', options: 'Optionen', findings: 'Befunde', changes: 'Änderungen', network: 'Netz', capacity: 'Effektive Kapazität', used: 'Belegt', free: 'Frei', lease: 'Leasedauer', pools: 'Pools und Ausschlüsse', filter: 'Reservierungen filtern', previous: 'Zurück', next: 'Weiter', page: 'Seite', address: 'Adresse', client: 'Client-ID', host: 'Hostname', value: 'Wert', source: 'Ebene', affected: 'Betroffene Objekte', noFindings: 'Keine Befunde für diesen Scope.', changeHint: 'Änderungen für diesen Scope werden im Change Set unterhalb der Detailansicht verwaltet.' } : { back: 'All scopes', overview: 'Overview', reservations: 'Reservations', options: 'Options', findings: 'Findings', changes: 'Changes', network: 'Network', capacity: 'Effective capacity', used: 'Used', free: 'Remaining', lease: 'Lease duration', pools: 'Pools and exclusions', filter: 'Filter reservations', previous: 'Previous', next: 'Next', page: 'Page', address: 'Address', client: 'Client ID', host: 'Hostname', value: 'Value', source: 'Level', affected: 'Affected objects', noFindings: 'No findings for this scope.', changeHint: 'Changes for this scope are managed in the Change Set below the detail view.' };
  const tabs: Array<[Tab, string, number | undefined]> = [['overview', c.overview, undefined], ['reservations', c.reservations, reservations.length], ['options', c.options, options.length], ['findings', c.findings, groups.reduce((sum, group) => sum + group.count, 0)], ['changes', c.changes, undefined]];
  function selectTab(next: Tab) { setTab(next); setPage(1); }
  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault();
    buttons[next]?.focus();
    buttons[next]?.click();
  }
  return <section className="workspace-scope-detail planner-card" aria-labelledby="workspace-scope-heading">
    <button type="button" className="text-button workspace-back" onClick={onBack}>← {c.back}</button>
    <header><p className="section-kicker">IPv4 scope</p><h2 id="workspace-scope-heading" ref={headingRef} tabIndex={-1}>{scope.name ?? scope.cidr}</h2><code>{scope.cidr}</code></header>
    <div role="tablist" aria-label={scope.name ?? scope.cidr} className="workspace-detail-tabs" onKeyDown={navigateTabs}>{tabs.map(([id, label, count]) => <button key={id} id={`workspace-tab-${id}`} type="button" role="tab" tabIndex={tab === id ? 0 : -1} aria-selected={tab === id} aria-controls={`workspace-panel-${id}`} onClick={() => selectTab(id)}>{label}{count !== undefined && <span>{count}</span>}</button>)}</div>
    <div id={`workspace-panel-${tab}`} role="tabpanel" aria-labelledby={`workspace-tab-${tab}`} tabIndex={0} className="workspace-tab-panel">
      {tab === 'overview' && <><dl className="workspace-facts"><Fact label={c.network} value={scope.cidr} /><Fact label={c.capacity} value={summary.effectiveCapacity} /><Fact label={c.used} value={summary.currentlyUsedAddresses} /><Fact label={c.free} value={summary.remainingAddresses} /><Fact label={c.lease} value={scope.leaseLifetimeSeconds ? `${scope.leaseLifetimeSeconds / 3600} h` : '—'} /><Fact label={c.findings} value={groups.reduce((sum, group) => sum + group.count, 0)} /></dl><h3>{c.pools}</h3><div className="workspace-table-wrap"><table className="workspace-table"><tbody>{workspace.configuration.pools.filter((item) => item.scopeId === scopeId).map((item) => <tr key={item.id}><td>Pool</td><td><code>{item.start} – {item.end}</code></td></tr>)}{exclusions.map((item) => <tr key={item.id}><td>Exclusion</td><td><button type="button" className="text-button" onClick={() => onSelectObject(workspace.nodes.find(({ id }) => id === item.id)!)}>{item.start} – {item.end}</button></td></tr>)}</tbody></table></div></>}
      {tab === 'reservations' && <><label className="workbench-field workspace-inline-filter"><span>{c.filter}</span><input type="search" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} /></label><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>{c.host}</th><th>{c.address}</th><th>{c.client}</th><th /></tr></thead><tbody>{reservationPage.items.map((item) => <tr key={item.id}><td>{item.hostname ?? '—'}</td><td><code>{item.address}</code></td><td><code>{mask(item.identifier)}</code></td><td><button type="button" className="text-button" onClick={() => onSelectObject(workspace.nodes.find(({ id }) => id === item.id)!)}>Select</button></td></tr>)}</tbody></table></div><Pagination locale={locale} page={reservationPage.page} pages={reservationPage.pageCount} previous={c.previous} next={c.next} label={c.page} onPage={setPage} /></>}
      {tab === 'options' && <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Option</th><th>{c.value}</th><th>{c.source}</th></tr></thead><tbody>{options.map((item) => <tr key={item.id}><td>{item.code ?? item.name}</td><td><code>{Array.isArray(item.value) ? item.value.join(', ') : String(item.value)}</code></td><td>{item.level}</td></tr>)}</tbody></table></div>}
      {tab === 'findings' && (groups.length ? <ol className="workspace-finding-groups">{groups.map((group) => <FindingGroup key={group.key} locale={locale} workspace={workspace} group={group} affected={c.affected} previous={c.previous} next={c.next} pageLabel={c.page} />)}</ol> : <p>{c.noFindings}</p>)}
      {tab === 'changes' && <p>{c.changeHint}</p>}
    </div>
  </section>;
}

function Fact({ label, value }: { label: string; value: string | number }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function Pagination({ page, pages, previous, next, label, onPage }: { locale: Locale; page: number; pages: number; previous: string; next: string; label: string; onPage: (page: number) => void }) { return <nav className="workspace-pagination" aria-label={label}><button type="button" className="secondary-button" disabled={page <= 1} onClick={() => onPage(page - 1)}>{previous}</button><span>{label} {page} / {pages}</span><button type="button" className="secondary-button" disabled={page >= pages} onClick={() => onPage(page + 1)}>{next}</button></nav>; }
function mask(value: string | undefined) { return value ? `${value.slice(0, 5)}••••` : '—'; }

function FindingGroup({ locale, workspace, group, affected, previous, next, pageLabel }: { locale: Locale; workspace: MicrosoftWorkspace; group: ReturnType<typeof groupWorkspaceFindings>[number]; affected: string; previous: string; next: string; pageLabel: string }) {
  const [page, setPage] = useState(1);
  const ids = [...new Set(group.findings.flatMap(({ entityIds }) => entityIds))];
  const labels = ids.map((id) => workspace.nodes.find((node) => node.id === id)?.label ?? id);
  const current = pageWorkspaceItems(labels, page);
  return <li className={`finding-${group.severity}`}><details><summary><span>{group.severity}</span><strong>{titles[locale][group.ruleId] ?? group.ruleId}</strong><b>{group.count}</b></summary><div className="workspace-finding-evidence"><h4>{affected}</h4><ul>{current.items.map((label, index) => <li key={`${label}-${index}`}>{label}</li>)}</ul>{current.pageCount > 1 && <Pagination locale={locale} page={current.page} pages={current.pageCount} previous={previous} next={next} label={pageLabel} onPage={setPage} />}</div></details></li>;
}
