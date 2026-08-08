import { useMemo, useState } from 'react';
import { ResultsPanel } from '../components/ResultsPanel';
import { ScenarioForm } from '../components/ScenarioForm';
import { defaultScenario } from '../domain/defaults';
import { validateScenario } from '../domain/lease-model';
import { buildPlan } from '../domain/planner';
import type { ScenarioInput } from '../domain/types';
import { translate, type Locale } from '../content/copy';

interface LeaseToolProps { locale: Locale }

export function LeaseTool({ locale }: LeaseToolProps) {
  const [input, setInput] = useState<ScenarioInput>({ ...defaultScenario });
  const issues = useMemo(() => validateScenario(input), [input]);
  const result = useMemo(() => (issues.length === 0 ? buildPlan(input) : null), [input, issues]);

  function updateInput(changes: Partial<ScenarioInput>) {
    setInput((current) => ({ ...current, ...changes }));
  }

  function reset() {
    setInput({ ...defaultScenario });
  }

  return (
    <div className="workspace" data-testid="tool-panel-lease">
      <ScenarioForm input={input} issues={issues} locale={locale} onChange={updateInput} onReset={reset} />
      <div className="results-column">
        {result ? <ResultsPanel input={input} result={result} locale={locale} /> : (
          <section className="planner-card invalid-results" role="region" aria-label={translate(locale, 'results.title')}>
            <span className="invalid-icon" aria-hidden="true">!</span>
            <h2>{translate(locale, 'results.invalid')}</h2>
          </section>
        )}
      </div>
    </div>
  );
}
