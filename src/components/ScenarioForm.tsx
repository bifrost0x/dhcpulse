import { RotateCcw } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { presets } from '../content/presets';
import { translate, type CopyKey, type Locale } from '../content/copy';
import type { ScenarioInput, ScenarioType, ValidationIssue } from '../domain/types';

interface ScenarioFormProps {
  input: ScenarioInput;
  issues: ValidationIssue[];
  locale: Locale;
  onChange: (changes: Partial<ScenarioInput>) => void;
  onReset: () => void;
}

const scenarioTypes: ScenarioType[] = ['migration', 'serverAddress', 'leaseChange', 'dnsChange', 'emergency'];

export function ScenarioForm({ input, issues, locale, onChange, onReset }: ScenarioFormProps) {
  const t = (key: CopyKey) => translate(locale, key);
  const issueFor = (field: keyof ScenarioInput) => issues.find((issue) => issue.field === field);
  const numberChange = (field: keyof ScenarioInput, raw: string) => onChange({ [field]: Number(raw) });
  const navigateScenario = (event: KeyboardEvent<HTMLInputElement>, current: ScenarioType) => {
    const currentIndex = scenarioTypes.indexOf(current);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % scenarioTypes.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + scenarioTypes.length) % scenarioTypes.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = scenarioTypes.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const next = scenarioTypes[nextIndex];
    if (!next) return;
    event.currentTarget.closest('[role="radiogroup"]')
      ?.querySelector<HTMLInputElement>(`input[value="${next}"]`)
      ?.focus();
    onChange({ scenarioType: next });
  };

  return (
    <section className="planner-card form-card" aria-labelledby="scenario-heading">
      <div className="card-heading">
        <div>
          <p className="section-kicker">{t('form.title')}</p>
          <h2 id="scenario-heading">{t('form.description')}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onReset} aria-label={t('form.reset')} title={t('form.reset')}>
          <RotateCcw size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="form-section presets-section">
        <h3>{t('form.preset')}</h3>
        <div className="preset-grid">
          {presets.map((preset) => (
            <button key={preset.id} type="button" className="preset-card" onClick={() => onChange(preset.input)}>
              <strong>{t(preset.labelKey)}</strong>
              <span>{t(preset.descriptionKey)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="form-section">
        <h3>{t('section.change')}</h3>
        <div className="scenario-grid" role="radiogroup" aria-label={t('section.change')}>
          {scenarioTypes.map((type) => (
            <label key={type} className={input.scenarioType === type ? 'choice-card selected' : 'choice-card'}>
              <input type="radio" name="scenario-type" value={type} checked={input.scenarioType === type} onChange={() => onChange({ scenarioType: type })} onKeyDown={(event) => navigateScenario(event, type)} />
              <span>{t(`scenario.${type}` as CopyKey)}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="form-section">
        <h3>{t('section.timing')}</h3>
        <div className="number-grid">
          <NumberField id="lease-duration" label={t('field.leaseDuration')} value={input.leaseDurationHours} suffix={t('field.hours')} min={0.25} step={0.25} issue={issueFor('leaseDurationHours')} locale={locale} onChange={(value) => numberChange('leaseDurationHours', value)} />
          {input.scenarioType === 'leaseChange' && (
            <NumberField id="new-lease-duration" label={t('field.newLeaseDuration')} value={input.newLeaseDurationHours} suffix={t('field.hours')} min={0.25} step={0.25} issue={issueFor('newLeaseDurationHours')} locale={locale} onChange={(value) => numberChange('newLeaseDurationHours', value)} />
          )}
          <NumberField id="t1" label={t('field.t1')} value={input.t1Percent} suffix={t('field.percent')} min={0.1} max={99.9} step={0.1} issue={issueFor('t1Percent')} locale={locale} onChange={(value) => numberChange('t1Percent', value)} />
          <NumberField id="t2" label={t('field.t2')} value={input.t2Percent} suffix={t('field.percent')} min={0.1} max={99.9} step={0.1} issue={issueFor('t2Percent')} locale={locale} onChange={(value) => numberChange('t2Percent', value)} />
        </div>
        <p className="field-help">{t(input.scenarioType === 'leaseChange' ? 'help.leaseChange' : 'help.timing')}</p>
      </div>

      <div className="form-section">
        <h3>{t('section.topology')}</h3>
        <div className="toggle-stack">
          <BooleanField label={t('field.sameAddress')} value={input.sameServerAddress} locale={locale} onChange={(value) => onChange({ sameServerAddress: value })} />
          <BooleanField label={t('field.usesRelay')} value={input.usesRelay} locale={locale} onChange={(value) => onChange({ usesRelay: value })} />
          {input.usesRelay && <BooleanField label={t('field.relayUpdated')} value={input.relayUpdated} locale={locale} onChange={(value) => onChange({ relayUpdated: value })} />}
          <BooleanField label={t('field.leasesTransferred')} value={input.leasesTransferred} locale={locale} onChange={(value) => onChange({ leasesTransferred: value })} />
          <BooleanField label={t('field.samePool')} value={input.samePool} locale={locale} onChange={(value) => onChange({ samePool: value })} />
          <BooleanField label={t('field.bothActive')} value={input.bothServersActive} locale={locale} onChange={(value) => onChange({ bothServersActive: value })} />
        </div>
      </div>

      <div className="form-section">
        <h3>{t('section.clients')}</h3>
        <div className="number-grid">
          <NumberField id="client-count" label={t('field.clientCount')} value={input.clientCount} min={0} step={1} issue={issueFor('clientCount')} locale={locale} onChange={(value) => numberChange('clientCount', value)} />
          <NumberField id="offline" label={t('field.offline')} value={input.offlinePercent} suffix={t('field.percent')} min={0} max={100} step={1} issue={issueFor('offlinePercent')} locale={locale} onChange={(value) => numberChange('offlinePercent', value)} />
        </div>
      </div>
    </section>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  value: number;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  issue?: ValidationIssue;
  locale: Locale;
  onChange: (value: string) => void;
}

function NumberField({ id, label, value, suffix, issue, locale, onChange, ...constraints }: NumberFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="number-field">
      <label htmlFor={id}>{label}</label>
      <div className={issue ? 'input-shell invalid' : 'input-shell'}>
        <input id={id} type="number" value={Number.isNaN(value) ? '' : value} aria-invalid={Boolean(issue)} aria-describedby={issue ? errorId : undefined} onChange={(event) => onChange(event.target.value)} {...constraints} />
        {suffix && <span>{suffix}</span>}
      </div>
      {issue && <span className="field-error" id={errorId}>{translate(locale, `validation.${issue.code}` as CopyKey)}</span>}
    </div>
  );
}

function BooleanField({ label, value, locale, onChange }: { label: string; value: boolean; locale: Locale; onChange: (value: boolean) => void }) {
  return (
    <fieldset className="boolean-field">
      <legend>{label}</legend>
      <div className="binary-control">
        <button type="button" aria-pressed={value} className={value ? 'active' : ''} onClick={() => onChange(true)}>{translate(locale, 'choice.yes')}</button>
        <button type="button" aria-pressed={!value} className={!value ? 'active' : ''} onClick={() => onChange(false)}>{translate(locale, 'choice.no')}</button>
      </div>
    </fieldset>
  );
}
