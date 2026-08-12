import { FileCode2, FolderOpen, ShieldCheck, Wrench } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import exampleXml from '../../../samples/microsoft-dhcp-realistic-large.xml?raw';
import type { Locale } from '../../content/copy';
import { ConfigImportError, importDhcpConfiguration } from '../../domain/config-import';
import { buildConfigurationWorkspace, type ConfigurationWorkspace } from '../../domain/config-workspace';
import { ConfigurationExportGuide } from './ConfigurationExportGuide';

const MAX_FILE_SIZE = 2 * 1024 * 1024;

interface Props {
  locale: Locale;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onOpen: (workspace: ConfigurationWorkspace, fileName: string) => void;
  notice?: string;
}

export function ConfigurationEntry({ locale, headingRef, onOpen, notice }: Props) {
  const [error, setError] = useState('');
  const readGeneration = useRef(0);
  const c = locale === 'de' ? {
    eyebrow: 'Lokaler DHCP-Arbeitsbereich', title: 'DHCP-Konfiguration verstehen und verbessern',
    intro: 'Konfiguration importieren, Zusammenhänge prüfen und nachvollziehbare Änderungen vorbereiten. Dateien bleiben in diesem Browser.',
    file: 'DHCP-Konfigurationsdatei', choose: 'Konfiguration öffnen', example: 'Microsoft-Beispiel öffnen',
    supported: 'Microsoft DHCP XML, Kea JSON, ISC dhcpd und dnsmasq bis 2 MiB', utilities: 'Werkzeuge öffnen',
    private: 'Lokal und privat', privateText: 'Keine Uploads, keine Speicherung und keine externen Analyse-Endpunkte.',
    invalid: 'Die Konfiguration konnte nicht gelesen werden.', large: 'Die Datei überschreitet 2 MiB.',
  } : {
    eyebrow: 'Local DHCP workspace', title: 'Understand and improve your DHCP configuration',
    intro: 'Import a configuration, understand the relationships, and prepare explainable changes. Files stay in this browser.',
    file: 'DHCP configuration file', choose: 'Open configuration', example: 'Open Microsoft example',
    supported: 'Microsoft DHCP XML, Kea JSON, ISC dhcpd, and dnsmasq up to 2 MiB', utilities: 'Open utilities',
    private: 'Local and private', privateText: 'No uploads, no storage, and no external analysis endpoints.',
    invalid: 'The configuration could not be read.', large: 'The file exceeds 2 MiB.',
  };

  useEffect(() => () => { readGeneration.current += 1; }, []);

  function openText(text: string, fileName: string) {
    try {
      const imported = importDhcpConfiguration({ text, fileName });
      setError('');
      onOpen(buildConfigurationWorkspace(imported.configuration), fileName);
    } catch (caught) {
      setError(caught instanceof ConfigImportError ? `${c.invalid} (${caught.code})` : c.invalid);
    }
  }

  async function openFile(file: File | undefined) {
    const generation = ++readGeneration.current;
    setError('');
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setError(c.large);
      return;
    }
    try {
      const text = await file.text();
      if (generation !== readGeneration.current) return;
      openText(text, file.name);
    } catch {
      if (generation === readGeneration.current) setError(c.invalid);
    }
  }

  return <>
    <section className="config-entry-hero">
      <div className="config-entry-copy">
        <p className="eyebrow"><span className="pulse-dot" />{c.eyebrow}</p>
        <h1 ref={headingRef} tabIndex={-1}>{c.title}</h1>
        <p>{c.intro}</p>
        {notice && <p className="config-session-notice" role="status">{notice}</p>}
        <div className="config-entry-actions">
          <label className="primary-button config-file-button">
            <FolderOpen size={18} aria-hidden="true" />{c.choose}
            <input type="file" aria-label={c.file} accept=".xml,.json,.conf,text/plain,application/json,application/xml,text/xml" onChange={(event) => void openFile(event.target.files?.[0])} />
          </label>
          <button className="secondary-button" type="button" onClick={() => openText(exampleXml, 'microsoft-dhcp-realistic-large.xml')}><FileCode2 size={18} aria-hidden="true" />{c.example}</button>
        </div>
        <p className="config-supported">{c.supported}</p>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
      <aside className="config-entry-assurance" aria-label={c.private}>
        <ShieldCheck size={28} aria-hidden="true" />
        <div><strong>{c.private}</strong><p>{c.privateText}</p></div>
      </aside>
    </section>
    <ConfigurationExportGuide locale={locale} />
    <section className="config-utilities-link planner-card">
      <Wrench size={22} aria-hidden="true" />
      <div><strong>{locale === 'de' ? 'Einzelne DHCP-Aufgabe lösen?' : 'Need a focused DHCP calculator?'}</strong><p>{locale === 'de' ? 'Die Spezialwerkzeuge bleiben separat verfügbar.' : 'The specialist utilities remain available separately.'}</p></div>
      <a className="secondary-button" href="#/utilities">{c.utilities}</a>
    </section>
  </>;
}
