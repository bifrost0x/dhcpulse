import type { Locale } from '../content/copy';
import type {
  ChangeSetResult,
  DhcpChangeOperation,
  OptionState,
  ReservationState,
} from './dhcp-change-set';
import type { DhcpConfiguration, DhcpOption, DhcpScope } from './config-model';
import type { MicrosoftWorkspace } from './microsoft-workspace';
import { evaluatePackageEligibility } from './workspace-view';

export type GeneratedArtifactName =
  | '01-Preflight.ps1'
  | '02-Apply.ps1'
  | '03-Verify.ps1'
  | '04-Rollback.ps1'
  | 'CHANGE.md'
  | 'change-set.json'
  | 'manifest.json';

export interface GeneratedArtifact {
  name: GeneratedArtifactName;
  mimeType: string;
  content: string;
}

export interface PowerShellPackage {
  artifacts: GeneratedArtifact[];
}

interface ScriptFragments {
  preflight: string[];
  apply: string[];
  verify: string[];
  rollback: string[];
  summary: { kind: string; target: string; before: string; after: string };
}

const scriptMime = 'text/plain;charset=utf-8';
const jsonMime = 'application/json;charset=utf-8';

export function quotePowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function generatePowerShellPackage(
  workspace: MicrosoftWorkspace,
  result: ChangeSetResult,
  locale: Locale,
  generatedAt: Date,
): Promise<PowerShellPackage> {
  if (!result.valid || result.changeSet.operations.length === 0) {
    throw new Error('A valid non-empty change set is required.');
  }
  const serverName = workspace.serverName;
  if (!serverName || /[\r\n\0]/.test(serverName) || result.changeSet.serverName !== serverName) {
    throw new Error('A valid single-line server name is required.');
  }
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('A valid generation timestamp is required.');
  if (!evaluatePackageEligibility(workspace, result).eligible) {
    throw new Error('The change set is not eligible for package generation.');
  }

  const fragments = result.changeSet.operations.map((operation) => operationFragments(workspace.configuration, operation));
  const artifacts: GeneratedArtifact[] = [
    artifact('01-Preflight.ps1', scriptMime, buildScript(serverName, 'Preflight', fragments.flatMap(({ preflight }) => preflight), 'Preflight completed successfully.')),
    artifact('02-Apply.ps1', scriptMime, buildScript(serverName, 'Apply', fragments.flatMap(({ apply }) => apply), 'Apply completed successfully.')),
    artifact('03-Verify.ps1', scriptMime, buildScript(serverName, 'Verify', fragments.flatMap(({ verify }) => verify), 'Verification completed successfully.')),
    artifact('04-Rollback.ps1', scriptMime, buildScript(serverName, 'Rollback', [...fragments].reverse().flatMap(({ rollback }) => rollback), 'Rollback completed successfully.')),
    artifact('CHANGE.md', 'text/markdown;charset=utf-8', buildChangeDocument(serverName, fragments, locale, generatedAt)),
    artifact('change-set.json', jsonMime, `${stableJson({ generator: 'DHCPulse', schemaVersion: 1, generatedAt: generatedAt.toISOString(), changeSet: result.changeSet })}\n`),
  ];
  const manifestFiles = await Promise.all(artifacts.map(async ({ name, content }) => ({
    name,
    bytes: new TextEncoder().encode(content).byteLength,
    sha256: await sha256(content),
  })));
  artifacts.push(artifact('manifest.json', jsonMime, `${stableJson({ generator: 'DHCPulse', schemaVersion: 1, generatedAt: generatedAt.toISOString(), files: manifestFiles })}\n`));
  return { artifacts };
}

function operationFragments(configuration: DhcpConfiguration, operation: DhcpChangeOperation): ScriptFragments {
  const marker = `# ${operation.id}: ${operation.kind}`;
  switch (operation.kind) {
    case 'scope-range.set': {
      const scope = requiredScope(configuration, operation.targetId);
      const scopeId = scopeAddress(scope);
      return {
        preflight: [marker, scopeGuard(scopeId, operation.before.start, operation.before.end)],
        apply: [marker, `Set-DhcpServerv4Scope -ComputerName $Server -ScopeId ${q(scopeId)} -StartRange ${q(operation.after.start)} -EndRange ${q(operation.after.end)}`],
        verify: [marker, scopeGuard(scopeId, operation.after.start, operation.after.end)],
        rollback: [marker, scopeGuard(scopeId, operation.after.start, operation.after.end), `Set-DhcpServerv4Scope -ComputerName $Server -ScopeId ${q(scopeId)} -StartRange ${q(operation.before.start)} -EndRange ${q(operation.before.end)}`],
        summary: { kind: operation.kind, target: scopeId, before: `${operation.before.start} – ${operation.before.end}`, after: `${operation.after.start} – ${operation.after.end}` },
      };
    }
    case 'scope-lease.set': {
      const scopeId = scopeAddress(requiredScope(configuration, operation.targetId));
      return {
        preflight: [marker, leaseGuard(scopeId, operation.beforeSeconds)],
        apply: [marker, `Set-DhcpServerv4Scope -ComputerName $Server -ScopeId ${q(scopeId)} -LeaseDuration ([TimeSpan]::FromSeconds(${operation.afterSeconds}))`],
        verify: [marker, leaseGuard(scopeId, operation.afterSeconds)],
        rollback: [marker, leaseGuard(scopeId, operation.afterSeconds), `Set-DhcpServerv4Scope -ComputerName $Server -ScopeId ${q(scopeId)} -LeaseDuration ([TimeSpan]::FromSeconds(${operation.beforeSeconds}))`],
        summary: { kind: operation.kind, target: scopeId, before: `${operation.beforeSeconds} seconds`, after: `${operation.afterSeconds} seconds` },
      };
    }
    case 'exclusion.add': {
      const scopeId = scopeAddress(requiredScope(configuration, operation.targetId));
      return {
        preflight: [marker, exclusionAbsentGuard(scopeId, operation.after.start, operation.after.end)],
        apply: [marker, addExclusion(scopeId, operation.after.start, operation.after.end)],
        verify: [marker, exclusionPresentGuard(scopeId, operation.after.start, operation.after.end)],
        rollback: [marker, exclusionPresentGuard(scopeId, operation.after.start, operation.after.end), removeExclusion(scopeId, operation.after.start, operation.after.end)],
        summary: { kind: operation.kind, target: scopeId, before: 'absent', after: `${operation.after.start} – ${operation.after.end}` },
      };
    }
    case 'exclusion.remove': {
      const scope = requiredScope(configuration, operation.before.scopeId);
      const scopeId = scopeAddress(scope);
      return {
        preflight: [marker, exclusionPresentGuard(scopeId, operation.before.start, operation.before.end)],
        apply: [marker, removeExclusion(scopeId, operation.before.start, operation.before.end)],
        verify: [marker, exclusionAbsentGuard(scopeId, operation.before.start, operation.before.end)],
        rollback: [marker, exclusionAbsentGuard(scopeId, operation.before.start, operation.before.end), addExclusion(scopeId, operation.before.start, operation.before.end)],
        summary: { kind: operation.kind, target: scopeId, before: `${operation.before.start} – ${operation.before.end}`, after: 'absent' },
      };
    }
    case 'reservation.add': {
      const scopeId = scopeAddress(requiredScope(configuration, operation.targetId));
      return {
        preflight: [marker, reservationAbsentGuard(operation.after.address)],
        apply: [marker, addReservation(scopeId, operation.after)],
        verify: [marker, reservationGuard(operation.after)],
        rollback: [marker, reservationGuard(operation.after), removeReservation(operation.after.address)],
        summary: { kind: operation.kind, target: operation.after.address, before: 'absent', after: reservationSummary(operation.after) },
      };
    }
    case 'reservation.update': {
      const beforeScope = configuration.reservations.find(({ id }) => id === operation.targetId)?.scopeId;
      const scopeId = scopeAddress(requiredScope(configuration, beforeScope));
      const sameAddress = operation.before.address === operation.after.address;
      const apply = sameAddress
        ? setReservation(operation.before.address, operation.after)
        : `${removeReservation(operation.before.address)}\n${addReservation(scopeId, operation.after)}`;
      const rollback = sameAddress
        ? setReservation(operation.after.address, operation.before)
        : `${removeReservation(operation.after.address)}\n${addReservation(scopeId, operation.before)}`;
      return {
        preflight: [marker, reservationGuard(operation.before), ...(sameAddress ? [] : [reservationAbsentGuard(operation.after.address)])],
        apply: [marker, apply],
        verify: [marker, reservationGuard(operation.after)],
        rollback: [marker, reservationGuard(operation.after), rollback],
        summary: { kind: operation.kind, target: operation.before.address, before: reservationSummary(operation.before), after: reservationSummary(operation.after) },
      };
    }
    case 'reservation.remove': {
      const scopeId = scopeAddress(requiredScope(configuration, configuration.reservations.find(({ id }) => id === operation.targetId)?.scopeId));
      return {
        preflight: [marker, reservationGuard(operation.before)],
        apply: [marker, removeReservation(operation.before.address)],
        verify: [marker, reservationAbsentGuard(operation.before.address)],
        rollback: [marker, reservationAbsentGuard(operation.before.address), addReservation(scopeId, operation.before)],
        summary: { kind: operation.kind, target: operation.before.address, before: reservationSummary(operation.before), after: 'absent' },
      };
    }
    case 'option.set': {
      const scopeId = operation.after.level === 'scope' ? scopeAddress(requiredScope(configuration, operation.targetId)) : undefined;
      return {
        preflight: [marker, operation.before ? optionGuard(operation.before, scopeId) : optionAbsentGuard(operation.after.code, scopeId)],
        apply: [marker, setOption(operation.after, scopeId)],
        verify: [marker, optionGuard(operation.after, scopeId)],
        rollback: [marker, optionGuard(operation.after, scopeId), operation.before ? setOption(operation.before, scopeId) : removeOption(operation.after.code, scopeId)],
        summary: { kind: operation.kind, target: scopeId ?? 'server', before: operation.before ? optionValue(operation.before.value) : 'absent', after: optionValue(operation.after.value) },
      };
    }
    case 'option.remove': {
      const scopeId = operation.before.level === 'scope' ? scopeAddress(requiredScope(configuration, operation.before.scopeId)) : undefined;
      return {
        preflight: [marker, optionGuard(operation.before, scopeId)],
        apply: [marker, removeOption(operation.before.code, scopeId)],
        verify: [marker, optionAbsentGuard(operation.before.code, scopeId)],
        rollback: [marker, optionAbsentGuard(operation.before.code, scopeId), setOption(operation.before, scopeId)],
        summary: { kind: operation.kind, target: scopeId ?? 'server', before: optionValue(operation.before.value), after: 'absent' },
      };
    }
    case 'scope.clone': {
      const scopeId = operation.after.cidr.split('/')[0]!;
      const add = `Add-DhcpServerv4Scope -ComputerName $Server -Name ${q(operation.after.name)} -StartRange ${q(operation.after.start)} -EndRange ${q(operation.after.end)} -SubnetMask ${q(operation.after.subnetMask)} -LeaseDuration ([TimeSpan]::FromSeconds(${operation.after.leaseSeconds})) -State InActive`;
      return {
        preflight: [marker, scopeAbsentGuard(scopeId)],
        apply: [marker, add],
        verify: [marker, scopeGuard(scopeId, operation.after.start, operation.after.end), leaseGuard(scopeId, operation.after.leaseSeconds)],
        rollback: [marker, scopeGuard(scopeId, operation.after.start, operation.after.end), `Remove-DhcpServerv4Scope -ComputerName $Server -ScopeId ${q(scopeId)} -Force`],
        summary: { kind: operation.kind, target: scopeId, before: 'absent', after: `${operation.after.name} (${operation.after.cidr})` },
      };
    }
  }
}

function buildScript(serverName: string, phase: string, lines: string[], success: string): string {
  return [
    '#Requires -Modules DhcpServer',
    `# DHCPulse ${phase} script. Review before execution.`,
    'Set-StrictMode -Version Latest',
    "$ErrorActionPreference = 'Stop'",
    `$Server = ${q(serverName)}`,
    '',
    ...lines,
    '',
    `Write-Host ${q(success)}`,
    '',
  ].join('\n');
}

function buildChangeDocument(serverName: string, fragments: ScriptFragments[], locale: Locale, generatedAt: Date): string {
  const de = locale === 'de';
  const warning = de ? 'Betriebsdaten - vor Weitergabe prüfen' : 'Operational data - do not share without review';
  const rows = fragments.map(({ summary }) => `| ${summary.kind} | ${summary.target} | ${escapeMarkdown(summary.before)} | ${escapeMarkdown(summary.after)} |`);
  return [
    '# DHCPulse Change Package',
    '',
    `> **${warning}.** ${de ? 'Dieses Paket enthält echte Infrastrukturwerte und führt nichts automatisch aus.' : 'This package contains real infrastructure values and does not execute anything automatically.'}`,
    '',
    `- ${de ? 'Server' : 'Server'}: \`${serverName}\``,
    `- ${de ? 'Erzeugt' : 'Generated'}: ${generatedAt.toISOString()}`,
    `- ${de ? 'Änderungen' : 'Changes'}: ${fragments.length}`,
    '',
    `## ${de ? 'Semantische Änderungen' : 'Semantic changes'}`,
    '',
    '| Kind | Target | Before | After |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    `## ${de ? 'Ausführungsreihenfolge' : 'Execution order'}`,
    '',
    '1. `01-Preflight.ps1`',
    '2. Review `02-Apply.ps1` and the table above.',
    '3. `02-Apply.ps1`',
    '4. `03-Verify.ps1`',
    '5. Use `04-Rollback.ps1` only if rollback is required and its guards still pass.',
    '',
    `## ${de ? 'Sicherheitsgrenze' : 'Safety boundary'}`,
    '',
    de
      ? 'DHCPulse verbindet sich nicht mit dem Server. Die Ausführung, Berechtigungsprüfung, Sicherung und Freigabe bleiben beim Administrator.'
      : 'DHCPulse does not connect to the server. Execution, authorization, backup, and approval remain the administrator’s responsibility.',
    '',
  ].join('\n');
}

function scopeGuard(scopeId: string, start: string, end: string): string {
  return `$Scope = Get-DhcpServerv4Scope -ComputerName $Server -ScopeId ${q(scopeId)} -ErrorAction Stop\nif ($Scope.StartRange.IPAddressToString -ne ${q(start)} -or $Scope.EndRange.IPAddressToString -ne ${q(end)}) { throw ${q(`Scope ${scopeId} range differs from the expected state.`)} }`;
}

function scopeAbsentGuard(scopeId: string): string {
  return `$ExistingScope = Get-DhcpServerv4Scope -ComputerName $Server -ScopeId ${q(scopeId)} -ErrorAction SilentlyContinue\nif ($null -ne $ExistingScope) { throw ${q(`Scope ${scopeId} already exists.`)} }`;
}

function leaseGuard(scopeId: string, seconds: number): string {
  return `$LeaseScope = Get-DhcpServerv4Scope -ComputerName $Server -ScopeId ${q(scopeId)} -ErrorAction Stop\nif ([int64]$LeaseScope.LeaseDuration.TotalSeconds -ne ${seconds}) { throw ${q(`Scope ${scopeId} lease duration differs from the expected state.`)} }`;
}

function exclusionLookup(scopeId: string, start: string, end: string): string {
  return `@(Get-DhcpServerv4ExclusionRange -ComputerName $Server -ScopeId ${q(scopeId)} -ErrorAction Stop | Where-Object { $_.StartRange.IPAddressToString -eq ${q(start)} -and $_.EndRange.IPAddressToString -eq ${q(end)} })`;
}

function exclusionPresentGuard(scopeId: string, start: string, end: string): string {
  return `$Exclusion = ${exclusionLookup(scopeId, start, end)}\nif ($Exclusion.Count -ne 1) { throw ${q(`Expected exclusion ${start}-${end} was not found exactly once.`)} }`;
}

function exclusionAbsentGuard(scopeId: string, start: string, end: string): string {
  return `$Exclusion = ${exclusionLookup(scopeId, start, end)}\nif ($Exclusion.Count -ne 0) { throw ${q(`Exclusion ${start}-${end} already exists.`)} }`;
}

function addExclusion(scopeId: string, start: string, end: string): string {
  return `Add-DhcpServerv4ExclusionRange -ComputerName $Server -ScopeId ${q(scopeId)} -StartRange ${q(start)} -EndRange ${q(end)}`;
}

function removeExclusion(scopeId: string, start: string, end: string): string {
  return `Remove-DhcpServerv4ExclusionRange -ComputerName $Server -ScopeId ${q(scopeId)} -StartRange ${q(start)} -EndRange ${q(end)}`;
}

function reservationGuard(state: ReservationState): string {
  return `$Reservation = Get-DhcpServerv4Reservation -ComputerName $Server -IPAddress ${q(state.address)} -ErrorAction Stop\nif ($Reservation.ClientId -ne ${q(state.clientId)} -or [string]$Reservation.Name -ne ${q(state.hostname ?? '')}) { throw ${q(`Reservation ${state.address} differs from the expected state.`)} }`;
}

function reservationAbsentGuard(address: string): string {
  return `$Reservation = Get-DhcpServerv4Reservation -ComputerName $Server -IPAddress ${q(address)} -ErrorAction SilentlyContinue\nif ($null -ne $Reservation) { throw ${q(`Reservation ${address} already exists.`)} }`;
}

function addReservation(scopeId: string, state: ReservationState): string {
  return `Add-DhcpServerv4Reservation -ComputerName $Server -ScopeId ${q(scopeId)} -IPAddress ${q(state.address)} -ClientId ${q(state.clientId)}${state.hostname ? ` -Name ${q(state.hostname)}` : ''}`;
}

function setReservation(address: string, state: ReservationState): string {
  return `Set-DhcpServerv4Reservation -ComputerName $Server -IPAddress ${q(address)} -ClientId ${q(state.clientId)} -Name ${q(state.hostname ?? '')}`;
}

function removeReservation(address: string): string {
  return `Remove-DhcpServerv4Reservation -ComputerName $Server -IPAddress ${q(address)} -Confirm:$false`;
}

function optionGuard(state: OptionState, scopeId: string | undefined): string {
  const expected = optionValue(state.value);
  return `$Option = Get-DhcpServerv4OptionValue -ComputerName $Server${scopeParameter(scopeId)} -OptionId ${state.code} -ErrorAction Stop\nif ((@($Option.Value) -join ',') -ne ${q(expected)}) { throw ${q(`Option ${state.code} differs from the expected state.`)} }`;
}

function optionAbsentGuard(code: number, scopeId: string | undefined): string {
  return `$Option = Get-DhcpServerv4OptionValue -ComputerName $Server${scopeParameter(scopeId)} -OptionId ${code} -ErrorAction SilentlyContinue\nif ($null -ne $Option) { throw ${q(`Option ${code} already exists at the target level.`)} }`;
}

function setOption(state: OptionState, scopeId: string | undefined): string {
  return `Set-DhcpServerv4OptionValue -ComputerName $Server${scopeParameter(scopeId)} -OptionId ${state.code} -Value ${powerShellValue(state.value)}`;
}

function removeOption(code: number, scopeId: string | undefined): string {
  return `Remove-DhcpServerv4OptionValue -ComputerName $Server${scopeParameter(scopeId)} -OptionId ${code} -Confirm:$false`;
}

function scopeParameter(scopeId: string | undefined): string {
  return scopeId ? ` -ScopeId ${q(scopeId)}` : '';
}

function powerShellValue(value: DhcpOption['value']): string {
  if (Array.isArray(value)) return value.map(q).join(',');
  if (typeof value === 'boolean') return value ? '$true' : '$false';
  if (typeof value === 'number') return String(value);
  return q(value);
}

function optionValue(value: DhcpOption['value']): string {
  return Array.isArray(value) ? value.join(',') : String(value);
}

function requiredScope(configuration: DhcpConfiguration, id: string | undefined): DhcpScope {
  const scope = configuration.ipv4Scopes.find((candidate) => candidate.id === id);
  if (!scope) throw new Error('A referenced IPv4 scope is missing.');
  return scope;
}

function scopeAddress(scope: DhcpScope): string {
  return scope.cidr.split('/')[0]!;
}

function reservationSummary(state: ReservationState): string {
  return `${state.address} · ${state.hostname ?? 'unnamed'}`;
}

function artifact(name: GeneratedArtifactName, mimeType: string, content: string): GeneratedArtifact {
  return { name, mimeType, content };
}

function q(value: string): string {
  return quotePowerShellLiteral(value);
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right, 'en')).map(([key, item]) => [key, sortJson(item)]));
  }
  return value;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function escapeMarkdown(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}
