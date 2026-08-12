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
import type { ConfigurationWorkspace } from '../domain/config-workspace';
import { ConfigurationEntry } from './config-workspace/ConfigurationEntry';
import { ConfigurationWorkspaceView } from './config-workspace/ConfigurationWorkspaceView';
import { Header } from './Header';
import { ToolFrame } from './ToolFrame';
import { UtilitiesCatalog } from './UtilitiesCatalog';

type ToolId = ToolCatalogEntry['id'];
type UtilityToolId = Exclude<ToolId, 'microsoft-workspace'>;
type Route = { kind: 'entry' } | { kind: 'workspace' } | { kind: 'utilities' } | { kind: 'tool'; id: ToolId } | { kind: 'not-found' };

const toolComponents: Record<Exclude<UtilityToolId, 'lease'>, ComponentType<ToolPanelProps>> = {
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
  if (hash === '#/workspace') return { kind: 'workspace' };
  if (hash === '#/utilities') return { kind: 'utilities' };
  if (!hash.startsWith('#/tool/')) return { kind: 'entry' };
  const requestedId = hash.slice('#/tool/'.length);
  if (requestedId === 'microsoft-workspace') return { kind: 'entry' };
  const tool = toolCatalog.find(({ id }) => id === requestedId);
  return tool ? { kind: 'tool', id: tool.id } : { kind: 'not-found' };
}

interface WorkbenchShellProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}

export function WorkbenchShell({ locale, onLocaleChange }: WorkbenchShellProps) {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));
  const [workspaceSession, setWorkspaceSession] = useState<{ workspace: ConfigurationWorkspace; fileName: string } | null>(null);
  const [toolResetVersion, setToolResetVersion] = useState(0);
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
    const returningToEntry = route.kind === 'entry'
      && previousRouteKind !== null
      && previousRouteKind !== 'entry';
    if (route.kind !== 'entry' || returningToEntry) routeHeadingRef.current?.focus();
    previousRouteKindRef.current = route.kind;
  }, [route.kind, routeKey]);

  function showCatalog() {
    setRoute({ kind: 'utilities' });
  }

  function backFromNotFound(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) showCatalog();
  }

  let mainContent;
  if (route.kind === 'entry' || (route.kind === 'workspace' && !workspaceSession)) {
    mainContent = (
      <ConfigurationEntry locale={locale} headingRef={routeHeadingRef} notice={route.kind === 'workspace' ? (locale === 'de' ? 'Diese Arbeitsbereich-Sitzung ist nicht mehr verfügbar. Öffne die Konfiguration erneut.' : 'This workspace session is no longer available. Open the configuration again.') : undefined} onOpen={(workspace, fileName) => {
        setWorkspaceSession({ workspace, fileName });
        window.location.hash = '#/workspace';
        setRoute({ kind: 'workspace' });
      }} />
    );
  } else if (route.kind === 'workspace') {
    mainContent = <ConfigurationWorkspaceView locale={locale} workspace={workspaceSession!.workspace} fileName={workspaceSession!.fileName} headingRef={routeHeadingRef} onClose={() => {
      setWorkspaceSession(null);
      window.location.hash = '#/';
      setRoute({ kind: 'entry' });
    }} />;
  } else if (route.kind === 'utilities') {
    mainContent = <UtilitiesCatalog locale={locale} headingRef={routeHeadingRef} onToolSelect={(id) => setRoute({ kind: 'tool', id })} />;
  } else if (route.kind === 'not-found') {
    mainContent = (
      <section className="not-found planner-card">
        <p className="section-kicker">404</p>
        <h1 ref={routeHeadingRef} tabIndex={-1}>{t('notFound.title')}</h1>
        <p>{t('notFound.description')}</p>
        <a className="primary-button" href="#/utilities" onClick={backFromNotFound}>{t('frame.back')}</a>
      </section>
    );
  } else {
    const tool = toolCatalog.find(({ id }) => id === route.id)!;
    if (tool.id === 'lease') {
      mainContent = (
        <ToolFrame locale={locale} tool={tool} headingRef={routeHeadingRef} onBack={showCatalog} onReset={() => setToolResetVersion((current) => current + 1)}>
          <LeaseTool key={toolResetVersion} locale={locale} />
        </ToolFrame>
      );
    } else {
      const Panel = toolComponents[route.id as Exclude<UtilityToolId, 'lease'>];
      mainContent = (
        <ToolFrame locale={locale} tool={tool} headingRef={routeHeadingRef} onBack={showCatalog} onReset={() => setToolResetVersion((current) => current + 1)}>
          <Panel key={`${tool.id}-${toolResetVersion}`} locale={locale} tool={tool} />
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
