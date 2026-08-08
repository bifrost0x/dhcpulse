import { CheckSquare2 } from 'lucide-react';
import { translate, type CopyKey, type Locale } from '../content/copy';
import type { ChecklistPhase } from '../domain/types';

export function Checklist({ phases, locale }: { phases: ChecklistPhase[]; locale: Locale }) {
  return (
    <section className="result-section" aria-labelledby="checklist-heading">
      <div className="result-section-heading"><CheckSquare2 size={18} aria-hidden="true" /><h3 id="checklist-heading">{translate(locale, 'checklist.title')}</h3></div>
      <div className="checklist-phases">
        {phases.map((phase) => (
          <details key={phase.phase} open={phase.phase === 'prepare'}>
            <summary><span>{translate(locale, `phase.${phase.phase}` as CopyKey)}</span><small>{phase.actionKeys.length}</small></summary>
            <ul>{phase.actionKeys.map((key) => <li key={key}><span className="fake-checkbox" aria-hidden="true" />{translate(locale, `action.${key}` as CopyKey)}</li>)}</ul>
          </details>
        ))}
      </div>
    </section>
  );
}
