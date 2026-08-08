import type {
  PxeAnalysisInput,
  PxeAnalysisResult,
  PxeArchitecture,
  PxeFinding,
} from './types';

const architectureDetails: Record<PxeArchitecture, { codes: number[]; family: string }> = {
  'bios-x86': { codes: [0], family: 'legacy BIOS' },
  'uefi-x86': { codes: [6], family: 'UEFI IA32' },
  'uefi-x64': { codes: [7, 9], family: 'UEFI x64' },
  'uefi-arm64': { codes: [11], family: 'UEFI ARM64' },
  'http-x64': { codes: [16], family: 'HTTP Boot x64' },
};

export function analyzePxe(input: PxeAnalysisInput): PxeAnalysisResult {
  const details = architectureDetails[input.architecture];
  const findings: PxeFinding[] = [];
  const architectures = new Set([input.architecture, ...(input.architectures ?? [])]);

  if ((input.globalBootFile || input.bootFile) && architectures.size > 1) {
    findings.push(finding('globalBootFileMixedArchitectures', 'A single global boot file cannot safely represent mixed firmware architectures.'));
  }
  if (isUrl(input.serverAddress) || isUrl(input.serverName)) {
    findings.push(finding('option66Url', 'Option 66 is a server name, not a URL; keep URL boot resources in the boot-file decision.'));
  }
  if (input.architecture === 'http-x64' && !isHttpUrl(input.bootFile)) {
    findings.push(finding('httpBootRequiresUrl', 'HTTP Boot requires an HTTP(S) boot-file URL.'));
  }
  if (input.ipxeChainload && input.userClass?.toLocaleLowerCase('en-US') === 'ipxe' && !input.userClassPolicy) {
    findings.push(finding('ipxeLoopRisk', 'Branch on the iPXE user class so an iPXE client is not chainloaded repeatedly.'));
  }
  if (input.proxyDhcp && input.authoritativeBootOptions) {
    findings.push(
      finding(
        'proxyDhcpWithAuthoritativeOptions',
        'ProxyDHCP and authoritative boot options can conflict; identify which service owns each PXE response.',
      ),
    );
  }
  if (!input.serverAddress && !input.serverName) {
    findings.push(finding('missingServer', 'A boot server address or name is required for review.'));
  }
  if (!input.bootFile) {
    findings.push(finding('missingBootFile', 'A boot file is required for review.'));
  }
  if (input.mode && input.mode !== 'none' && (input.serverAddress || input.serverName || input.bootFile)) {
    findings.push(
      finding(
        'directOptionsWithManagedDeployment',
        'WDS, MDT, and MECM commonly require DHCP policies or ProxyDHCP instead of unconditional options 66/67.',
      ),
    );
  }

  return {
    architectureCode: details.codes[0]!,
    architectureCodes: [...details.codes],
    recommendedBootFileFamily: details.family,
    findings,
    decisionSteps: [
      { order: 1, key: 'identifyArchitecture', instruction: 'Identify client architecture codes and firmware transport.' },
      { order: 2, key: 'identifyResponder', instruction: 'Identify the authoritative DHCP and optional ProxyDHCP responders.' },
      { order: 3, key: 'branchClasses', instruction: 'Branch on architecture, vendor class, and iPXE user class where applicable.' },
      { order: 4, key: 'selectBootResource', instruction: 'Select a server and boot file appropriate to the matched architecture.' },
      { order: 5, key: 'labValidate', instruction: 'Review and validate the policy in an isolated representative environment.' },
    ],
    policyExamples: {
      microsoftDhcpPowerShell: microsoftExample(input, details.codes),
      keaJson: keaExample(input, details.codes),
    },
    reviewNotice: 'Generated policy examples are review-only and require environment review before any use.',
  };
}

function finding(key: PxeFinding['key'], message: string): PxeFinding {
  return { key, severity: 'warning', message };
}

function isUrl(value: string | undefined): boolean {
  return value !== undefined && /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim());
}

function isHttpUrl(value: string | undefined): boolean {
  return value !== undefined && /^https?:\/\//i.test(value.trim());
}

function microsoftExample(input: PxeAnalysisInput, codes: number[]): string {
  const server = input.serverName ?? input.serverAddress ?? '<review-server>';
  const bootFile = input.bootFile ?? '<review-boot-file>';
  return [
    '# REVIEW ONLY - do not apply without environment review',
    `$ArchitectureCodes = @(${codes.join(', ')})`,
    `$BootServer = '${escapePowerShell(server)}'`,
    `$BootFile = '${escapePowerShell(bootFile)}'`,
    '# Create architecture/vendor/user-class conditions and test policy precedence before use.',
  ].join('\n');
}

function keaExample(input: PxeAnalysisInput, codes: number[]): string {
  return JSON.stringify(
    {
      'review-only': true,
      notice: 'REVIEW ONLY - do not deploy without environment review',
      warning: 'Do not deploy without environment review',
      match: {
        'client-system-architecture': codes,
        ...(input.vendorClass ? { 'vendor-class': input.vendorClass } : {}),
        ...(input.userClass ? { 'user-class': input.userClass } : {}),
      },
      'option-data': [
        { code: 66, data: input.serverName ?? input.serverAddress ?? '<review-server>' },
        { code: 67, data: input.bootFile ?? '<review-boot-file>' },
      ],
    },
    null,
    2,
  );
}

function escapePowerShell(value: string): string {
  return value.replaceAll("'", "''");
}
