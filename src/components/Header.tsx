import { GitFork, Languages } from 'lucide-react';
import { translate, type Locale } from '../content/copy';

interface HeaderProps {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}

export function Header({ locale, onLocaleChange }: HeaderProps) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label={t('nav.home')}>
        <img src="./dhcpulse-mark.svg" alt="" width="38" height="38" />
        <span>
          <strong>{t('app.name')}</strong>
          <small>{t('app.tagline')}</small>
        </span>
      </a>
      <nav aria-label={t('nav.primary')}>
        <a className="header-link" href="https://github.com/bifrost0x/dhcpulse" target="_blank" rel="noreferrer">
          <GitFork size={17} aria-hidden="true" />
          <span>{t('nav.github')}</span>
        </a>
        <div className="language-switch" aria-label={t('nav.language')}>
          <Languages size={17} aria-hidden="true" />
          <button type="button" className={locale === 'en' ? 'active' : ''} onClick={() => onLocaleChange('en')} aria-label="English" aria-pressed={locale === 'en'}>EN</button>
          <span aria-hidden="true">/</span>
          <button type="button" className={locale === 'de' ? 'active' : ''} onClick={() => onLocaleChange('de')} aria-label="Deutsch" aria-pressed={locale === 'de'}>DE</button>
        </div>
      </nav>
    </header>
  );
}
