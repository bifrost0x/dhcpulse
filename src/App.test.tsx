import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import dnsmasq from './test/fixtures/dnsmasq.conf?raw';
import iscDhcpd from './test/fixtures/isc-dhcpd.conf?raw';
import kea from './test/fixtures/kea.json?raw';
import microsoftXml from './test/fixtures/microsoft-dhcp.xml?raw';

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

  it('keeps every workspace destination available through compact responsive tab labels', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));

    const expectedTabs = [
      ['Overview', 'Overview'],
      ['Review issues (33)', 'Issues'],
      ['Inventory (410)', 'Objects'],
      ['Change plan (0)', 'Plan'],
      ['Export', 'Export'],
    ] as const;

    for (const [accessibleName, compactLabel] of expectedTabs) {
      const tab = screen.getByRole('tab', { name: accessibleName });
      expect(within(tab).getByText(compactLabel, { selector: '.workspace-tab-compact' })).toBeInTheDocument();
    }
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
    await user.click(screen.getByRole('button', { name: 'Review Gateway is inside a dynamic pool' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    expect(within(context).getByText(/break connectivity/i)).toBeVisible();
    expect(within(context).getByText(/exclude the gateway address/i)).toBeVisible();
    expect(within(context).getByRole('button', { name: 'Preview change' })).toBeVisible();
  });

  it('turns a guided reservation finding into a validated change without guessing the new address', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Reservation is outside its scope distribution range' }));
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
    const reviewTray = screen.getByRole('region', { name: 'Review tray' });
    const remediationQueue = screen.getByRole('region', { name: 'Remediation queue' });
    expect(reviewTray).toHaveTextContent('1 prepared change');
    expect(reviewTray.compareDocumentPosition(remediationQueue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('associates guided change validation errors with the responsible field', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Reservation is outside its scope distribution range' }));
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
    await user.click(screen.getByRole('button', { name: 'Review Reservation is outside its scope distribution range' }));
    expect(screen.getByRole('heading', { name: 'Reservation is outside its scope distribution range' })).toHaveFocus();
  });

  it('keeps the context panel aligned with the visible filtered work', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Actionability' }), 'actionable');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scope' }), screen.getByRole('option', { name: 'Office VLAN 100' }));
    await user.click(screen.getByRole('button', { name: 'Review Scope option overrides the server value' }));

    const context = screen.getByRole('complementary', { name: 'Finding context' });
    const row = screen.getByRole('button', { name: 'Review Scope option overrides the server value' });
    expect(within(row).getByText(/Office VLAN 100/)).toBeVisible();
    expect(within(row).queryByText(/Warehouse VLAN/)).not.toBeInTheDocument();
    expect(within(context).getByText('Scope option overrides the server value')).toBeVisible();
    expect(within(context).getByText('Office VLAN 100')).toBeVisible();
    expect(within(context).getByText('Occurrence 1 of 2')).toBeVisible();
    await user.click(within(context).getByRole('button', { name: 'Align with server value' }));
    expect(within(context).getByRole('button', { name: 'Preview change' })).toBeVisible();
  });

  it('keeps a finding in context while preparing and reviewing a change', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));

    await user.click(screen.getByRole('button', { name: 'Review Gateway is inside a dynamic pool' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    expect(within(context).getByRole('heading', { name: 'Gateway is inside a dynamic pool' })).toHaveFocus();
    expect(within(context).getByText('Why flagged')).toBeVisible();
    expect(within(context).getByText('Operational impact')).toBeVisible();
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));

    expect(screen.getByRole('tab', { name: /Review issues/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'Review tray' })).not.toBeInTheDocument();
    const preview = within(context).getByText('Validated change preview').closest('section')!;
    expect(preview).toBeVisible();
    expect(within(context).getByText('Office VLAN 100 · 192.0.2.0/26')).toBeVisible();
    expect(within(preview).getByText('192.0.2.8')).toBeVisible();
    expect(within(preview).queryByText('{"start":"192.0.2.8","end":"192.0.2.8"}')).not.toBeInTheDocument();
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
    expect(within(changes).getByText('192.0.2.8')).toBeVisible();
    expect(within(changes).queryByText('{"start":"192.0.2.8","end":"192.0.2.8"}')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to issues' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Review export' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Review issue rationale' }));
    expect(screen.getByRole('tab', { name: /Review issues/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('complementary', { name: 'Finding context' })).getByRole('heading', { name: 'Gateway is inside a dynamic pool' })).toBeVisible();
  });

  it('continues from a valid change plan into guarded export review', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Gateway is inside a dynamic pool' }));
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
    await user.click(screen.getByRole('button', { name: 'Review Gateway is inside a dynamic pool' }));
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
    expect(within(context).getByRole('heading', { name: 'Gateway is inside a dynamic pool' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Review changes' }));
    await user.click(screen.getAllByRole('button', { name: 'Review issue rationale' })[1]!);
    expect(within(screen.getByRole('complementary', { name: 'Finding context' })).getByRole('heading', { name: 'Scope option overrides the server value' })).toBeVisible();
  });

  it('does not offer the same exclusion twice after adding it to the plan', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.click(screen.getByRole('button', { name: 'Review Gateway is inside a dynamic pool' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    expect(within(context).getByText('192.0.2.8')).toBeVisible();
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to review' }));
    expect(within(context).queryByRole('button', { name: 'Preview change' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Review tray' })).toHaveTextContent('1 prepared change');
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
    await user.click(screen.getByRole('button', { name: 'Review Gateway is inside a dynamic pool' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to review' }));
    await user.click(screen.getByRole('tab', { name: 'Export' }));

    expect(screen.getByRole('heading', { name: 'Target scope risk' })).toBeVisible();
    expect(screen.getByText(/Gateway is inside a dynamic pool \(1\)/)).toBeVisible();
    expect(screen.getByText(/Scope 192\.0\.2\.0\/26 · Office VLAN 100/)).toBeVisible();
  });

  it('distinguishes warning acknowledgement from a hard package blocker', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scope' }), screen.getByRole('option', { name: 'Office VLAN 100' }));
    await user.click(screen.getByRole('button', { name: 'Review Scope option overrides the server value' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Align with server value' }));
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to change plan' }));
    await user.click(screen.getByRole('tab', { name: 'Export' }));

    expect(screen.getByText('Review warnings to continue')).toBeVisible();
    expect(screen.queryByText('Generation blocked')).not.toBeInTheDocument();
    expect(screen.getByText('1 prepared change · 1 target scope')).toBeVisible();
    const targetRisk = screen.getByRole('heading', { name: 'Target scope risk' }).closest('section')!;
    expect(within(targetRisk).getByText('Existing blockers (context only)')).toBeVisible();
    expect(within(targetRisk).getByText(/Reservation is outside its scope distribution range/)).toBeVisible();
    const acknowledgement = screen.getByRole('checkbox', { name: /reviewed the target warnings/ });
    expect(acknowledgement).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Generate guarded package' })).toBeDisabled();

    await user.click(acknowledgement);
    expect(screen.getByText('Ready to generate')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Generate guarded package' })).toBeEnabled();
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
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scope' }), screen.getByRole('option', { name: 'Management VLAN 111' }));
    await user.click(screen.getByRole('button', { name: 'Review Scope option overrides the server value' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Align with server value' }));
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to change plan' }));
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
    expect(await readBlob(downloads.blobs[1]!)).toContain('Set-DhcpServerv4OptionValue');
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
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scope' }), screen.getByRole('option', { name: 'Management VLAN 111' }));
    await user.click(screen.getByRole('button', { name: 'Review Scope option overrides the server value' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Align with server value' }));
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to change plan' }));
    await user.click(screen.getByRole('tab', { name: 'Export' }));
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
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scope' }), screen.getByRole('option', { name: 'Management VLAN 111' }));
    await user.click(screen.getByRole('button', { name: 'Review Scope option overrides the server value' }));
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    await user.click(within(context).getByRole('button', { name: 'Align with server value' }));
    await user.click(within(context).getByRole('button', { name: 'Preview change' }));
    await user.click(within(context).getByRole('button', { name: 'Add to change plan' }));
    await user.click(screen.getByRole('tab', { name: 'Export' }));
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
    expect(screen.getByText('33 issues sorted by urgency')).toBeVisible();
    expect(screen.getAllByText(/Occurrence 1 of/).length).toBeLessThanOrEqual(1);
  });

  it('normalizes a stale workspace URL back to the clean import entry', () => {
    renderAt('#/workspace');
    expect(window.location.hash).toBe('#/');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Understand and improve your DHCP configuration' })).not.toHaveFocus();
  });

  it('uses the inventory-style list and detail panes for issues on narrow layouts', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      media: '(max-width: 1050px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('tab', { name: /Review issues/ }));

    const queue = screen.getByRole('region', { name: 'Remediation queue' });
    const context = screen.getByRole('complementary', { name: 'Finding context' });
    expect(queue.tagName).toBe('SECTION');
    expect(queue).toHaveClass('planner-card');
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(queue).not.toContainElement(context);
    expect(queue.parentElement?.lastElementChild).toBe(context);
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
    await user.click(screen.getByRole('button', { name: 'Prüfen Failover-Scope-Zuordnung fehlt im Export' }));
    const context = screen.getByRole('complementary', { name: 'Befundkontext' });
    expect(within(context).getByText('Betriebliche Auswirkung')).toBeVisible();
    expect(within(context).getByText(/nicht belegen/)).toBeVisible();
    expect(within(context).getByText(/Zuordnung.*beiden Partnern/i)).toBeVisible();
    expect(within(context).getByText('Herstellerdokumentation')).toBeVisible();
  });

  it('keeps workspace operations and package eligibility understandable in German', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(screen.getByRole('button', { name: 'Open Microsoft example' }));
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    expect(screen.getByText(/IPv4-Scopes.*Pools.*Ausschlüsse/)).toBeVisible();
    expect(screen.queryByText(/IPv4 scopes.*pools.*exclusions/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Probleme prüfen/ }));
    await user.click(screen.getByRole('button', { name: 'Prüfen Gateway liegt in einem dynamischen Pool' }));
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
