import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

describe('release SBOM normalization', () => {
  it('removes the random serial number and pins the timestamp to the source commit', () => {
    const directory = mkdtempSync(join(tmpdir(), 'dhcpulse-sbom-'));
    const filePath = join(directory, 'sbom.json');
    try {
      writeFileSync(filePath, JSON.stringify({
        bomFormat: 'CycloneDX',
        serialNumber: 'urn:uuid:random',
        metadata: { timestamp: '2099-01-01T00:00:00.000Z' },
      }));

      execFileSync(process.execPath, ['scripts/normalize-sbom.mjs', filePath, '1786543200']);

      const normalized = JSON.parse(readFileSync(filePath, 'utf8'));
      expect(normalized.serialNumber).toBeUndefined();
      expect(normalized.metadata.timestamp).toBe('2026-08-12T14:00:00.000Z');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
