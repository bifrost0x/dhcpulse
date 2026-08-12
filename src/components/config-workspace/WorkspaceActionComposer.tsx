import { CheckCircle2, Wrench } from 'lucide-react';
import { useId, useState } from 'react';
import type { Locale } from '../../content/copy';
import type { ConfigurationWorkspace } from '../../domain/config-workspace';
import type { ChangeSetResult, DhcpChangeOperation } from '../../domain/dhcp-change-set';
import { FindingActionError } from '../../domain/finding-actions';
import type { WorkspaceActionDescriptor, WorkspaceActionValues } from '../../domain/workspace-action';
import { operationTargetLabel } from './workspace-display';

interface Props {
  locale: Locale;
  workspace: ConfigurationWorkspace;
  subjectKey: string;
  actions: WorkspaceActionDescriptor[];
  currentResult: ChangeSetResult | null;
  build: (action: WorkspaceActionDescriptor, values: WorkspaceActionValues) => ChangeSetResult;
  onCommit: (result: ChangeSetResult) => void;
}

export function WorkspaceActionComposer({ locale, workspace, subjectKey, actions, currentResult, build, onCommit }: Props) {
  const prefix = useId();
  const [selection, setSelection] = useState<{ subjectKey: string; actionId: string; values: WorkspaceActionValues } | null>(null);
  const [preview, setPreview] = useState<{ subjectKey: string; result: ChangeSetResult } | null>(null);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState<{ subjectKey: string; fields: string[] } | null>(null);
  if (actions.length === 0) return null;
  const selected = selection?.subjectKey === subjectKey
    ? actions.find(({ id }) => id === selection.actionId) ?? null
    : null;
  const values = selected ? selection!.values : {};
  const visiblePreview = preview?.subjectKey === subjectKey ? preview.result : null;
  const existingIds = new Set(currentResult?.changeSet.operations.map(({ id }) => id) ?? []);
  const previewOperations = visiblePreview?.changeSet.operations.filter(({ id }) => !existingIds.has(id)) ?? [];

  function choose(action: WorkspaceActionDescriptor) {
    setSelection({
      subjectKey,
      actionId: action.id,
      values: Object.fromEntries(action.fields.map((field) => [field.name, field.defaultValue])),
    });
    setPreview(null);
    setError('');
    setInvalid(null);
  }

  function update(name: string, value: string) {
    if (!selection || selection.subjectKey !== subjectKey) return;
    setSelection({ ...selection, values: { ...selection.values, [name]: value } });
    setPreview(null);
    setError('');
    setInvalid((current) => current?.subjectKey === subjectKey
      ? { subjectKey, fields: current.fields.filter((field) => field !== name) }
      : null);
  }

  function buildPreview() {
    if (!selected) return;
    try {
      const result = build(selected, values);
      setPreview({ subjectKey, result });
      setError('');
      setInvalid(null);
    } catch (cause) {
      setPreview(null);
      setError(locale === 'de' ? 'Prüfe die Eingaben und versuche es erneut.' : 'Review the values and try again.');
      const fieldName = cause instanceof FindingActionError ? cause.fieldName : undefined;
      setInvalid({ subjectKey, fields: fieldName ? [fieldName] : selected.fields.filter(({ required }) => required).map(({ name }) => name) });
    }
  }

  return <section className="workspace-action-composer" aria-labelledby={`${prefix}-heading`}>
    <header><Wrench size={18} aria-hidden="true" /><div><h3 id={`${prefix}-heading`}>{locale === 'de' ? 'Verfügbare Änderungen' : 'Available changes'}</h3><p>{locale === 'de' ? 'DHCPulse erzeugt nur eine lokale, prüfbare Vorschau. Es wird nichts ausgeführt.' : 'DHCPulse creates a local, reviewable preview only. Nothing is executed.'}</p></div></header>
    <div className="workspace-action-options" role="group" aria-label={locale === 'de' ? 'Änderung auswählen' : 'Choose a change'}>
      {actions.map((action) => <button key={action.id} type="button" aria-label={actionLabel(action.id, locale)} aria-pressed={selected?.id === action.id} onClick={() => choose(action)}><strong>{actionLabel(action.id, locale)}</strong><span>{action.mode === 'guided' ? (locale === 'de' ? 'Eingaben erforderlich' : 'Input required') : (locale === 'de' ? 'Aus Import ableitbar' : 'Derived from import')}</span></button>)}
    </div>
    {selected && <div className="workspace-action-editor">
      {selected.fields.length > 0 && <div className="workspace-action-fields">{selected.fields.map((field) => {
        const id = `${prefix}-${field.name}`;
        const fieldInvalid = invalid?.subjectKey === subjectKey && invalid.fields.includes(field.name);
        const errorId = `${id}-error`;
        return <label key={field.name} htmlFor={id}><span>{fieldLabel(field.name, locale)}</span>{field.type === 'select'
          ? <select id={id} value={values[field.name] ?? ''} required={field.required} aria-invalid={fieldInvalid} aria-describedby={fieldInvalid ? errorId : undefined} onChange={(event) => update(field.name, event.target.value)}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}{option.detail ? ` · ${option.detail}` : ''}</option>)}</select>
          : <input id={id} type={field.type === 'integer' ? 'number' : 'text'} inputMode={field.type === 'integer' ? 'numeric' : undefined} required={field.required} aria-invalid={fieldInvalid} aria-describedby={fieldInvalid ? errorId : undefined} value={values[field.name] ?? ''} onChange={(event) => update(field.name, event.target.value)} />}{fieldInvalid && <small id={errorId} className="field-error">{locale === 'de' ? 'Gib einen gültigen Wert ein.' : 'Enter a valid value.'}</small>}</label>;
      })}</div>}
      <button type="button" className="secondary-button" onClick={buildPreview}>{locale === 'de' ? 'Änderung prüfen' : 'Preview change'}</button>
    </div>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {visiblePreview && <section className="workspace-action-preview" aria-live="polite">
      <h3>{locale === 'de' ? 'Validierte Änderungsvorschau' : 'Validated change preview'}</h3>
      {previewOperations.length > 0 ? <ol>{previewOperations.map((operation) => <li key={operation.id}><strong>{operationLabel(operation.kind, locale)}</strong><dl><div><dt>{locale === 'de' ? 'Ziel' : 'Target'}</dt><dd>{operationTargetLabel(workspace, operation, locale)}</dd></div><div><dt>{locale === 'de' ? 'Vorher' : 'Before'}</dt><dd>{formatOperationState(operation, 'before', locale)}</dd></div><div><dt>{locale === 'de' ? 'Nachher' : 'After'}</dt><dd>{formatOperationState(operation, 'after', locale)}</dd></div></dl></li>)}</ol> : <p>{locale === 'de' ? 'Diese Änderung ist bereits im Änderungsplan.' : 'This change is already in the change plan.'}</p>}
      {visiblePreview.issues.length > 0 && <ul className="workspace-change-issues">{visiblePreview.issues.map((issue) => <li key={`${issue.operationId ?? 'set'}-${issue.code}`}>{issueLabel(issue.code, locale)}</li>)}</ul>}
      <footer><span className={visiblePreview.valid ? 'validation-ok' : 'field-error'}><CheckCircle2 size={16} aria-hidden="true" />{visiblePreview.valid ? (locale === 'de' ? 'Validierung bestanden' : 'Validation passed') : (locale === 'de' ? 'Validierung blockiert' : 'Validation blocked')}</span><button type="button" className="primary-button" disabled={!visiblePreview.valid || previewOperations.length === 0} onClick={() => onCommit(visiblePreview)}>{locale === 'de' ? 'Zum Änderungsplan hinzufügen' : 'Add to change plan'}</button></footer>
    </section>}
  </section>;
}

function actionLabel(id: WorkspaceActionDescriptor['id'], locale: Locale): string {
  const labels: Record<WorkspaceActionDescriptor['id'], [string, string]> = {
    'exclude-reserved-address': ['Reservierungsadresse ausschließen', 'Exclude reservation address'],
    'exclude-gateway-address': ['Gateway-Adresse ausschließen', 'Exclude gateway address'],
    'resolve-duplicate-reservations': ['Doppelte Reservierungen bereinigen', 'Resolve duplicate reservations'],
    'update-reservation-address': ['Reservierungsadresse korrigieren', 'Correct reservation address'],
    'set-valid-option-value': ['Optionswert korrigieren', 'Correct option value'],
    'align-option-with-server': ['An Serverwert angleichen', 'Align with server value'],
    'remove-scope-option': ['Scope-Überschreibung entfernen', 'Remove scope override'],
    'resize-scope-range': ['Adressbereich bearbeiten', 'Edit address range'],
    'set-scope-lease': ['Lease-Dauer festlegen', 'Set lease duration'],
    'clone-scope': ['Scope klonen', 'Clone scope'],
    'remove-exclusion': ['Ausschluss entfernen', 'Remove exclusion'],
    'update-reservation': ['Reservierung bearbeiten', 'Edit reservation'],
    'remove-reservation': ['Reservierung entfernen', 'Remove reservation'],
    'set-option-value': ['Optionswert bearbeiten', 'Edit option value'],
    'remove-option': ['Option entfernen', 'Remove option'],
    'set-server-option': ['Serveroption festlegen', 'Set server option'],
  };
  return labels[id][locale === 'de' ? 0 : 1];
}

function fieldLabel(name: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    keepReservationId: ['Zu behaltende Reservierung', 'Reservation to keep'],
    address: ['IPv4-Adresse', 'IPv4 address'],
    value: ['Optionswert', 'Option value'],
    start: ['Startadresse', 'Start address'],
    end: ['Endadresse', 'End address'],
    leaseSeconds: ['Lease-Dauer in Sekunden', 'Lease duration in seconds'],
    cidr: ['CIDR des neuen Scopes', 'New scope CIDR'],
    name: ['Name des neuen Scopes', 'New scope name'],
    clientId: ['Client-ID', 'Client ID'],
    hostname: ['Hostname', 'Hostname'],
    optionCode: ['Optionscode', 'Option code'],
  };
  return labels[name]?.[locale === 'de' ? 0 : 1] ?? name;
}

function operationLabel(kind: DhcpChangeOperation['kind'], locale: Locale) {
  const labels: Record<DhcpChangeOperation['kind'], [string, string]> = {
    'scope-range.set': ['Adressbereich ändern', 'Change address range'],
    'scope-lease.set': ['Lease-Dauer ändern', 'Change lease duration'],
    'exclusion.add': ['Ausschlussbereich hinzufügen', 'Add exclusion range'],
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

function formatOperationState(operation: DhcpChangeOperation, side: 'before' | 'after', locale: Locale) {
  if (operation.kind === 'scope-lease.set') {
    const seconds = side === 'before' ? operation.beforeSeconds : operation.afterSeconds;
    return `${seconds.toLocaleString(locale === 'de' ? 'de-DE' : 'en-US')} ${locale === 'de' ? 'Sekunden' : 'seconds'}`;
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

function issueLabel(code: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    'before-state-mismatch': ['Der Ausgangszustand stimmt nicht mit dem Import überein.', 'The current state does not match the import.'],
    'no-op': ['Vorher und nachher sind identisch.', 'Before and after are identical.'],
    'range-outside-scope': ['Der Bereich liegt außerhalb des Scopes.', 'The range is outside the scope.'],
    'exclusion-overlap': ['Der Ausschluss überschneidet sich mit einem vorhandenen Ausschluss.', 'The exclusion overlaps an existing exclusion.'],
    'reservation-outside-scope': ['Die Reservierung liegt außerhalb des Scopes.', 'The reservation is outside the scope.'],
    'duplicate-reservation-address': ['Die Reservierungsadresse ist bereits vorhanden.', 'The reservation address already exists.'],
    'duplicate-reservation-identifier': ['Die Client-ID ist bereits vorhanden.', 'The client ID already exists.'],
    'invalid-option-value': ['Der Optionswert ist ungültig.', 'The option value is invalid.'],
    'operation-conflict': ['Eine andere vorgemerkte Änderung bearbeitet dasselbe Ziel.', 'Another prepared change edits the same target.'],
  };
  return labels[code]?.[locale === 'de' ? 0 : 1] ?? (locale === 'de' ? `Validierung: ${code}` : `Validation: ${code}`);
}
