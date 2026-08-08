import {
  diagnosticCauseCatalog,
  readOnlyCommandAllowlist,
  securityRuleCatalog,
} from '../content/diagnostic-rules';
import type {
  DiagnosticCauseId,
  DiagnosticEvidenceStep,
  DiagnosticScoreContribution,
  DiagnosticValidationFinding,
  DhcpDiagnosticInput,
  DhcpDiagnosticResult,
  DhcpSecurityFinding,
  DhcpSecurityFindingId,
  RankedDiagnosticCause,
  Severity,
} from './types';

interface CauseAccumulator {
  contributions: DiagnosticScoreContribution[];
}

const severityRank: Record<Severity, number> = { blocker: 0, warning: 1, info: 2 };

export function diagnoseDhcp(input: DhcpDiagnosticInput): DhcpDiagnosticResult {
  const causes = rankCauses(input);

  return {
    rankedCauses: causes,
    evidenceSteps: evidenceSteps(input, causes),
    wiresharkFilters: wiresharkFilters(input),
    commands: commands(input),
    securityFindings: securityFindings(input),
    validationFindings: validationFindings(input),
  };
}

function rankCauses(input: DhcpDiagnosticInput): RankedDiagnosticCause[] {
  const scores = new Map<DiagnosticCauseId, CauseAccumulator>();
  const serverIds = distinctServerIds(input);
  const has = (symptom: DhcpDiagnosticInput['symptoms'][number]) =>
    input.symptoms.includes(symptom);
  const add = (id: DiagnosticCauseId, score: number, evidence: string) => {
    const current = scores.get(id) ?? { contributions: [] };
    if (!current.contributions.some((contribution) => contribution.evidence === evidence)) {
      current.contributions.push({ evidence, weight: score });
    }
    scores.set(id, current);
  };

  if (has('apipa')) {
    add('dhcp-server-unreachable', 40, 'symptom=apipa');
    if (input.path === 'relay') add('relay-path-unreachable', 45, 'symptom=apipa');
  }
  if (has('no-offer')) {
    add('dhcp-server-unreachable', 60, 'symptom=no-offer');
    if (input.path === 'relay') add('relay-path-unreachable', 70, 'symptom=no-offer');
  }
  if (has('relay-failure')) add('relay-path-unreachable', 100, 'symptom=relay-failure');
  if (has('wrong-subnet')) {
    add('scope-or-relay-selection-mismatch', 100, 'symptom=wrong-subnet');
  }
  if (has('wrong-options')) add('option-delivery-mismatch', 100, 'symptom=wrong-options');
  if (has('renewal-failure')) add('renewal-path-failure', 100, 'symptom=renewal-failure');
  if (has('pxe-failure')) add('pxe-policy-mismatch', 100, 'symptom=pxe-failure');
  if (has('dns-registration')) add('dns-update-failure', 100, 'symptom=dns-registration');
  if (has('duplicate-address')) {
    add('duplicate-address-detection', 100, 'symptom=duplicate-address');
    add('address-pool-exhaustion', 40, 'symptom=duplicate-address');
  }
  if (has('pool-exhaustion')) add('address-pool-exhaustion', 100, 'symptom=pool-exhaustion');
  if (has('failover-state')) add('failover-state-degraded', 100, 'symptom=failover-state');
  if (has('rogue-server')) add('rogue-or-duplicate-server', 100, 'symptom=rogue-server');
  if (has('dhcpv6-ra')) add('dhcpv6-ra-mismatch', 100, 'symptom=dhcpv6-ra');

  if (input.path === 'relay' && !input.offerSeen) {
    add('relay-path-unreachable', 30, 'path=relay;offerSeen=false');
  }
  if (input.path === 'relay' && !input.relayGiaddr?.trim() && !input.relayLinkAddress?.trim()) {
    add('relay-path-unreachable', 20, 'relay-address=missing');
  }
  if (!input.offerSeen && (has('apipa') || has('no-offer'))) {
    add('dhcp-server-unreachable', 20, 'offerSeen=false');
  }
  if (input.requestSeen && !input.ackSeen) {
    add(
      input.existingClientsAffected ? 'renewal-path-failure' : 'dhcp-server-unreachable',
      50,
      'requestSeen=true;ackSeen=false',
    );
  }
  if (serverIds.length > 1) {
    add('rogue-or-duplicate-server', 200, `serverIds=${serverIds.join(',')}`);
  }
  if (isValidFreePoolPercentage(input.freePoolPercentage) && input.freePoolPercentage <= 5) {
    add('address-pool-exhaustion', 150, `freePoolPercentage=${input.freePoolPercentage}`);
  }
  if (input.declineSeen) {
    add('address-pool-exhaustion', 80, 'declineSeen=true');
    add('duplicate-address-detection', 60, 'declineSeen=true');
  }
  if (input.dnsQueueSymptoms) add('dns-update-failure', 150, 'dnsQueueSymptoms=true');
  if (input.nakSeen) {
    add('scope-or-relay-selection-mismatch', 40, 'nakSeen=true');
    add('renewal-path-failure', 30, 'nakSeen=true');
  }
  if (input.failoverState && input.failoverState.toLowerCase() !== 'normal') {
    add('failover-state-degraded', 150, `failoverState=${input.failoverState}`);
  }
  if (input.recentChange) {
    add('option-delivery-mismatch', 10, 'recentChange=true');
    add('scope-or-relay-selection-mismatch', 10, 'recentChange=true');
  }
  if (input.existingClientsAffected && !input.newClientsAffected) {
    add('renewal-path-failure', 20, 'affectedClients=existing');
  }
  if (input.affectedVlans === 'some' && input.path === 'relay') {
    add('scope-or-relay-selection-mismatch', 10, 'affectedVlans=some');
  }

  return [...scores.entries()]
    .map(([id, entry]) => {
      const contributions = [...entry.contributions];
      return {
        id,
        title: diagnosticCauseCatalog[id].title,
        score: contributions.reduce((sum, contribution) => sum + contribution.weight, 0),
        rationale: diagnosticCauseCatalog[id].rationale,
        matchedEvidence: contributions.map(({ evidence }) => evidence),
        contributions,
        source: diagnosticCauseCatalog[id].source,
      };
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

function evidenceSteps(
  input: DhcpDiagnosticInput,
  causes: RankedDiagnosticCause[],
): DiagnosticEvidenceStep[] {
  const steps: DiagnosticEvidenceStep[] = [
    {
      id: 'inspect-client-configuration',
      instruction: 'Record the client address, lease, gateway, DNS servers, and DHCP server identifier.',
      source: 'https://www.rfc-editor.org/rfc/rfc2131',
    },
    {
      id: 'inspect-existing-exchange',
      instruction: 'Inspect an existing packet capture for DISCOVER, OFFER, REQUEST, ACK, NAK, and DECLINE evidence.',
      source: 'https://www.rfc-editor.org/rfc/rfc2131',
    },
  ];
  if (causes.some(({ id }) => id === 'relay-path-unreachable')) {
    steps.push({
      id: 'inspect-relay-selection',
      instruction: 'Compare the observed giaddr or link-address with the intended VLAN and server-facing relay path.',
      source: 'https://www.rfc-editor.org/rfc/rfc2131',
    });
  }
  if (input.symptoms.includes('dns-registration') || input.dnsQueueSymptoms) {
    steps.push({
      id: 'inspect-dns-update-events',
      instruction: 'Inspect DHCP audit and DNS event logs for failed dynamic update records and credential errors.',
      source: 'https://www.rfc-editor.org/rfc/rfc4703',
    });
  }
  if (
    (isValidFreePoolPercentage(input.freePoolPercentage) && input.freePoolPercentage <= 10) ||
    input.symptoms.includes('pool-exhaustion')
  ) {
    steps.push({
      id: 'inspect-scope-capacity',
      instruction: 'Review scope statistics, exclusions, reservations, active leases, and DECLINE records.',
      source: 'https://www.rfc-editor.org/rfc/rfc2131',
    });
  }
  if (input.symptoms.includes('failover-state')) {
    steps.push({
      id: 'inspect-failover-state',
      instruction: 'Review the current partner state, last transition, MCLT, and replication status.',
      source: 'https://learn.microsoft.com/en-us/windows-server/networking/technologies/dhcp/dhcp-failover',
    });
  }
  return steps;
}

function wiresharkFilters(input: DhcpDiagnosticInput): string[] {
  const filters = new Set<string>(['bootp']);
  if (!input.offerSeen || input.symptoms.includes('no-offer')) filters.add('bootp.option.dhcp == 2');
  if (distinctServerIds(input).length > 1 || input.symptoms.includes('rogue-server')) {
    filters.add('bootp.option.dhcp_server_id');
  }
  if (input.declineSeen || input.symptoms.includes('duplicate-address')) {
    filters.add('bootp.option.dhcp == 4');
  }
  if (input.path === 'relay') filters.add('bootp.giaddr');
  if (input.symptoms.includes('pxe-failure')) {
    filters.add('bootp.option.type == 60 || bootp.option.type == 93');
  }
  if (input.symptoms.includes('dhcpv6-ra')) filters.add('dhcpv6 || icmpv6.type == 134');
  return [...filters];
}

function commands(input: DhcpDiagnosticInput): string[] {
  const selected = new Set<string>(['ipconfig /all']);
  if (input.serverPlatform === 'windows') {
    selected.add('Get-DhcpServerv4Scope');
    selected.add('Get-DhcpServerv4ScopeStatistics');
    selected.add('Get-DhcpServerAuditLog');
    selected.add('Get-WinEvent -LogName "Microsoft-Windows-DHCP-Server/Operational" -MaxEvents 100');
    if (input.symptoms.includes('failover-state')) selected.add('Get-DhcpServerv4Failover');
    if (input.symptoms.includes('dns-registration') || input.dnsQueueSymptoms) {
      selected.add('Get-WinEvent -LogName "DNS Server" -MaxEvents 100');
    }
  }
  return readOnlyCommandAllowlist.filter((command) => selected.has(command));
}

function securityFindings(input: DhcpDiagnosticInput): DhcpSecurityFinding[] {
  const findings: DhcpSecurityFinding[] = [];
  const serverIds = distinctServerIds(input);
  const add = (
    id: DhcpSecurityFindingId,
    severity: Severity,
    evidence: string[],
  ) => {
    const content = securityRuleCatalog[id];
    findings.push({ id, severity, rationale: content.rationale, evidence, source: content.source });
  };

  if (!input.security.dhcpSnoopingEnabled) {
    add('security-dhcp-snooping-disabled', 'warning', ['dhcpSnoopingEnabled=false']);
  }
  if (!input.security.serverFacingPortsTrusted) {
    add('security-trusted-port-misconfigured', 'warning', ['serverFacingPortsTrusted=false']);
  }
  if (serverIds.length > 1 || input.symptoms.includes('rogue-server')) {
    const evidence: string[] = [];
    if (input.symptoms.includes('rogue-server')) evidence.push('symptom=rogue-server');
    if (serverIds.length > 1) evidence.push(`serverIds=${serverIds.join(',')}`);
    add('security-rogue-dhcp-server', 'blocker', evidence);
  }
  if (
    (isValidFreePoolPercentage(input.freePoolPercentage) && input.freePoolPercentage <= 5) ||
    input.declineSeen
  ) {
    add('security-starvation-or-exhaustion', 'warning', [
      `freePoolPercentage=${input.freePoolPercentage}`,
      `declineSeen=${input.declineSeen}`,
    ]);
  }
  if (input.path === 'relay' && !input.security.option82Trusted) {
    add('security-option-82-trust-missing', 'warning', ['path=relay', 'option82Trusted=false']);
  }
  if (!input.security.dnsUpdateCredentialsAligned) {
    add('security-dns-credential-mismatch', 'warning', ['dnsUpdateCredentialsAligned=false']);
  }
  if (!input.security.auditLoggingEnabled) {
    add('security-audit-logging-disabled', 'warning', ['auditLoggingEnabled=false']);
  }
  if (input.serverPlatform === 'windows' && !input.security.windowsDhcpAuthorized) {
    add('security-windows-dhcp-unauthorized', 'blocker', ['windowsDhcpAuthorized=false']);
  }
  if (input.symptoms.includes('dhcpv6-ra') && !input.security.raGuardEnabled) {
    add('security-ra-guard-disabled', 'warning', ['raGuardEnabled=false']);
  }
  if (!input.security.backupRestoreTested) {
    add('security-backup-restore-unverified', 'warning', ['backupRestoreTested=false']);
  }
  if (input.security.secretExposureDetected) {
    add('security-secret-exposure', 'blocker', ['secretExposureDetected=true']);
  }

  findings.sort(
    (left, right) => severityRank[left.severity] - severityRank[right.severity],
  );
  return findings;
}

function distinctServerIds(input: DhcpDiagnosticInput): string[] {
  return [...new Set(input.serverIds.map((id) => id.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function validationFindings(input: DhcpDiagnosticInput): DiagnosticValidationFinding[] {
  if (isValidFreePoolPercentage(input.freePoolPercentage)) return [];
  return [
    {
      id: 'diagnostics-invalid-free-pool-percentage',
      severity: 'blocker',
      rationale: 'Free pool percentage must be a finite value from 0 through 100.',
      evidence: [`freePoolPercentage=${String(input.freePoolPercentage)}`],
      source:
        'https://learn.microsoft.com/en-us/powershell/module/dhcpserver/get-dhcpserverv4scopestatistics',
    },
  ];
}

function isValidFreePoolPercentage(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}
