import { AlertTriangle, Boxes, FileCheck2, LayoutDashboard, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Locale } from '../../content/copy';
import { createChangeSet, removeChangeOperation, type ChangeSetResult, type DhcpChangeOperation } from '../../domain/dhcp-change-set';
import { prepareFindingAction } from '../../domain/finding-actions';
import { listInventoryActions, prepareInventoryAction } from '../../domain/inventory-actions';
import type { ConfigurationWorkspace, WorkspaceFinding } from '../../domain/config-workspace';
import { generatePowerShellPackage, type PowerShellPackage } from '../../domain/powershell-package';
import { summarizeTargetRisk } from '../../domain/remediation-queue';
import { evaluatePackageEligibility } from '../../domain/workspace-view';
import { workspaceRuleCatalog, workspaceRuleCopy } from '../../domain/workspace-rule-catalog';
import { WorkspaceObjectView } from '../workspace/WorkspaceObjectView';
import { RemediationQueue, type RemediationQueueHandle } from './RemediationQueue';
import { WorkspaceActionComposer } from './WorkspaceActionComposer';
import { operationTargetLabel } from './workspace-display';

type Tab = 'overview' | 'remediate' | 'objects' | 'changes' | 'package';
const tabOrder: Tab[] = ['overview', 'remediate', 'objects', 'changes', 'package'];

interface Props {
  locale: Locale;
  workspace: ConfigurationWorkspace;
  fileName: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}

const fallbackExplanation = (locale: Locale) => ({
  rationale: locale === 'de' ? 'Die importierten Felder haben diese Regel ausgelöst.' : 'The imported fields triggered this rule.',
  impact: locale === 'de' ? 'Der Befund sollte im Umgebungskontext geprüft werden.' : 'Review this finding in the environment context.',
  recommendation: locale === 'de' ? 'Evidenz und Quellobjekt vor Änderungen prüfen.' : 'Review evidence and source object before changes.',
});

const findingTitle = (ruleId: string, locale: Locale) => workspaceRuleCopy(ruleId, locale)?.title ?? ruleId;
const findingExplanation = (ruleId: string, locale: Locale) => workspaceRuleCopy(ruleId, locale) ?? fallbackExplanation(locale);
const titles: Record<Locale, Record<string, string>> = {
  en: Object.fromEntries(Object.entries(workspaceRuleCatalog).map(([ruleId, rule]) => [ruleId, rule.copy.en.title])),
  de: Object.fromEntries(Object.entries(workspaceRuleCatalog).map(([ruleId, rule]) => [ruleId, rule.copy.de.title])),
};

export function ConfigurationWorkspaceView({ locale, workspace, fileName, headingRef, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [changeResult, setChangeResult] = useState<ChangeSetResult | null>(null);
  const [generated, setGenerated] = useState<PowerShellPackage | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingTabFocus = useRef<Tab | null>(null);
  const remediationRef = useRef<RemediationQueueHandle>(null);
  const tabs: Array<{ id: Tab; label: string; compactLabel: string }> = locale === 'de'
    ? [{ id: 'overview', label: 'Überblick', compactLabel: 'Überblick' }, { id: 'remediate', label: `Probleme prüfen (${workspace.findings.length})`, compactLabel: 'Probleme' }, { id: 'objects', label: `Bestand (${workspace.nodes.length})`, compactLabel: 'Bestand' }, { id: 'changes', label: `Änderungsplan (${changeResult?.changeSet.operations.length ?? 0})`, compactLabel: 'Plan' }, { id: 'package', label: 'Export', compactLabel: 'Export' }]
    : [{ id: 'overview', label: 'Overview', compactLabel: 'Overview' }, { id: 'remediate', label: `Review issues (${workspace.findings.length})`, compactLabel: 'Issues' }, { id: 'objects', label: `Inventory (${workspace.nodes.length})`, compactLabel: 'Objects' }, { id: 'changes', label: `Change plan (${changeResult?.changeSet.operations.length ?? 0})`, compactLabel: 'Plan' }, { id: 'package', label: 'Export', compactLabel: 'Export' }];
  const selected = useMemo(() => workspace.nodes.find(({ id }) => id === selectedId) ?? null, [selectedId, workspace.nodes]);
  const imported = locale === 'de'
    ? workspace.format === 'microsoft-xml' ? 'Microsoft-DHCP-XML lokal importiert' : `${workspace.vendor}-Konfiguration lokal importiert`
    : workspace.format === 'microsoft-xml' ? 'Microsoft DHCP XML imported locally' : `${workspace.vendor} configuration imported locally`;
  const vendorLabel = workspace.format === 'microsoft-xml' ? 'Microsoft DHCP' : workspace.format === 'kea-json' ? 'ISC Kea' : workspace.format === 'isc-dhcpd' ? 'ISC dhcpd' : 'dnsmasq';

  useEffect(() => {
    if (pendingTabFocus.current !== tab) return;
    tabRefs.current[tabOrder.indexOf(tab)]?.focus();
    pendingTabFocus.current = null;
  }, [tab]);

  function selectTab(next: Tab) {
    setTab(next);
    if (next !== 'objects') setSelectedId(null);
  }

  function navigateToTab(next: Tab) {
    pendingTabFocus.current = next;
    selectTab(next);
  }

  function openObject(id: string) {
    pendingTabFocus.current = null;
    setSelectedId(id);
    setTab('objects');
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    selectTab(tabs[next]!.id);
    tabRefs.current[next]?.focus();
  }

  function prepare(finding: WorkspaceFinding) {
    if (!finding.actionId) return;
    const result = prepareFindingAction(workspace, finding, finding.actionId, changeResult?.changeSet ?? createChangeSet(workspace));
    setChangeResult(result);
    setGenerated(null);
    if (tab !== 'remediate') setTab('changes');
  }

  function acceptChangeResult(result: ChangeSetResult) {
    setChangeResult(result);
    setGenerated(null);
  }

  return <section className="configuration-workspace" aria-labelledby="configuration-workspace-heading">
    <header className="workspace-session-header">
      <div><p className="section-kicker">{vendorLabel}</p><h1 id="configuration-workspace-heading" ref={headingRef} tabIndex={-1}>{locale === 'de' ? 'DHCP-Konfiguration prüfen' : 'DHCP configuration review'}</h1><p><span>{imported}</span> · {fileName}</p><p className="workspace-purpose">{locale === 'de' ? 'DHCPulse erklärt den importierten Zustand, priorisiert Probleme und bereitet überprüfbare Änderungen vor. Es verbindet sich mit keinem Server und führt nichts aus.' : 'DHCPulse explains the imported state, prioritizes issues, and prepares reviewable changes. It never connects to a server or executes anything.'}</p></div>
      <button type="button" className="secondary-button" onClick={onClose}>{locale === 'de' ? 'Andere Konfiguration' : 'Open another configuration'}</button>
    </header>
    <div className="workspace-product-tabs" role="tablist" aria-label={locale === 'de' ? 'Arbeitsbereich' : 'Workspace'}>
      {tabs.map((item, index) => <button key={item.id} id={`workspace-tab-${item.id}`} ref={(node) => { tabRefs.current[index] = node; }} type="button" role="tab" tabIndex={tab === item.id ? 0 : -1} aria-label={item.label} aria-selected={tab === item.id} aria-controls={`workspace-panel-${item.id}`} onClick={() => selectTab(item.id)} onKeyDown={(event) => handleTabKey(event, index)}><span className="workspace-tab-wide" aria-hidden="true">{item.label}</span><span className="workspace-tab-compact" aria-hidden="true">{item.compactLabel}</span></button>)}
    </div>
    <div id={`workspace-panel-${tab}`} className="workspace-product-panel" role="tabpanel" aria-labelledby={`workspace-tab-${tab}`}>
      <div hidden={tab !== 'remediate'}><RemediationQueue ref={remediationRef} locale={locale} workspace={workspace} result={changeResult} titleFor={(ruleId) => findingTitle(ruleId, locale)} explanationFor={(ruleId) => findingExplanation(ruleId, locale)} evidenceLabel={(key) => evidenceLabel(key, locale)} onPrepare={prepare} onPrepareResult={acceptChangeResult} onOpenObject={openObject} onReviewChanges={() => navigateToTab('changes')} /></div>
      {tab === 'overview' && <Overview locale={locale} workspace={workspace} changeCount={changeResult?.changeSet.operations.length ?? 0} onOpenObjects={() => navigateToTab('objects')} onReviewFindings={() => navigateToTab('remediate')} onReviewChanges={() => navigateToTab('changes')} />}
      {tab === 'objects' && <Objects locale={locale} workspace={workspace} selected={selected} result={changeResult} onSelect={setSelectedId} onPrepareResult={acceptChangeResult} />}
      {tab === 'changes' && <Changes locale={locale} workspace={workspace} result={changeResult} onBack={(findingId, targetScopeId) => { if (findingId) remediationRef.current?.focusFinding(findingId, targetScopeId); navigateToTab('remediate'); }} onReviewTarget={openObject} onExport={() => navigateToTab('package')} onRemove={(id) => { if (changeResult) setChangeResult(removeChangeOperation(workspace, changeResult.changeSet, id)); setGenerated(null); }} />}
      {tab === 'package' && <Package locale={locale} workspace={workspace} result={changeResult} generated={generated} onGenerated={setGenerated} onReviewIssues={() => navigateToTab('remediate')} />}
    </div>
  </section>;
}

function Overview({ locale, workspace, changeCount, onOpenObjects, onReviewFindings, onReviewChanges }: { locale: Locale; workspace: ConfigurationWorkspace; changeCount: number; onOpenObjects: () => void; onReviewFindings: () => void; onReviewChanges: () => void }) {
  const metrics = [
    [locale === 'de' ? 'IPv4-Scopes' : 'IPv4 scopes', workspace.summary.ipv4Scopes],
    [locale === 'de' ? 'Reservierungen' : 'Reservations', workspace.summary.reservations],
    [locale === 'de' ? 'Optionen' : 'Options', workspace.summary.options],
    [locale === 'de' ? 'Befunde' : 'Findings', workspace.findings.length],
  ] as const;
  const blockers = workspace.findings.filter(({ severity }) => severity === 'blocker').length;
  const warnings = workspace.findings.filter(({ severity }) => severity === 'warning').length;
  const reviewLabel = blockers > 0
    ? locale === 'de' ? `${blockers} Blocker prüfen` : `Review ${blockers} blockers`
    : locale === 'de' ? `${warnings} Warnungen prüfen` : `Review ${warnings} warnings`;
  return <div className="workspace-overview-product">
    <section className="planner-card workspace-start-here">
      <div><span className="section-kicker">{locale === 'de' ? 'Hier starten' : 'Start here'}</span><h2>{locale === 'de' ? 'Deine Konfiguration ist bereit zur Prüfung' : 'Your configuration is ready for review'}</h2><p>{locale === 'de' ? 'DHCPulse hat die Datei lokal gelesen, den Bestand aufgebaut und auffällige Konstellationen priorisiert. Es wird nichts ausgeführt oder irgendwohin gesendet.' : 'DHCPulse read the file locally, built the inventory, and prioritized notable conditions. Nothing is executed or sent anywhere.'}</p></div>
      <ol aria-label={locale === 'de' ? 'So funktioniert der Arbeitsbereich' : 'How this workspace works'}>
        <li><strong>1</strong><span>{locale === 'de' ? 'Überblick verstehen' : 'Understand the overview'}</span></li>
        <li><strong>2</strong><span>{locale === 'de' ? 'Probleme mit Evidenz prüfen' : 'Review issues with evidence'}</span></li>
        <li><strong>3</strong><span>{locale === 'de' ? 'Änderungen erst ansehen, dann vormerken' : 'Preview changes before adding them'}</span></li>
        <li><strong>4</strong><span>{locale === 'de' ? 'Plan prüfen und sicher exportieren' : 'Review the plan and export safely'}</span></li>
      </ol>
      <div className="workspace-start-actions"><button type="button" className="primary-button" onClick={onReviewFindings}>{reviewLabel}</button><button type="button" className="secondary-button" onClick={onOpenObjects}>{locale === 'de' ? `${workspace.nodes.length} Objekte durchsuchen` : `Browse ${workspace.nodes.length} objects`}</button></div>
    </section>
    <section className="workspace-metrics planner-card">{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
    <section className="workspace-overview-status">
      <article className="planner-card"><h2>{locale === 'de' ? 'Importabdeckung' : 'Import coverage'}</h2><strong>{workspace.coverage.parserWarnings ? (locale === 'de' ? 'Begrenzte Abdeckung' : 'Limited coverage') : (locale === 'de' ? 'Unterstützte Felder gelesen' : 'Supported fields read')}</strong><p>{locale === 'de' ? `Ein begrenzter Parser hat ${workspace.coverage.supportedObjects} unterstützte Objekte und ${workspace.coverage.parserWarnings} Parserhinweise erkannt. Hersteller-Sonderfälle können fehlen.` : `A bounded parser recognized ${workspace.coverage.supportedObjects} supported objects and ${workspace.coverage.parserWarnings} parser warnings. Vendor-specific constructs may be omitted.`}</p></article>
      <article className="planner-card"><h2>{locale === 'de' ? 'Bewertung' : 'Assessment'}</h2><strong>{blockers} {locale === 'de' ? 'Blocker' : 'blockers'} · {warnings} {locale === 'de' ? 'Warnungen' : 'warnings'}</strong><p>{locale === 'de' ? 'Befunde sind priorisiert und mit Evidenz verknüpft.' : 'Findings are prioritized and linked to evidence.'}</p></article>
      <article className="planner-card"><h2>{locale === 'de' ? 'Paketgrenze' : 'Package boundary'}</h2><strong>{workspace.capabilities.executableChanges ? (locale === 'de' ? 'Microsoft-Aktionen verfügbar' : 'Microsoft actions available') : (locale === 'de' ? 'Nur Analyse' : 'Analysis only')}</strong><p>{locale === 'de' ? 'Ausführbare Änderungen benötigen Microsoft XML und vollständige Zielfakten.' : 'Executable changes require Microsoft XML and complete target facts.'}</p></article>
    </section>
    <section className="workspace-overview-grid">
      <article className="planner-card"><LayoutDashboard size={22} aria-hidden="true" /><h2>{locale === 'de' ? 'Konfigurationsbestand' : 'Configuration inventory'}</h2><p>{locale === 'de' ? `${workspace.summary.ipv4Scopes} IPv4-Scopes · ${workspace.summary.pools} Pools · ${workspace.summary.exclusions} Ausschlüsse` : `${workspace.summary.ipv4Scopes} IPv4 scopes · ${workspace.summary.pools} pools · ${workspace.summary.exclusions} exclusions`}</p><button type="button" className="text-button" onClick={onOpenObjects}>{locale === 'de' ? 'Bestand öffnen' : 'Open inventory'}</button></article>
      <article className="planner-card"><AlertTriangle size={22} aria-hidden="true" /><h2>{locale === 'de' ? 'Priorisierte Probleme' : 'Prioritized issues'}</h2><p>{locale === 'de' ? `${blockers} Blocker · ${warnings} Warnungen` : `${blockers} blockers · ${warnings} warnings`}</p><button type="button" className="text-button" onClick={onReviewFindings}>{locale === 'de' ? 'Priorisierte Probleme öffnen' : 'Open prioritized issues'}</button></article>
      <article className="planner-card"><FileCheck2 size={22} aria-hidden="true" /><h2>{locale === 'de' ? 'Änderungsplan' : 'Change plan'}</h2><p>{changeCount > 0 ? (locale === 'de' ? `${changeCount} ${changeCount === 1 ? 'Änderung ist' : 'Änderungen sind'} zur Prüfung vorgemerkt.` : `${changeCount} ${changeCount === 1 ? 'change is' : 'changes are'} ready for review.`) : workspace.capabilities.executableChanges ? (locale === 'de' ? 'Noch keine Änderung vorgemerkt. Vorschläge werden nie automatisch angewendet.' : 'No changes prepared yet. Suggestions are never applied automatically.') : (locale === 'de' ? 'Analyse verfügbar; ein ausführbarer Export benötigt Microsoft XML.' : 'Analysis is available; executable export requires Microsoft XML.')}</p>{changeCount > 0 && <button type="button" className="text-button" onClick={onReviewChanges}>{locale === 'de' ? 'Änderungsplan prüfen' : 'Review change plan'}</button>}</article>
    </section>
  </div>;
}

function Objects({ locale, workspace, selected, result, onSelect, onPrepareResult }: { locale: Locale; workspace: ConfigurationWorkspace; selected: ConfigurationWorkspace['nodes'][number] | null; result: ChangeSetResult | null; onSelect: (id: string | null) => void; onPrepareResult: (result: ChangeSetResult) => void }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | ConfigurationWorkspace['nodes'][number]['kind']>('all');
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingDetailFocus = useRef(Boolean(selected));
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = workspace.nodes.filter((node) => (kind === 'all' || node.kind === kind) && (!normalized || node.searchableText.includes(normalized)));
  const results = filtered.slice(0, 100);
  const counts = workspace.nodes.reduce<Record<string, number>>((current, node) => ({ ...current, [node.kind]: (current[node.kind] ?? 0) + 1 }), {});
  const searchLabel = locale === 'de' ? 'Konfigurationsobjekte durchsuchen' : 'Search configuration objects';
  const selectedActions = selected ? listInventoryActions(workspace, selected) : [];
  useEffect(() => {
    if (!selected || !pendingDetailFocus.current) return;
    detailHeadingRef.current?.focus();
    pendingDetailFocus.current = false;
  }, [selected]);
  function selectObject(id: string) {
    pendingDetailFocus.current = true;
    onSelect(id);
  }
  function selectKind(next: 'all' | ConfigurationWorkspace['nodes'][number]['kind']) {
    setQuery('');
    setKind(next);
    const firstId = next === 'all' ? null : workspace.nodes.find((node) => node.kind === next)?.id ?? null;
    if (firstId) pendingDetailFocus.current = true;
    onSelect(firstId);
  }
  return <div className="workspace-object-product">
    <section className="planner-card workspace-object-filter-rail">
      <span className="section-kicker">{locale === 'de' ? 'Bestand filtern' : 'Filter inventory'}</span>
      <h2>{locale === 'de' ? 'Objekttypen' : 'Object types'}</h2>
      <p>{locale === 'de' ? 'Wähle eine Kategorie, um die zugehörigen Objekte direkt anzuzeigen.' : 'Choose a category to show its objects immediately.'}</p>
      <div className="workspace-object-counts" role="group" aria-label={locale === 'de' ? 'Objekttyp filtern' : 'Filter by object type'}>
        <button type="button" aria-pressed={kind === 'all'} aria-label={locale === 'de' ? `Alle Objekttypen anzeigen (${workspace.nodes.length})` : `Show all object types (${workspace.nodes.length})`} onClick={() => selectKind('all')}><span>{locale === 'de' ? 'Alle Typen' : 'All types'}</span><b>{workspace.nodes.length}</b></button>
        {Object.entries(counts).map(([entryKind, count]) => { const label = workspaceKindLabel(entryKind as ConfigurationWorkspace['nodes'][number]['kind'], locale); return <button type="button" key={entryKind} aria-pressed={kind === entryKind} aria-label={locale === 'de' ? `Objekte vom Typ ${label} anzeigen (${count})` : `Show ${label} objects (${count})`} onClick={() => selectKind(entryKind as ConfigurationWorkspace['nodes'][number]['kind'])}><span>{label}</span><b>{count}</b></button>; })}
      </div>
    </section>
    <section className="planner-card workspace-object-list-pane" aria-label={locale === 'de' ? 'Objektergebnisse' : 'Object results'}>
      <label className="workspace-search"><Search size={18} aria-hidden="true" /><span className="visually-hidden">{searchLabel}</span><input type="search" aria-label={searchLabel} placeholder={locale === 'de' ? 'Name, Adresse, Netz, Option oder Client-ID' : 'Name, address, network, option, or client ID'} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <header><div><span className="section-kicker">{locale === 'de' ? 'Ergebnisse' : 'Results'}</span><h2>{locale === 'de' ? 'Objektbestand' : 'Object inventory'}</h2></div><strong>{filtered.length > 100 ? '100+' : filtered.length}</strong></header>
      <p>{locale === 'de' ? 'Maximal 100 Objekte werden gleichzeitig angezeigt.' : 'At most 100 objects are shown at once.'}</p>
      {results.length ? <ul className="workspace-object-results">{results.map((node) => <li key={node.id}><button type="button" className={selected?.id === node.id ? 'active' : ''} onClick={() => selectObject(node.id)}><strong>{node.label}</strong>{node.secondary && <span>{node.secondary}</span>}<small>{workspaceKindLabel(node.kind, locale)}</small></button></li>)}</ul> : <p className="workspace-object-empty">{locale === 'de' ? 'Keine passenden Objekte.' : 'No matching objects.'}</p>}
    </section>
    {selected ? <WorkspaceObjectView locale={locale} workspace={workspace} selected={selected} headingRef={detailHeadingRef} actionPanel={selectedActions.length > 0 ? <WorkspaceActionComposer
      locale={locale}
      workspace={workspace}
      subjectKey={`inventory:${selected.id}`}
      actions={selectedActions}
      currentResult={result}
      build={(action, values) => prepareInventoryAction(workspace, selected, action.id, result?.changeSet ?? createChangeSet(workspace), values)}
      onCommit={onPrepareResult}
    /> : <section className="workspace-action-unavailable"><h3>{locale === 'de' ? 'Für dieses Objekt nur Analyse' : 'Analysis only for this object'}</h3><p>{workspace.format !== 'microsoft-xml'
      ? (locale === 'de' ? 'Ausführbare Änderungspakete sind auf Microsoft-DHCP-XML beschränkt.' : 'Executable change packages are limited to Microsoft DHCP XML.')
      : (locale === 'de' ? 'Richtlinien-, Failover- und DHCPv6-Änderungen sowie Objekte ohne vollständige Identität benötigen zusätzlichen Serverkontext und bleiben deshalb schreibgeschützt.' : 'Policy, failover, and DHCPv6 changes, plus objects without complete identity, need additional server context and therefore remain read-only.')}</p></section>} /> : <Message title={locale === 'de' ? 'Objekt auswählen' : 'Select an object'} text={locale === 'de' ? 'Suche nach einem Objekt und öffne es für Details und Provenienz.' : 'Search for an object and open it for details and provenance.'} />}
  </div>;
}

function Changes({ locale, workspace, result, onRemove, onBack, onReviewTarget, onExport }: { locale: Locale; workspace: ConfigurationWorkspace; result: ChangeSetResult | null; onRemove: (id: string) => void; onBack: (findingId?: string, targetScopeId?: string) => void; onReviewTarget: (id: string) => void; onExport: () => void }) {
  if (!workspace.capabilities.executableChanges) return <Message title={locale === 'de' ? 'Analyse ohne ausführbare Änderung' : 'Analysis without executable changes'} text={locale === 'de' ? 'Für ein geprüftes PowerShell-Paket wird ein Microsoft-DHCP-XML-Export benötigt.' : 'A Microsoft DHCP XML export is required for a guarded PowerShell package.'} />;
  if (!result?.changeSet.operations.length) return <Message title={locale === 'de' ? 'Noch keine Änderung vorgemerkt' : 'No changes prepared'} text={locale === 'de' ? 'Prüfe ein Problem, sieh dir die vorgeschlagene Änderung an und füge sie anschließend dem Änderungsplan hinzu.' : 'Review an issue, preview its suggested change, and then add it to the change plan.'} />;
  return <section className="planner-card workspace-prepared-changes"><header><div><span className="section-kicker">{locale === 'de' ? 'Prüfschritt' : 'Review step'}</span><h2>{locale === 'de' ? 'Vorgemerkte Änderungen' : 'Prepared changes'}</h2></div><button type="button" className="text-button" onClick={() => onBack()}>{locale === 'de' ? 'Zurück zu den Problemen' : 'Back to issues'}</button></header><ol>{result.changeSet.operations.map((operation) => {
    const finding = workspace.findings.find(({ id }) => id === operation.rationaleFindingId);
    const before = operation.kind === 'exclusion.add' ? (locale === 'de' ? 'Kein Ausschluss für diese Adresse' : 'No exclusion for this address') : formatOperationState(operation, 'before', locale);
    const after = formatOperationState(operation, 'after', locale);
    const issues = result.issues.filter(({ operationId }) => operationId === operation.id);
    return <li key={operation.id}><div className="workspace-change-review"><strong>{operationLabel(operation.kind, locale)}</strong><dl><div><dt>{locale === 'de' ? 'Ziel' : 'Target'}</dt><dd>{operationTargetLabel(workspace, operation, locale)}</dd></div><div><dt>{locale === 'de' ? 'Begründung' : 'Rationale'}</dt><dd>{finding ? findingTitle(finding.ruleId, locale) : locale === 'de' ? 'Bestandsänderung gegen die importierte Konfiguration validiert' : 'Inventory change validated against the imported configuration'}</dd></div><div><dt>{locale === 'de' ? 'Vorher' : 'Before'}</dt><dd>{before}</dd></div><div><dt>{locale === 'de' ? 'Nachher' : 'After'}</dt><dd>{after}</dd></div></dl>{issues.length > 0 && <ul className="workspace-change-issues">{issues.map((issue) => <li key={`${operation.id}-${issue.code}`}>{issueLabel(issue.code, locale)}</li>)}</ul>}</div><div className="workspace-change-actions">{finding ? <button type="button" className="text-button" onClick={() => onBack(finding.id, operation.targetId)}>{locale === 'de' ? 'Begründung beim Problem prüfen' : 'Review issue rationale'}</button> : <button type="button" className="text-button" onClick={() => onReviewTarget(operation.targetId)}>{operation.kind === 'scope.clone' ? (locale === 'de' ? 'Quell-Scope im Bestand prüfen' : 'Review source scope in inventory') : (locale === 'de' ? 'Ziel im Bestand prüfen' : 'Review target in inventory')}</button>}<button type="button" className="text-button" onClick={() => onRemove(operation.id)}>{locale === 'de' ? 'Entfernen' : 'Remove'}</button></div></li>;
  })}</ol>{result.issues.length > 0 && <ul className="workspace-change-issues">{result.issues.map((issue) => <li key={`${issue.operationId ?? 'set'}-${issue.code}`}>{issueLabel(issue.code, locale)}</li>)}</ul>}<div className="workspace-change-completion"><p className={result.valid ? 'validation-ok' : 'field-error'}>{result.valid ? (locale === 'de' ? 'Validierung bestanden.' : 'Validation passed.') : (locale === 'de' ? 'Validierung blockiert.' : 'Validation blocked.')}</p><button type="button" className="primary-button" disabled={!result.valid} onClick={onExport}>{locale === 'de' ? 'Export prüfen' : 'Review export'}</button></div></section>;
}

function formatOperationState(operation: DhcpChangeOperation, side: 'before' | 'after', locale: Locale) {
  if (operation.kind === 'scope-lease.set') {
    const seconds = side === 'before' ? operation.beforeSeconds : operation.afterSeconds;
    return `${seconds} ${locale === 'de' ? 'Sekunden' : 'seconds'}`;
  }
  if (!(side in operation)) return locale === 'de' ? 'Nicht vorhanden' : 'Not present';
  const state = operation[side as keyof typeof operation] as unknown;
  if (!state || typeof state !== 'object') return String(state ?? '');
  const fields = state as Record<string, unknown>;
  if ('cidr' in fields && 'start' in fields && 'end' in fields) return `${String(fields.cidr)} · ${String(fields.start)} – ${String(fields.end)}`;
  if ('start' in fields && 'end' in fields) return fields.start === fields.end ? String(fields.start) : `${String(fields.start)} – ${String(fields.end)}`;
  if ('address' in fields && 'clientId' in fields) return `${String(fields.address)} · ${String(fields.clientId)}${fields.hostname ? ` · ${String(fields.hostname)}` : ''}`;
  if ('code' in fields && 'value' in fields) return `Option ${String(fields.code)} · ${Array.isArray(fields.value) ? fields.value.join(', ') : String(fields.value)}`;
  return locale === 'de' ? 'Strukturierte Konfigurationsdaten' : 'Structured configuration data';
}

function Package({ locale, workspace, result, generated, onGenerated, onReviewIssues }: { locale: Locale; workspace: ConfigurationWorkspace; result: ChangeSetResult | null; generated: PowerShellPackage | null; onGenerated: (value: PowerShellPackage | null) => void; onReviewIssues: () => void }) {
  const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const generation = useRef(0);
  useEffect(() => () => {
    generation.current += 1;
  }, [result]);
  if (!workspace.capabilities.executableChanges) return <Message title={locale === 'de' ? 'Microsoft XML erforderlich' : 'Microsoft XML required'} text={locale === 'de' ? 'Ein Microsoft-DHCP-XML-Export ist für ausführbare Änderungen erforderlich.' : 'A Microsoft DHCP XML export is required for executable changes.'} />;
  const checked = result ? evaluatePackageEligibility(workspace, result) : null;
  const hasWarnings = Boolean(checked?.warnings.length);
  const hardBlocked = Boolean(checked && !checked.eligible);
  const warningsPending = Boolean(checked?.eligible && hasWarnings && !warningsAcknowledged);
  const eligible = Boolean(checked?.eligible) && !warningsPending;
  async function generate() {
    if (!result || !eligible || generating) return;
    const token = ++generation.current;
    setGenerating(true);
    setGenerationError('');
    onGenerated(null);
    try {
      const next = await generatePowerShellPackage(workspace, result, locale, new Date());
      if (generation.current !== token) return;
      onGenerated(next);
    } catch {
      if (generation.current !== token) return;
      setGenerationError(locale === 'de'
        ? 'Paketerzeugung fehlgeschlagen. Es wurden keine Dateien erstellt.'
        : 'Package generation failed. No files were created.');
    } finally {
      if (generation.current === token) setGenerating(false);
    }
  }
  const plannedArtifacts = ['01-Preflight.ps1', '02-Apply.ps1', '03-Verify.ps1', '04-Rollback.ps1', 'CHANGE.md', 'change-set.json', 'manifest.json'];
  const risk = result ? summarizeTargetRisk(workspace, result) : null;
  const targetCount = checked ? checked.targetScopeIds.length + checked.newScopes.length : 0;
  const operationCount = result?.changeSet.operations.length ?? 0;
  const readinessLabel = hardBlocked
    ? (locale === 'de' ? 'Erzeugung blockiert' : 'Generation blocked')
    : warningsPending
      ? (locale === 'de' ? 'Warnungen prüfen, um fortzufahren' : 'Review warnings to continue')
      : (locale === 'de' ? 'Bereit zur Erzeugung' : 'Ready to generate');
  const planSummary = locale === 'de'
    ? `${operationCount} ${operationCount === 1 ? 'vorgemerkte Änderung' : 'vorgemerkte Änderungen'} · ${targetCount} ${targetCount === 1 ? 'Ziel-Scope' : 'Ziel-Scopes'}`
    : `${operationCount} ${operationCount === 1 ? 'prepared change' : 'prepared changes'} · ${targetCount} ${targetCount === 1 ? 'target scope' : 'target scopes'}`;
  return <section className="planner-card workspace-package-panel"><FileCheck2 size={24} aria-hidden="true" /><h2>{locale === 'de' ? 'Abgesichertes Änderungspaket' : 'Guarded change package'}</h2><p>{locale === 'de' ? 'DHCPulse führt nichts aus. Prüfe Preflight, Apply, Verify und Rollback vor der Ausführung.' : 'DHCPulse executes nothing. Review Preflight, Apply, Verify, and Rollback before execution.'}</p><section className="workspace-artifact-plan"><h3>{locale === 'de' ? 'Enthaltene Dateien' : 'Included files'}</h3><ul>{plannedArtifacts.map((name) => <li key={name}><code>{name}</code></li>)}</ul></section>{!result?.changeSet.operations.length ? <section className="workspace-package-empty" role="status"><h3>{locale === 'de' ? 'Zuerst eine Änderung vorbereiten' : 'Prepare a change first'}</h3><p>{locale === 'de' ? 'Der Export wird verfügbar, nachdem du ein Problem geprüft, die vorgeschlagene Änderung angesehen und dem Änderungsplan hinzugefügt hast.' : 'Export becomes available after you preview and add at least one change to the change plan.'}</p><button type="button" className="secondary-button" onClick={onReviewIssues}>{locale === 'de' ? 'Probleme mit Änderungsvorschlag prüfen' : 'Review changeable issues'}</button></section> : <>{risk && <section className="workspace-target-risk"><h3>{locale === 'de' ? 'Risiko der Ziel-Scopes' : 'Target scope risk'}</h3><div><strong>{locale === 'de' ? 'Ziele' : 'Targets'}</strong><ul>{risk.targetScopeIds.map((id) => { const scope = workspace.configuration.ipv4Scopes.find((candidate) => candidate.id === id); return <li key={id}>Scope {scope?.cidr ?? id} · {scope?.name ?? id}</li>; })}{risk.newScopes.map((scope) => <li key={scope.cidr}>{locale === 'de' ? 'Neuer Scope' : 'New scope'} {scope.cidr} · {scope.name}</li>)}</ul></div>{risk.blockerRules.length > 0 && <div><strong>{locale === 'de' ? 'Blockierende Regeln' : 'Blocking rules'}</strong><ul>{risk.blockerRules.map(({ ruleId, count }) => <li key={ruleId}>{titles[locale][ruleId] ?? ruleId} ({count})</li>)}</ul></div>}{risk.existingBlockerRules.length > 0 && <div><strong>{locale === 'de' ? 'Bestehende Blocker (nur Kontext)' : 'Existing blockers (context only)'}</strong><ul>{risk.existingBlockerRules.map(({ ruleId, count }) => <li key={ruleId}>{titles[locale][ruleId] ?? ruleId} ({count})</li>)}</ul></div>}{risk.warningRules.length > 0 && <div><strong>{locale === 'de' ? 'Warnungsregeln' : 'Warning rules'}</strong><ul>{risk.warningRules.map(({ ruleId, count }) => <li key={ruleId}>{titles[locale][ruleId] ?? ruleId} ({count})</li>)}</ul></div>}</section>}{checked && <div id="workspace-package-eligibility" className={`workspace-package-eligibility ${eligible ? 'eligible' : 'blocked'}`}><strong>{readinessLabel}</strong>{checked.blockers.length > 0 && <ul>{checked.blockers.map((blocker) => <li key={blocker}>{eligibilityLabel(blocker, locale)}</li>)}</ul>}{checked.warnings.length > 0 && <><ul>{checked.warnings.map((warning) => <li key={warning}>{eligibilityLabel(warning, locale)}</li>)}</ul>{!hardBlocked && <label className="workspace-warning-ack"><input type="checkbox" checked={warningsAcknowledged} onChange={(event) => setWarningsAcknowledged(event.target.checked)} />{locale === 'de' ? 'Ich habe die Warnungen der Ziel-Scopes geprüft.' : 'I reviewed the target warnings.'}</label>}</>}<span>{planSummary}</span>{hardBlocked && <button type="button" className="text-button" onClick={onReviewIssues}>{locale === 'de' ? 'Blockierende Probleme prüfen' : 'Review blocking issues'}</button>}</div>}<button type="button" className="primary-button" aria-describedby="workspace-package-eligibility" disabled={!eligible || generating} onClick={() => void generate()}>{generating ? (locale === 'de' ? 'Paket wird erzeugt…' : 'Generating package…') : (locale === 'de' ? 'Abgesichertes Paket erzeugen' : 'Generate guarded package')}</button>{generationError && <p className="field-error" role="alert">{generationError}</p>}{generated && <PackageDownloads key={generated.artifacts.at(-1)?.content} locale={locale} generated={generated} />}</>}</section>;
}

function PackageDownloads({ locale, generated }: { locale: Locale; generated: PowerShellPackage }) {
  const [lastRequested, setLastRequested] = useState<string | null>(null);
  const [downloads] = useState(() => generated.artifacts.map((artifact) => ({
    name: artifact.name,
    url: URL.createObjectURL(new Blob([artifact.content], { type: artifact.mimeType })),
  })));
  useEffect(() => () => downloads.forEach(({ url }) => URL.revokeObjectURL(url)), [downloads]);
  return <section className="workspace-artifacts"><h3>{locale === 'de' ? 'Paket bereit' : 'Package ready'}</h3>{downloads.map(({ name, url }) => <a className="secondary-button" key={name} href={url} download={name} onClick={() => setLastRequested(name)}>{locale === 'de' ? 'Herunterladen' : 'Download'} {name}</a>)}<p className="workspace-download-status" role="status">{lastRequested ? (locale === 'de' ? `Download angefordert: ${lastRequested}` : `Download requested: ${lastRequested}`) : ''}</p></section>;
}

function Message({ title, text }: { title: string; text: string }) { return <section className="planner-card workspace-message"><Boxes size={24} aria-hidden="true" /><h2>{title}</h2><p>{text}</p></section>; }

function workspaceKindLabel(kind: ConfigurationWorkspace['nodes'][number]['kind'], locale: Locale) {
  const labels = locale === 'de' ? { server: 'Server', scope: 'IPv4-Scope', pool: 'Pool', exclusion: 'Ausschluss', reservation: 'Reservierung', option: 'Option', policy: 'Richtlinie', failover: 'Failover', dhcpv6: 'DHCPv6' } : { server: 'Server', scope: 'IPv4 scope', pool: 'Pool', exclusion: 'Exclusion', reservation: 'Reservation', option: 'Option', policy: 'Policy', failover: 'Failover', dhcpv6: 'DHCPv6' };
  return labels[kind];
}

function operationLabel(kind: DhcpChangeOperation['kind'], locale: Locale) {
  const labels: Record<DhcpChangeOperation['kind'], [string, string]> = {
    'scope-range.set': ['Adressbereich ändern', 'Change address range'],
    'scope-lease.set': ['Lease-Dauer ändern', 'Change lease duration'],
    'exclusion.add': ['Ausschluss hinzufügen', 'Add exclusion'],
    'exclusion.remove': ['Ausschlussbereich entfernen', 'Remove exclusion range'],
    'reservation.add': ['Reservierung hinzufügen', 'Add reservation'],
    'reservation.update': ['Reservierung aktualisieren', 'Update reservation'],
    'reservation.remove': ['Reservierung entfernen', 'Remove reservation'],
    'option.set': ['Optionswert festlegen', 'Set option value'],
    'option.remove': ['Option entfernen', 'Remove option'],
    'scope.clone': ['Scope klonen', 'Clone scope'],
  };
  return labels[kind][locale === 'de' ? 0 : 1];
}

function issueLabel(code: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    'before-state-mismatch': ['Der Ausgangszustand stimmt nicht mit dem Import überein.', 'The current state does not match the import.'],
    'exclusion-outside-new-range': ['Ein Ausschluss liegt außerhalb des neuen Bereichs.', 'An exclusion is outside the new range.'],
    'range-outside-scope': ['Der Bereich liegt außerhalb des Scopes.', 'The range is outside the scope.'],
    'exclusion-overlap': ['Der Ausschluss überschneidet sich mit einem vorhandenen Ausschluss.', 'The exclusion overlaps an existing exclusion.'],
    'reservation-outside-scope': ['Die Reservierung liegt außerhalb des Scopes.', 'The reservation is outside the scope.'],
    'unsupported-option': ['Die DHCP-Option wird für Änderungen nicht unterstützt.', 'The DHCP option is not supported for changes.'],
    'invalid-option-value': ['Der Wert der DHCP-Option ist ungültig.', 'The DHCP option value is invalid.'],
  };
  return labels[code]?.[locale === 'de' ? 0 : 1] ?? (locale === 'de' ? 'Die Änderung konnte nicht sicher validiert werden.' : 'The change could not be validated safely.');
}

function eligibilityLabel(code: string, locale: Locale) {
  if (code.startsWith('target-warning-findings:')) {
    const count = code.split(':')[1] ?? '0';
    return locale === 'de' ? `${count} Warnungen betreffen die Ziel-Scopes.` : `${count} warnings affect the target scopes.`;
  }
  const labels: Record<string, [string, string]> = {
    'change-set-empty': ['Es wurde noch keine Änderung vorbereitet.', 'No change has been prepared.'],
    'change-set-invalid': ['Der Änderungssatz enthält Validierungsfehler.', 'The change set contains validation errors.'],
    'server-name-missing': ['Im Export fehlt der Servername.', 'The server name is missing from the export.'],
    'target-facts-missing': ['Für mindestens einen Ziel-Scope fehlen erforderliche Fakten.', 'Required facts are missing for at least one target scope.'],
    'target-blocker-findings': ['Ein Blocker betrifft mindestens einen Ziel-Scope.', 'A blocker affects at least one target scope.'],
  };
  return labels[code]?.[locale === 'de' ? 0 : 1] ?? (locale === 'de' ? 'Die Paketprüfung hat ein unbekanntes Problem gemeldet.' : 'The package check reported an unknown problem.');
}

function evidenceLabel(key: string, locale: Locale) {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('-', ' ').toLocaleLowerCase();
  if (locale === 'en') return words.replace(/^./, (letter) => letter.toLocaleUpperCase());
  const labels: Record<string, string> = {
    address: 'Adresse', cidr: 'Netz', count: 'Anzahl', gateway: 'Gateway',
    'pool start': 'Pool-Start', 'pool end': 'Pool-Ende', 'option code': 'Optionscode',
    'server value': 'Serverwert', 'scope value': 'Scope-Wert',
    'utilization percent': 'Auslastung in Prozent', capacity: 'Kapazität', used: 'Belegt',
    identifier: 'Client-ID', 'scope id': 'Scope-ID', relationship: 'Failover-Beziehung',
  };
  return labels[words] ?? 'Evidenz';
}
