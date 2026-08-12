import type { Locale } from '../../content/copy';
import type { ConfigurationWorkspace } from '../../domain/config-workspace';
import type { DhcpChangeOperation } from '../../domain/dhcp-change-set';

export function operationTargetLabel(workspace: ConfigurationWorkspace, operation: DhcpChangeOperation, locale: Locale): string {
  if (operation.kind === 'scope.clone') return `${locale === 'de' ? 'Neuer Scope' : 'New scope'} · ${operation.after.name} · ${operation.after.cidr}`;
  const configuration = workspace.configuration;
  const scope = configuration.ipv4Scopes.find(({ id }) => id === operation.targetId);
  if (scope) return `${scope.name ?? (locale === 'de' ? 'IPv4-Scope' : 'IPv4 scope')} · ${scope.cidr}`;
  const reservation = configuration.reservations.find(({ id }) => id === operation.targetId);
  if (reservation) return `${reservation.hostname ?? (locale === 'de' ? 'Reservierung' : 'Reservation')} · ${reservation.address}`;
  const exclusion = configuration.exclusions.find(({ id }) => id === operation.targetId);
  if (exclusion) {
    const owner = configuration.ipv4Scopes.find(({ id }) => id === exclusion.scopeId);
    const range = exclusion.start === exclusion.end ? exclusion.start : `${exclusion.start} – ${exclusion.end}`;
    return owner ? `${range} · ${owner.name ?? owner.cidr}` : range;
  }
  const option = configuration.options.find(({ id }) => id === operation.targetId);
  if (option) {
    const owner = configuration.ipv4Scopes.find(({ id }) => id === option.scopeId);
    const optionName = `Option ${option.code ?? option.name ?? '—'}`;
    return owner ? `${optionName} · ${owner.name ?? owner.cidr}` : optionName;
  }
  const server = configuration.servers.find(({ id }) => id === operation.targetId);
  if (server) return server.name ?? (locale === 'de' ? 'DHCP-Server' : 'DHCP server');
  return operation.targetId;
}
