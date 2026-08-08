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
  if (input.ipxeChainload && !input.userClassPolicy) {
    const observedClass = input.userClass?.toLocaleLowerCase('en-US') === 'ipxe' ? ' The observed user class is iPXE.' : '';
    findings.push(
      finding(
        'ipxeLoopRisk',
        `Branch on the iPXE user class so a chainloaded client is not chainloaded repeatedly.${observedClass}`,
      ),
    );
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
  const vendorClass = parseVendorClass(input.vendorClass);
  const architectureClasses = codes.map((code) => {
    const paddedCode = String(code).padStart(5, '0');
    return {
      name: `<REVIEW-PXE-ARCH-${paddedCode}>`,
      data:
        vendorClass.observed?.architectureCode === code
          ? vendorClass.observed.value
          : `${vendorClass.prefix}:Arch:${paddedCode}:UNDI:003016`,
    };
  });
  const userClassCondition = input.userClass ? ' -UserClass $UserClassConditions' : '';
  return [
    '# REVIEW ONLY - do not apply without environment review',
    "$ScopeId = '<REVIEW-SCOPE-ID>'",
    "$PolicyName = '<REVIEW-POLICY-NAME>'",
    `$BootServer = '${escapePowerShell(server)}'`,
    `$BootFile = '${escapePowerShell(bootFile)}'`,
    '# Capture Option 60 in this environment and replace every example below with the exact complete VCI value observed.',
    '# UNDI:003016 is an example suffix only. Windows DHCP vendor classes do not perform prefix matching.',
    ...architectureClasses.map(
      ({ name, data }) =>
        `Add-DhcpServerv4Class -Name '${escapePowerShell(name)}' -Type Vendor -Data '${escapePowerShell(data)}'`,
    ),
    `$VendorClassConditions = ${powerShellArray(['EQ', ...architectureClasses.map(({ name }) => name)])}`,
    ...(input.userClass ? [`$UserClassConditions = ${powerShellArray(['EQ', input.userClass])}`] : []),
    `Add-DhcpServerv4Policy -ScopeId $ScopeId -Name $PolicyName -Condition AND -VendorClass $VendorClassConditions${userClassCondition}`,
    'Set-DhcpServerv4OptionValue -ScopeId $ScopeId -PolicyName $PolicyName -OptionId 66 -Value $BootServer',
    'Set-DhcpServerv4OptionValue -ScopeId $ScopeId -PolicyName $PolicyName -OptionId 67 -Value $BootFile',
  ].join('\n');
}

function keaExample(input: PxeAnalysisInput, codes: number[]): string {
  const architectureTest = codes.map((code) => `option[93].hex == 0x${code.toString(16).padStart(4, '0')}`).join(' or ');
  const vendorPrefix = parseVendorClass(input.vendorClass).prefix;
  const vendorTest = ` and substring(option[60].text, 0, ${vendorPrefix.length}) == '${escapeKeaExpression(vendorPrefix)}'`;
  const userClassTest = input.userClass ? ` and option[77].text == '${escapeKeaExpression(input.userClass)}'` : '';
  return JSON.stringify(
    {
      'review-only': true,
      notice: 'REVIEW ONLY - do not deploy without environment review',
      'client-classes': [
        {
          name: '<REVIEW-ARCHITECTURE-CLASS>',
          test: `(${architectureTest})${vendorTest}`,
        },
        {
          name: '<REVIEW-BOOT-POLICY>',
          test: `member('<REVIEW-ARCHITECTURE-CLASS>')${userClassTest}`,
          'option-data': [
            { code: 66, data: input.serverName ?? input.serverAddress ?? '<review-server>' },
            { code: 67, data: input.bootFile ?? '<review-boot-file>' },
          ],
        },
      ],
    },
    null,
    2,
  );
}

function escapePowerShell(value: string): string {
  return value.replaceAll("'", "''");
}

function powerShellArray(values: string[]): string {
  return `@(${values.map((value) => `'${escapePowerShell(value)}'`).join(', ')})`;
}

function escapeKeaExpression(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
}

function parseVendorClass(value: string | undefined): {
  prefix: string;
  observed?: { architectureCode: number; value: string };
} {
  const candidate = value?.trim() || 'PXEClient';
  const completeVci = /^(.*):Arch:(\d{5}):(.+)$/.exec(candidate);
  if (!completeVci) return { prefix: candidate };
  return {
    prefix: completeVci[1] || 'PXEClient',
    observed: { architectureCode: Number(completeVci[2]), value: candidate },
  };
}
