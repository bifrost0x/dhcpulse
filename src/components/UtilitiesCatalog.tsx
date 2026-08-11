import type { Locale } from '../content/copy';
import type { ToolCatalogEntry } from '../content/tool-catalog';
import { ToolCatalog } from './ToolCatalog';

type ToolId = ToolCatalogEntry['id'];

export function UtilitiesCatalog({ locale, headingRef, onToolSelect }: { locale: Locale; headingRef: React.RefObject<HTMLHeadingElement | null>; onToolSelect: (id: ToolId) => void }) {
  return <>
    <section className="catalog-hero utilities-hero"><p className="eyebrow"><span className="pulse-dot" />{locale === 'de' ? 'Spezialwerkzeuge' : 'Specialist utilities'}</p><h1 ref={headingRef} tabIndex={-1}>{locale === 'de' ? 'DHCP-Werkzeuge' : 'DHCP utilities'}</h1><p>{locale === 'de' ? 'Gezielte Rechner und Generatoren für einzelne Aufgaben.' : 'Focused calculators and generators for individual tasks.'}</p><a className="text-button" href="#/">{locale === 'de' ? 'Zur Konfigurationsanalyse' : 'Back to configuration analysis'}</a></section>
    <ToolCatalog locale={locale} onToolSelect={onToolSelect} exclude={['microsoft-workspace', 'config-analyzer']} />
  </>;
}
