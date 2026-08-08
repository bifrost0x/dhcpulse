import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('DHCPulse workspace', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with a useful, ready-to-plan migration scenario', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Plan the change. See when clients move.' })).toBeVisible();
    expect(screen.getByText('Ready to plan')).toBeVisible();
    expect(screen.getByText('3', { selector: '.metric-value' })).toBeVisible();
  });

  it('loads the unsafe overlap preset and explains the no-go verdict', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Unsafe overlap check/ }));

    expect(screen.getByText('No-go as entered')).toBeVisible();
    expect(screen.getByText('Both servers can answer from the same pool')).toBeVisible();
    expect(screen.getByText('The shared pool has no transferred lease state')).toBeVisible();
  });

  it('preserves entered values while switching to German', async () => {
    const user = userEvent.setup();
    render(<App />);
    const clients = screen.getByRole('spinbutton', { name: 'Estimated clients' });

    await user.clear(clients);
    await user.type(clients, '321');
    await user.click(screen.getByRole('button', { name: 'Deutsch' }));

    expect(screen.getByRole('spinbutton', { name: 'Geschätzte Clients' })).toHaveValue(321);
    expect(screen.getByRole('heading', { name: 'Plane den Change. Sieh, wann Clients wechseln.' })).toBeVisible();
  });

  it('withholds the result and identifies invalid T1 ordering', async () => {
    const user = userEvent.setup();
    render(<App />);

    const t1 = screen.getByRole('spinbutton', { name: 'T1 renewal' });
    await user.clear(t1);
    await user.type(t1, '90');

    expect(screen.getByText('T1 must occur before T2.')).toBeVisible();
    expect(screen.getByText('Correct the highlighted timing values to calculate a plan.')).toBeVisible();
    expect(screen.queryByText('Ready to plan')).not.toBeInTheDocument();
  });

  it('resets edits to the safe default scenario', async () => {
    const user = userEvent.setup();
    render(<App />);
    const clients = screen.getByRole('spinbutton', { name: 'Estimated clients' });

    await user.clear(clients);
    await user.type(clients, '7');
    await user.click(screen.getByRole('button', { name: 'Reset scenario' }));

    expect(screen.getByRole('spinbutton', { name: 'Estimated clients' })).toHaveValue(250);
  });

  it('downloads the generated plan without sending the scenario anywhere', async () => {
    const user = userEvent.setup();
    const createObjectUrl = vi.fn(() => 'blob:dhcpulse-plan');
    const revokeObjectUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    render(<App />);

    const results = screen.getByRole('region', { name: 'Cutover outlook' });
    await user.click(within(results).getByRole('button', { name: 'Download Markdown' }));

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:dhcpulse-plan');
  });

  it('supports native arrow-key navigation across change types', () => {
    render(<App />);
    const migration = screen.getByRole('radio', { name: 'Server migration' });
    const serverAddress = screen.getByRole('radio', { name: 'New DHCP server address' });

    migration.focus();
    fireEvent.keyDown(migration, { key: 'ArrowRight' });

    expect(serverAddress).toBeChecked();
  });
});
