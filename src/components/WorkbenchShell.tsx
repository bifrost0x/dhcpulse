import { useEffect, useRef, useState, type ComponentType, type MouseEvent } from 'react';
import { translate, type Locale } from '../content/copy';
import { toolCatalog, type ToolCatalogEntry } from '../content/tool-catalog';
import { ConfigAnalyzerTool } from '../tools/ConfigAnalyzerTool';
import { ConfigDiffTool } from '../tools/ConfigDiffTool';
import { Dhcpv6Tool } from '../tools/Dhcpv6Tool';
import { DiagnosticsTool } from '../tools/DiagnosticsTool';
import { FailoverTool } from '../tools/FailoverTool';
import { LeaseTool } from '../tools/LeaseTool';
import { OptionsTool } from '../tools/OptionsTool';
import { PxeTool } from '../tools/PxeTool';
import { ScopeTool } from '../tools/ScopeTool';
import { SecurityTool } from '../tools/SecurityTool';
import type { ToolPanelProps } from '../tools/ToolPanel';
import { Header } from './Header';
import { ToolCatalog } from './ToolCatalog';
import { ToolFrame } from './ToolFrame';

type ToolId = ToolCatalogEntry['id'];
type Route = { kind: 'catalog' } | { kind: 'tool'; id: ToolId } | { kind: 'not-found' };

const toolComponents: Record<Exclude<ToolId, 'lease'>, ComponentType<ToolPanelProps>> = {
  scope: ScopeTool,
  options: OptionsTool,
  pxe: PxeTool,
  failover: FailoverTool,
  dhcpv6: Dhcpv6Tool,
  diagnostics: DiagnosticsTool,
  security: SecurityTool,
  'config-analyzer': ConfigAnalyzerTool,
  'config-diff': ConfigDiffTool,
};

function routeFromHash(hash: string): Route {
  if (!hash.startsWith('#/tool/')) return { kind: 'catalog' };
  const requestedId = hash.slice('#/tool/'.length);
  const tool = toolCatalog.find(({ id }) => id === requestedId);
  return tool ? { kind: 'tool', id: tool.id } : { kind: 'not-found' };
}

interface WorkbenchShellProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}

export function WorkbenchShell({ locale, onLocaleChange }: WorkbenchShellProps) {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));
  const [leaseResetVersion, setLeaseResetVersion] = useState(0);
  const routeHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousRouteKindRef = useRef<Route['kind'] | null>(null);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const routeKey = route.kind === 'tool' ? `tool:${route.id}` : route.kind;

  useEffect(() => {
    const updateRoute = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  useEffect(() => {
    const previousRouteKind = previousRouteKindRef.current;
    const returningToCatalog = route.kind === 'catalog'
      && previousRouteKind !== null
      && previousRouteKind !== 'catalog';
    if (route.kind !== 'catalog' || returningToCatalog) routeHeadingRef.current?.focus();
    previousRouteKindRef.current = route.kind;
  }, [route.kind, routeKey]);

  function showCatalog() {
    setRoute({ kind: 'catalog' });
  }

  function backFromNotFound(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) showCatalog();
  }

  let mainContent;
  if (route.kind === 'catalog') {
    mainContent = (
      <>
        <section className="catalog-hero">
          <p className="eyebrow"><span className="pulse-dot" />{t('shell.eyebrow')}</p>
          <h1 ref={routeHeadingRef} tabIndex={-1}>{t('shell.title')}</h1>
          <p>{t('shell.description')}</p>
        </section>
        <ToolCatalog locale={locale} onToolSelect={(id) => setRoute({ kind: 'tool', id })} />
      </>
    );
  } else if (route.kind === 'not-found') {
    mainContent = (
      <section className="not-found planner-card">
        <p className="section-kicker">404</p>
        <h1 ref={routeHeadingRef} tabIndex={-1}>{t('notFound.title')}</h1>
        <p>{t('notFound.description')}</p>
        <a className="primary-button" href="#/" onClick={backFromNotFound}>{t('frame.back')}</a>
      </section>
    );
  } else {
    const tool = toolCatalog.find(({ id }) => id === route.id)!;
    if (tool.id === 'lease') {
      mainContent = (
        <ToolFrame locale={locale} tool={tool} headingRef={routeHeadingRef} onBack={showCatalog} onReset={() => setLeaseResetVersion((current) => current + 1)}>
          <LeaseTool key={leaseResetVersion} locale={locale} />
        </ToolFrame>
      );
    } else {
      const Panel = toolComponents[tool.id];
      mainContent = (
        <ToolFrame locale={locale} tool={tool} headingRef={routeHeadingRef} onBack={showCatalog}>
          <Panel locale={locale} tool={tool} />
        </ToolFrame>
      );
    }
  }

  return (
    <div id="top" className="app-shell">
      <Header locale={locale} onLocaleChange={onLocaleChange} />
      <main>{mainContent}</main>
      <footer>
        <p>{t('footer.disclaimer')}</p>
        <a href="https://www.rfc-editor.org/rfc/rfc2131.html" target="_blank" rel="noreferrer">{t('footer.rfc')}</a>
      </footer>
    </div>
  );
}
