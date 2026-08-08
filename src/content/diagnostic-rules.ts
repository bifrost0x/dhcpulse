import type { DiagnosticCauseId, DhcpSecurityFindingId } from '../domain/types';

interface RuleContent {
  title: string;
  rationale: string;
  source: string;
}

export const diagnosticCauseCatalog: Record<DiagnosticCauseId, RuleContent> = {
  'relay-path-unreachable': {
    title: 'Relay path or server reachability failure',
    rationale: 'Relayed requests without an offer point first to relay forwarding, routing, or the server-facing path.',
    source: 'https://www.rfc-editor.org/rfc/rfc2131',
  },
  'dhcp-server-unreachable': {
    title: 'DHCP server unavailable or unreachable',
    rationale: 'A discover without an offer can indicate that no eligible server received or answered the request.',
    source: 'https://www.rfc-editor.org/rfc/rfc2131',
  },
  'rogue-or-duplicate-server': {
    title: 'Rogue or duplicate DHCP server',
    rationale: 'Multiple server identifiers in the same client exchange indicate competing responders.',
    source: 'https://www.rfc-editor.org/rfc/rfc2131',
  },
  'address-pool-exhaustion': {
    title: 'Address pool exhaustion or starvation',
    rationale: 'Low free capacity and DECLINE activity can prevent the server from selecting a usable address.',
    source: 'https://www.rfc-editor.org/rfc/rfc2131',
  },
  'dns-update-failure': {
    title: 'Dynamic DNS update failure',
    rationale: 'Registration symptoms and queued updates point to the DHCP-to-DNS update path.',
    source: 'https://www.rfc-editor.org/rfc/rfc4703',
  },
  'failover-state-degraded': {
    title: 'Failover relationship state is degraded',
    rationale: 'A non-normal partner state can change lease ownership and service behavior.',
    source: 'https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/dhcp-failover',
  },
  'scope-or-relay-selection-mismatch': {
    title: 'Scope or relay link selection mismatch',
    rationale: 'Wrong-subnet and NAK evidence can indicate an incorrect giaddr, link-address, or scope match.',
    source: 'https://www.rfc-editor.org/rfc/rfc2131',
  },
  'option-delivery-mismatch': {
    title: 'DHCP option delivery mismatch',
    rationale: 'The selected scope, reservation, class, or policy may not provide the expected options.',
    source: 'https://www.rfc-editor.org/rfc/rfc2132',
  },
  'renewal-path-failure': {
    title: 'Renewal or rebinding path failure',
    rationale: 'Existing clients can fail when unicast renewal or later rebinding cannot reach an eligible server.',
    source: 'https://www.rfc-editor.org/rfc/rfc2131',
  },
  'pxe-policy-mismatch': {
    title: 'PXE policy or boot option mismatch',
    rationale: 'PXE failures commonly follow architecture, class, boot-server, or boot-file selection mismatches.',
    source: 'https://www.rfc-editor.org/rfc/rfc4578',
  },
  'dhcpv6-ra-mismatch': {
    title: 'DHCPv6 and Router Advertisement mismatch',
    rationale: 'RA flags, prefix data, and DHCPv6 mode must describe a compatible client configuration path.',
    source: 'https://www.rfc-editor.org/rfc/rfc4861',
  },
  'duplicate-address-detection': {
    title: 'Duplicate address or stale lease state',
    rationale: 'DECLINE or duplicate-address evidence can identify a conflicting address or stale ownership record.',
    source: 'https://www.rfc-editor.org/rfc/rfc2131',
  },
};

export const securityRuleCatalog: Record<DhcpSecurityFindingId, RuleContent> = {
  'security-dhcp-snooping-disabled': {
    title: 'DHCP snooping is disabled',
    rationale: 'DHCP snooping helps restrict server replies to explicitly trusted network paths.',
    source: 'https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-17/configuration_guide/ip/b_1717_ip_9300_cg/configuring_dhcp.html',
  },
  'security-trusted-port-misconfigured': {
    title: 'DHCP trusted-port assignment is inconsistent',
    rationale: 'Server-facing or relay-facing ports must be the deliberate trusted boundary.',
    source: 'https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-17/configuration_guide/ip/b_1717_ip_9300_cg/configuring_dhcp.html',
  },
  'security-rogue-dhcp-server': {
    title: 'Multiple DHCP servers observed',
    rationale: 'Unexpected competing server identifiers can indicate an unauthorized or duplicate DHCP service.',
    source: 'https://www.rfc-editor.org/rfc/rfc2131',
  },
  'security-starvation-or-exhaustion': {
    title: 'Pool starvation or exhaustion signal',
    rationale: 'Very low free capacity, especially with DECLINE activity, warrants review for abuse and address conflicts.',
    source: 'https://www.rfc-editor.org/rfc/rfc2131',
  },
  'security-option-82-trust-missing': {
    title: 'Option 82 trust is not established',
    rationale: 'Relay-agent information must be accepted only from a defined trusted boundary.',
    source: 'https://www.rfc-editor.org/rfc/rfc3046',
  },
  'security-dns-credential-mismatch': {
    title: 'DNS update credentials are misaligned',
    rationale: 'Shared, controlled DHCP DNS credentials reduce inconsistent ownership and failed secure updates.',
    source: 'https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/dhcp-failover',
  },
  'security-audit-logging-disabled': {
    title: 'DHCP audit logging is disabled',
    rationale: 'Audit logs are needed to reconstruct lease, update, and administrative events.',
    source: 'https://learn.microsoft.com/en-us/powershell/module/dhcpserver/get-dhcpserverauditlog',
  },
  'security-windows-dhcp-unauthorized': {
    title: 'Windows DHCP server is not authorized',
    rationale: 'An Active Directory joined Windows DHCP server should be explicitly authorized before serving clients.',
    source: 'https://learn.microsoft.com/en-us/powershell/module/dhcpserver/get-dhcpserverindc',
  },
  'security-ra-guard-disabled': {
    title: 'RA Guard is disabled',
    rationale: 'RA Guard limits unauthorized Router Advertisements on access-layer ports.',
    source: 'https://www.rfc-editor.org/rfc/rfc6105',
  },
  'security-backup-restore-unverified': {
    title: 'Backup and restore readiness is unverified',
    rationale: 'A recoverable DHCP service needs a current backup and a tested restore procedure.',
    source: 'https://learn.microsoft.com/en-us/powershell/module/dhcpserver/backup-dhcpserver',
  },
  'security-secret-exposure': {
    title: 'DHCP or DNS secret exposure detected',
    rationale: 'Exposed update credentials or configuration secrets require containment and rotation.',
    source: 'https://owasp.org/www-project-secrets-management-cheat-sheet/',
  },
};

export const readOnlyCommandAllowlist = [
  'ipconfig /all',
  'ipconfig /renew',
  'Get-DhcpServerv4Scope',
  'Get-DhcpServerv4ScopeStatistics',
  'Get-DhcpServerv4Failover',
  'Get-DhcpServerAuditLog',
  'Get-WinEvent -LogName "Microsoft-Windows-DHCP-Server/Operational" -MaxEvents 100',
  'Get-WinEvent -LogName "DNS Server" -MaxEvents 100',
] as const;
