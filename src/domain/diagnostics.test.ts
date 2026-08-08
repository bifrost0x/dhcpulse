import { describe, expect, it } from 'vitest';

import { diagnoseDhcp } from './diagnostics';
import type { DhcpDiagnosticInput } from './types';

const healthySecurity: DhcpDiagnosticInput['security'] = {
  dhcpSnoopingEnabled: true,
  serverFacingPortsTrusted: true,
  option82Trusted: true,
  dnsUpdateCredentialsAligned: true,
  auditLoggingEnabled: true,
  windowsDhcpAuthorized: true,
  raGuardEnabled: true,
  backupRestoreTested: true,
  secretExposureDetected: false,
};

const baseInput: DhcpDiagnosticInput = {
  symptoms: ['apipa', 'no-offer'],
  path: 'relay',
  affectedVlans: 'some',
  existingClientsAffected: false,
  newClientsAffected: true,
  serverPlatform: 'windows',
  recentChange: false,
  offerSeen: false,
  requestSeen: false,
  ackSeen: false,
  nakSeen: false,
  declineSeen: false,
  relayGiaddr: null,
  relayLinkAddress: null,
  serverIds: [],
  freePoolPercentage: 50,
  dnsQueueSymptoms: false,
  failoverState: 'normal',
  security: healthySecurity,
};

function diagnose(overrides: Partial<DhcpDiagnosticInput> = {}) {
  return diagnoseDhcp({ ...baseInput, ...overrides });
}

describe('diagnoseDhcp', () => {
  it('ranks relay path and server reachability for APIPA with no offer through a relay', () => {
    const result = diagnose();

    expect(result.rankedCauses.slice(0, 2).map(({ id }) => id)).toEqual([
      'relay-path-unreachable',
      'dhcp-server-unreachable',
    ]);
    expect(result.rankedCauses.every(({ matchedEvidence }) => matchedEvidence.length > 0)).toBe(
      true,
    );
    expect(result.wiresharkFilters).toContain('bootp.option.dhcp == 2');
  });

  it('ranks a rogue or duplicate server first when multiple server IDs are observed', () => {
    const result = diagnose({
      symptoms: ['rogue-server', 'wrong-options'],
      path: 'direct',
      offerSeen: true,
      serverIds: ['10.0.0.10', '10.0.0.11'],
    });

    expect(result.rankedCauses[0]).toEqual(
      expect.objectContaining({
        id: 'rogue-or-duplicate-server',
        matchedEvidence: expect.arrayContaining(['serverIds=10.0.0.10,10.0.0.11']),
      }),
    );
    expect(result.securityFindings).toContainEqual(
      expect.objectContaining({ id: 'security-rogue-dhcp-server', severity: 'blocker' }),
    );
  });

  it('deduplicates repeated server IDs before evaluating rogue-server evidence', () => {
    const result = diagnose({
      symptoms: ['wrong-options'],
      path: 'direct',
      offerSeen: true,
      serverIds: [' 10.0.0.10 ', '10.0.0.10'],
    });

    expect(result.rankedCauses.some(({ id }) => id === 'rogue-or-duplicate-server')).toBe(false);
    expect(result.securityFindings.some(({ id }) => id === 'security-rogue-dhcp-server')).toBe(
      false,
    );
  });

  it('raises a rogue-server security finding from symptom evidence without server IDs', () => {
    const result = diagnose({
      symptoms: ['rogue-server'],
      path: 'direct',
      serverIds: [],
    });

    expect(result.securityFindings).toContainEqual(
      expect.objectContaining({
        id: 'security-rogue-dhcp-server',
        severity: 'blocker',
        evidence: ['symptom=rogue-server'],
      }),
    );
  });

  it('ranks exhaustion first when pool space is low and DECLINE is observed', () => {
    const result = diagnose({
      symptoms: ['pool-exhaustion', 'duplicate-address'],
      path: 'direct',
      declineSeen: true,
      freePoolPercentage: 2,
    });

    expect(result.rankedCauses[0]).toEqual(
      expect.objectContaining({
        id: 'address-pool-exhaustion',
        matchedEvidence: expect.arrayContaining([
          'freePoolPercentage=2',
          'declineSeen=true',
        ]),
      }),
    );
    expect(result.securityFindings).toContainEqual(
      expect.objectContaining({ id: 'security-starvation-or-exhaustion' }),
    );
  });

  it('returns safe DNS evidence for registration and queue symptoms', () => {
    const result = diagnose({
      symptoms: ['dns-registration'],
      path: 'direct',
      dnsQueueSymptoms: true,
    });

    expect(result.rankedCauses.at(0)?.id).toBe('dns-update-failure');
    expect(result.evidenceSteps).toContainEqual(
      expect.objectContaining({
        id: 'inspect-dns-update-events',
        instruction: expect.stringContaining('DHCP audit and DNS event logs'),
      }),
    );
    expect(result.commands).toContain('Get-DhcpServerAuditLog');
  });

  it('returns only allowlisted commands and never emits mutation verbs', () => {
    const scenarios: DhcpDiagnosticInput[] = [
      baseInput,
      {
        ...baseInput,
        symptoms: [
          'wrong-subnet',
          'wrong-options',
          'renewal-failure',
          'relay-failure',
          'pxe-failure',
          'dns-registration',
          'duplicate-address',
          'pool-exhaustion',
          'failover-state',
          'rogue-server',
          'dhcpv6-ra',
        ],
        dnsQueueSymptoms: true,
        serverIds: ['a', 'b'],
        freePoolPercentage: 0,
      },
    ];
    const allowlist = new Set([
      'ipconfig /all',
      'ipconfig /renew',
      'Get-DhcpServerv4Scope',
      'Get-DhcpServerv4ScopeStatistics',
      'Get-DhcpServerv4Failover',
      'Get-DhcpServerAuditLog',
      'Get-WinEvent -LogName "Microsoft-Windows-DHCP-Server/Operational" -MaxEvents 100',
      'Get-WinEvent -LogName "DNS Server" -MaxEvents 100',
    ]);

    for (const scenario of scenarios) {
      const result = diagnoseDhcp(scenario);
      expect(result.commands.every((command) => allowlist.has(command))).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(/\b(?:Set|Add|Remove|Restart|Stop|Start)-/i);
    }
  });

  it('evaluates every defensive security control from explicit evidence', () => {
    const result = diagnose({
      symptoms: ['rogue-server', 'dns-registration', 'dhcpv6-ra'],
      path: 'relay',
      serverIds: ['192.0.2.10', '192.0.2.11'],
      freePoolPercentage: 4,
      declineSeen: true,
      security: {
        dhcpSnoopingEnabled: false,
        serverFacingPortsTrusted: false,
        option82Trusted: false,
        dnsUpdateCredentialsAligned: false,
        auditLoggingEnabled: false,
        windowsDhcpAuthorized: false,
        raGuardEnabled: false,
        backupRestoreTested: false,
        secretExposureDetected: true,
      },
    });

    expect(result.securityFindings.map(({ id }) => id)).toEqual([
      'security-rogue-dhcp-server',
      'security-windows-dhcp-unauthorized',
      'security-secret-exposure',
      'security-dhcp-snooping-disabled',
      'security-trusted-port-misconfigured',
      'security-starvation-or-exhaustion',
      'security-option-82-trust-missing',
      'security-dns-credential-mismatch',
      'security-audit-logging-disabled',
      'security-ra-guard-disabled',
      'security-backup-restore-unverified',
    ]);
    expect(
      result.securityFindings.every(
        ({ rationale, evidence, source }) =>
          rationale.length > 0 && evidence.length > 0 && /^(https:\/\/|RFC\s)/.test(source),
      ),
    ).toBe(true);
  });

  it('uses stable score and ID ordering when causes tie', () => {
    const first = diagnose({ symptoms: ['wrong-options'], path: 'direct' });
    const second = diagnose({ symptoms: ['wrong-options'], path: 'direct' });

    expect(first.rankedCauses).toEqual(second.rankedCauses);
    expect(first.rankedCauses).toEqual(
      [...first.rankedCauses].sort(
        (left, right) => right.score - left.score || left.id.localeCompare(right.id),
      ),
    );
  });

  it('traces a REQUEST without an ACK into the ranked renewal path cause', () => {
    const result = diagnose({
      symptoms: ['renewal-failure'],
      path: 'direct',
      existingClientsAffected: true,
      newClientsAffected: false,
      offerSeen: true,
      requestSeen: true,
      ackSeen: false,
    });

    expect(result.rankedCauses.at(0)).toEqual(
      expect.objectContaining({
        id: 'renewal-path-failure',
        matchedEvidence: expect.arrayContaining(['requestSeen=true;ackSeen=false']),
      }),
    );
  });
});
