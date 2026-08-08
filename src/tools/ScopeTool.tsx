import { useMemo, useState } from 'react';
import { analyzeIpv4Cidr } from '../domain/ip-address';
import { analyzeScopeDesign } from '../domain/scope-design';
import type { ScopeFinding } from '../domain/types';
import { buildWorkbenchReport, downloadWorkbenchReport } from '../domain/workbench-export';
import type { ToolPanelProps } from './ToolPanel';

const defaults = {
  cidr: '192.0.2.0/24', gateway: '192.0.2.1', pools: '192.0.2.50-192.0.2.200',
  exclusions: '192.0.2.100-192.0.2.104', reservations: '192.0.2.60', leases: 40, growth: 4,
};
const copy = {
  en: { title: 'IPv4 scope model', cidr: 'CIDR', gateway: 'Gateway', pools: 'Pool ranges (start-end, one per line)', exclusions: 'Exclusions (start-end, one per line)', reservations: 'Reservations (address, one per line)', leases: 'Current leases', growth: 'Expected daily growth', reset: 'Reset', download: 'Download report', summary: 'Capacity summary', usable: 'Usable addresses', poolCapacity: 'Effective pool capacity', remaining: 'addresses remain', runway: 'days of runway', findings: 'Findings', assumptions: 'Assumptions and limitations', sources: 'Authoritative sources', invalid: 'Enter a valid IPv4 CIDR.', nonnegative: 'Enter zero or a positive number.', none: 'No capacity or collision findings.', bar: 'Address-space utilization', network: 'Network', broadcast: 'Broadcast', netmask: 'Netmask', wildcard: 'Wildcard', usableRange: 'Usable range', used: 'used' },
  de: { title: 'IPv4-Scope-Modell', cidr: 'CIDR', gateway: 'Gateway', pools: 'Pool-Bereiche (Start-Ende, ein Bereich je Zeile)', exclusions: 'Ausschlüsse (Start-Ende, ein Bereich je Zeile)', reservations: 'Reservierungen (eine Adresse je Zeile)', leases: 'Aktuelle Leases', growth: 'Erwartetes tägliches Wachstum', reset: 'Zurücksetzen', download: 'Bericht herunterladen', summary: 'Kapazitätsübersicht', usable: 'Nutzbare Adressen', poolCapacity: 'Effektive Pool-Kapazität', remaining: 'Adressen verbleiben', runway: 'Tage Reichweite', findings: 'Hinweise', assumptions: 'Annahmen und Grenzen', sources: 'Maßgebliche Quellen', invalid: 'Gib ein gültiges IPv4-CIDR ein.', nonnegative: 'Gib null oder eine positive Zahl ein.', none: 'Keine Kapazitäts- oder Kollisionshinweise.', bar: 'Adressraumauslastung', network: 'Netz', broadcast: 'Broadcast', netmask: 'Netzmaske', wildcard: 'Wildcard-Maske', usableRange: 'Nutzbarer Bereich', used: 'belegt' },
} as const;

export function ScopeTool({ locale }: ToolPanelProps) {
  const [state, setState] = useState(defaults);
  const c = copy[locale];
  const cidr = useMemo(() => analyzeIpv4Cidr(state.cidr), [state.cidr]);
  const poolRanges = useMemo(() => parseRanges(state.pools, true), [state.pools]);
  const exclusions = useMemo(() => parseRanges(state.exclusions), [state.exclusions]);
  const reservations = useMemo(() => lines(state.reservations).map((address, index) => ({ id: `reservation-${index + 1}`, address })), [state.reservations]);
  const result = useMemo(() => {
    const scopes = poolRanges.map((pool, index) => ({ id: `pool-${index + 1}`, cidr: state.cidr, gateway: state.gateway, pool, exclusions: [], reservations: [], leases: 0 }));
    const exclusionsByPool = scopes.map(() => [] as typeof exclusions);
    const standaloneExclusionFindings: ScopeFinding[] = [];
    for (const exclusion of exclusions) {
      const checks = scopes.map((scope) => analyzeScopeDesign({ scopes: [{ ...scope, exclusions: [exclusion] }] }));
      const applicable = checks.map((check, index) => check.scopes[0]!.excludedAddresses > 0 ? index : -1).filter((index) => index >= 0);
      if (applicable.length > 0) applicable.forEach((index) => exclusionsByPool[index]!.push(exclusion));
      else standaloneExclusionFindings.push(...(checks[0]?.findings.filter(({ key }) => key === 'invalidExclusionRange' || key === 'exclusionOutsidePool') ?? []));
    }
    const analyzed = scopes.map((scope, index) => analyzeScopeDesign({ scopes: [{ ...scope, exclusions: exclusionsByPool[index] }] }));
    const individual = analyzed.flatMap(({ findings }) => findings.filter(({ key }) => !['overCapacityCurrentLeases', 'exhaustionWithin30Days', 'reservationOutsideSubnet', 'duplicateReservationAddress'].includes(key)));
    const reservationFindings = scopes[0] ? analyzeScopeDesign({ scopes: [{ ...scopes[0], gateway: undefined, reservations }] }).findings.filter(({ key }) => key === 'reservationOutsideSubnet' || key === 'duplicateReservationAddress') : [];
    const collisions = scopes.length > 1
      ? analyzeScopeDesign({ scopes }).findings.filter(({ key }) => key === 'overlappingDynamicPools')
      : [];
    const capacities = analyzed.map(({ scopes: [capacity] }) => capacity!);
    const effective = capacities.reduce((sum, item) => sum + item.effectiveCapacity, 0);
    const used = normalizeCount(state.leases);
    const remaining = Math.max(0, effective - used);
    const aggregateFindings: ScopeFinding[] = [];
    if (used > effective) aggregateFindings.push({ key: 'overCapacityCurrentLeases', severity: 'blocker', scopeId: 'aggregate' });
    if (Number.isFinite(state.growth) && state.growth > 0 && remaining / state.growth <= 30) aggregateFindings.push({ key: 'exhaustionWithin30Days', severity: 'warning', scopeId: 'aggregate' });
    return { findings: dedupeFindings([...individual, ...standaloneExclusionFindings, ...reservationFindings, ...collisions, ...aggregateFindings]), capacities, totals: { effective, used, remaining } };
  }, [exclusions, poolRanges, reservations, state.cidr, state.gateway, state.growth, state.leases]);
  const totals = result.totals;
  const utilization = totals.effective === 0 ? 0 : Math.min(100, (totals.used / totals.effective) * 100);
  const runway = state.growth > 0 ? Math.floor(totals.remaining / state.growth) : null;
  const hasFinding = (...keys: ScopeFinding['key'][]) => result.findings.some((finding) => keys.includes(finding.key));
  const update = (key: keyof typeof defaults, value: string | number) => setState((current) => ({ ...current, [key]: value }));
  const report = () => buildWorkbenchReport({
    toolId: 'scope', toolName: locale === 'de' ? 'Bereich und Kapazität' : 'Scope and capacity', generatedAt: new Date().toISOString(), locale,
    inputs: { [locale === 'de' ? 'Pool-Anzahl' : 'Pool count']: poolRanges.length, [locale === 'de' ? 'Ausschluss-Anzahl' : 'Exclusion count']: exclusions.length, [locale === 'de' ? 'Reservierungsanzahl' : 'Reservation count']: reservations.length, [locale === 'de' ? 'Aktuelle Leases' : 'Current leases']: normalizeCount(state.leases), [locale === 'de' ? 'Tägliches Wachstum' : 'Daily growth']: normalizeCount(state.growth), [locale === 'de' ? 'Effektive Kapazität' : 'Effective capacity']: totals.effective, [locale === 'de' ? 'Verbleibend' : 'Remaining']: totals.remaining }, findings: result.findings.map((finding) => ({ severity: finding.severity, title: findingLabel(finding.key, locale), detail: `${locale === 'de' ? 'Pool' : 'Pool'} ${finding.scopeId}` })),
    assumptions: [locale === 'de' ? 'Die Reichweite nimmt gleichmäßiges tägliches Wachstum an.' : 'Runway assumes steady daily growth.'],
    sources: [{ label: 'RFC 2131', url: 'https://www.rfc-editor.org/rfc/rfc2131.html' }, { label: 'RFC 4632', url: 'https://www.rfc-editor.org/rfc/rfc4632.html' }],
    sensitiveValues: [state.cidr, state.gateway, state.pools, state.exclusions, state.reservations, ...lines(state.reservations)],
  });
  return <div className="workbench-grid" data-testid="tool-panel-scope">
    <section className="planner-card workbench-form" aria-labelledby="scope-form-title"><h2 id="scope-form-title">{c.title}</h2>
      <div className="workbench-fields">
        <Field label={c.cidr} value={state.cidr} onChange={(value) => update('cidr', value)} error={!cidr ? c.invalid : undefined} />
        <Field label={c.gateway} value={state.gateway} onChange={(value) => update('gateway', value)} error={hasFinding('gatewayInDynamicPool') ? findingLabel('gatewayInDynamicPool', locale) : undefined} />
        <TextField label={c.pools} value={state.pools} onChange={(value) => update('pools', value)} error={hasFinding('invalidPoolRange', 'poolOutsideSubnet', 'overlappingDynamicPools') ? result.findings.filter((item) => ['invalidPoolRange', 'poolOutsideSubnet', 'overlappingDynamicPools'].includes(item.key)).map((item) => findingLabel(item.key, locale))[0] : undefined} />
        <TextField label={c.exclusions} value={state.exclusions} onChange={(value) => update('exclusions', value)} error={hasFinding('invalidExclusionRange', 'exclusionOutsidePool') ? result.findings.filter((item) => ['invalidExclusionRange', 'exclusionOutsidePool'].includes(item.key)).map((item) => findingLabel(item.key, locale))[0] : undefined} />
        <TextField label={c.reservations} value={state.reservations} onChange={(value) => update('reservations', value)} error={hasFinding('reservationOutsideSubnet', 'duplicateReservationAddress') ? result.findings.filter((item) => ['reservationOutsideSubnet', 'duplicateReservationAddress'].includes(item.key)).map((item) => findingLabel(item.key, locale))[0] : undefined} />
        <NumberField label={c.leases} value={state.leases} onChange={(value) => update('leases', value)} error={state.leases < 0 ? c.nonnegative : hasFinding('overCapacityCurrentLeases') ? findingLabel('overCapacityCurrentLeases', locale) : undefined} />
        <NumberField label={c.growth} value={state.growth} onChange={(value) => update('growth', value)} error={state.growth < 0 ? c.nonnegative : undefined} />
      </div>
      <div className="workbench-actions"><button className="secondary-button" type="button" onClick={() => setState(defaults)}>{c.reset}</button><button className="primary-button" type="button" onClick={() => downloadWorkbenchReport(report().markdown, 'dhcpulse-scope-report.md')}>{c.download}</button></div>
    </section>
    <section className="planner-card workbench-results" role="region" aria-labelledby="scope-results-title"><h2 id="scope-results-title">{c.summary}</h2>
      {cidr && <><div className="metric-grid workbench-metrics"><div className="metric"><span>{c.usable}</span><strong className="metric-value">{cidr.usableAddresses}</strong></div><div className="metric"><span>{c.poolCapacity}</span><strong data-metric="pool-capacity">{totals.effective}</strong></div><div className="metric"><span>{c.remaining}</span><strong>{totals.remaining}</strong></div><div className="metric"><span>{c.runway}</span><strong>{runway === null ? '∞' : runway}</strong></div></div><dl className="fact-grid"><div><dt>{c.network}</dt><dd>{cidr.network}</dd></div><div><dt>{c.broadcast}</dt><dd>{cidr.broadcast}</dd></div><div><dt>{c.netmask}</dt><dd>{cidr.netmask}</dd></div><div><dt>{c.wildcard}</dt><dd>{cidr.wildcardMask}</dd></div><div><dt>{c.usableRange}</dt><dd>{cidr.firstUsable} - {cidr.lastUsable}</dd></div></dl><div className="address-bar" role="img" aria-label={`${c.bar}: ${Math.round(utilization)}%`}><span style={{ width: `${utilization}%` }} /></div><p>{totals.remaining} {c.remaining}; {Math.round(utilization)}% {c.used}.</p></>}
      <FindingList title={c.findings} none={c.none} findings={result.findings.map((finding) => ({ severity: finding.severity, text: findingLabel(finding.key, locale) }))} locale={locale} />
      <Info title={c.assumptions} items={[locale === 'de' ? 'Die Reichweite nimmt gleichmäßiges tägliches Wachstum an; die tatsächliche Lease-Verteilung kann abweichen.' : 'Runway assumes steady daily growth; actual lease distribution can vary.']} />
      <Sources title={c.sources} />
    </section>
  </div>;
}

function Field({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) { const id = idFor(label); return <label className="workbench-field" htmlFor={id}><span>{label}</span><input id={id} value={value} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(event.target.value)} />{error && <small id={`${id}-error`} className="field-error">{error}</small>}</label>; }
function TextField({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) { const id = idFor(label); return <label className="workbench-field span-2" htmlFor={id}><span>{label}</span><textarea id={id} value={value} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(event.target.value)} />{error && <small id={`${id}-error`} className="field-error">{error}</small>}</label>; }
function NumberField({ label, value, onChange, error }: { label: string; value: number; onChange: (value: number) => void; error?: string }) { const id = idFor(label); return <label className="workbench-field" htmlFor={id}><span>{label}</span><input id={id} type="number" min="0" value={Number.isFinite(value) ? value : ''} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(event.target.valueAsNumber)} />{error && <small id={`${id}-error`} className="field-error">{error}</small>}</label>; }
function idFor(label: string) { return `scope-${label.replace(/\W/g, '-')}`; }
function lines(value: string) { return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }
function parseRanges(value: string, requireOne = false) { const parsed = lines(value).map((item) => { const match = /^\s*([^\s-]+)\s*-\s*([^\s-]+)\s*$/.exec(item); return match ? { start: match[1]!, end: match[2]! } : { start: item, end: '' }; }); return parsed.length || !requireOne ? parsed : [{ start: '', end: '' }]; }
function normalizeCount(value: number) { return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0; }
function dedupeFindings(findings: ScopeFinding[]) { const seen = new Set<string>(); return findings.filter((finding) => { const key = `${finding.key}:${finding.scopeId}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function findingLabel(key: ScopeFinding['key'], locale: 'en' | 'de') { const labels: Record<ScopeFinding['key'], [string, string]> = { invalidCidr: ['Invalid CIDR', 'Ungültiges CIDR'], invalidPoolRange: ['Invalid pool range', 'Ungültiger Pool-Bereich'], poolOutsideSubnet: ['Pool is outside the subnet', 'Pool liegt außerhalb des Subnetzes'], invalidExclusionRange: ['Invalid exclusion range', 'Ungültiger Ausschlussbereich'], exclusionOutsidePool: ['Exclusion is outside the pool', 'Ausschluss liegt außerhalb des Pools'], reservationOutsideSubnet: ['Reservation is outside the subnet', 'Reservierung liegt außerhalb des Subnetzes'], duplicateReservationAddress: ['Duplicate reservation address', 'Doppelte Reservierungsadresse'], gatewayInDynamicPool: ['Gateway is inside the dynamic pool', 'Gateway liegt im dynamischen Pool'], overlappingScopeNetworks: ['Scope networks overlap', 'Scope-Netze überlappen'], overlappingDynamicPools: ['Dynamic pools overlap', 'Dynamische Pools überlappen'], overCapacityCurrentLeases: ['Current leases exceed capacity', 'Aktuelle Leases überschreiten die Kapazität'], exhaustionWithin30Days: ['Capacity may be exhausted within 30 days', 'Kapazität könnte innerhalb von 30 Tagen erschöpft sein'] }; return labels[key][locale === 'de' ? 1 : 0]; }
function FindingList({ title, findings, none, locale }: { title: string; findings: { severity: string; text: string }[]; none: string; locale: 'en' | 'de' }) { return <section className="workbench-section"><h3>{title}</h3>{findings.length ? <ul className="finding-list-compact">{findings.map((finding, index) => <li key={`${finding.text}-${index}`} className={`finding-${finding.severity}`}><span className="severity">{severityLabel(finding.severity, locale)}</span>{finding.text}</li>)}</ul> : <p>{none}</p>}</section>; }
function severityLabel(value: string, locale: 'en' | 'de') { const labels = locale === 'de' ? { blocker: 'Blocker', warning: 'Warnung', info: 'Hinweis' } : { blocker: 'Blocker', warning: 'Warning', info: 'Info' }; return labels[value as keyof typeof labels]; }
function Info({ title, items }: { title: string; items: string[] }) { return <details className="workbench-section"><summary>{title}</summary><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></details>; }
function Sources({ title }: { title: string }) { return <section className="workbench-section"><h3>{title}</h3><ul><li><a href="https://www.rfc-editor.org/rfc/rfc2131.html" target="_blank" rel="noreferrer">RFC 2131</a></li><li><a href="https://www.rfc-editor.org/rfc/rfc4632.html" target="_blank" rel="noreferrer">RFC 4632</a></li></ul></section>; }
