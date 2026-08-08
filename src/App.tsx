import { useMemo, useState } from 'react';
import { Header } from './components/Header';
import { ResultsPanel } from './components/ResultsPanel';
import { ScenarioForm } from './components/ScenarioForm';
import { defaultScenario } from './domain/defaults';
import { validateScenario } from './domain/lease-model';
import { buildPlan } from './domain/planner';
import type { ScenarioInput } from './domain/types';
import { translate, type Locale } from './content/copy';

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const [input, setInput] = useState<ScenarioInput>({ ...defaultScenario });
  const issues = useMemo(() => validateScenario(input), [input]);
  const result = useMemo(() => (issues.length === 0 ? buildPlan(input) : null), [input, issues]);

  function updateInput(changes: Partial<ScenarioInput>) {
    setInput((current) => ({ ...current, ...changes }));
  }

  function changeLocale(nextLocale: Locale) {
    document.documentElement.lang = nextLocale;
    setLocale(nextLocale);
  }

  return (
    <div id="top" className="app-shell">
      <Header locale={locale} onLocaleChange={changeLocale} />
      <main>
        <section className="hero">
          <p className="eyebrow"><span className="pulse-dot" />{translate(locale, 'hero.eyebrow')}</p>
          <h1>{translate(locale, 'hero.title')}</h1>
          <p className="hero-copy">{translate(locale, 'hero.description')}</p>
          <div className="trust-badges" aria-label="Privacy features">
            <span>{translate(locale, 'hero.badge.local')}</span><span>{translate(locale, 'hero.badge.noUpload')}</span><span>{translate(locale, 'hero.badge.open')}</span>
          </div>
        </section>
        <div className="workspace">
          <ScenarioForm input={input} issues={issues} locale={locale} onChange={updateInput} onReset={() => setInput({ ...defaultScenario })} />
          <div className="results-column">
            {result ? <ResultsPanel input={input} result={result} locale={locale} /> : (
              <section className="planner-card invalid-results" role="region" aria-label={translate(locale, 'results.title')}>
                <AlertIcon />
                <h2>{translate(locale, 'results.invalid')}</h2>
              </section>
            )}
          </div>
        </div>
      </main>
      <footer><p>{translate(locale, 'footer.disclaimer')}</p><a href="https://www.rfc-editor.org/rfc/rfc2131.html" target="_blank" rel="noreferrer">{translate(locale, 'footer.rfc')}</a></footer>
    </div>
  );
}

function AlertIcon() {
  return <span className="invalid-icon" aria-hidden="true">!</span>;
}
