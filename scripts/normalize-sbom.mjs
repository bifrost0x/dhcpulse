import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const [filePath, epochText] = process.argv.slice(2);
const epochSeconds = Number(epochText);

if (!filePath || !Number.isSafeInteger(epochSeconds) || epochSeconds <= 0) {
  throw new Error('Usage: node scripts/normalize-sbom.mjs <file> <positive-source-date-epoch>');
}

const sbom = JSON.parse(readFileSync(filePath, 'utf8'));
if (!sbom || typeof sbom !== 'object' || !sbom.metadata || typeof sbom.metadata !== 'object') {
  throw new Error('The input is not a CycloneDX document with metadata.');
}

delete sbom.serialNumber;
sbom.metadata.timestamp = new Date(epochSeconds * 1000).toISOString();
writeFileSync(filePath, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8');
