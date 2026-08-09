import { useMemo, useState } from 'react';
import type { Locale } from '../../content/copy';
import {
  addChangeOperation,
  createChangeSet,
  removeChangeOperation,
  validateChangeSet,
  type ChangeSetResult,
  type DhcpChangeOperation,
} from '../../domain/dhcp-change-set';
import type { MicrosoftWorkspace, WorkspaceNode } from '../../domain/microsoft-workspace';
import { generatePowerShellPackage, type PowerShellPackage } from '../../domain/powershell-package';
import { evaluatePackageEligibility } from '../../domain/workspace-view';

interface Props {
  locale: Locale;
  workspace: MicrosoftWorkspace;
  selected: WorkspaceNode | null;
}

const copy = {
  en: {
    eligibility: 'Package eligibility', eligible: 'Eligible for the selected targets.', ineligible: 'Package generation is blocked for the selected targets.',
    editor: 'Contextual change', select: 'Select an IPv4 scope to stage a supported change.', lease: 'Lease duration in hours',
    stage: 'Stage lease change', set: 'Change Set', empty: 'No changes staged yet.', remove: 'Remove', invalid: 'Enter a positive whole number of hours.',
    valid: 'Validated and ready for package generation.', blocked: 'Resolve the validation errors before generating a package.', generate: 'Generate guarded package',
    generated: 'Generated package', download: 'Download', safety: 'Nothing is executed. Review Preflight, Apply, Verify, and Rollback before running them on the named server.',
    removeExclusion: 'Stage exclusion removal', removeReservation: 'Stage reservation removal', removeOption: 'Stage option removal', destructiveHint: 'This only stages a reversible change; nothing is executed.',
  },
  de: {
    eligibility: 'Paketfreigabe', eligible: 'Für die gewählten Ziel-Scopes freigegeben.', ineligible: 'Die Paketerzeugung ist für die gewählten Ziel-Scopes blockiert.',
    editor: 'Kontextbezogene Änderung', select: 'Wähle einen IPv4-Scope aus, um eine unterstützte Änderung vorzumerken.', lease: 'Leasedauer in Stunden',
    stage: 'Lease-Änderung vormerken', set: 'Change Set', empty: 'Noch keine Änderungen vorgemerkt.', remove: 'Entfernen', invalid: 'Gib eine positive ganze Stundenzahl ein.',
    valid: 'Validiert und bereit für die Paketerzeugung.', blocked: 'Behebe die Validierungsfehler vor der Paketerzeugung.', generate: 'Abgesichertes Paket erzeugen',
    generated: 'Erzeugtes Paket', download: 'Herunterladen', safety: 'Es wird nichts ausgeführt. Prüfe Preflight, Apply, Verify und Rollback, bevor du sie auf dem benannten Server startest.',
    removeExclusion: 'Ausschlussentfernung vormerken', removeReservation: 'Reservierungsentfernung vormerken', removeOption: 'Optionsentfernung vormerken', destructiveHint: 'Dies merkt nur eine umkehrbare Änderung vor; es wird nichts ausgeführt.',
  },
} as const;

export function WorkspaceChangePanel({ locale, workspace, selected }: Props) {
  const c = copy[locale];
  const [result, setResult] = useState<ChangeSetResult>(() => validateChangeSet(workspace, createChangeSet(workspace)));
  const [leaseDraft, setLeaseDraft] = useState<{ scopeId: string; value: string } | null>(null);
  const [fieldError, setFieldError] = useState('');
  const [generated, setGenerated] = useState<PowerShellPackage | null>(null);
  const scope = useMemo(() => selected?.kind === 'scope' ? workspace.configuration.ipv4Scopes.find(({ id }) => id === selected.id) : undefined, [selected, workspace]);
  const exclusion = selected?.kind === 'exclusion' ? workspace.configuration.exclusions.find(({ id }) => id === selected.id) : undefined;
  const reservation = selected?.kind === 'reservation' ? workspace.configuration.reservations.find(({ id }) => id === selected.id) : undefined;
  const option = selected?.kind === 'option' ? workspace.configuration.options.find(({ id }) => id === selected.id) : undefined;
  const leaseHours = scope && leaseDraft?.scopeId === scope.id ? leaseDraft.value : scope?.leaseLifetimeSeconds ? String(scope.leaseLifetimeSeconds / 3600) : '';
  const eligibility = useMemo(() => evaluatePackageEligibility(workspace, result), [result, workspace]);

  function stageLease() {
    if (!scope) return;
    const hours = Number(leaseHours);
    if (!Number.isInteger(hours) || hours <= 0) {
      setFieldError(c.invalid);
      return;
    }
    const beforeSeconds = scope.leaseLifetimeSeconds ?? 0;
    setFieldError('');
    setGenerated(null);
    setResult((current) => addChangeOperation(workspace, current.changeSet, {
      id: `lease-${scope.id}`,
      kind: 'scope-lease.set',
      targetId: scope.id,
      beforeSeconds,
      afterSeconds: hours * 3600,
    }));
  }

  function stage(operation: DhcpChangeOperation) {
    setGenerated(null);
    setResult((current) => addChangeOperation(workspace, current.changeSet, operation));
  }

  async function generate() {
    if (!eligibility.eligible) return;
    setGenerated(await generatePowerShellPackage(workspace, result, locale, new Date()));
  }

  function download(name: string, mimeType: string, content: string) {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="workspace-change-area">
      <section className="workspace-change-editor planner-card" aria-labelledby="workspace-change-heading">
        <p className="section-kicker">2 · {c.set}</p>
        <h2 id="workspace-change-heading">{c.editor}</h2>
        {scope ? <>
          <p><strong>{scope.name ?? scope.cidr}</strong> · {scope.cidr}</p>
          <label className="workbench-field"><span>{c.lease}</span><input type="number" min="1" step="1" value={leaseHours} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'workspace-lease-error' : undefined} onChange={(event) => { setLeaseDraft({ scopeId: scope.id, value: event.target.value }); setFieldError(''); }} />{fieldError && <small className="field-error" id="workspace-lease-error">{fieldError}</small>}</label>
          <button type="button" className="secondary-button" onClick={stageLease}>{c.stage}</button>
        </> : exclusion?.scopeId ? <><p><strong>{exclusion.start} – {exclusion.end}</strong></p><p>{c.destructiveHint}</p><button type="button" className="secondary-button" onClick={() => stage({ id: `remove-${exclusion.id}`, kind: 'exclusion.remove', targetId: exclusion.id, before: { scopeId: exclusion.scopeId!, start: exclusion.start, end: exclusion.end } })}>{c.removeExclusion}</button></> : reservation?.identifier ? <><p><strong>{reservation.hostname ?? reservation.address}</strong> · {reservation.address}</p><p>{c.destructiveHint}</p><button type="button" className="secondary-button" onClick={() => stage({ id: `remove-${reservation.id}`, kind: 'reservation.remove', targetId: reservation.id, before: { address: reservation.address, clientId: reservation.identifier!, hostname: reservation.hostname } })}>{c.removeReservation}</button></> : option && (option.level === 'global' || option.level === 'scope') && option.code !== undefined ? <><p><strong>Option {option.code}</strong></p><p>{c.destructiveHint}</p><button type="button" className="secondary-button" onClick={() => stage({ id: `remove-${option.id}`, kind: 'option.remove', targetId: option.id, before: { optionId: option.id, code: option.code!, value: option.value, level: option.level as 'global' | 'scope', scopeId: option.scopeId } })}>{c.removeOption}</button></> : <p>{c.select}</p>}
      </section>
      <section className="workspace-change-set planner-card" aria-labelledby="workspace-change-set-heading">
        <p className="section-kicker">2 · Review</p>
        <h2 id="workspace-change-set-heading">{c.set}</h2>
        {result.changeSet.operations.length === 0 ? <p>{c.empty}</p> : <ol>{result.changeSet.operations.map((operation) => <li key={operation.id}><div><strong>{operation.kind}</strong>{operation.kind === 'scope-lease.set' && <span>{operation.beforeSeconds / 3600} hours → {operation.afterSeconds / 3600} hours</span>}</div><button type="button" className="text-button" onClick={() => { setGenerated(null); setResult(removeChangeOperation(workspace, result.changeSet, operation.id)); }}>{c.remove}</button></li>)}</ol>}
        {result.issues.length > 0 && <ul className="workspace-change-issues">{result.issues.map((issue) => <li key={`${issue.operationId ?? 'set'}-${issue.code}`}>{issue.code}</li>)}</ul>}
        {result.changeSet.operations.length > 0 && <p className={result.valid ? 'validation-ok' : 'field-error'}>{result.valid ? c.valid : c.blocked}</p>}
        <div className={`workspace-package-eligibility ${eligibility.eligible ? 'eligible' : 'blocked'}`}><span>{c.eligibility}</span><strong>{eligibility.eligible ? c.eligible : c.ineligible}</strong>{eligibility.blockers.length > 0 && <ul>{eligibility.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}</div>
        <button type="button" className="primary-button" disabled={!eligibility.eligible} onClick={() => void generate()}>{c.generate}</button>
      </section>
      {generated && <section className="workspace-package planner-card" aria-labelledby="workspace-package-heading"><p className="section-kicker">3 · Package</p><h2 id="workspace-package-heading">{c.generated}</h2><p>{c.safety}</p><div className="workspace-artifacts">{generated.artifacts.map((artifact) => <button type="button" className="secondary-button" key={artifact.name} onClick={() => download(artifact.name, artifact.mimeType, artifact.content)}>{c.download} {artifact.name}</button>)}</div></section>}
    </div>
  );
}
