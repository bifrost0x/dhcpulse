import { ArrowLeft, BookOpen, RotateCcw } from 'lucide-react';
import type { MouseEvent, ReactNode, Ref } from 'react';
import { translate, type Locale } from '../content/copy';
import type { ToolCatalogEntry } from '../content/tool-catalog';
import { PrivacyNote } from './PrivacyNote';

interface ToolFrameProps {
  children: ReactNode;
  locale: Locale;
  tool: ToolCatalogEntry;
  headingRef?: Ref<HTMLHeadingElement>;
  onBack: () => void;
  onReset?: () => void;
}

export function ToolFrame({ children, locale, tool, headingRef, onBack, onReset }: ToolFrameProps) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const titleId = `tool-title-${tool.id}`;

  function handleBack(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onBack();
  }

  return (
    <article className="tool-frame" aria-labelledby={titleId}>
      <a className="back-link" href="#/utilities" onClick={handleBack}><ArrowLeft size={18} aria-hidden="true" />{t('frame.back')}</a>
      <header className="tool-frame-header">
        <div>
          <p className="section-kicker">{t(`catalog.group.${tool.group}`)}</p>
          <h1 ref={headingRef} id={titleId} tabIndex={-1}>{tool.name[locale]}</h1>
          <p>{tool.description[locale]}</p>
        </div>
        <div className="tool-reset-slot">
          {onReset ? (
            <button type="button" className="secondary-button" onClick={onReset}><RotateCcw size={17} aria-hidden="true" />{t('frame.resetTool')}</button>
          ) : <span>{t('frame.resetUnavailable')}</span>}
        </div>
      </header>

      <aside className="tool-context" aria-labelledby={`tool-context-${tool.id}`}>
        <BookOpen size={20} aria-hidden="true" />
        <div>
          <h2 id={`tool-context-${tool.id}`}>{t('frame.context')}</h2>
          <p>{t('frame.contextDescription')}</p>
          {tool.id === 'lease' && <a href="https://www.rfc-editor.org/rfc/rfc2131.html" target="_blank" rel="noreferrer">{t('frame.reference')}: RFC 2131</a>}
        </div>
      </aside>

      <div className="tool-content">{children}</div>
      <PrivacyNote locale={locale} />
    </article>
  );
}
