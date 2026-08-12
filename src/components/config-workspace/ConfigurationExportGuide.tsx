import { BookOpenCheck, ExternalLink, FileTerminal, ShieldAlert } from 'lucide-react';
import type { Locale } from '../../content/copy';

interface ConfigurationExportGuideProps {
  locale: Locale;
}

const fullExportCommand = `$ExportPath = Join-Path $env:TEMP 'dhcpulse-export.xml'
Export-DhcpServer -ComputerName $env:COMPUTERNAME -File $ExportPath -Force
$ExportPath`;

const scopeExportCommand = `$ExportPath = Join-Path $env:TEMP 'dhcpulse-scope.xml'
Export-DhcpServer -ComputerName $env:COMPUTERNAME -File $ExportPath -ScopeId 10.10.10.0 -Force
$ExportPath`;

export function ConfigurationExportGuide({ locale }: ConfigurationExportGuideProps) {
  const de = locale === 'de';

  return (
    <section className="config-export-guide planner-card" aria-labelledby="config-export-guide-heading">
      <header className="config-export-guide-header">
        <p className="config-export-eyebrow">
          <BookOpenCheck aria-hidden="true" size={16} />
          {de ? 'Hier starten, wenn noch keine Datei vorliegt' : 'Start here if you do not have a file'}
        </p>
        <h2 id="config-export-guide-heading">
          {de ? 'Microsoft-DHCP-Export erstellen' : 'Create a Microsoft DHCP export'}
        </h2>
        <p>
          {de
            ? 'Der Export liest die DHCP-Konfiguration und schreibt sie in eine lokale XML-Datei. Er verändert den Server nicht.'
            : 'The export reads the DHCP configuration and writes it to a local XML file. It does not change the server.'}
        </p>
      </header>

      <div className="config-export-guide-grid">
        <article className="config-export-step">
          <span className="config-export-step-number" aria-hidden="true">1</span>
          <div>
            <h3>{de ? 'Auf dem DHCP-Server ausführen' : 'Run on the DHCP server'}</h3>
            <p>
              {de
                ? 'Öffne Windows PowerShell mit einem Konto, das die DHCP-Konfiguration lesen darf. Das DHCP-Server-PowerShell-Modul muss auf dem Server oder über RSAT verfügbar sein.'
                : 'Open Windows PowerShell with an account that can read the DHCP configuration. The DHCP Server PowerShell module must be available on the server or through RSAT.'}
            </p>
          </div>
        </article>

        <article className="config-export-step config-export-command">
          <span className="config-export-step-number" aria-hidden="true">2</span>
          <div>
            <h3>{de ? 'Konfiguration exportieren' : 'Export the configuration'}</h3>
            <pre aria-label={de ? 'PowerShell-Befehl für den vollständigen Export' : 'PowerShell command for the full export'}>
              <code>{fullExportCommand}</code>
            </pre>
            <p>
              {de
                ? 'PowerShell gibt anschließend den Speicherort aus. Wähle diese XML-Datei oben in DHCPulse aus.'
                : 'PowerShell prints the saved location. Select that XML file in DHCPulse above.'}
            </p>
          </div>
        </article>
      </div>

      <div className="config-export-notices">
        <div className="config-export-note">
          <ShieldAlert aria-hidden="true" size={20} />
          <div>
            <strong>{de ? 'Nur die benötigten Daten exportieren' : 'Export only what is needed'}</strong>
            <p>
              {de
                ? 'Füge -Leases nicht hinzu. Lease-Daten werden für diesen Workspace nicht benötigt. Der Export kann Hostnamen, IP-Adressen und Client-IDs enthalten. Lösche oder schütze die Datei nach der Nutzung.'
                : 'Do not add -Leases. Lease data is not needed by this workspace. The export can contain hostnames, IP addresses, and client identifiers. Delete or protect it after use.'}
            </p>
          </div>
        </div>

        <details className="config-export-details" open>
          <summary>{de ? 'Export größer als 2 MiB?' : 'Export larger than 2 MiB?'}</summary>
          <p>
            {de
              ? 'Exportiere einzelne Bereiche nacheinander. Ersetze die Beispiel-ID durch die Netzwerkadresse des gewünschten DHCP-Bereichs.'
              : 'Export individual scopes separately. Replace the example ID with the network address of the DHCP scope you need.'}
          </p>
          <pre aria-label={de ? 'PowerShell-Befehl für einen einzelnen Bereich' : 'PowerShell command for a single scope'}>
            <code>{scopeExportCommand}</code>
          </pre>
        </details>
      </div>

      <div className="config-export-guide-footer">
        <a
          className="secondary-button"
          href="https://learn.microsoft.com/en-us/powershell/module/dhcpserver/export-dhcpserver?view=windowsserver2025-ps"
          target="_blank"
          rel="noreferrer"
          aria-label={de ? 'Offizielle Export-DhcpServer-Dokumentation öffnen' : 'Open the official Export-DhcpServer documentation'}
        >
          <ExternalLink aria-hidden="true" size={16} />
          {de ? 'Microsoft-Dokumentation' : 'Microsoft documentation'}
        </a>

        <details className="config-export-other-vendors">
          <summary>
            <FileTerminal aria-hidden="true" size={17} />
            {de ? 'Kea, ISC dhcpd oder dnsmasq?' : 'Kea, ISC dhcpd, or dnsmasq?'}
          </summary>
          <ul>
            <li><strong>Kea:</strong> {de ? 'Wähle die aktive JSON-Konfiguration, häufig kea-dhcp4.conf.' : 'Select the active JSON configuration, commonly named kea-dhcp4.conf.'}</li>
            <li><strong>ISC dhcpd:</strong> {de ? 'Wähle die aktive dhcpd.conf.' : 'Select the active dhcpd.conf.'}</li>
            <li><strong>dnsmasq:</strong> {de ? 'Wähle die aktive Hauptkonfiguration oder eine zusammengeführte .conf-Datei. Eingebundene Dateien müssen gegebenenfalls zusammengeführt werden.' : 'Select the active primary configuration or a consolidated .conf file. Included files may need to be combined.'}</li>
          </ul>
        </details>
      </div>
    </section>
  );
}
