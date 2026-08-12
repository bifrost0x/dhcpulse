import { describe, expect, it } from 'vitest';
import microsoftXml from '../test/fixtures/microsoft-dhcp.xml?raw';
import { importDhcpConfiguration } from './config-import';
import { addChangeOperation, createChangeSet, type DhcpChangeOperation } from './dhcp-change-set';
import { buildMicrosoftWorkspace } from './microsoft-workspace';
import { generatePowerShellPackage, quotePowerShellLiteral } from './powershell-package';

function setup() {
  const configuration = importDhcpConfiguration({ text: microsoftXml, format: 'microsoft-xml' }).configuration;
  return { configuration, workspace: buildMicrosoftWorkspace(configuration) };
}

function artifactContent(artifacts: Awaited<ReturnType<typeof generatePowerShellPackage>>['artifacts'], name: string) {
  return artifacts.find((artifact) => artifact.name === name)?.content ?? '';
}

describe('PowerShell change package', () => {
  it('quotes hostile values as inert PowerShell single-quoted literals', () => {
    expect(quotePowerShellLiteral("O'Brien; $(Get-ChildItem) | Remove-Item `x`")).toBe("'O''Brien; $(Get-ChildItem) | Remove-Item `x`'");
    expect(quotePowerShellLiteral('line one\nline two')).toBe("'line one\nline two'");
  });

  it('generates deterministic guarded scripts and documentation for staged additions and changes', async () => {
    const { configuration, workspace } = setup();
    const scope = configuration.ipv4Scopes[0]!;
    const option = configuration.options.find(({ code, scopeId }) => code === 6 && scopeId === scope.id)!;
    const operations: DhcpChangeOperation[] = [
      { id: 'range-1', kind: 'scope-range.set', targetId: scope.id, before: { start: '192.0.2.20', end: '192.0.2.120' }, after: { start: '192.0.2.20', end: '192.0.2.200' } },
      { id: 'lease-1', kind: 'scope-lease.set', targetId: scope.id, beforeSeconds: 28_800, afterSeconds: 86_400 },
      { id: 'exclude-add', kind: 'exclusion.add', targetId: scope.id, after: { start: '192.0.2.100', end: '192.0.2.105' } },
      { id: 'reservation-add', kind: 'reservation.add', targetId: scope.id, after: { address: '192.0.2.70', clientId: '02-00-5E-10-00-70', hostname: "O'Brien Printer; $(whoami)" } },
      { id: 'option-set', kind: 'option.set', targetId: scope.id, before: { optionId: option.id, code: 6, value: option.value, level: 'scope' }, after: { code: 6, value: ['192.0.2.53', '192.0.2.54'], level: 'scope' } },
      { id: 'clone-1', kind: 'scope.clone', targetId: scope.id, after: { cidr: '198.51.100.0/24', name: 'New VLAN', subnetMask: '255.255.255.0', start: '198.51.100.20', end: '198.51.100.120', leaseSeconds: 28_800 } },
    ];
    let result = addChangeOperation(workspace, createChangeSet(workspace), operations[0]!);
    for (const operation of operations.slice(1)) result = addChangeOperation(workspace, result.changeSet, operation);
    const generatedAt = new Date('2026-08-09T10:00:00.000Z');

    const first = await generatePowerShellPackage(workspace, result, 'en', generatedAt);
    const second = await generatePowerShellPackage(workspace, result, 'en', generatedAt);

    expect(first).toEqual(second);
    expect(first.artifacts.map(({ name }) => name)).toEqual([
      '01-Preflight.ps1',
      '02-Apply.ps1',
      '03-Verify.ps1',
      '04-Rollback.ps1',
      'CHANGE.md',
      'change-set.json',
      'manifest.json',
    ]);
    const preflight = artifactContent(first.artifacts, '01-Preflight.ps1');
    const apply = artifactContent(first.artifacts, '02-Apply.ps1');
    const verify = artifactContent(first.artifacts, '03-Verify.ps1');
    const rollback = artifactContent(first.artifacts, '04-Rollback.ps1');
    expect(preflight).toContain('#Requires -Modules DhcpServer');
    expect(preflight).toContain("$Server = 'dhcp01.example.com'");
    expect(preflight).toContain('Get-DhcpServerv4Scope');
    expect(apply).toContain('Set-DhcpServerv4Scope');
    expect(apply).toContain('Add-DhcpServerv4ExclusionRange');
    expect(apply).toContain('Add-DhcpServerv4Reservation');
    expect(apply).toContain("-Name 'O''Brien Printer; $(whoami)'");
    expect(apply).toContain('Set-DhcpServerv4OptionValue');
    expect(apply).toContain('Add-DhcpServerv4Scope');
    expect(verify).toContain('Verification completed successfully.');
    expect(rollback).toContain('Remove-DhcpServerv4Scope');
    expect(rollback).toContain('Remove-DhcpServerv4Reservation');
    expect(rollback).toContain('Remove-DhcpServerv4ExclusionRange');
    expect(rollback).toContain('Rollback completed successfully.');
    expect(`${preflight}${apply}${verify}${rollback}`).not.toContain('Invoke-Expression');
    expect(`${preflight}${apply}${verify}${rollback}`).not.toContain('Invoke-Command');
    expect(artifactContent(first.artifacts, 'CHANGE.md')).toContain('Operational data - do not share without review');
    expect(artifactContent(first.artifacts, 'CHANGE.md')).not.toContain('<d:DhcpServerExport');
  });

  it('maps removal and reservation update operations to guarded inverse commands', async () => {
    const { configuration, workspace } = setup();
    const exclusion = configuration.exclusions[0]!;
    const reservation = configuration.reservations[0]!;
    const option = configuration.options.find(({ code }) => code === 6)!;
    const operations: DhcpChangeOperation[] = [
      { id: 'exclude-remove', kind: 'exclusion.remove', targetId: exclusion.id, before: { scopeId: exclusion.scopeId!, start: exclusion.start, end: exclusion.end } },
      { id: 'reservation-update', kind: 'reservation.update', targetId: reservation.id, before: { address: reservation.address, clientId: reservation.identifier!, hostname: reservation.hostname }, after: { address: reservation.address, clientId: '02:00:5e:10:00:71', hostname: 'printer-2.example.com' } },
      { id: 'option-remove', kind: 'option.remove', targetId: option.id, before: { optionId: option.id, code: option.code!, value: option.value, level: 'scope', scopeId: option.scopeId } },
    ];
    let result = addChangeOperation(workspace, createChangeSet(workspace), operations[0]!);
    for (const operation of operations.slice(1)) result = addChangeOperation(workspace, result.changeSet, operation);

    const pkg = await generatePowerShellPackage(workspace, result, 'de', new Date('2026-08-09T10:00:00.000Z'));
    const apply = artifactContent(pkg.artifacts, '02-Apply.ps1');
    const rollback = artifactContent(pkg.artifacts, '04-Rollback.ps1');

    expect(apply).toContain('Remove-DhcpServerv4ExclusionRange');
    expect(apply).toContain('Set-DhcpServerv4Reservation');
    expect(apply).toContain('Remove-DhcpServerv4OptionValue');
    expect(rollback).toContain('Add-DhcpServerv4ExclusionRange');
    expect(rollback).toContain('Set-DhcpServerv4Reservation');
    expect(rollback).toContain('Set-DhcpServerv4OptionValue');
    expect(artifactContent(pkg.artifacts, 'CHANGE.md')).toContain('Betriebsdaten - vor Weitergabe prüfen');
  });

  it('computes the manifest from exact UTF-8 artifact contents', async () => {
    const { configuration, workspace } = setup();
    const scope = configuration.ipv4Scopes[0]!;
    const result = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'lease-1',
      kind: 'scope-lease.set',
      targetId: scope.id,
      beforeSeconds: 28_800,
      afterSeconds: 86_400,
    });

    const pkg = await generatePowerShellPackage(workspace, result, 'en', new Date('2026-08-09T10:00:00.000Z'));
    const manifest = JSON.parse(artifactContent(pkg.artifacts, 'manifest.json')) as { generatedAt: string; files: Array<{ name: string; bytes: number; sha256: string }> };

    expect(manifest.generatedAt).toBe('2026-08-09T10:00:00.000Z');
    expect(manifest.files).toHaveLength(6);
    for (const item of manifest.files) {
      const content = artifactContent(pkg.artifacts, item.name);
      expect(item.bytes).toBe(new TextEncoder().encode(content).byteLength);
      expect(item.sha256).toMatch(/^[0-9A-F]{64}$/);
      expect(item.sha256).toBe(await sha256(content));
    }
  });

  it('refuses empty, invalid, or line-broken server targets before producing artifacts', async () => {
    const { configuration, workspace } = setup();
    const empty = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'invalid-option',
      kind: 'option.set',
      targetId: configuration.ipv4Scopes[0]!.id,
      after: { code: 121, value: 'unsafe', level: 'scope' },
    });
    await expect(generatePowerShellPackage(workspace, empty, 'en', new Date())).rejects.toThrow('valid non-empty change set');

    const clean = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'lease-1',
      kind: 'scope-lease.set',
      targetId: configuration.ipv4Scopes[0]!.id,
      beforeSeconds: 28_800,
      afterSeconds: 86_400,
    });
    const hostileWorkspace = { ...workspace, serverName: 'server\nWrite-Host unsafe' };
    await expect(generatePowerShellPackage(hostileWorkspace, { ...clean, changeSet: { ...clean.changeSet, serverName: hostileWorkspace.serverName } }, 'en', new Date())).rejects.toThrow('server name');
  });

  it('refuses package generation when the source is not a Microsoft DHCP XML export', async () => {
    const { configuration, workspace } = setup();
    const result = addChangeOperation(workspace, createChangeSet(workspace), {
      id: 'lease-1',
      kind: 'scope-lease.set',
      targetId: configuration.ipv4Scopes[0]!.id,
      beforeSeconds: 28_800,
      afterSeconds: 86_400,
    });
    const foreignWorkspace = {
      ...workspace,
      configuration: {
        ...workspace.configuration,
        metadata: {
          ...workspace.configuration.metadata,
          source: { ...workspace.configuration.metadata.source, format: 'kea-json' as const },
        },
      },
    };

    await expect(generatePowerShellPackage(foreignWorkspace, result, 'en', new Date())).rejects.toThrow(
      'Microsoft DHCP XML export',
    );
  });
});

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}
