import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { searchWorkspace, type MicrosoftWorkspace, type WorkspaceEntityKind } from '../../domain/microsoft-workspace';
import type { Locale } from '../../content/copy';

interface WorkspaceNavigationProps {
  locale: Locale;
  workspace: MicrosoftWorkspace;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const kindOrder: WorkspaceEntityKind[] = ['server', 'scope', 'pool', 'exclusion', 'reservation', 'option', 'policy', 'failover', 'dhcpv6'];
const labels: Record<Locale, Record<WorkspaceEntityKind, string>> = {
  en: { server: 'Servers', scope: 'IPv4 scopes', pool: 'Pools', exclusion: 'Exclusions', reservation: 'Reservations', option: 'Options', policy: 'Policies', failover: 'Failover', dhcpv6: 'DHCPv6' },
  de: { server: 'Server', scope: 'IPv4-Scopes', pool: 'Pools', exclusion: 'Ausschlüsse', reservation: 'Reservierungen', option: 'Optionen', policy: 'Policies', failover: 'Failover', dhcpv6: 'DHCPv6' },
};

export function WorkspaceNavigation({ locale, workspace, selectedId, onSelect }: WorkspaceNavigationProps) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => searchWorkspace(workspace, query), [query, workspace]);
  const searchLabel = locale === 'de' ? 'Umgebung durchsuchen' : 'Search environment';

  return (
    <nav className="workspace-navigation" aria-label={locale === 'de' ? 'Konfigurationsobjekte' : 'Configuration objects'}>
      <label className="workspace-search">
        <Search size={17} aria-hidden="true" />
        <span className="visually-hidden">{searchLabel}</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={searchLabel} placeholder={searchLabel} />
      </label>
      {kindOrder.map((kind) => {
        const nodes = visible.filter((node) => node.kind === kind);
        if (nodes.length === 0) return null;
        return (
          <section className="workspace-nav-group" key={kind} aria-labelledby={`workspace-nav-${kind}`}>
            <h3 id={`workspace-nav-${kind}`}>{labels[locale][kind]} <span>{nodes.length}</span></h3>
            <ul>{nodes.map((node) => (
              <li key={node.id}>
                <button type="button" className={selectedId === node.id ? 'active' : ''} aria-current={selectedId === node.id ? 'true' : undefined} onClick={() => onSelect(node.id)}>
                  <strong>{node.label}</strong>{node.secondary && <small>{node.secondary}</small>}
                </button>
              </li>
            ))}</ul>
          </section>
        );
      })}
      {visible.length === 0 && <p className="workspace-empty">{locale === 'de' ? 'Keine passenden Objekte.' : 'No matching objects.'}</p>}
    </nav>
  );
}
