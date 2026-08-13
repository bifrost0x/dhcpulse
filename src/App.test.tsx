import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import dnsmasq from './test/fixtures/dnsmasq.conf?raw';
import iscDhcpd from './test/fixtures/isc-dhcpd.conf?raw';
import kea from './test/fixtures/kea.json?raw';
import microsoftXml from './test/fixtures/microsoft-dhcp.xml?raw';

const toolNames = [
  'Microsoft DHCP Config Workspace',
  'Scope and capacity',
  'Lease transition',
  'DHCP options',
  'PXE boot',
  'Failover design',
  'DHCPv6',
  'Diagnostics',
  'DHCP security',
  'Configuration analyzer',
  'Configuration comparison',
];

function renderAt(hash = '') {
  window.history.replaceState(null, '', hash || '/');
  return render(<App />);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe('DHCPulse Workbench', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('starts with configuration import instead of a specialist tool catalog', () => {
    renderAt();

    expect(screen.getByRole('heading', { name: 'Understand and improve your DHCP configuration' })).toBeVisible();
    expect(screen.getByLabelText('DHCP configuration file')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open Microsoft example' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open utilities' })).toHaveAttribute('href', '#/utilities');
    expect(screen.queryByText('11 tools ready')).not.toBeInTheDocument();
  });

  it('explains the concrete admin outcomes before asking for a configuration', async () => {
    const user = userEvent.setup();
    renderAt();

    const outcomes = screen.getByRole('region', { name: 'What DHCPulse produces' });
    expect(within(outcomes).getByText('Searchable inventory')).toBeVisible();
    expect(within(outcomes).getByText('Prioritized review')).toBeVisible();
    expect(within(outcomes).getByText('Guarded change package')).toBeVisible();
    expect(within(outcomes).getByText(/Preflight, Apply, Verify, and Rollback/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    const germanOutcomes = screen.getByRole('region', { name: 'Das liefert DHCPulse' });
    expect(within(germanOutcomes).getByText('Durchsuchbares Inventar')).toBeVisible();
    expect(within(germanOutcomes).getByText('Priorisierte Prüfung')).toBeVisible();
    expect(within(germanOutcomes).getByText('Abgesichertes Änderungspaket')).toBeVisible();
  });

  it('guides a Microsoft administrator from PowerShell export to local import', () => {
    renderAt();

    const guide = screen.getByRole('region', { name: 'Create a Microsoft DHCP export' });
    expect(within(guide).getByText('Run on the DHCP server')).toBeVisible();
    expect(within(guide).getByText(/DHCP Server PowerShell module/)).toBeVisible();
    expect(within(guide).getByText("$ExportPath = Join-Path $env:TEMP 'dhcpulse-export.xml'", { exact: false })).toBeVisible();
    expect(within(guide).getByLabelText('PowerShell command for the full export')).toHaveTextContent(/Export-DhcpServer -ComputerName \$env:COMPUTERNAME/);
    expect(within(guide).getByText(/Do not add.*-Leases/i)).toBeVisible();
    expect(within(guide).getByText(/-ScopeId 10\.10\.10\.0/)).toBeVisible();
    expect(within(guide).getByText(/hostnames, IP addresses, and client identifiers/i)).toBeVisible();
    expect(within(guide).getByRole('link', { name: 'Open the official Export-DhcpServer documentation' })).toHaveAttribute('href', 'https://learn.microsoft.com/en-us/powershell/module/dhcpserver/export-dhcpserver?view=windowsserver2025-ps');
    expect(within(guide).getByText('Kea, ISC dhcpd, or dnsmasq?')).toBeVisible();
  });

  it('localizes the integrated export guide in German', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));

    const guide = screen.getByRole('region', { name: 'Microsoft-DHCP-Export erstellen' });
    expect(within(guide).getByText('Auf dem DHCP-Server ausführen')).toBeVisible();
    expect(within(guide).getByText(/DHCP-Server-PowerShell-Modul/)).toBeVisible();
    expect(within(guide).getByText(/Füge.*-Leases.*nicht hinzu/i)).toBeVisible();
    expect(within(guide).getByText('Kea, ISC dhcpd oder dnsmasq?')).toBeVisible();
    expect(within(guide).getByRole('link', { name: 'Offizielle Export-DhcpServer-Dokumentation öffnen' })).toBeVisible();
  });

  it('rejects oversized primary imports before reading and cancels a pending read on route exit', async () => {
    const user = userEvent.setup();
    renderAt();
    const input = screen.getByLabelText('DHCP configuration file');
    const oversized = new File(['small'], 'oversized.xml');
    const oversizedText = vi.fn(async () => microsoftXml);
    Object.defineProperties(oversized, { size: { configurable: true, value: 2 * 1024 * 1024 + 1 }, text: { configurable: true, value: oversizedText } });
    await user.upload(input, oversized);
    expect(oversizedText).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('The file exceeds 2 MiB.');

    const pending = deferred<string>();
    const delayed = new File(['ignored'], 'pending.xml');
    Object.defineProperty(delayed, 'text', { configurable: true, value: vi.fn(() => pending.promise) });
    fireEvent.change(input, { target: { files: [delayed] } });
    await user.click(screen.getByRole('link', { name: 'Open utilities' }));
    await act(async () => pending.resolve(microsoftXml));
    expect(screen.getByRole('heading', { name: 'DHCP utilities' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'DHCP configuration review' })).not.toBeInTheDocument();
  });

  it.each([
    ['microsoft.xml', microsoftXml, 'Microsoft DHCP'],
    ['kea.json', kea, 'ISC Kea'],
    ['dhcpd.conf', iscDhcpd, 'ISC dhcpd'],
    ['dnsmasq.conf', dnsmasq, 'dnsmasq'],
  ] as const)('opens %s directly into the shared workspace', async (fileName, content, vendor) => {
    const user = userEvent.setup();
    renderAt();

    await user.upload(screen.getByLabelText('DHCP configuration file'), new File([content], fileName));

    expect(window.location.hash).toBe('#/workspace');
    expect(screen.getByRole('heading', { name: 'DHCP configuration review' })).toHaveFocus();
    expect(screen.getByText(vendor)).toBeVisible();
    expect(screen.getByRole('tab', { name: /Review issues/ })).toBeVisible();
    expect(screen.getByRole('tab', { name: /Inventory/ })).toBeVisible();
  });

  it('opens with one explained workflow instead of competing analysis views', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));

    expect(screen.getByRole('heading', { name: 'DHCP configuration review' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.queryByRole('tab', { name: /^Analyze$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Findings/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your configuration is ready for review' })).toBeVisible();
    expect(screen.getByText(/nothing is executed or sent anywhere/i)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Review 5 blockers' }));
    expect(screen.getByRole('tab', { name: /Review issues/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Review issues/ })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Act now' })).toBeVisible();
  });

  it('explains why export is unavailable and returns to the issue workflow', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: 'Export' }));

    expect(screen.getByRole('heading', { name: 'Prepare a change first' })).toBeVisible();
    expect(screen.getByText(/export becomes available after you preview and add at least one change/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Generate guarded package' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Review changeable issues' }));
    expect(screen.getByRole('tab', { name: /Review issues/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Review issues/ })).toHaveFocus();
  });

  it('opens a realistic example and explains a finding before offering a guarded change', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    expect(screen.getByRole('heading', { name: 'DHCP configuration review' })).toHaveFocus();
    expect(screen.getByText('Microsoft DHCP XML imported locally')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Reservation is inside a dynamic pool' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    expect(within(context).getByText(/address conflict/i)).toBeVisible();
    expect(within(context).getByText(/exclude this address/i)).toBeVisible();
    expect(within(context).getByRole('button', { name: 'Preview change' })).toBeVisible();
  });

  it('turns a guided reservation finding into a validated change without guessing the new address', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Reservation is outside its scope' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });

    expect(within(context).getByRole('heading', { name: 'Available changes' })).toBeVisible();
    await user.click(within(context).getByRole('button', { name: 'Correct reservation address' }));
    const address = within(context).getByRole('textbox', { name: 'IPv4 address' });
    expect(address).toHaveValue('198.51.100.250');
    await user.clear(address);
    await user.type(address, '192.0.2.40');
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));

    expect(within(context).getByRole('heading', { name: 'Validated change preview' })).toBeVisible();
    expect(within(context).getByText(/^192\.0\.2\.40 ·/)).toBeVisible();
    const preview = within(context).getByRole('heading', { name: 'Validated change preview' }).closest('section')!;
    expect(within(preview).getAllByRole('definition')[0]).toHaveTextContent('device-025.lab.example · 198.51.100.250');
    await user.click(within(context).getByRole('button', { name: 'Add to change plan' }));
    expect(screen.getByRole('region', { name: 'Review tray' })).toHaveTextContent('1 prepared change');
  });

  it('associates guided change validation errors with the responsible field', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Reservation is outside its scope' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Correct reservation address' }));
    const address = within(context).getByRole('textbox', { name: 'IPv4 address' });
    await user.clear(address);
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));

    expect(address).toHaveAttribute('aria-invalid', 'true');
    expect(address).toHaveAccessibleDescription('Enter a valid value.');
    expect(within(context).getByRole('alert')).toHaveTextContent('Review the values and try again.');
  });

  it('offers both safe resolutions for a scope option override', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Scope option overrides the server value' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });

    expect(within(context).getByRole('button', { name: 'Align with server value' })).toBeVisible();
    expect(within(context).getByRole('button', { name: 'Remove scope override' })).toBeVisible();
    await user.click(within(context).getByRole('button', { name: 'Align with server value' }));
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    expect(within(context).getByText('Set option value')).toBeVisible();
    await user.click(within(context).getByRole('button', { name: 'Add to change plan' }));
    expect(screen.getByRole('region', { name: 'Review tray' })).toHaveTextContent('1 prepared change');
  });

  it('moves from the explained overview into a prioritized issue queue', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));

    await user.click(screen.getByRole('button', { name: 'Review 5 blockers' }));
    expect(screen.getByRole('tab', { name: /Review issues/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Act now' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Review' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Observe' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^Review / }).length).toBeLessThanOrEqual(50);
    expect(screen.queryByRole('region', { name: 'Review tray' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review Reservation is outside its scope' }));
    expect(screen.getByRole('heading', { name: 'Reservation is outside its scope' })).toHaveFocus();
  });

  it('keeps the context panel aligned with the visible filtered work', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Actionability' }), 'actionable');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scope' }), screen.getByRole('option', { name: 'Office VLAN 100' }));
    await user.click(screen.getByRole('button', { name: 'Review Reservation is inside a dynamic pool' }));

    const context = screen.getByRole('complementary', { name: 'Finding context' });
    const row = screen.getByRole('button', { name: 'Review Reservation is inside a dynamic pool' });
    expect(within(row).getByText(/Office VLAN 100/)).toBeVisible();
    expect(within(row).queryByText(/Warehouse VLAN/)).not.toBeInTheDocument();
    expect(within(context).getByText('Reservation is inside a dynamic pool')).toBeVisible();
    expect(within(context).getByText('Office VLAN 100')).toBeVisible();
    expect(within(context).getByText('Occurrence 1 of 24')).toBeVisible();
    expect(within(context).getByRole('button', { name: 'Preview change' })).toBeVisible();
  });

  it('keeps a finding in context while preparing and reviewing a change', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));

    await user.click(screen.getByRole('button', { name: 'Review Reservation is inside a dynamic pool' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    expect(within(context).getByRole('heading', { name: 'Reservation is inside a dynamic pool' })).toHaveFocus();
    expect(within(context).getByText('Why flagged')).toBeVisible();
    expect(within(context).getByText('Operational impact')).toBeVisible();
    expect(within(context).getByText(/Occurrence 1 of 298/)).toBeVisible();
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));

    expect(screen.getByRole('tab', { name: /Review issues/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'Review tray' })).not.toBeInTheDocument();
    const preview = within(context).getByText('Validated change preview').closest('section')!;
    expect(preview).toBeVisible();
    expect(within(context).getByText('Warehouse VLAN 108 · 203.0.113.0/26')).toBeVisible();
    expect(within(preview).getByText('203.0.113.13')).toBeVisible();
    expect(within(preview).queryByText('{"start":"203.0.113.13","end":"203.0.113.13"}')).not.toBeInTheDocument();
    await user.click(within(context).getByRole('button', { name: 'Add to review' }));
    expect(screen.getByRole('region', { name: 'Review tray' })).toHaveTextContent('1 prepared change');
    expect(within(context).getByText('Validated change preview')).toBeVisible();
    expect(within(context).getByText(/Before/)).toBeVisible();
    expect(within(context).getByText(/After/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Review changes' }));
    const changes = screen.getByRole('heading', { name: 'Prepared changes' }).closest('section')!;
    expect(changes).toBeVisible();
    expect(within(changes).getByText('Target')).toBeVisible();
    expect(within(changes).getByText('Rationale')).toBeVisible();
    expect(within(changes).getByText('No exclusion for this address')).toBeVisible();
    expect(within(changes).getByText('203.0.113.13')).toBeVisible();
    expect(within(changes).queryByText('{"start":"203.0.113.13","end":"203.0.113.13"}')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to issues' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Review export' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Review issue rationale' }));
    expect(screen.getByRole('tab', { name: /Review issues/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('complementary', { name: 'Finding context' })).getByText('Occurrence 1 of 25')).toBeVisible();
  });

  it('continues from a valid change plan into guarded export review', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Reservation is inside a dynamic pool' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to review' }));
    await user.click(screen.getByRole('button', { name: 'Review changes' }));

    await user.click(screen.getByRole('button', { name: 'Review export' }));

    expect(screen.getByRole('tab', { name: 'Export' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Export' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Guarded change package' })).toBeVisible();
  });

  it('returns from each prepared operation to its exact finding rationale', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Reservation is inside a dynamic pool' }));
    let context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to review' }));

    await user.click(screen.getByRole('button', { name: 'Review Scope option overrides the server value' }));
    context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Align with server value' }));
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to change plan' }));
    await user.click(screen.getByRole('button', { name: 'Review changes' }));

    const rationaleButtons = screen.getAllByRole('button', { name: 'Review issue rationale' });
    expect(rationaleButtons).toHaveLength(2);
    await user.click(rationaleButtons[0]!);
    context = screen.getByRole('complementary', { name: 'Finding context' });
    expect(within(context).getByRole('heading', { name: 'Reservation is inside a dynamic pool' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Review changes' }));
    await user.click(screen.getAllByRole('button', { name: 'Review issue rationale' })[1]!);
    expect(within(screen.getByRole('complementary', { name: 'Finding context' })).getByRole('heading', { name: 'Scope option overrides the server value' })).toBeVisible();
  });

  it('never adds an invalid legacy exclusion preview to the change plan', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scope' }), screen.getByRole('option', { name: 'Office VLAN 100' }));
    await user.click(screen.getByRole('button', { name: 'Review Reservation is inside a dynamic pool' }));
    let context = screen.getByRole('complementary', { name: 'Finding context' });
    for (let index = 0; index < 24 && !within(context).queryByText('192.0.2.8'); index += 1) {
      await user.click(within(context).getByRole('button', { name: 'Next occurrence' }));
      context = screen.getByRole('complementary', { name: 'Finding context' });
    }
    expect(within(context).getByText('192.0.2.8')).toBeVisible();
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to review' }));
    await user.click(screen.getByRole('button', { name: 'Review Gateway is inside a dynamic pool' }));
    context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));

    expect(within(context).getByText('Validation blocked')).toBeVisible();
    expect(within(context).getByRole('button', { name: 'Add to review' })).toBeDisabled();
  });

  it('localizes the operational queue and keeps non-Microsoft findings analysis-only', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.upload(screen.getByLabelText('DHCP configuration file'), new File([kea], 'kea.json'));
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    await user.click(screen.getByRole('tab', { name: /Probleme prüfen/ }));

    expect(screen.getByRole('heading', { name: 'Jetzt handeln' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Prüfen' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Beobachten' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Arbeitsliste filtern' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Änderung vorbereiten' })).not.toBeInTheDocument();
  });

  it('shows exact target scopes and grouped risks before package acknowledgement', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Reservation is inside a dynamic pool' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to review' }));
    await user.click(screen.getByRole('tab', { name: 'Export' }));

    expect(screen.getByRole('heading', { name: 'Target scope risk' })).toBeVisible();
    expect(screen.getByText(/Reservation is inside a dynamic pool \(25\)/)).toBeVisible();
    expect(screen.getByText(/Scope 203\.0\.113\.0\/26 · Warehouse VLAN 108/)).toBeVisible();
  });

  it('keeps specialist utilities reachable on a subordinate route', async () => {
    const user = userEvent.setup();
    renderAt();
    expect(screen.queryByRole('link', { name: /PXE boot/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open utilities' }));

    expect(window.location.hash).toBe('#/utilities');
    expect(screen.getByRole('heading', { name: 'DHCP utilities' })).toHaveFocus();
    expect(screen.getByRole('link', { name: /PXE boot/ })).toBeVisible();
  });

  it('turns an evidenced finding into a downloadable guarded Microsoft package', async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Reservation is inside a dynamic pool' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to review' }));
    await user.click(screen.getByRole('button', { name: 'Review changes' }));

    expect(screen.getByRole('heading', { name: 'Prepared changes' })).toBeVisible();
    expect(screen.getAllByText(/Validation passed/).some((item) => item.classList.contains('validation-ok'))).toBe(true);
    await user.click(screen.getByRole('tab', { name: 'Export' }));
    const acknowledgement = screen.queryByRole('checkbox', { name: /reviewed the target warnings/ });
    if (acknowledgement) await user.click(acknowledgement);
    await user.click(screen.getByRole('button', { name: 'Generate guarded package' }));
    const applyDownload = screen.getByRole('link', { name: 'Download 02-Apply.ps1' });
    expect(applyDownload).toHaveAttribute('download', '02-Apply.ps1');
    expect(applyDownload).toHaveAttribute('href', 'blob:download-2');
    expect(await readBlob(downloads.blobs[1]!)).toContain('Add-DhcpServerv4ExclusionRange');
    applyDownload.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await user.click(applyDownload);
    expect(screen.getByRole('status')).toHaveTextContent('Download requested: 02-Apply.ps1');

    await user.click(screen.getByRole('button', { name: 'Open another configuration' }));
    expect(downloads.revokeObjectUrl).toHaveBeenCalledTimes(7);
  });

  it('ignores package generation that finishes after leaving the export view', async () => {
    const user = userEvent.setup();
    const digest = deferred<ArrayBuffer>();
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn(() => digest.promise) } });
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Reservation is inside a dynamic pool' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to review' }));
    await user.click(screen.getByRole('tab', { name: 'Export' }));
    await user.click(screen.getByRole('checkbox', { name: 'I reviewed the target warnings.' }));
    await user.click(screen.getByRole('button', { name: 'Generate guarded package' }));
    expect(screen.getByRole('button', { name: 'Generating package…' })).toBeDisabled();

    await user.click(screen.getByRole('tab', { name: /Change plan/ }));
    await user.click(screen.getByRole('tab', { name: 'Export' }));
    await act(async () => digest.resolve(new Uint8Array(32).buffer));

    expect(screen.queryByRole('heading', { name: 'Package ready' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Download/ })).not.toBeInTheDocument();
  });

  it('surfaces package generation failures without exposing partial files', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn(async () => { throw new Error('digest failed'); }) } });
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Reservation is inside a dynamic pool' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to review' }));
    await user.click(screen.getByRole('tab', { name: 'Export' }));
    await user.click(screen.getByRole('checkbox', { name: 'I reviewed the target warnings.' }));
    await user.click(screen.getByRole('button', { name: 'Generate guarded package' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Package generation failed. No files were created.');
    expect(screen.getByRole('button', { name: 'Generate guarded package' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: /Download/ })).not.toBeInTheDocument();
  });

  it('keeps non-Microsoft analysis useful without exposing executable controls', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.upload(screen.getByLabelText('DHCP configuration file'), new File([kea], 'kea.json'));
    await user.click(screen.getByRole('tab', { name: /Change plan/ }));
    expect(screen.getByText(/Microsoft DHCP XML export is required/)).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Export' }));
    expect(screen.queryByRole('button', { name: 'Generate guarded package' })).not.toBeInTheDocument();
  });

  it('provides complete keyboard tabs and severity filtering in the shared workspace', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.upload(screen.getByLabelText('DHCP configuration file'), new File([microsoftXml], 'microsoft.xml'));
    const overview = screen.getByRole('tab', { name: 'Overview' });
    overview.focus();
    await user.keyboard('{ArrowRight}');
    const issues = screen.getByRole('tab', { name: /Review issues/ });
    expect(issues).toHaveFocus();
    expect(issues).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', issues.id);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Severity' }), 'warning');
    expect(screen.queryByRole('heading', { name: 'Act now' })).toBeVisible();
    expect(screen.queryByText('Blocker', { selector: '.remediation-severity' })).not.toBeInTheDocument();
  });

  it('shows import coverage separately from assessment and package readiness', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.upload(screen.getByLabelText('DHCP configuration file'), new File([kea], 'kea.json'));
    expect(screen.getByRole('heading', { name: 'Import coverage' })).toBeVisible();
    expect(screen.getByText(/bounded parser/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Assessment' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open prioritized issues' }));
    expect(screen.getByRole('tab', { name: /Review issues/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps a large estate bounded in the paginated issue queue', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));

    expect(screen.getAllByRole('button', { name: /^Review / }).length).toBeLessThanOrEqual(50);
    expect(screen.getByText('331 issues sorted by urgency')).toBeVisible();
    expect(screen.getAllByText(/Occurrence 1 of/).length).toBeLessThanOrEqual(1);
  });

  it('explains a direct workspace link when its local session is unavailable', () => {
    renderAt('#/workspace');
    expect(screen.getByRole('status')).toHaveTextContent('This workspace session is no longer available');
  });

  it('keeps large object inventories search-first and bounded', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Inventory/ }));
    expect(screen.queryByRole('button', { name: /device-250/ })).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search configuration objects' }), 'device-250');
    expect(screen.getByRole('button', { name: /device-250/ })).toBeVisible();
  });

  it('uses inventory category cards as bounded object filters', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Inventory/ }));

    const objectResults = screen.getByRole('region', { name: 'Object results' });
    expect(objectResults).toBeVisible();
    expect(within(objectResults).getAllByRole('button').length).toBeGreaterThan(0);

    const reservations = screen.getByRole('button', { name: 'Show Reservation objects (300)' });
    await user.click(reservations);

    expect(reservations).toHaveAttribute('aria-pressed', 'true');
    expect(within(objectResults).getByText('100+')).toBeVisible();
    expect(screen.getByRole('button', { name: /device-001\.lab\.example/ })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'device-001.lab.example' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'device-001.lab.example' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Office VLAN 100/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all object types (410)' }));
    expect(screen.getByRole('heading', { name: 'Object inventory' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Select an object' })).toBeVisible();
    expect(within(objectResults).getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('prepares guided scope changes directly from the inventory', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Inventory/ }));
    await user.click(screen.getByRole('button', { name: /Show IPv4 scope objects/ }));
    await user.click(screen.getByRole('button', { name: /Office VLAN 100/ }));
    const detail = screen.getByRole('heading', { name: 'Office VLAN 100' }).closest('section')!;

    expect(within(detail).getByRole('heading', { name: 'Available changes' })).toBeVisible();
    expect(within(detail).getByRole('button', { name: 'Edit address range' })).toBeVisible();
    expect(within(detail).getByRole('button', { name: 'Set lease duration' })).toBeVisible();
    expect(within(detail).getByRole('button', { name: 'Clone scope' })).toBeVisible();
    await user.click(within(detail).getByRole('button', { name: 'Set lease duration' }));
    const lease = within(detail).getByRole('spinbutton', { name: 'Lease duration in seconds' });
    await user.clear(lease);
    await user.type(lease, '14400');
    await user.click(within(detail).getByRole('button', { name: 'Preview change' }));
    expect(within(detail).getByText('14,400 seconds')).toBeVisible();
    await user.click(within(detail).getByRole('button', { name: 'Add to change plan' }));
    await user.click(screen.getByRole('tab', { name: 'Change plan (1)' }));
    expect(screen.getByText('Inventory change validated against the imported configuration')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Review target in inventory' }));
    expect(screen.getByRole('tab', { name: /Inventory/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Office VLAN 100' })).toHaveFocus();
  });

  it('treats a cloned scope as a new package target from preview through export', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Inventory/ }));
    await user.click(screen.getByRole('button', { name: /Show IPv4 scope objects/ }));
    await user.click(screen.getByRole('button', { name: /Office VLAN 100/ }));
    const detail = screen.getByRole('heading', { name: 'Office VLAN 100' }).closest('section')!;

    await user.click(within(detail).getByRole('button', { name: 'Clone scope' }));
    await user.clear(within(detail).getByRole('textbox', { name: 'New scope CIDR' }));
    await user.type(within(detail).getByRole('textbox', { name: 'New scope CIDR' }), '10.44.0.0/24');
    await user.clear(within(detail).getByRole('textbox', { name: 'New scope name' }));
    await user.type(within(detail).getByRole('textbox', { name: 'New scope name' }), 'Branch VLAN 44');
    await user.clear(within(detail).getByRole('textbox', { name: 'Start address' }));
    await user.type(within(detail).getByRole('textbox', { name: 'Start address' }), '10.44.0.20');
    await user.clear(within(detail).getByRole('textbox', { name: 'End address' }));
    await user.type(within(detail).getByRole('textbox', { name: 'End address' }), '10.44.0.240');
    await user.click(within(detail).getByRole('button', { name: 'Preview change' }));
    expect(within(detail).getByText('New scope · Branch VLAN 44 · 10.44.0.0/24')).toBeVisible();
    await user.click(within(detail).getByRole('button', { name: 'Add to change plan' }));

    await user.click(screen.getByRole('tab', { name: 'Change plan (1)' }));
    expect(screen.getByText('New scope · Branch VLAN 44 · 10.44.0.0/24')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Review source scope in inventory' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Review export' }));
    expect(screen.getByText('New scope 10.44.0.0/24 · Branch VLAN 44')).toBeVisible();
    expect(screen.getByText('Ready to generate')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Generate guarded package' })).toBeEnabled();
  });

  it('prepares a reversible exclusion removal from the inventory', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Inventory/ }));
    await user.click(screen.getByRole('button', { name: /Show Exclusion objects/ }));
    const detail = document.querySelector<HTMLElement>('.workspace-object')!;

    await user.click(within(detail).getByRole('button', { name: 'Remove exclusion' }));
    await user.click(within(detail).getByRole('button', { name: 'Preview change' }));
    expect(within(detail).getByText('Remove exclusion range')).toBeVisible();
    await user.click(within(detail).getByRole('button', { name: 'Add to change plan' }));
    await user.click(screen.getByRole('tab', { name: 'Change plan (1)' }));
    expect(screen.getByText('Remove exclusion range')).toBeVisible();
  });

  it('explains when an inventory object is intentionally analysis-only', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Inventory/ }));
    await user.click(screen.getByRole('button', { name: /Show Policy objects/ }));
    const detail = document.querySelector<HTMLElement>('.workspace-object')!;

    expect(within(detail).getByRole('heading', { name: 'Analysis only for this object' })).toBeVisible();
    expect(within(detail).getByText(/policy, failover, and DHCPv6 changes.*need additional server context/i)).toBeVisible();
  });

  it('localizes the complete shared finding explanation in German', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.upload(screen.getByLabelText('DHCP configuration file'), new File([microsoftXml], 'microsoft.xml'));
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    await user.click(screen.getByRole('tab', { name: /Probleme prüfen/ }));
    await user.click(screen.getByRole('button', { name: 'Prüfen Reservierung liegt in einem dynamischen Pool' }));
    const context = screen.getByRole('complementary', { name: 'Befundkontext' });
    expect(within(context).getByText('Betriebliche Auswirkung')).toBeVisible();
    expect(within(context).getByText(/Adresskonflikt/)).toBeVisible();
    expect(within(context).getByText(/Adresse.*dynamischen Pool ausschließen/i)).toBeVisible();
    expect(within(context).getByText('Pool-Start')).toBeVisible();
    expect(within(context).queryByText('poolStart')).not.toBeInTheDocument();
  });

  it('keeps workspace operations and package eligibility understandable in German', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    expect(screen.getByText(/IPv4-Scopes.*Pools.*Ausschlüsse/)).toBeVisible();
    expect(screen.queryByText(/IPv4 scopes.*pools.*exclusions/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Probleme prüfen/ }));
    await user.click(screen.getByRole('button', { name: 'Prüfen Reservierung liegt in einem dynamischen Pool' }));
    const context = screen.getByRole('complementary', { name: 'Befundkontext' });
    await user.click(within(context).getByRole('button', { name: 'Änderung prüfen' }));
    await user.click(within(context).getByRole('button', { name: 'Zur Prüfung hinzufügen' }));
    await user.click(screen.getByRole('button', { name: 'Änderungen prüfen' }));
    expect(screen.getAllByText('Ausschluss hinzufügen').length).toBeGreaterThan(0);
    expect(screen.queryByText('exclusion.add')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Export' }));
    expect(screen.queryByText(/target-warning-findings/)).not.toBeInTheDocument();
    for (const artifact of ['01-Preflight.ps1', '02-Apply.ps1', '03-Verify.ps1', '04-Rollback.ps1', 'CHANGE.md', 'change-set.json', 'manifest.json']) {
      expect(screen.getByText(artifact, { selector: '.workspace-artifact-plan code' })).toBeVisible();
    }
  });

  it('renders all stable tool links, their groups, and a live tool count', () => {
    renderAt('#/utilities');

    expect(screen.getByRole('heading', { name: 'DHCP utilities' })).toBeVisible();
    expect(screen.getByText('9 tools ready')).toBeVisible();
    for (const group of ['Plan', 'Build', 'Analyze', 'Troubleshoot', 'Secure']) {
      expect(screen.getByRole('heading', { name: group })).toBeVisible();
    }
    for (const name of toolNames.filter((name) => !['Microsoft DHCP Config Workspace', 'Configuration analyzer'].includes(name))) {
      expect(screen.getByRole('link', { name: new RegExp(name) })).toHaveAttribute('href', expect.stringContaining('#/tool/'));
    }
  });

  it('keeps narrow-page overflow out of the document while category scrolling stays local', async () => {
    const { readFileSync } = await vi.importActual<{
      readFileSync(path: string, encoding: 'utf8'): string;
    }>('node:fs');
    const resetCss = readFileSync('src/styles/reset.css', 'utf8');
    const appCss = readFileSync('src/styles/app.css', 'utf8');

    expect(resetCss).not.toMatch(/body\s*\{[^}]*min-width\s*:\s*320px/i);
    expect(appCss).toMatch(/\.category-tabs\s*\{[^}]*overflow-x\s*:\s*auto/i);
    expect(appCss).toMatch(/\.config-file-button:focus-within\s*\{[^}]*outline/i);
  });

  it('searches translated tool content and clears an empty result', async () => {
    const user = userEvent.setup();
    renderAt('#/utilities');
    const search = screen.getByRole('searchbox', { name: 'Search tools' });

    await user.type(search, 'pxe');
    expect(screen.getByRole('link', { name: /PXE boot/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Scope and capacity/ })).not.toBeInTheDocument();

    await user.clear(search);
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    const germanSearch = screen.getByRole('searchbox', { name: 'Tools durchsuchen' });
    await user.type(germanSearch, 'Kapazität');
    expect(screen.getByRole('link', { name: /Bereich und Kapazität/ })).toBeVisible();

    await user.clear(germanSearch);
    await user.type(germanSearch, 'kein solches werkzeug');
    expect(screen.getByText('Keine passenden Tools gefunden.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Suche löschen' }));
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('#/tool/'))).toHaveLength(9);
  });

  it('navigates through valid tool hashes without reloading', async () => {
    const user = userEvent.setup();
    renderAt('#/utilities');

    await user.click(screen.getByRole('link', { name: /Scope and capacity/ }));
    expect(window.location.hash).toBe('#/tool/scope');
    expect(screen.getByRole('heading', { name: 'Scope and capacity' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to all tools' })).toBeVisible();

    window.location.hash = '#/tool/dhcpv6';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByRole('heading', { name: 'DHCPv6' })).toBeVisible();
    expect(screen.getByTestId('tool-panel-dhcpv6')).not.toBeEmptyDOMElement();
  });

  it('moves keyboard focus to the route heading without stealing it on a locale-only change', async () => {
    const user = userEvent.setup();
    renderAt('#/utilities');
    const scopeLink = screen.getByRole('link', { name: /Scope and capacity/ });

    scopeLink.focus();
    await user.keyboard('{Enter}');

    const heading = screen.getByRole('heading', { name: 'Scope and capacity' });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute('tabindex', '-1');

    const germanButton = screen.getByRole('button', { name: 'Deutsch' });
    germanButton.focus();
    await user.keyboard('{Enter}');

    expect(germanButton).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Bereich und Kapazität' })).not.toHaveFocus();
  });

  it('moves focus to the not-found heading after an invalid hash route', () => {
    renderAt('#/utilities');
    screen.getByRole('searchbox', { name: 'Search tools' }).focus();

    window.location.hash = '#/tool/unknown';
    fireEvent(window, new HashChangeEvent('hashchange'));

    const heading = screen.getByRole('heading', { name: 'Tool not found' });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('shows a not-found route and returns to the catalog', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/unknown');

    expect(screen.getByRole('heading', { name: 'Tool not found' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Back to all tools' }));
    expect(screen.getByRole('heading', { name: 'DHCP utilities' })).toBeVisible();
  });

  it('returns keyboard focus to the catalog heading from both Back links', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/scope');

    const toolBack = screen.getByRole('link', { name: 'Back to all tools' });
    toolBack.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('heading', { name: 'DHCP utilities' })).toHaveFocus();

    window.location.hash = '#/tool/unknown';
    fireEvent(window, new HashChangeEvent('hashchange'));
    const notFoundBack = screen.getByRole('link', { name: 'Back to all tools' });
    notFoundBack.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('heading', { name: 'DHCP utilities' })).toHaveFocus();
  });

  it('keeps route focus stable across locale changes and tool returns', async () => {
    const user = userEvent.setup();
    renderAt('#/utilities');
    const initialHeading = screen.getByRole('heading', { name: 'DHCP utilities' });

    expect(initialHeading).toHaveAttribute('tabindex', '-1');
    expect(initialHeading).toHaveFocus();

    const germanButton = screen.getByRole('button', { name: 'Deutsch' });
    germanButton.focus();
    await user.keyboard('{Enter}');
    expect(germanButton).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'DHCP-Werkzeuge' })).not.toHaveFocus();

    window.location.hash = '#/tool/scope';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByRole('heading', { name: 'Bereich und Kapazität' })).toHaveFocus();

    window.location.hash = '#/utilities';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByRole('heading', { name: 'DHCP-Werkzeuge' })).toHaveFocus();
  });

  it('moves category selection and focus with wrapping keyboard controls', () => {
    renderAt('#/utilities');
    expect(screen.getByRole('toolbar', { name: 'Tool categories' })).toBeVisible();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    const all = screen.getByRole('button', { name: 'All tools' });
    const plan = screen.getByRole('button', { name: 'Plan' });
    const secure = screen.getByRole('button', { name: 'Secure' });

    all.focus();
    fireEvent.keyDown(all, { key: 'ArrowLeft' });
    expect(secure).toHaveFocus();
    expect(secure).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(secure, { key: 'ArrowRight' });
    expect(all).toHaveFocus();
    expect(all).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(all, { key: 'End' });
    expect(secure).toHaveFocus();
    expect(secure).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(secure, { key: 'Home' });
    expect(all).toHaveFocus();
    expect(all).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(all, { key: 'ArrowRight' });
    expect(plan).toHaveFocus();
    expect(plan).toHaveAttribute('aria-pressed', 'true');
  });

  it('preserves the lease planner behavior, entered values, and export action', async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();
    renderAt('#/tool/lease');

    await user.click(screen.getByRole('button', { name: /Unsafe overlap check/ }));
    expect(screen.getByText('No-go as entered')).toBeVisible();
    expect(screen.getByText('Both servers can answer from the same pool')).toBeVisible();
    expect(screen.getByText('The shared pool has no transferred lease state')).toBeVisible();

    const clients = screen.getByRole('spinbutton', { name: 'Estimated clients' });
    await user.clear(clients);
    await user.type(clients, '321');
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    expect(screen.getByRole('spinbutton', { name: 'Geschätzte Clients' })).toHaveValue(321);
    expect(window.location.hash).toBe('#/tool/lease');

    const results = screen.getByRole('region', { name: 'Cutover-Ausblick' });
    await user.click(within(results).getByRole('button', { name: 'Markdown herunterladen' }));
    await user.click(within(results).getByRole('button', { name: 'JSON herunterladen' }));

    expect(downloads.items).toHaveLength(2);
    expect(downloads.items[0]?.filename).toBe('dhcpulse-change-plan.md');
    expect(downloads.items[0]?.blob.type).toBe('text/markdown;charset=utf-8');
    expect(await readBlob(downloads.items[0]!.blob)).toContain('**Gesch\u00e4tzte Clients:** 321');
    expect(downloads.items[1]?.filename).toBe('dhcpulse-change-plan.json');
    expect(downloads.items[1]?.blob.type).toBe('application/json;charset=utf-8');
    expect(JSON.parse(await readBlob(downloads.items[1]!.blob))).toMatchObject({
      tool: { id: 'lease' },
      locale: 'de',
      scenario: { clientCount: 321 },
    });
    expect(downloads.revokeObjectUrl).toHaveBeenCalledTimes(2);
  });

  it('keeps the ready-to-plan default lease scenario', () => {
    renderAt('#/tool/lease');

    expect(screen.getByText('Ready to plan')).toBeVisible();
    expect(screen.getByText('3', { selector: '.metric-value' })).toBeVisible();
  });

  it('withholds the lease result when T1 ordering is invalid', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/lease');

    const t1 = screen.getByRole('spinbutton', { name: 'T1 renewal' });
    await user.clear(t1);
    await user.type(t1, '90');

    expect(screen.getByText('T1 must occur before T2.')).toBeVisible();
    expect(screen.getByText('Correct the highlighted timing values to calculate a plan.')).toBeVisible();
    expect(screen.queryByText('Ready to plan')).not.toBeInTheDocument();
  });

  it('resets lease edits to the safe default scenario', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/lease');
    const clients = screen.getByRole('spinbutton', { name: 'Estimated clients' });

    await user.clear(clients);
    await user.type(clients, '7');
    await user.click(screen.getByRole('button', { name: 'Reset scenario' }));

    expect(screen.getByRole('spinbutton', { name: 'Estimated clients' })).toHaveValue(250);
  });

  it('keeps native arrow-key navigation across lease change types', () => {
    renderAt('#/tool/lease');
    const migration = screen.getByRole('radio', { name: 'Server migration' });
    const serverAddress = screen.getByRole('radio', { name: 'New DHCP server address' });

    migration.focus();
    fireEvent.keyDown(migration, { key: 'ArrowRight' });

    expect(serverAddress).toBeChecked();
  });

  it('renders a named, non-empty panel for every stable route', () => {
    const ids = ['scope', 'lease', 'options', 'pxe', 'failover', 'dhcpv6', 'diagnostics', 'security', 'config-analyzer', 'config-diff'];
    const names = toolNames.filter((name) => name !== 'Microsoft DHCP Config Workspace');
    const view = renderAt('#/tool/scope');

    names.forEach((name, index) => {
      const id = ids[index];
      if (index > 0) {
        window.location.hash = `#/tool/${id}`;
        fireEvent(window, new HashChangeEvent('hashchange'));
      }
      expect(screen.getByRole('heading', { name })).toBeVisible();
      expect(screen.getByTestId(`tool-panel-${id}`)).not.toBeEmptyDOMElement();
    });

    view.unmount();
  });

  it('redirects the retired Microsoft utility route to the unified import entry', () => {
    renderAt('#/tool/microsoft-workspace');
    expect(screen.getByRole('heading', { name: 'Understand and improve your DHCP configuration' })).toBeVisible();
    expect(screen.queryByText('Open a Microsoft DHCP export')).not.toBeInTheDocument();
  });

  it('states browser-local processing and no uploads in both languages', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/scope');

    expect(screen.getByText(/Processed only in this browser\. No data is uploaded\./)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    expect(screen.getByText(/Nur lokal in diesem Browser verarbeitet\. Es werden keine Daten hochgeladen\./)).toBeVisible();
  });

  it('derives scope capacity and address facts from the /24 example', () => {
    renderAt('#/tool/scope');
    expect(screen.getByText('254', { selector: '.metric-value' })).toBeVisible();
    expect(screen.getByText('192.0.2.0')).toBeVisible();
    expect(screen.getByText('255.255.255.0')).toBeVisible();
    expect(screen.getByText(/106 addresses remain/)).toBeVisible();
  });

  it('models multiple editable scope pool ranges and exposes overlap findings', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/scope');
    const pools = screen.getByRole('textbox', { name: 'Pool ranges (start-end, one per line)' });
    await user.clear(pools);
    await user.type(pools, '192.0.2.10-192.0.2.20{enter}192.0.2.30-192.0.2.40');
    await user.clear(screen.getByRole('textbox', { name: /Exclusions/ }));
    await user.clear(screen.getByRole('textbox', { name: /Reservations/ }));
    expect(screen.getByText('22', { selector: '[data-metric="pool-capacity"]' })).toBeVisible();

    await user.clear(pools);
    await user.type(pools, '192.0.2.10-192.0.2.30{enter}192.0.2.20-192.0.2.40');
    expect(screen.getAllByText('Dynamic pools overlap').length).toBeGreaterThan(0);
  });

  it('aggregates leases across multiple pools and applies exclusions only to their relevant pool', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/scope');
    const pools = screen.getByRole('textbox', { name: 'Pool ranges (start-end, one per line)' });
    await user.clear(pools);
    await user.type(pools, '192.0.2.10-192.0.2.20{enter}192.0.2.30-192.0.2.40');
    await user.clear(screen.getByRole('textbox', { name: /Exclusions/ }));
    await user.clear(screen.getByRole('textbox', { name: /Reservations/ }));
    const leases = screen.getByRole('spinbutton', { name: /^Current leases/ });
    await user.clear(leases);
    await user.type(leases, '15');

    expect(screen.getByText('22', { selector: '[data-metric="pool-capacity"]' })).toBeVisible();
    expect(screen.getByText(/7 addresses remain/)).toBeVisible();
    expect(screen.queryByText('Current leases exceed capacity')).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /Exclusions/ }), '192.0.2.12-192.0.2.13');
    expect(screen.getByText('20', { selector: '[data-metric="pool-capacity"]' })).toBeVisible();
    expect(screen.getByText(/5 addresses remain/)).toBeVisible();
    expect(screen.queryByText('Exclusion is outside the pool')).not.toBeInTheDocument();
  });

  it('encodes the domain-search example and reports malformed hexadecimal data', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/options');
    expect(screen.getByText('076578616d706c6503636f6d00036c6162076578616d706c6503636f6d00')).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'Decode hexadecimal' }));
    const hex = screen.getByRole('textbox', { name: 'Hexadecimal value' });
    await user.clear(hex);
    await user.type(hex, 'zz');
    expect(screen.getByText('Value contains non-hexadecimal characters.')).toBeVisible();
  });

  it('validates a type-aware editable option set for duplicates and timing relationships', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/options');
    expect(screen.getByRole('spinbutton', { name: 'Option 2 value' })).toHaveAttribute('type', 'number');
    const secondCode = screen.getByRole('spinbutton', { name: 'Option 2 code' });
    await user.clear(secondCode);
    await user.type(secondCode, '51');
    expect(screen.getAllByText('Option 51 cannot be repeated.').length).toBeGreaterThan(0);

    await user.clear(secondCode);
    await user.type(secondCode, '58');
    const secondValue = screen.getByRole('spinbutton', { name: 'Option 2 value' });
    await user.clear(secondValue);
    await user.type(secondValue, '80000');
    expect(screen.getAllByText('T1 must be less than T2.').length).toBeGreaterThan(0);
  });

  it('keeps cleared numeric option fields controlled without React warnings', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderAt('#/tool/options');

    await user.clear(screen.getByRole('spinbutton', { name: 'Option 2 code' }));

    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('Received NaN for the `value` attribute');
    consoleError.mockRestore();
  });

  it('derives PXE architecture results from visible selections before warning about a mixed global file', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/pxe');
    expect(screen.queryByText(/single global boot file cannot safely represent mixed firmware architectures/i)).not.toBeInTheDocument();
    expect(screen.getByText('7, 9')).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: 'BIOS x86' }));
    await user.click(screen.getByRole('checkbox', { name: 'Use one global boot file for mixed architectures' }));
    expect(screen.getAllByText(/single global boot file cannot safely represent mixed firmware architectures/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/REVIEW ONLY/).length).toBeGreaterThan(0);
  });

  it('redacts opaque PXE field values from the downloaded report', async () => {
    const user = userEvent.setup();
    const opaque = 'PXE_PRIVATE_Q7Z_VALUE';
    let reportBlob: Blob | undefined;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob: Blob) => { reportBlob = blob; return 'blob:pxe-report'; }) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderAt('#/tool/pxe');
    const server = screen.getByRole('textbox', { name: 'Boot server' });
    await user.clear(server);
    await user.type(server, opaque);
    await user.click(screen.getByRole('button', { name: 'Download Markdown' }));

    expect(reportBlob).toBeDefined();
    expect(await readBlob(reportBlob!)).not.toContain(opaque);
  });

  it('marks failover no-go when TCP port 647 is blocked', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/failover');
    await user.click(screen.getByRole('checkbox', { name: 'TCP port 647 allowed between partners' }));
    expect(screen.getByText('No-go')).toBeVisible();
    expect(screen.getAllByText(/TCP 647/i).length).toBeGreaterThan(0);
  });

  it('associates failover and DHCPv6 numeric blockers with their controls', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/failover');
    const mclt = screen.getByRole('spinbutton', { name: 'MCLT (minutes)' });
    await user.clear(mclt);
    await user.type(mclt, '-1');
    expect(mclt).toHaveAttribute('aria-invalid', 'true');
    expect(mclt).toHaveAccessibleDescription(/nonnegative safe integer/i);

    window.location.hash = '#/tool/dhcpv6';
    fireEvent(window, new HashChangeEvent('hashchange'));
    const prefix = screen.getByRole('spinbutton', { name: 'Delegated pool prefix' });
    await user.clear(prefix);
    await user.type(prefix, '129');
    expect(prefix).toHaveAttribute('aria-invalid', 'true');
    expect(prefix).toHaveAccessibleDescription(/0 through 128/i);
  });

  it('shows 256 delegated /64 prefixes for a /56 DHCPv6 pool', () => {
    renderAt('#/tool/dhcpv6');
    expect(screen.getByText('256', { selector: '.metric-value' })).toBeVisible();
    expect(screen.getByText(/Router Advertisements supply the IPv6 default route/i)).toBeVisible();
  });

  it('shows the DHCPv6 DNS delivery finding in both languages', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/dhcpv6');

    await user.click(screen.getByRole('checkbox', { name: 'DNS option present' }));
    expect(screen.getByText('DHCPv6 DNS delivery requires the Recursive Name Server option.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    expect(screen.getByText('Die DHCPv6-DNS-Option fehlt f\u00fcr den ausgew\u00e4hlten Modus.')).toBeVisible();
  });

  it('omits an opaque DHCPv6 relay address from the downloaded Markdown report', async () => {
    const user = userEvent.setup();
    const opaque = 'DHCPV6_PRIVATE_Q7Z_VALUE';
    let reportBlob: Blob | undefined;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob: Blob) => { reportBlob = blob; return 'blob:dhcpv6-report'; }) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderAt('#/tool/dhcpv6');
    await user.click(screen.getByRole('checkbox', { name: 'DHCPv6 relay used' }));
    await user.type(screen.getByRole('textbox', { name: /^Relay link-address/ }), opaque);
    await user.click(screen.getByRole('button', { name: 'Download Markdown' }));

    expect(reportBlob).toBeDefined();
    expect(await readBlob(reportBlob!)).not.toContain(opaque);
  });

  it('ranks the relay cause and provides packet filters and read-only commands', () => {
    renderAt('#/tool/diagnostics');
    expect(screen.getByText('Relay path or server reachability failure')).toBeVisible();
    expect(screen.getByText('bootp.option.dhcp == 2')).toBeVisible();
    expect(screen.getByText('ipconfig /all')).toBeVisible();
    expect(screen.queryByText('ipconfig /renew')).not.toBeInTheDocument();
  });

  it('lists concrete security gaps without an opaque numeric score', () => {
    renderAt('#/tool/security');
    expect(screen.getByText('DHCP snooping is disabled')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Prevent' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Detect' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Recover' })).toBeVisible();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  });

  it('applies Windows DHCP authorization only to domain-joined Windows servers', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/security');

    const platform = screen.getByRole('combobox', { name: 'Server platform' });
    const directoryContext = screen.getByRole('combobox', { name: 'Active Directory context' });
    expect(platform).toHaveValue('windows');
    expect(directoryContext).toHaveValue('domain-joined');
    expect(screen.getByText('Windows DHCP server is not authorized')).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Windows DHCP authorized' })).toBeVisible();

    await user.selectOptions(platform, 'kea');
    expect(directoryContext).toHaveValue('not-applicable');
    expect(directoryContext).toBeDisabled();
    expect(screen.queryByText('Windows DHCP server is not authorized')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Windows DHCP authorized' })).not.toBeInTheDocument();

    await user.selectOptions(platform, 'windows');
    await user.selectOptions(directoryContext, 'standalone');
    expect(screen.queryByText('Windows DHCP server is not authorized')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Windows DHCP authorized' })).not.toBeInTheDocument();
  });

  it('localizes security platform and authorization applicability controls', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/security');
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));

    const platform = screen.getByRole('combobox', { name: 'Serverplattform' });
    expect(screen.getByRole('combobox', { name: 'Active-Directory-Kontext' })).toBeVisible();
    await user.selectOptions(platform, 'dnsmasq');
    expect(screen.getByText('Nicht anwendbar')).toBeVisible();
    expect(screen.queryByText('Windows-DHCP-Server ist nicht autorisiert')).not.toBeInTheDocument();
  });

  it('analyzes pasted and file configurations, redacts preview data, and resets sensitive state', async () => {
    const user = userEvent.setup();
    const fixture = '{"Dhcp4":{"subnet4":[{"subnet":"192.0.2.0/24","pools":[{"pool":"192.0.2.10 - 192.0.2.20"}],"reservations":[{"hw-address":"02:00:5e:10:00:77","hostname":"secret-host.example.test","ip-address":"192.0.2.50"}]}]}}';
    renderAt('#/tool/config-analyzer');
    fireEvent.change(screen.getByRole('textbox', { name: 'Configuration text' }), { target: { value: fixture } });
    await user.click(screen.getByRole('button', { name: 'Analyze configuration' }));
    expect(screen.getByText('ISC Kea')).toBeVisible();
    expect(screen.getByText('1', { selector: '[data-metric="scopes"]' })).toBeVisible();
    expect(screen.queryByText(/secret-host|02:00:5e:10:00:77/i)).not.toBeInTheDocument();
    const file = new File([fixture], 'sensitive-lab.json', { type: 'application/json' });
    const text = vi.fn(async () => fixture);
    Object.defineProperty(file, 'text', { configurable: true, value: text });
    await user.upload(screen.getByLabelText('Local configuration file'), file);
    expect(text).toHaveBeenCalledOnce();
    expect(screen.getByText('sensitive-lab.json')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByText('Kea')).not.toBeInTheDocument();
    expect(screen.queryByText('sensitive-lab.json')).not.toBeInTheDocument();
  });

  it('rejects an oversized analyzer file before File.text is called', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/config-analyzer');
    const file = new File(['small'], 'oversized.json');
    const text = vi.fn(async () => '{}');
    Object.defineProperties(file, { size: { configurable: true, value: 2 * 1024 * 1024 + 1 }, text: { configurable: true, value: text } });
    await user.upload(screen.getByLabelText('Local configuration file'), file);
    expect(screen.getByText('Files must be 2 MiB or smaller.')).toBeVisible();
    expect(text).not.toHaveBeenCalled();
  });

  it('does not restore analyzer state after Reset while File.text is pending', async () => {
    const user = userEvent.setup();
    const pending = deferred<string>();
    const fixture = '{"Dhcp4":{"subnet4":[{"subnet":"192.0.2.0/24"}]}}';
    const file = new File(['ignored'], 'pending-sensitive.json');
    Object.defineProperty(file, 'text', { configurable: true, value: vi.fn(() => pending.promise) });
    renderAt('#/tool/config-analyzer');

    fireEvent.change(screen.getByLabelText('Local configuration file'), { target: { files: [file] } });
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await act(async () => pending.resolve(fixture));

    expect(screen.queryByText('pending-sensitive.json')).not.toBeInTheDocument();
    expect(screen.queryByText('ISC Kea')).not.toBeInTheDocument();
  });

  it('opens analyzer and comparison with synthetic presets and authoritative format sources', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/config-analyzer');
    expect(screen.getByRole('textbox', { name: 'Configuration text' })).not.toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Analyze configuration' }));
    expect(screen.getByRole('link', { name: 'Kea Administrator Reference Manual' })).toBeVisible();

    window.location.hash = '#/tool/config-diff';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByRole('textbox', { name: 'Source configuration' })).not.toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Target configuration' })).not.toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Compare configurations' }));
    expect(screen.getByText('Total changes')).toBeVisible();
    expect(screen.getByRole('link', { name: 'ISC DHCP configuration reference' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Kea migration guidance' })).toBeVisible();
    const visibleChanges = screen.getAllByRole('listitem').filter((item) => item.closest('.change-list'));
    const impacts = visibleChanges.map((item) => item.getAttribute('data-impact'));
    const impactRanks: Record<string, number> = { blocker: 0, warning: 1, info: 2 };
    expect(impacts).toEqual([...impacts].sort((a, b) => impactRanks[a!]! - impactRanks[b!]!));
  });

  it('does not restore either comparison side after Reset while file reads are pending', async () => {
    const user = userEvent.setup();
    const sourcePending = deferred<string>();
    const targetPending = deferred<string>();
    const fixture = '{"Dhcp4":{"subnet4":[{"subnet":"192.0.2.0/24"}]}}';
    const source = new File(['ignored'], 'pending-source.json');
    const target = new File(['ignored'], 'pending-target.json');
    Object.defineProperty(source, 'text', { configurable: true, value: vi.fn(() => sourcePending.promise) });
    Object.defineProperty(target, 'text', { configurable: true, value: vi.fn(() => targetPending.promise) });
    renderAt('#/tool/config-diff');

    fireEvent.change(screen.getByLabelText('Source local file'), { target: { files: [source] } });
    fireEvent.change(screen.getByLabelText('Target local file'), { target: { files: [target] } });
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await act(async () => { sourcePending.resolve(fixture); targetPending.resolve(fixture); });

    expect(screen.queryByText('pending-source.json')).not.toBeInTheDocument();
    expect(screen.queryByText('pending-target.json')).not.toBeInTheDocument();
    expect(screen.queryByText(/\u2713 ISC Kea/)).not.toBeInTheDocument();
  });

  it('links comparison file errors to the responsible file control', () => {
    renderAt('#/tool/config-diff');
    const file = new File(['small'], 'oversized-source.conf');
    Object.defineProperty(file, 'size', { configurable: true, value: 2 * 1024 * 1024 + 1 });
    const input = screen.getByLabelText('Source local file');
    fireEvent.change(input, { target: { files: [file] } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Files must be 2 MiB or smaller.');
  });

  it('compares configurations and filters added and changed entries', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/config-diff');
    const before = '{"Dhcp4":{"subnet4":[{"subnet":"192.0.2.0/24","pools":[{"pool":"192.0.2.10 - 192.0.2.20"}]},{"subnet":"203.0.113.0/24","pools":[{"pool":"203.0.113.10 - 203.0.113.20"}]}]}}';
    const after = '{"Dhcp4":{"subnet4":[{"subnet":"192.0.2.0/24","pools":[{"pool":"192.0.2.10 - 192.0.2.30"}]},{"subnet":"198.51.100.0/24","pools":[{"pool":"198.51.100.10 - 198.51.100.20"}]}]}}';
    fireEvent.change(screen.getByRole('textbox', { name: 'Source configuration' }), { target: { value: before } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Target configuration' }), { target: { value: after } });
    await user.click(screen.getByRole('button', { name: 'Compare configurations' }));
    expect(screen.getAllByText('Added').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Removed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Changed').length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Change kind' }), 'added');
    expect(screen.getAllByText('Added').length).toBeGreaterThan(0);
    expect(within(document.querySelector('.change-list')!).queryByText('Changed')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Change kind' }), 'removed');
    expect(screen.queryAllByText('Removed').filter((element) => element.tagName !== 'OPTION').length).toBeGreaterThan(0);
  });

  it('downloads Markdown and JSON reports with correct payloads for every ready workbench tool', async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();
    const cases = [
      ['scope', 'dhcpulse-scope-report'],
      ['options', 'dhcpulse-options-report'],
      ['pxe', 'dhcpulse-pxe-report'],
      ['failover', 'dhcpulse-failover-report'],
      ['dhcpv6', 'dhcpulse-dhcpv6-report'],
      ['diagnostics', 'dhcpulse-diagnostics-report'],
      ['security', 'dhcpulse-security-report'],
    ] as const;
    renderAt('#/tool/scope');

    for (const [toolId, filename] of cases) {
      if (window.location.hash !== `#/tool/${toolId}`) {
        window.location.hash = `#/tool/${toolId}`;
        fireEvent(window, new HashChangeEvent('hashchange'));
      }
      const before = downloads.items.length;
      await user.click(screen.getByRole('button', { name: 'Download Markdown' }));
      await user.click(screen.getByRole('button', { name: 'Download JSON' }));
      const markdown = downloads.items[before]!;
      const json = downloads.items[before + 1]!;

      expect(markdown.filename).toBe(`${filename}.md`);
      expect(markdown.blob.type).toBe('text/markdown;charset=utf-8');
      expect(await readBlob(markdown.blob)).toContain(`Tool ID: ${toolId}`);
      expect(json.filename).toBe(`${filename}.json`);
      expect(json.blob.type).toBe('application/json;charset=utf-8');
      expect(JSON.parse(await readBlob(json.blob))).toMatchObject({ tool: { id: toolId } });
      expect(downloads.revokeObjectUrl).toHaveBeenCalledWith(`blob:download-${before + 1}`);
      expect(downloads.revokeObjectUrl).toHaveBeenCalledWith(`blob:download-${before + 2}`);
    }
  });

  it('downloads both report formats after analyzer and comparison results exist', async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();
    renderAt('#/tool/config-analyzer');

    await user.click(screen.getByRole('button', { name: 'Analyze configuration' }));
    await user.click(screen.getByRole('button', { name: 'Download Markdown' }));
    await user.click(screen.getByRole('button', { name: 'Download JSON' }));
    expect(downloads.items[0]?.filename).toBe('dhcpulse-config-analysis.md');
    expect(JSON.parse(await readBlob(downloads.items[1]!.blob))).toMatchObject({ tool: { id: 'config-analyzer' } });

    window.location.hash = '#/tool/config-diff';
    fireEvent(window, new HashChangeEvent('hashchange'));
    await user.click(screen.getByRole('button', { name: 'Compare configurations' }));
    await user.click(screen.getByRole('button', { name: 'Download Markdown' }));
    await user.click(screen.getByRole('button', { name: 'Download JSON' }));
    expect(downloads.items[2]?.filename).toBe('dhcpulse-config-diff.md');
    expect(downloads.items[2]?.blob.type).toBe('text/markdown;charset=utf-8');
    expect(downloads.items[3]?.filename).toBe('dhcpulse-config-diff.json');
    expect(downloads.items[3]?.blob.type).toBe('application/json;charset=utf-8');
    expect(JSON.parse(await readBlob(downloads.items[3]!.blob))).toMatchObject({ tool: { id: 'config-diff' } });
    expect(downloads.revokeObjectUrl).toHaveBeenCalledTimes(4);
  });

  it('withholds Scope results and downloads for blank or non-integer lease inputs', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/scope');
    const leases = screen.getByRole('spinbutton', { name: 'Current leases' });

    await user.clear(leases);
    expect(leases).toHaveAttribute('aria-invalid', 'true');
    expect(leases).toHaveAccessibleDescription('Enter a finite nonnegative integer.');
    expect(screen.queryByText('254', { selector: '.metric-value' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download Markdown' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download JSON' })).not.toBeInTheDocument();

    await user.type(leases, '1.5');
    expect(leases).toHaveAccessibleDescription('Enter a finite nonnegative integer.');
    expect(screen.queryByText('254', { selector: '.metric-value' })).not.toBeInTheDocument();

    await user.clear(leases);
    await user.type(leases, '15');
    const growth = screen.getByRole('spinbutton', { name: 'Expected daily growth' });
    await user.clear(growth);
    expect(growth).toHaveAccessibleDescription('Enter a finite nonnegative integer.');
    expect(screen.queryByText('254', { selector: '.metric-value' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    expect(screen.getByRole('spinbutton', { name: /^Erwartetes t\u00e4gliches Wachstum/ })).toHaveAccessibleDescription('Gib eine endliche, nichtnegative ganze Zahl ein.');
  });

  it('keeps Scope CIDR and numeric validation messages distinct', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/scope');
    const cidr = screen.getByRole('textbox', { name: 'CIDR' });

    await user.clear(cidr);
    await user.type(cidr, 'not-a-cidr');

    expect(cidr).toHaveAccessibleDescription('Enter a valid IPv4 CIDR.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders complete German workbench copy without key fallbacks', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/config-analyzer');
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    expect(screen.getByRole('button', { name: 'Konfiguration analysieren' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Markdown herunterladen' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'JSON herunterladen' })).toBeVisible();
    expect(document.body).not.toHaveTextContent(/workbench\.[a-z]/i);
  });

  it('localizes analyzer warning text and German report input keys', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/config-analyzer');
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Konfigurationsformat' }), 'dnsmasq');
    const text = screen.getByRole('textbox', { name: 'Konfigurationstext' });
    await user.clear(text);
    await user.type(text, 'dhcp-range=192.0.2.10,192.0.2.20,255.255.255.0,192.0.2.255,1h');
    await user.click(screen.getByRole('button', { name: 'Konfiguration analysieren' }));

    expect(screen.getAllByText(/Nicht unterstützte Anweisung/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/unsupported-directive/)).not.toBeInTheDocument();
    await user.click(screen.getByText('Redigierte Berichtsvorschau'));
    const preview = document.querySelector('.report-preview')!;
    expect(preview).toHaveTextContent(/Bereiche: 1/);
    expect(preview).not.toHaveTextContent(/scopes: 1/);
  });

  it('presents domain-derived diagnostics and report privacy copy in German', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/diagnostics');
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    expect(screen.getByText('Relay-Pfad oder Server nicht erreichbar')).toBeVisible();
    expect(screen.queryByText('Relay path or server reachability failure')).not.toBeInTheDocument();
    const checks = screen.getByRole('heading', { name: 'Geordnete Nachweispr\u00fcfungen' }).closest('section')!;
    expect(within(checks).getAllByRole('link', { name: /Quelle f\u00fcr Pr\u00fcfung/ }).length).toBeGreaterThan(0);
  });

  it('localizes domain-derived failover, DHCPv6, and security results in German', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/failover');
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    expect(screen.getByText('Windows-DHCP-Failover gilt nur für IPv4-Scopes.')).toBeVisible();
    expect(screen.queryByText('Windows DHCP failover supports IPv4 scopes only.')).not.toBeInTheDocument();

    window.location.hash = '#/tool/dhcpv6';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByText('Router Advertisements liefern die IPv6-Standardroute; DHCPv6 nicht.')).toBeVisible();
    expect(screen.queryByText(/Router Advertisements supply the IPv6 default route/i)).not.toBeInTheDocument();

    window.location.hash = '#/tool/security';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByText('DHCP Snooping ist deaktiviert')).toBeVisible();
    expect(screen.queryByText('DHCP snooping is disabled')).not.toBeInTheDocument();
  });

  it('localizes Header landmark labels and polished German catalog copy', async () => {
    const user = userEvent.setup();
    renderAt('#/utilities');

    await user.click(screen.getByRole('button', { name: 'Deutsch' }));

    expect(screen.getByRole('link', { name: 'DHCPulse Startseite' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'DHCP-Werkzeuge' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Konfigurationsvergleich/ })).toHaveTextContent('DHCP-Konfigurationen vor einer Änderung vergleichen.');
  });
});

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

function captureDownloads() {
  const blobs: Blob[] = [];
  const items: { blob: Blob; filename: string }[] = [];
  const createObjectUrl = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return `blob:download-${blobs.length}`;
  });
  const revokeObjectUrl = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureDownload(this: HTMLAnchorElement) {
    items.push({ blob: blobs[items.length]!, filename: this.download });
  });
  return { blobs, items, createObjectUrl, revokeObjectUrl };
}
