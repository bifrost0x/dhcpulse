import { ArrowRight, Search } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { interpolate, translate, type Locale } from '../content/copy';
import { toolCatalog, type ToolCatalogEntry, type ToolGroup } from '../content/tool-catalog';

type ToolId = ToolCatalogEntry['id'];
type Category = 'all' | ToolGroup;

const categories: Category[] = ['all', 'plan', 'build', 'analyze', 'troubleshoot', 'secure'];

const keywords: Record<ToolId, { en: string[]; de: string[] }> = {
  'microsoft-workspace': { en: ['microsoft', 'windows', 'xml', 'powershell', 'change package'], de: ['microsoft', 'windows', 'xml', 'powershell', 'change-paket'] },
  scope: { en: ['subnet', 'cidr', 'pool', 'capacity'], de: ['subnetz', 'cidr', 'pool', 'kapazität'] },
  lease: { en: ['cutover', 'migration', 'renewal', 'timing'], de: ['cutover', 'migration', 'renewal', 'zeit'] },
  options: { en: ['option', 'dns', 'gateway', 'encode'], de: ['option', 'dns', 'gateway', 'kodieren'] },
  pxe: { en: ['boot', 'network', 'wds', 'uefi'], de: ['start', 'netzwerk', 'wds', 'uefi'] },
  failover: { en: ['resilience', 'partner', 'mclt', 'availability'], de: ['ausfallsicherheit', 'partner', 'mclt', 'verfügbarkeit'] },
  dhcpv6: { en: ['ipv6', 'router advertisement', 'prefix'], de: ['ipv6', 'router advertisement', 'präfix'] },
  diagnostics: { en: ['troubleshoot', 'discover', 'offer', 'renewal'], de: ['diagnose', 'discover', 'offer', 'erneuerung'] },
  security: { en: ['snooping', 'audit', 'hardening', 'rogue'], de: ['snooping', 'audit', 'härtung', 'rogue'] },
  'config-analyzer': { en: ['configuration', 'import', 'review', 'risk'], de: ['konfiguration', 'import', 'prüfung', 'risiko'] },
  'config-diff': { en: ['configuration', 'compare', 'migration', 'change'], de: ['konfiguration', 'vergleich', 'migration', 'änderung'] },
};

interface ToolCatalogProps {
  locale: Locale;
  onToolSelect: (id: ToolId) => void;
  exclude?: ToolId[];
}

export function ToolCatalog({ locale, onToolSelect, exclude = [] }: ToolCatalogProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const categoryRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const visibleTools = useMemo(() => toolCatalog.filter((tool) => {
    if (exclude.includes(tool.id)) return false;
    if (category !== 'all' && tool.group !== category) return false;
    if (!normalizedQuery) return true;
    const groupKey = `catalog.group.${tool.group}` as const;
    const searchable = [
      tool.id,
      tool.name.en,
      tool.name.de,
      tool.description.en,
      tool.description.de,
      translate('en', groupKey),
      translate('de', groupKey),
      ...keywords[tool.id].en,
      ...keywords[tool.id].de,
    ].join(' ').toLocaleLowerCase(locale);
    return searchable.includes(normalizedQuery);
  }), [category, exclude, locale, normalizedQuery]);

  function categoryLabel(value: Category) {
    return value === 'all' ? t('catalog.all') : t(`catalog.group.${value}`);
  }

  function selectCategory(index: number) {
    const next = categories[index];
    if (!next) return;
    setCategory(next);
    categoryRefs.current[index]?.focus();
  }

  function handleCategoryKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % categories.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + categories.length) % categories.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = categories.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectCategory(nextIndex);
  }

  function handleToolClick(event: MouseEvent<HTMLAnchorElement>, id: ToolId) {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      onToolSelect(id);
    }
  }

  return (
    <section className="catalog-section" aria-labelledby="catalog-heading">
      <div className="catalog-toolbar">
        <label className="catalog-search">
          <span className="visually-hidden">{t('catalog.search')}</span>
          <Search size={19} aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('catalog.searchPlaceholder')} aria-label={t('catalog.search')} />
        </label>
        <p className="tool-count" aria-live="polite">{interpolate(t('shell.toolCount'), { count: visibleTools.length })}</p>
      </div>

      <div className="category-tabs" role="toolbar" aria-label={t('catalog.filters')} aria-orientation="horizontal">
        {categories.map((value, index) => (
          <button
            key={value}
            ref={(node) => { categoryRefs.current[index] = node; }}
            type="button"
            aria-pressed={category === value}
            tabIndex={category === value ? 0 : -1}
            onClick={() => setCategory(value)}
            onKeyDown={(event) => handleCategoryKey(event, index)}
          >
            {categoryLabel(value)}
          </button>
        ))}
      </div>

      <div id="catalog-heading" className="visually-hidden">{t('shell.title')}</div>
      {visibleTools.length === 0 ? (
        <div className="catalog-empty">
          <h2>{t('catalog.empty')}</h2>
          <p>{t('catalog.emptyHint')}</p>
          <button type="button" className="secondary-button" onClick={() => { setQuery(''); setCategory('all'); }}>{t('catalog.clear')}</button>
        </div>
      ) : categories.slice(1).map((group) => {
        const tools = visibleTools.filter((tool) => tool.group === group);
        if (tools.length === 0) return null;
        const headingId = `catalog-group-${group}`;
        return (
          <section key={group} className="catalog-group" aria-labelledby={headingId}>
            <h2 id={headingId}>{categoryLabel(group)}</h2>
            <div className="tool-grid">
              {tools.map((tool) => (
                <a key={tool.id} className={`tool-card${tool.id === 'microsoft-workspace' ? ' tool-card-featured' : ''}`} href={`#/tool/${tool.id}`} onClick={(event) => handleToolClick(event, tool.id)}>
                  <span className="tool-card-group">{categoryLabel(tool.group)}</span>
                  <strong>{tool.name[locale]}</strong>
                  <p>{tool.description[locale]}</p>
                  <span className="tool-card-action">{t('catalog.open')}<ArrowRight size={17} aria-hidden="true" /></span>
                </a>
              ))}
            </div>
          </section>
        );
      })}
    </section>
  );
}
