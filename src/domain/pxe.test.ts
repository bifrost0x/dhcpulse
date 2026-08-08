import { describe, expect, it } from 'vitest';
import { analyzePxe } from './pxe';

describe('analyzePxe', () => {
  it.each([
    ['bios-x86', [0], 'legacy BIOS'],
    ['uefi-x86', [6], 'UEFI IA32'],
    ['uefi-x64', [7, 9], 'UEFI x64'],
    ['uefi-arm64', [11], 'UEFI ARM64'],
    ['http-x64', [16], 'HTTP Boot x64'],
  ] as const)('maps %s to its architecture code aliases and boot family', (architecture, codes, family) => {
    const result = analyzePxe({ architecture, serverAddress: '192.0.2.10', bootFile: 'boot.efi' });
    expect(result.architectureCode).toBe(codes[0]);
    expect(result.architectureCodes).toEqual(codes);
    expect(result.recommendedBootFileFamily).toBe(family);
  });

  it('returns ordered decisions and explicitly review-only policy examples', () => {
    const result = analyzePxe({
      architecture: 'uefi-x64',
      vendorClass: 'PXEClient',
      userClass: 'iPXE',
      serverName: 'pxe.example.test',
      bootFile: 'bootx64.efi',
    });
    expect(result.decisionSteps.map(({ order }) => order)).toEqual([1, 2, 3, 4, 5]);
    expect(result.policyExamples.microsoftDhcpPowerShell).toContain('REVIEW ONLY');
    expect(result.policyExamples.microsoftDhcpPowerShell).toContain('Add-DhcpServerv4Policy');
    expect(result.policyExamples.microsoftDhcpPowerShell).toContain('Set-DhcpServerv4OptionValue');
    expect(result.policyExamples.microsoftDhcpPowerShell).toContain(
      "Add-DhcpServerv4Class -Name '<REVIEW-PXE-ARCH-00007>' -Type Vendor -Data 'PXEClient:Arch:00007'",
    );
    expect(result.policyExamples.microsoftDhcpPowerShell).toContain(
      "Add-DhcpServerv4Class -Name '<REVIEW-PXE-ARCH-00009>' -Type Vendor -Data 'PXEClient:Arch:00009'",
    );
    expect(result.policyExamples.microsoftDhcpPowerShell).toContain(
      "$VendorClassConditions = @('EQ', '<REVIEW-PXE-ARCH-00007>', '<REVIEW-PXE-ARCH-00009>')",
    );
    expect(result.policyExamples.microsoftDhcpPowerShell).toContain('-VendorClass $VendorClassConditions');
    expect(result.policyExamples.microsoftDhcpPowerShell).not.toContain(
      "-VendorClass 'EQ,PXEClient:Arch:00007*,PXEClient:Arch:00009*'",
    );
    expect(result.policyExamples.microsoftDhcpPowerShell).toContain('-UserClass');

    const kea = JSON.parse(result.policyExamples.keaJson) as {
      notice: string;
      'client-classes': Array<{ test: string; 'option-data': Array<{ code: number; data: string }> }>;
    };
    expect(kea.notice).toContain('REVIEW ONLY');
    expect(kea['client-classes']).toHaveLength(2);
    expect(kea['client-classes'][0]?.test).toContain('option[93].hex == 0x0007');
    expect(kea['client-classes'][0]?.test).toContain('option[93].hex == 0x0009');
    expect(kea['client-classes'][0]?.test).toContain("substring(option[60].text, 0, 9) == 'PXEClient'");
    expect(kea['client-classes'][0]?.test).not.toContain("option[60].text == 'PXEClient'");
    expect(kea['client-classes'][1]?.test).toContain('option[77].text');
    expect(kea['client-classes'][1]?.['option-data']).toEqual([
      { code: 66, data: 'pxe.example.test' },
      { code: 67, data: 'bootx64.efi' },
    ]);
    expect(result.reviewNotice).toMatch(/environment review/i);
  });

  it('warns about incompatible boot settings and missing values', () => {
    const result = analyzePxe({
      architecture: 'http-x64',
      architectures: ['bios-x86', 'uefi-x64'],
      serverAddress: 'https://boot.example.test',
      bootFile: 'bootx64.efi',
      globalBootFile: true,
      proxyDhcp: true,
      authoritativeBootOptions: true,
      mode: 'mecm',
    });
    expect(result.findings.map(({ key }) => key)).toEqual([
      'globalBootFileMixedArchitectures',
      'option66Url',
      'httpBootRequiresUrl',
      'proxyDhcpWithAuthoritativeOptions',
      'directOptionsWithManagedDeployment',
    ]);
  });

  it('detects an iPXE loop risk when user-class branching is absent', () => {
    expect(
      analyzePxe({
        architecture: 'uefi-x64',
        serverAddress: '192.0.2.10',
        bootFile: 'ipxe.efi',
        ipxeChainload: true,
        userClassPolicy: false,
      }).findings.map(({ key }) => key),
    ).toContain('ipxeLoopRisk');
  });

  it('reports missing server and boot file independently', () => {
    expect(analyzePxe({ architecture: 'bios-x86' }).findings.map(({ key }) => key)).toEqual([
      'missingServer',
      'missingBootFile',
    ]);
  });

  it('recognizes one boot file as global for mixed architectures and URLs in either server field', () => {
    const result = analyzePxe({
      architecture: 'bios-x86',
      architectures: ['uefi-x64'],
      serverName: 'https://boot.example.test',
      bootFile: 'undionly.kpxe',
    });
    expect(result.findings.map(({ key }) => key)).toEqual([
      'globalBootFileMixedArchitectures',
      'option66Url',
    ]);
  });
});
