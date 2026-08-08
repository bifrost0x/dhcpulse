import { ShieldCheck } from 'lucide-react';
import { translate, type Locale } from '../content/copy';

export function PrivacyNote({ locale }: { locale: Locale }) {
  return (
    <aside className="privacy-note">
      <ShieldCheck size={20} aria-hidden="true" />
      <div><strong>{translate(locale, 'privacy.title')}</strong><p>{translate(locale, 'privacy.description')}</p></div>
    </aside>
  );
}
