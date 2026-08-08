import { useState } from 'react';
import { WorkbenchShell } from './components/WorkbenchShell';
import type { Locale } from './content/copy';

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');

  function changeLocale(nextLocale: Locale) {
    document.documentElement.lang = nextLocale;
    setLocale(nextLocale);
  }

  return <WorkbenchShell locale={locale} onLocaleChange={changeLocale} />;
}
