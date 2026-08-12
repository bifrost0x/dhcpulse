import type { Locale } from '../../content/copy';
import type { MicrosoftWorkspace, WorkspaceNode } from '../../domain/microsoft-workspace';
import type { RefObject } from 'react';
import type { ReactNode } from 'react';

interface WorkspaceObjectViewProps {
  locale: Locale;
  workspace: MicrosoftWorkspace;
  selected: WorkspaceNode;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  actionPanel?: ReactNode;
}

export function WorkspaceObjectView({ locale, workspace, selected, headingRef, actionPanel }: WorkspaceObjectViewProps) {
  const scope = workspace.configuration.ipv4Scopes.find(({ id }) => id === selected.id);
  const scopeSummary = scope ? workspace.scopeSummaries[scope.id] : undefined;
  return (
    <section className="workspace-object planner-card" aria-labelledby="workspace-object-heading">
      <p className="section-kicker">{kindLabel(selected.kind, locale)}</p>
      <h2 id="workspace-object-heading" ref={headingRef} tabIndex={-1}>{selected.label}</h2>
      {selected.secondary && <p className="workspace-object-secondary">{selected.secondary}</p>}
      {scope && scopeSummary && <>
        <div className="workspace-capacity-header"><span>{scope.startRange} – {scope.endRange}</span><strong>{Math.round(scopeSummary.utilizationPercent)} %</strong></div>
        <div className="workspace-capacity-bar" aria-label={locale === 'de' ? 'Adresskapazität' : 'Address capacity'}><span style={{ width: `${Math.min(100, scopeSummary.utilizationPercent)}%` }} /></div>
        <dl className="workspace-facts">
          <Fact label={locale === 'de' ? 'Netz' : 'Network'} value={scope.cidr} />
          <Fact label={locale === 'de' ? 'Effektive Kapazität' : 'Effective capacity'} value={scopeSummary.effectiveCapacity} />
          <Fact label={locale === 'de' ? 'Beobachtete Leases' : 'Observed leases'} value={scopeSummary.currentlyUsedAddresses} />
          <Fact label={locale === 'de' ? 'Frei' : 'Remaining'} value={scopeSummary.remainingAddresses} />
          <Fact label={locale === 'de' ? 'Lease-Dauer' : 'Lease duration'} value={scope.leaseLifetimeSeconds ? `${scope.leaseLifetimeSeconds / 3600} h` : '—'} />
          <Fact label={locale === 'de' ? 'Wirksame Optionen' : 'Effective options'} value={scopeSummary.effectiveOptions.length} />
        </dl>
        <section className="workspace-related"><h3>{locale === 'de' ? 'Wirksame Optionen' : 'Effective options'}</h3><ul>{scopeSummary.effectiveOptions.slice(0, 50).map((option) => <li key={option.optionId}><span>Option {option.code ?? option.name}</span><code>{displayValue(option.value)}</code><small>{levelLabel(option.sourceLevel, locale)}</small></li>)}</ul>{scopeSummary.effectiveOptions.length > 50 && <p>{locale === 'de' ? `Die ersten 50 von ${scopeSummary.effectiveOptions.length} Optionen werden angezeigt. Suche die Option für vollständige Details direkt.` : `Showing the first 50 of ${scopeSummary.effectiveOptions.length} options. Search for an option directly to inspect its full detail.`}</p>}</section>
      </>}
      {!scope && <ObjectFacts workspace={workspace} node={selected} locale={locale} />}
      {actionPanel}
      <footer className="workspace-provenance"><span>{locale === 'de' ? 'Quelle' : 'Source'}</span><code>{selected.provenance.location}</code></footer>
    </section>
  );
}

function ObjectFacts({ workspace, node, locale }: { workspace: MicrosoftWorkspace; node: WorkspaceNode; locale: Locale }) {
  const reservation = workspace.configuration.reservations.find(({ id }) => id === node.id);
  const pool = workspace.configuration.pools.find(({ id }) => id === node.id);
  const exclusion = workspace.configuration.exclusions.find(({ id }) => id === node.id);
  const option = workspace.configuration.options.find(({ id }) => id === node.id);
  const values: Array<[string, string | number]> = [];
  if (reservation) values.push([locale === 'de' ? 'Adresse' : 'Address', reservation.address], [locale === 'de' ? 'Client-ID' : 'Client ID', maskIdentifier(reservation.identifier)]);
  if (pool || exclusion) values.push([locale === 'de' ? 'Start' : 'Start', (pool ?? exclusion)!.start], [locale === 'de' ? 'Ende' : 'End', (pool ?? exclusion)!.end]);
  if (option) values.push(['Option', option.code ?? option.name ?? '—'], [locale === 'de' ? 'Wert' : 'Value', displayValue(option.value)], [locale === 'de' ? 'Ebene' : 'Level', levelLabel(option.level, locale)]);
  return <dl className="workspace-facts">{values.map(([label, value]) => <Fact key={label} label={label} value={value} />)}</dl>;
}

function Fact({ label, value }: { label: string; value: string | number }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function displayValue(value: string | number | boolean | string[]) { return Array.isArray(value) ? value.join(', ') : String(value); }
function maskIdentifier(value: string | undefined) { if (!value) return '—'; return value.length <= 5 ? '••••' : `${value.slice(0, 5)}••••`; }
function kindLabel(kind: WorkspaceNode['kind'], locale: Locale) { const labels = locale === 'de' ? { server: 'Server', scope: 'IPv4-Scope', pool: 'Pool', exclusion: 'Ausschluss', reservation: 'Reservierung', option: 'Option', policy: 'Richtlinie', failover: 'Failover', dhcpv6: 'DHCPv6' } : { server: 'Server', scope: 'IPv4 scope', pool: 'Pool', exclusion: 'Exclusion', reservation: 'Reservation', option: 'Option', policy: 'Policy', failover: 'Failover', dhcpv6: 'DHCPv6' }; return labels[kind]; }
function levelLabel(level: string, locale: Locale) { if (locale === 'en') return level; return level === 'global' ? 'Serverweit' : level === 'scope' ? 'Scope' : level; }
