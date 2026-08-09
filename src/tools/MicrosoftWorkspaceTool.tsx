import { FileCode2, FolderOpen, RotateCcw, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceFindings } from '../components/workspace/WorkspaceFindings';
import { WorkspaceChangePanel } from '../components/workspace/WorkspaceChangePanel';
import { WorkspaceNavigation } from '../components/workspace/WorkspaceNavigation';
import { WorkspaceObjectView } from '../components/workspace/WorkspaceObjectView';
import { ConfigImportError, importDhcpConfiguration } from '../domain/config-import';
import { buildMicrosoftWorkspace, type MicrosoftWorkspace } from '../domain/microsoft-workspace';
import type { ToolPanelProps } from './ToolPanel';

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const syntheticExample = `<?xml version="1.0" encoding="utf-8"?>
<DhcpServerExport Version="1.0">
  <Server><Name>dhcp01.example.com</Name><AuditLog><Enable>true</Enable></AuditLog></Server>
  <IPv4>
    <OptionValues><OptionValue><OptionId>15</OptionId><Value>example.com</Value></OptionValue></OptionValues>
    <Scopes><Scope>
      <ScopeId>192.0.2.0</ScopeId><SubnetMask>255.255.255.0</SubnetMask><Name>Documentation LAN</Name><LeaseDuration>08:00:00</LeaseDuration>
      <IPRanges><IPRange><StartRange>192.0.2.20</StartRange><EndRange>192.0.2.120</EndRange></IPRange></IPRanges>
      <ExclusionRanges><ExclusionRange><StartRange>192.0.2.30</StartRange><EndRange>192.0.2.39</EndRange></ExclusionRange></ExclusionRanges>
      <Reservations><Reservation><IPAddress>192.0.2.50</IPAddress><ClientId>02-00-5E-10-00-01</ClientId><Name>printer.example.com</Name></Reservation></Reservations>
      <OptionValues><OptionValue><OptionId>6</OptionId><Value>192.0.2.53</Value></OptionValue></OptionValues>
    </Scope></Scopes>
    <FailoverRelationships><FailoverRelationship><Name>example-ha</Name><PartnerServer>dhcp02.example.com</PartnerServer><Mode>LoadBalance</Mode></FailoverRelationship></FailoverRelationships>
  </IPv4>
</DhcpServerExport>`;

const copy = {
  en: {
    importTitle: 'Open a Microsoft DHCP export', importDescription: 'Drop or choose an Export-DhcpServer XML file. It is parsed only in this browser.', file: 'Microsoft DHCP XML export', example: 'Open synthetic example', reset: 'Reset workspace', tooLarge: 'Files must be 2 MiB or smaller.', readError: 'The file could not be read.', importError: 'This is not a supported Microsoft DHCP XML export.', local: 'Local only', source: 'Source export', overview: 'Workspace', changeSet: 'Change Set', package: 'Package', imported: 'Imported locally', limitations: 'Parser coverage', partial: 'Bounded Microsoft XML support; review parser findings before generating changes.', fileHint: 'XML, maximum 2 MiB', paste: 'Paste XML instead', pasteLabel: 'Microsoft DHCP XML', openPaste: 'Open pasted export', emptyPaste: 'Paste a Microsoft DHCP XML export first.',
  },
  de: {
    importTitle: 'Microsoft-DHCP-Export öffnen', importDescription: 'Ziehe eine Export-DhcpServer-XML-Datei hierher oder wähle sie aus. Sie wird ausschließlich in diesem Browser verarbeitet.', file: 'Microsoft-DHCP-XML-Export', example: 'Synthetisches Beispiel öffnen', reset: 'Arbeitsbereich zurücksetzen', tooLarge: 'Dateien dürfen höchstens 2 MiB groß sein.', readError: 'Die Datei konnte nicht gelesen werden.', importError: 'Dies ist kein unterstützter Microsoft-DHCP-XML-Export.', local: 'Nur lokal', source: 'Quell-Export', overview: 'Arbeitsbereich', changeSet: 'Change Set', package: 'Paket', imported: 'Lokal importiert', limitations: 'Parserabdeckung', partial: 'Begrenzte Microsoft-XML-Unterstützung; prüfe Parserbefunde vor der Change-Erzeugung.', fileHint: 'XML, maximal 2 MiB', paste: 'XML stattdessen einfügen', pasteLabel: 'Microsoft-DHCP-XML', openPaste: 'Eingefügten Export öffnen', emptyPaste: 'Füge zuerst einen Microsoft-DHCP-XML-Export ein.',
  },
} as const;

export function MicrosoftWorkspaceTool({ locale }: ToolPanelProps) {
  const c = copy[locale];
  const [workspace, setWorkspace] = useState<MicrosoftWorkspace | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [fileKey, setFileKey] = useState(0);
  const [pastedXml, setPastedXml] = useState('');
  const generation = useRef(0);
  const overviewHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => { generation.current += 1; }, []);
  useEffect(() => { if (workspace) overviewHeadingRef.current?.focus(); }, [workspace]);

  const selected = useMemo(() => workspace?.nodes.find(({ id }) => id === selectedId) ?? null, [selectedId, workspace]);

  function open(content: string, name: string) {
    try {
      const imported = importDhcpConfiguration({ text: content, fileName: name, format: 'microsoft-xml' });
      const next = buildMicrosoftWorkspace(imported.configuration);
      setWorkspace(next);
      setSelectedId(null);
      setFileName(name);
      setPastedXml('');
      setError('');
    } catch (caught) {
      setWorkspace(null);
      setSelectedId(null);
      setFileName('');
      setError(caught instanceof ConfigImportError ? c.importError : c.importError);
    }
  }

  async function onFile(file: File | undefined) {
    const token = ++generation.current;
    setWorkspace(null);
    setSelectedId(null);
    setError('');
    setFileName('');
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setError(c.tooLarge);
      return;
    }
    try {
      const content = await file.text();
      if (token !== generation.current) return;
      open(content, file.name);
    } catch {
      if (token !== generation.current) return;
      setError(c.readError);
    }
  }

  function reset() {
    generation.current += 1;
    setWorkspace(null);
    setSelectedId(null);
    setFileName('');
    setError('');
    setPastedXml('');
    setFileKey((value) => value + 1);
  }

  if (!workspace) return (
    <section className="workspace-import planner-card" aria-labelledby="workspace-import-heading" data-testid="tool-panel-microsoft-workspace">
      <div className="workspace-import-icon"><FolderOpen size={28} aria-hidden="true" /></div>
      <p className="section-kicker">Export-DhcpServer</p>
      <h2 id="workspace-import-heading">{c.importTitle}</h2>
      <p>{c.importDescription}</p>
      <label className="workspace-dropzone">
        <FileCode2 size={28} aria-hidden="true" />
        <strong>{c.file}</strong>
        <span>{c.fileHint}</span>
        <input key={fileKey} type="file" accept=".xml,application/xml,text/xml" aria-label={c.file} aria-describedby={error ? 'workspace-import-error' : 'workspace-file-note'} aria-invalid={Boolean(error)} onChange={(event) => void onFile(event.target.files?.[0])} />
      </label>
      <small id="workspace-file-note"><ShieldCheck size={14} aria-hidden="true" />{c.local}</small>
      {error && <p id="workspace-import-error" className="field-error" role="alert">{error}</p>}
      <div className="workspace-import-actions"><button type="button" className="primary-button" onClick={() => open(syntheticExample, 'dhcpulse-example.xml')}>{c.example}</button><button type="button" className="secondary-button" onClick={reset}><RotateCcw size={16} aria-hidden="true" />{c.reset}</button></div>
      <details className="workspace-paste"><summary>{c.paste}</summary><label className="workbench-field"><span>{c.pasteLabel}</span><textarea rows={8} value={pastedXml} onChange={(event) => { generation.current += 1; setPastedXml(event.target.value); setError(''); }} /></label><button type="button" className="secondary-button" disabled={!pastedXml.trim()} onClick={() => open(pastedXml, 'pasted-export.xml')}>{c.openPaste}</button></details>
    </section>
  );

  return (
    <div className="microsoft-workspace" data-testid="tool-panel-microsoft-workspace">
      <header className="workspace-status planner-card">
        <div><span className="workspace-status-dot" /><strong>{c.imported}</strong><small>{fileName}</small></div>
        <ol aria-label={locale === 'de' ? 'Arbeitsablauf' : 'Workflow'}><li className="active">1 · {c.overview}</li><li>2 · {c.changeSet}</li><li>3 · {c.package}</li></ol>
        <button type="button" className="secondary-button" onClick={reset}><RotateCcw size={16} aria-hidden="true" />{c.reset}</button>
      </header>
      <aside className="workspace-limitation"><strong>{c.limitations}</strong><span>{c.partial}</span></aside>
      <div className="workspace-layout">
        <WorkspaceNavigation locale={locale} workspace={workspace} selectedId={selectedId} onSelect={setSelectedId} />
        <WorkspaceObjectView locale={locale} workspace={workspace} selected={selected} overviewHeadingRef={overviewHeadingRef} />
        <WorkspaceFindings locale={locale} workspace={workspace} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      <WorkspaceChangePanel locale={locale} workspace={workspace} selected={selected} />
    </div>
  );
}
