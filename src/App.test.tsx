import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const toolNames = [
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

describe('DHCPulse Workbench', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('renders all stable tool links, their groups, and a live tool count', () => {
    renderAt();

    expect(screen.getByRole('heading', { name: 'DHCPulse Workbench' })).toBeVisible();
    expect(screen.getByText('10 tools ready')).toBeVisible();
    for (const group of ['Plan', 'Build', 'Analyze', 'Troubleshoot', 'Secure']) {
      expect(screen.getByRole('heading', { name: group })).toBeVisible();
    }
    for (const name of toolNames) {
      expect(screen.getByRole('link', { name: new RegExp(name) })).toHaveAttribute('href', expect.stringContaining('#/tool/'));
    }
  });

  it('searches translated tool content and clears an empty result', async () => {
    const user = userEvent.setup();
    renderAt();
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
    expect(screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('#/tool/'))).toHaveLength(10);
  });

  it('navigates through valid tool hashes without reloading', async () => {
    const user = userEvent.setup();
    renderAt();

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
    renderAt();
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
    renderAt();
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
    expect(screen.getByRole('heading', { name: 'DHCPulse Workbench' })).toBeVisible();
  });

  it('moves category selection and focus with wrapping keyboard controls', () => {
    renderAt();
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
    const createObjectUrl = vi.fn(() => 'blob:dhcpulse-plan');
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
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
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:dhcpulse-plan');
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
    const view = renderAt('#/tool/scope');

    toolNames.forEach((name, index) => {
      const id = ['scope', 'lease', 'options', 'pxe', 'failover', 'dhcpv6', 'diagnostics', 'security', 'config-analyzer', 'config-diff'][index];
      if (index > 0) {
        window.location.hash = `#/tool/${id}`;
        fireEvent(window, new HashChangeEvent('hashchange'));
      }
      expect(screen.getByRole('heading', { name })).toBeVisible();
      expect(screen.getByTestId(`tool-panel-${id}`)).not.toBeEmptyDOMElement();
    });

    view.unmount();
  });

  it('states browser-local processing and no uploads in both languages', async () => {
    const user = userEvent.setup();
    renderAt('#/tool/scope');

    expect(screen.getByText(/Processed only in this browser\. No data is uploaded\./)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));
    expect(screen.getByText(/Nur lokal in diesem Browser verarbeitet\. Es werden keine Daten hochgeladen\./)).toBeVisible();
  });

  it('localizes Header landmark labels and polished German catalog copy', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('button', { name: 'Deutsch' }));

    expect(screen.getByRole('link', { name: 'DHCPulse Startseite' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Konfigurationsanalyse/ })).toHaveTextContent('DHCP-Konfiguration auf typische Risiken prüfen.');
  });
});
