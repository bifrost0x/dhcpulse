import {
  deterministicConfigId,
  emptyDhcpConfiguration,
  type DhcpConfiguration,
  type DhcpOptionLevel,
  type DhcpPolicyClass,
  type DhcpReservation,
  type DhcpScope,
} from '../config-model';
import {
  addWarning,
  assignReservationsToScopes,
  maskToPrefix,
  numeric,
  optionCode,
  optional,
  optionalNumber,
  provenance,
} from './shared';

interface IscToken {
  value: string;
  line: number;
}

interface IscStatement {
  kind: 'statement';
  tokens: IscToken[];
}

interface IscBlock {
  kind: 'block';
  header: IscToken[];
  children: IscNode[];
}

type IscNode = IscStatement | IscBlock;

export function importIscDhcpd(text: string, fileName?: string): DhcpConfiguration {
  const configuration = emptyDhcpConfiguration('isc-dhcpd', 'ISC DHCP', fileName);
  const nodes = parseNodes(tokenize(text)).nodes;
  const globalLease = findNumericStatement(nodes, 'default-lease-time');
  const maxLease = findNumericStatement(nodes, 'max-lease-time');
  configuration.servers.push({
    id: deterministicConfigId('server', 'isc-dhcpd'),
    provenance: provenance('isc-dhcpd', 'line 1'),
    ...optionalNumber('defaultLeaseTimeSeconds', globalLease),
    ...optionalNumber('maxLeaseTimeSeconds', maxLease),
  });
  const unsupported = { count: 0 };
  collectFailoverRelationships(configuration, nodes);
  walk(configuration, nodes, { level: 'global', unsupported, globalLease });
  assignReservationsToScopes(configuration);
  addWarning(configuration, 'unsupported-directive', unsupported.count, '$', 'ISC dhcpd contains unsupported statements or expressions; their values were omitted.');
  if (unsupported.count === 0) addWarning(configuration, 'partial-parse', 1, '$', 'ISC dhcpd import supports a tokenizer-based analysis subset, not the complete expression language.');
  return configuration;
}

interface Context {
  scope?: DhcpScope;
  poolId?: string;
  reservationId?: string;
  level: DhcpOptionLevel;
  sharedNetwork?: string;
  unsupported: { count: number };
  globalLease?: number;
}

function walk(configuration: DhcpConfiguration, nodes: IscNode[], context: Context): void {
  for (const node of nodes) {
    if (node.kind === 'block') {
      const header = values(node.header);
      const keyword = header[0]?.toLowerCase();
      if (keyword === 'subnet' && header[1] && header[2]?.toLowerCase() === 'netmask' && header[3]) {
        const cidr = `${header[1]}/${maskToPrefix(header[3])}`;
        const scope: DhcpScope = {
          id: deterministicConfigId('scope', 'dhcpv4', cidr),
          provenance: provenance('isc-dhcpd', tokenLocation(node.header[0])),
          protocol: 'dhcpv4',
          cidr,
          ...optionalNumber('leaseLifetimeSeconds', findNumericStatement(node.children, 'default-lease-time') ?? context.globalLease),
          ...(context.sharedNetwork ? { sharedNetwork: context.sharedNetwork } : {}),
        };
        configuration.ipv4Scopes.push(scope);
        walk(configuration, node.children, { ...context, scope, level: 'scope' });
      } else if (keyword === 'shared-network' && header[1]) {
        const name = header[1];
        configuration.policies.push({
          id: deterministicConfigId('shared-network', name),
          provenance: provenance('isc-dhcpd', tokenLocation(node.header[0])),
          kind: 'shared-network',
          name,
        });
        walk(configuration, node.children, { ...context, sharedNetwork: name, level: 'shared-network' });
      } else if (keyword === 'pool') {
        const range = node.children
          .filter((child): child is IscStatement => child.kind === 'statement')
          .map((child) => values(child.tokens))
          .find((statement) => statement[0]?.toLowerCase() === 'range' && statement[1] && statement[2]);
        const poolId = range?.[1] && range[2]
          ? deterministicConfigId('pool', context.scope?.cidr, range[1], range[2])
          : undefined;
        walk(configuration, node.children, { ...context, level: 'pool', ...(poolId ? { poolId } : {}) });
      } else if (keyword === 'host' && header[1]) {
        importHost(configuration, node, header[1], context);
      } else if (keyword === 'class' && header[1]) {
        const expression = firstStatementText(node.children, 'match');
        const item: DhcpPolicyClass = {
          id: deterministicConfigId('class', header[1]),
          provenance: provenance('isc-dhcpd', tokenLocation(node.header[0])),
          kind: 'class',
          name: header[1],
          ...optional('expression', expression),
        };
        configuration.classes.push(item);
        if (expression) context.unsupported.count += 1;
      } else if (keyword === 'failover' && header[1]?.toLowerCase() === 'peer' && header[2]) {
        // Pre-collected so peer references resolve regardless of declaration order.
      } else {
        context.unsupported.count += 1;
      }
      continue;
    }

    const statement = values(node.tokens);
    const keyword = statement[0]?.toLowerCase();
    if (keyword === 'range' && statement[1] && statement[2]) {
      configuration.pools.push({
        id: deterministicConfigId('pool', context.scope?.cidr, statement[1], statement[2]),
        provenance: provenance('isc-dhcpd', tokenLocation(node.tokens[0])),
        protocol: 'dhcpv4',
        ...(context.scope ? { scopeId: context.scope.id } : {}),
        start: statement[1],
        end: statement[2],
        ...optionalNumber('leaseLifetimeSeconds', context.scope?.leaseLifetimeSeconds ?? context.globalLease),
      });
    } else if (keyword === 'option' && statement[1]) {
      const value = statement.slice(2).join(' ');
      if (value) addOption(configuration, statement[1], value, node.tokens[0], context);
    } else if (keyword === 'default-lease-time' || keyword === 'max-lease-time' || keyword === 'authoritative') {
      // Captured at server/scope level.
    } else if (keyword === 'failover' && statement[1]?.toLowerCase() === 'peer') {
      const relationship = configuration.failoverRelationships.find((item) => item.name === statement[2]);
      if (relationship && context.scope && !relationship.scopeIds.includes(context.scope.id)) relationship.scopeIds.push(context.scope.id);
    } else if (keyword === 'hardware' || keyword === 'fixed-address' || keyword === 'match' || keyword === 'primary' || keyword === 'secondary' || keyword === 'address' || (keyword === 'peer' && statement[1]?.toLowerCase() === 'address')) {
      // Captured by the owning block where relevant.
    } else if (keyword) {
      context.unsupported.count += 1;
    }
  }
}

function collectFailoverRelationships(configuration: DhcpConfiguration, nodes: IscNode[]): void {
  for (const node of nodes) {
    if (node.kind !== 'block') continue;
    const header = values(node.header);
    if (header[0]?.toLowerCase() === 'failover' && header[1]?.toLowerCase() === 'peer' && header[2]) {
      const partner = statementValues(node.children, ['peer', 'address'])[0];
      if (!configuration.failoverRelationships.some(({ name }) => name === header[2])) {
        configuration.failoverRelationships.push({
          id: deterministicConfigId('failover', header[2]),
          provenance: provenance('isc-dhcpd', tokenLocation(node.header[0])),
          name: header[2],
          ...(partner ? { partner } : {}),
          scopeIds: [],
        });
      }
    } else {
      collectFailoverRelationships(configuration, node.children);
    }
  }
}

function importHost(configuration: DhcpConfiguration, block: IscBlock, name: string, context: Context): void {
  const fixedAddress = statementValues(block.children, ['fixed-address'])[0];
  if (!fixedAddress) {
    context.unsupported.count += 1;
    return;
  }
  const hardware = statementValues(block.children, ['hardware', 'ethernet'])[0];
  const reservation: DhcpReservation = {
    id: deterministicConfigId('reservation', 'dhcpv4', hardware, name, fixedAddress),
    provenance: provenance('isc-dhcpd', tokenLocation(block.header[0])),
    protocol: 'dhcpv4',
    ...(context.scope ? { scopeId: context.scope.id } : {}),
    address: fixedAddress,
    ...(hardware ? { identifier: hardware, identifierType: 'mac' } : { identifier: name, identifierType: 'hostname' }),
    hostname: name,
    level: context.scope ? 'scope' : 'global',
  };
  configuration.reservations.push(reservation);
  walk(configuration, block.children, { ...context, reservationId: reservation.id, level: 'reservation' });
}

function addOption(configuration: DhcpConfiguration, name: string, value: string, token: IscToken | undefined, context: Context): void {
  const code = optionCode(name);
  configuration.options.push({
    id: deterministicConfigId(
      'option',
      'dhcpv4',
      code,
      name,
      context.level,
      context.scope?.cidr,
      context.poolId,
      context.reservationId,
      value,
    ),
    provenance: provenance('isc-dhcpd', tokenLocation(token)),
    protocol: 'dhcpv4',
    ...(code !== undefined ? { code } : {}),
    name,
    value,
    level: context.level,
    ...(context.scope ? { scopeId: context.scope.id } : {}),
    ...(context.poolId ? { poolId: context.poolId } : {}),
    ...(context.reservationId ? { reservationId: context.reservationId } : {}),
  });
}

function tokenize(text: string): IscToken[] {
  const tokens: IscToken[] = [];
  let index = 0;
  let line = 1;
  while (index < text.length) {
    const current = text[index] ?? '';
    if (/\s/.test(current)) {
      if (current === '\n') line += 1;
      index += 1;
      continue;
    }
    if (current === '#') {
      while (index < text.length && text[index] !== '\n') index += 1;
      continue;
    }
    if (current === '/' && text[index + 1] === '/') {
      index += 2;
      while (index < text.length && text[index] !== '\n') index += 1;
      continue;
    }
    if (current === '/' && text[index + 1] === '*') {
      index += 2;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
        if (text[index] === '\n') line += 1;
        index += 1;
      }
      index += 2;
      continue;
    }
    if ('{};'.includes(current)) {
      tokens.push({ value: current, line });
      index += 1;
      continue;
    }
    if (current === '"') {
      const startLine = line;
      index += 1;
      let value = '';
      let escaped = false;
      while (index < text.length) {
        const character = text[index] ?? '';
        index += 1;
        if (escaped) {
          value += character;
          escaped = false;
        } else if (character === '\\') escaped = true;
        else if (character === '"') break;
        else {
          if (character === '\n') line += 1;
          value += character;
        }
      }
      tokens.push({ value, line: startLine });
      continue;
    }
    const start = index;
    while (index < text.length && !/[\s{};"]/u.test(text[index] ?? '')) index += 1;
    tokens.push({ value: text.slice(start, index), line });
  }
  return tokens;
}

function parseNodes(tokens: IscToken[], start = 0): { nodes: IscNode[]; index: number } {
  const nodes: IscNode[] = [];
  let index = start;
  while (index < tokens.length) {
    if (tokens[index]?.value === '}') return { nodes, index: index + 1 };
    const header: IscToken[] = [];
    while (index < tokens.length && !['{', ';', '}'].includes(tokens[index]?.value ?? '')) {
      const token = tokens[index];
      if (token) header.push(token);
      index += 1;
    }
    const delimiter = tokens[index]?.value;
    if (delimiter === '{') {
      const child = parseNodes(tokens, index + 1);
      nodes.push({ kind: 'block', header, children: child.nodes });
      index = child.index;
    } else if (delimiter === ';') {
      nodes.push({ kind: 'statement', tokens: header });
      index += 1;
    } else if (delimiter === '}') {
      if (header.length) nodes.push({ kind: 'statement', tokens: header });
      return { nodes, index: index + 1 };
    } else {
      if (header.length) nodes.push({ kind: 'statement', tokens: header });
      break;
    }
  }
  return { nodes, index };
}

function values(tokens: IscToken[]): string[] {
  return tokens.map(({ value }) => value);
}

function statementValues(nodes: IscNode[], prefix: string[]): string[] {
  for (const node of nodes) {
    if (node.kind !== 'statement') continue;
    const statement = values(node.tokens);
    if (prefix.every((part, index) => statement[index]?.toLowerCase() === part)) return statement.slice(prefix.length);
  }
  return [];
}

function findNumericStatement(nodes: IscNode[], name: string): number | undefined {
  return numeric(statementValues(nodes, [name])[0]);
}

function firstStatementText(nodes: IscNode[], name: string): string | undefined {
  const statement = nodes.find((node) => node.kind === 'statement' && node.tokens[0]?.value.toLowerCase() === name);
  return statement?.kind === 'statement' ? values(statement.tokens).slice(1).join(' ') : undefined;
}

function tokenLocation(token: IscToken | undefined): string {
  return `line ${token?.line ?? 1}`;
}
