import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Eye, ShieldAlert } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Locale } from '../../content/copy';
import { createChangeSet, type ChangeSetResult, type DhcpChangeOperation } from '../../domain/dhcp-change-set';
import { listFindingActions, prepareFindingAction } from '../../domain/finding-actions';
import type { ConfigurationWorkspace, WorkspaceFinding } from '../../domain/config-workspace';
import {
  buildRemediationContext,
  buildRemediationQueue,
  countPreparedRemediationOccurrences,
  countRemediationOccurrences,
  findRemediationOccurrenceIndex,
  type RemediationQueueItem,
  type RemediationSection,
} from '../../domain/remediation-queue';
import { WorkspaceActionComposer } from './WorkspaceActionComposer';
import { operationTargetLabel } from './workspace-display';

interface Explanation { rationale: string; impact: string; recommendation: string }

interface Props {
  locale: Locale;
  workspace: ConfigurationWorkspace;
  result: ChangeSetResult | null;
  titleFor: (ruleId: string) => string;
  explanationFor: (ruleId: string) => Explanation;
  evidenceLabel: (key: string) => string;
  onPrepare: (finding: WorkspaceFinding) => void;
  onPrepareResult: (result: ChangeSetResult) => void;
  onOpenObject: (id: string) => void;
  onReviewChanges: () => void;
}

const sectionOrder: RemediationSection[] = ['act-now', 'review', 'observe'];
const pageSize = 50;

export interface RemediationQueueHandle {
  focusFinding: (findingId: string, targetScopeId?: string) => void;
}

export const RemediationQueue = forwardRef<RemediationQueueHandle, Props>(function RemediationQueue({
  locale, workspace, result, titleFor, explanationFor, evidenceLabel,
  onPrepare, onPrepareResult, onOpenObject, onReviewChanges,
}, ref) {
  const queue = useMemo(() => buildRemediationQueue(workspace, result), [workspace, result]);
  const allItems = sectionOrder.flatMap((section) => queue.sections[section]);
  const [selectedId, setSelectedId] = useState(allItems[0]?.id ?? '');
  const [occurrenceIndex, setOccurrenceIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [scopeId, setScopeId] = useState('all');
  const [severity, setSeverity] = useState<'all' | WorkspaceFinding['severity']>('all');
  const [actionability, setActionability] = useState<'all' | 'actionable' | 'analysis'>('all');
  const [pages, setPages] = useState<Record<RemediationSection, number>>({ 'act-now': 1, review: 1, observe: 1 });
  const [preview, setPreview] = useState<ChangeSetResult | null>(null);
  const narrowLayout = useNarrowLayout();
  const contextHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusContext = useRef(false);
  const preparedIds = new Set(result?.changeSet.operations.map(({ rationaleFindingId }) => rationaleFindingId) ?? []);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = (item: RemediationQueueItem) => (scopeId === 'all' || item.scopeIds.includes(scopeId))
    && (severity === 'all' || item.severity === severity)
    && (actionability === 'all' || (actionability === 'actionable' ? item.actionable : !item.actionable))
    && (!normalizedQuery || titleFor(item.ruleId).toLocaleLowerCase().includes(normalizedQuery));
  const pageData = Object.fromEntries(sectionOrder.map((section) => {
    const items = queue.sections[section].filter(filtered);
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(pages[section], pageCount);
    return [section, { items, page, pageCount, pageItems: items.slice((page - 1) * pageSize, page * pageSize) }];
  })) as Record<RemediationSection, { items: RemediationQueueItem[]; page: number; pageCount: number; pageItems: RemediationQueueItem[] }>;
  const visibleItems = sectionOrder.flatMap((section) => pageData[section].pageItems);
  const selected = visibleItems.find(({ id }) => id === selectedId) ?? visibleItems[0];
  const activeScope = scopeId === 'all' ? undefined : scopeId;
  const context = selected ? buildRemediationContext(workspace, selected, occurrenceIndex, activeScope) : null;
  const contextFindingId = context?.finding.id;

  useEffect(() => {
    if (!focusContext.current || !contextHeadingRef.current) return;
    contextHeadingRef.current?.focus();
    focusContext.current = false;
  }, [contextFindingId]);

  function select(item: RemediationQueueItem) {
    if (item.id === selected?.id) contextHeadingRef.current?.focus();
    else focusContext.current = true;
    setSelectedId(item.id);
    setOccurrenceIndex(0);
    setPreview(null);
  }

  function changePage(section: RemediationSection, nextPage: number) {
    const nextItem = pageData[section].items[(nextPage - 1) * pageSize];
    setPages((value) => ({ ...value, [section]: nextPage }));
    if (nextItem) select(nextItem);
  }

  function resetPaging() {
    setPages({ 'act-now': 1, review: 1, observe: 1 });
  }

  function previewAction(finding: WorkspaceFinding) {
    if (!finding.actionId) return;
    setPreview(prepareFindingAction(workspace, finding, finding.actionId, result?.changeSet ?? createChangeSet(workspace)));
  }

  useImperativeHandle(ref, () => ({
    focusFinding(findingId: string, targetScopeId?: string) {
      const item = allItems.find((candidate) => candidate.findingIds.includes(findingId));
      if (!item) return;
      const scopedTarget = targetScopeId && workspace.configuration.ipv4Scopes.some(({ id }) => id === targetScopeId)
        ? targetScopeId : undefined;
      const navigableItems = queue.sections[item.section].filter((candidate) => !scopedTarget || candidate.scopeIds.includes(scopedTarget));
      const filteredIndex = navigableItems.findIndex(({ id }) => id === item.id);
      setQuery('');
      setScopeId(scopedTarget ?? 'all');
      setSeverity('all');
      setActionability('all');
      setPages((value) => ({ ...value, [item.section]: Math.floor(Math.max(0, filteredIndex) / pageSize) + 1 }));
      setSelectedId(item.id);
      setOccurrenceIndex(Math.max(0, findRemediationOccurrenceIndex(workspace, item, findingId, scopedTarget)));
      setPreview(null);
      focusContext.current = true;
    },
  }), [allItems, queue, workspace]);

  function renderContextPanel() {
    if (!context || !selected) return null;
    const actions = listFindingActions(workspace, context.finding);
    const legacyAction = actions.length === 1
      && (actions[0]!.id === 'exclude-reserved-address' || actions[0]!.id === 'exclude-gateway-address');
    const composerActions = legacyAction ? [] : actions;
    return <aside className="planner-card remediation-context" aria-label={locale === 'de' ? 'Befundkontext' : 'Finding context'}>
      <header><span className={`remediation-severity finding-${context.finding.severity}`}>{severityLabel(context.finding.severity, locale)}</span><h2 ref={contextHeadingRef} tabIndex={-1}>{titleFor(context.finding.ruleId)}</h2><small>{context.scopeLabel ?? (locale === 'de' ? 'Globaler Kontext' : 'Global context')}</small></header>
      {context.occurrenceCount > 1 && <div className="remediation-occurrence"><button type="button" aria-label={locale === 'de' ? 'Vorheriger Befund' : 'Previous occurrence'} disabled={context.occurrenceIndex === 0} onClick={() => { setPreview(null); setOccurrenceIndex((value) => Math.max(0, value - 1)); }}><ChevronLeft size={17} /></button><span>{locale === 'de' ? 'Vorkommen' : 'Occurrence'} {context.occurrenceIndex + 1} {locale === 'de' ? 'von' : 'of'} {context.occurrenceCount}</span><button type="button" aria-label={locale === 'de' ? 'Nächster Befund' : 'Next occurrence'} disabled={context.occurrenceIndex + 1 >= context.occurrenceCount} onClick={() => { setPreview(null); setOccurrenceIndex((value) => Math.min(context.occurrenceCount - 1, value + 1)); }}><ChevronRight size={17} /></button></div>}
      <ContextBlock title={locale === 'de' ? 'Warum markiert' : 'Why flagged'} text={explanationFor(context.finding.ruleId).rationale} />
      <ContextBlock title={locale === 'de' ? 'Betriebliche Auswirkung' : 'Operational impact'} text={explanationFor(context.finding.ruleId).impact} />
      <ContextBlock title={locale === 'de' ? 'Empfehlung' : 'Recommendation'} text={explanationFor(context.finding.ruleId).recommendation} />
      <section className="remediation-evidence"><h3>{locale === 'de' ? 'Evidenz' : 'Evidence'}</h3><dl>{Object.entries(context.finding.evidence).map(([key, value]) => <div key={key}><dt>{evidenceLabel(key)}</dt><dd>{String(value)}</dd></div>)}</dl></section>
      <section className="remediation-provenance"><h3>{locale === 'de' ? 'Quelle und Beziehungen' : 'Source and relationships'}</h3><p>{context.finding.source}</p><p>{context.entityIds.length} {locale === 'de' ? 'verknüpfte Objekte' : 'linked objects'} · {context.relatedFindingIds.length} {locale === 'de' ? 'verwandte Befunde' : 'related findings'}</p></section>
      {!preparedIds.has(context.finding.id) && composerActions.length > 0 && <WorkspaceActionComposer
        locale={locale}
        workspace={workspace}
        subjectKey={`finding:${context.finding.id}`}
        actions={composerActions}
        currentResult={result}
        build={(action, values) => prepareFindingAction(workspace, context.finding, action.id, result?.changeSet ?? createChangeSet(workspace), values)}
        onCommit={onPrepareResult}
      />}
      {preview && !preparedIds.has(context.finding.id) && <OperationPreview locale={locale} workspace={workspace} operation={preview.changeSet.operations.at(-1)!} result={preview} title={titleFor(context.finding.ruleId)} />}
      {preparedIds.has(context.finding.id) && result && <OperationPreview locale={locale} workspace={workspace} operation={result.changeSet.operations.find(({ rationaleFindingId }) => rationaleFindingId === context.finding.id)!} result={result} title={titleFor(context.finding.ruleId)} />}
      <footer>{context.finding.entityIds[0] && <button type="button" className="text-button" onClick={() => onOpenObject(context.finding.entityIds[0]!)}>{locale === 'de' ? 'Objekt öffnen' : 'Open object'}</button>}<a className="text-button" href={context.finding.sources[0]} target="_blank" rel="noreferrer">{locale === 'de' ? 'Herstellerdokumentation' : 'Vendor documentation'}</a>{legacyAction && !preparedIds.has(context.finding.id) && !preview && <button type="button" className="primary-button" onClick={() => previewAction(context.finding)}>{locale === 'de' ? 'Änderung prüfen' : 'Preview change'}</button>}{preview && !preparedIds.has(context.finding.id) && <button type="button" className="primary-button" disabled={!preview.valid} onClick={() => { if (!preview.valid) return; onPrepare(context.finding); setPreview(null); }}>{locale === 'de' ? 'Zur Prüfung hinzufügen' : 'Add to review'}</button>}</footer>
    </aside>;
  }

  return <div className="remediation-workspace">
    <section className="planner-card remediation-command-bar" aria-label={locale === 'de' ? 'Arbeitsliste filtern' : 'Filter work queue'}>
      <div><span className="section-kicker">{locale === 'de' ? 'Probleme prüfen' : 'Review issues'}</span><strong>{workspace.findings.length} {locale === 'de' ? 'Probleme nach Dringlichkeit sortiert' : 'issues sorted by urgency'}</strong><small>{locale === 'de' ? 'Wähle ein Problem, prüfe Evidenz und Auswirkungen und sieh dir eine mögliche Änderung an.' : 'Select an issue, review its evidence and impact, then preview an available change.'}</small></div>
      <label><span>{locale === 'de' ? 'Suche' : 'Search'}</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setOccurrenceIndex(0); setPreview(null); resetPaging(); }} placeholder={locale === 'de' ? 'Regel oder Problem' : 'Rule or problem'} /></label>
      <label><span>{locale === 'de' ? 'Scope' : 'Scope'}</span><select value={scopeId} onChange={(event) => { setScopeId(event.target.value); setOccurrenceIndex(0); setPreview(null); resetPaging(); }}><option value="all">{locale === 'de' ? 'Alle Scopes' : 'All scopes'}</option>{workspace.configuration.ipv4Scopes.map((scope) => <option key={scope.id} value={scope.id}>{scope.name ?? scope.cidr}</option>)}</select></label>
      <label><span>{locale === 'de' ? 'Priorität' : 'Severity'}</span><select value={severity} onChange={(event) => { setSeverity(event.target.value as typeof severity); setOccurrenceIndex(0); setPreview(null); resetPaging(); }}><option value="all">{locale === 'de' ? 'Alle' : 'All'}</option><option value="blocker">Blocker</option><option value="warning">{locale === 'de' ? 'Warnung' : 'Warning'}</option><option value="info">Info</option></select></label>
      <label><span>{locale === 'de' ? 'Bearbeitung' : 'Actionability'}</span><select value={actionability} onChange={(event) => { setActionability(event.target.value as typeof actionability); setOccurrenceIndex(0); setPreview(null); resetPaging(); }}><option value="all">{locale === 'de' ? 'Alle' : 'All'}</option><option value="actionable">{locale === 'de' ? 'Änderung möglich' : 'Change available'}</option><option value="analysis">{locale === 'de' ? 'Prüfung nötig' : 'Review required'}</option></select></label>
    </section>

    <div className="remediation-layout">
      <main className="remediation-queue" aria-label={locale === 'de' ? 'Remediation Queue' : 'Remediation queue'}>
        {sectionOrder.map((section) => {
          const { items, page, pageCount, pageItems } = pageData[section];
          return <section key={section} className={`remediation-section remediation-${section}`}>
            <header><div>{sectionIcon(section)}<h2>{sectionLabel(section, locale)}</h2></div><span>{items.reduce((total, item) => total + countRemediationOccurrences(workspace, item, activeScope), 0)}</span></header>
            {items.length === 0 ? <p className="remediation-empty">{locale === 'de' ? 'Keine passenden Aufgaben.' : 'No matching work.'}</p> : <><ol>{pageItems.map((item) => <li key={item.id}>
              <button type="button" className={selected?.id === item.id ? 'active' : ''} aria-label={`${locale === 'de' ? 'Prüfen' : 'Review'} ${titleFor(item.ruleId)}`} onClick={() => select(item)}>
                <span className={`remediation-severity finding-${item.severity}`}>{severityLabel(item.severity, locale)}</span>
                <strong>{titleFor(item.ruleId)}</strong>
                <small>{scopeSummary(item, workspace, locale, activeScope)} · {confidenceLabel(item.confidence, locale)}</small>
                <b>{countRemediationOccurrences(workspace, item, activeScope)}</b>
                <span className="remediation-status">{countPreparedRemediationOccurrences(workspace, item, result, activeScope) > 0 ? `${countPreparedRemediationOccurrences(workspace, item, result, activeScope)} ${locale === 'de' ? 'vorbereitet' : 'prepared'}` : item.actionable ? (locale === 'de' ? 'Änderung möglich' : 'Change available') : (locale === 'de' ? 'Prüfen' : 'Review')}</span>
              </button>
              {narrowLayout && selected?.id === item.id && renderContextPanel()}
            </li>)}</ol>{pageCount > 1 && <nav className="remediation-pagination" aria-label={`${sectionLabel(section, locale)} ${locale === 'de' ? 'Seiten' : 'pages'}`}><button type="button" disabled={page === 1} onClick={() => changePage(section, page - 1)}>{locale === 'de' ? 'Zurück' : 'Previous'}</button><span>{locale === 'de' ? 'Seite' : 'Page'} {page} {locale === 'de' ? 'von' : 'of'} {pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => changePage(section, page + 1)}>{locale === 'de' ? 'Weiter' : 'Next'}</button></nav>}</>}
          </section>;
        })}
      </main>

      {!narrowLayout && renderContextPanel()}
    </div>

    {Boolean(result?.changeSet.operations.length) && <section className="remediation-review-tray" aria-live="polite" aria-label={locale === 'de' ? 'Review-Ablage' : 'Review tray'}>
      <ClipboardCheck size={19} aria-hidden="true" /><div><strong>{result?.changeSet.operations.length ?? 0} {locale === 'de' ? 'vorbereitete Änderungen' : `${result?.changeSet.operations.length === 1 ? 'prepared change' : 'prepared changes'}`}</strong><span>{locale === 'de' ? 'Nur lokal im aktuellen Browser-Tab' : 'Local to this browser tab only'}</span></div><button type="button" className="secondary-button" disabled={!result?.changeSet.operations.length} onClick={onReviewChanges}>{locale === 'de' ? 'Änderungen prüfen' : 'Review changes'}</button>
    </section>}
  </div>;
});

function ContextBlock({ title, text }: { title: string; text: string }) { return <section className="remediation-context-block"><h3>{title}</h3><p>{text}</p></section>; }

function OperationPreview({ locale, workspace, operation, result, title }: {
  locale: Locale;
  workspace: ConfigurationWorkspace;
  operation: DhcpChangeOperation;
  result: ChangeSetResult;
  title: string;
}) {
  const before = operation.kind === 'exclusion.add'
    ? (locale === 'de' ? 'Kein Ausschluss für diese Adresse' : 'No exclusion for this address')
    : 'before' in operation ? JSON.stringify(operation.before) : locale === 'de' ? 'Importierter Zustand' : 'Imported state';
  const after = operation.kind === 'exclusion.add'
    ? (operation.after.start === operation.after.end ? operation.after.start : `${operation.after.start} – ${operation.after.end}`)
    : 'after' in operation ? JSON.stringify(operation.after) : locale === 'de' ? 'Geplanter Zustand' : 'Planned state';
  const issues = result.issues.filter(({ operationId }) => !operationId || operationId === operation.id);
  return <section className="remediation-preview" aria-live="polite">
    <h3>{locale === 'de' ? 'Validierte Änderungsvorschau' : 'Validated change preview'}</h3>
    <dl>
      <div><dt>{locale === 'de' ? 'Ziel' : 'Target'}</dt><dd>{operationTargetLabel(workspace, operation, locale)}</dd></div>
      <div><dt>{locale === 'de' ? 'Aktion' : 'Action'}</dt><dd>{operationLabel(operation.kind, locale)}</dd></div>
      <div><dt>{locale === 'de' ? 'Begründung' : 'Rationale'}</dt><dd>{title}</dd></div>
      <div><dt>{locale === 'de' ? 'Vorher' : 'Before'}</dt><dd>{before}</dd></div>
      <div><dt>{locale === 'de' ? 'Nachher' : 'After'}</dt><dd>{after}</dd></div>
    </dl>
    {issues.length > 0 && <ul>{issues.map((issue) => <li key={`${issue.operationId ?? 'set'}-${issue.code}`}>{issueLabel(issue.code, locale)}</li>)}</ul>}
    <p><CheckCircle2 size={16} aria-hidden="true" />{result.valid ? (locale === 'de' ? 'Validierung bestanden' : 'Validation passed') : (locale === 'de' ? 'Validierung blockiert' : 'Validation blocked')}</p>
  </section>;
}

function operationLabel(kind: DhcpChangeOperation['kind'], locale: Locale) {
  if (kind === 'exclusion.add') return locale === 'de' ? 'Ausschluss hinzufügen' : 'Add exclusion';
  return locale === 'de' ? 'DHCP-Änderung' : 'DHCP change';
}

function issueLabel(code: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    'range-outside-scope': ['Der Bereich liegt außerhalb des Scopes.', 'The range is outside the scope.'],
    'exclusion-overlap': ['Der Ausschluss überschneidet sich mit einem vorhandenen Ausschluss.', 'The exclusion overlaps an existing exclusion.'],
  };
  return labels[code]?.[locale === 'de' ? 0 : 1]
    ?? (locale === 'de' ? 'Die Änderung konnte nicht sicher validiert werden.' : 'The change could not be validated safely.');
}

function sectionIcon(section: RemediationSection) {
  return section === 'act-now' ? <ShieldAlert size={19} aria-hidden="true" /> : section === 'review' ? <AlertTriangle size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />;
}

function sectionLabel(section: RemediationSection, locale: Locale) {
  if (locale === 'de') return { 'act-now': 'Jetzt handeln', review: 'Prüfen', observe: 'Beobachten' }[section];
  return { 'act-now': 'Act now', review: 'Review', observe: 'Observe' }[section];
}

function severityLabel(severity: WorkspaceFinding['severity'], locale: Locale) {
  if (locale === 'de') return { blocker: 'Blocker', warning: 'Warnung', info: 'Hinweis' }[severity];
  return { blocker: 'Blocker', warning: 'Warning', info: 'Info' }[severity];
}

function confidenceLabel(confidence: WorkspaceFinding['confidence'], locale: Locale) {
  if (locale === 'de') return { certain: 'sicher', limited: 'begrenzt', 'assumption-dependent': 'annahmenabhängig' }[confidence];
  return confidence === 'assumption-dependent' ? 'assumption-dependent' : confidence;
}

function scopeSummary(item: RemediationQueueItem, workspace: ConfigurationWorkspace, locale: Locale, activeScope?: string) {
  if (item.scopeIds.length === 0) return locale === 'de' ? 'Global' : 'Global';
  const firstId = activeScope && item.scopeIds.includes(activeScope) ? activeScope : item.scopeIds[0];
  const first = workspace.configuration.ipv4Scopes.find(({ id }) => id === firstId);
  const label = first?.name ?? first?.cidr ?? item.scopeIds[0];
  return activeScope ? label : item.scopeIds.length > 1 ? `${label} +${item.scopeIds.length - 1}` : label;
}

function useNarrowLayout() {
  const query = '(max-width: 1050px)';
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return matches;
}
