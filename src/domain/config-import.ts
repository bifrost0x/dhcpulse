import type { DhcpConfigFormat, DhcpConfiguration, ParserWarning } from './config-model';
import { importDnsmasq } from './config-import/dnsmasq';
import { importIscDhcpd } from './config-import/isc';
import { importKeaJson } from './config-import/kea';
import { importMicrosoftXml } from './config-import/microsoft';
import { ConfigImportError, type ImportFormat } from './config-import/shared';

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;

export { ConfigImportError } from './config-import/shared';
export { stripKeaComments } from './config-import/kea';
export type { ConfigImportErrorCode } from './config-import/shared';

export interface ConfigImportInput {
  text: string;
  fileName?: string;
  format?: ImportFormat;
}

export interface ConfigImportResult {
  configuration: DhcpConfiguration;
  warnings: ParserWarning[];
}

export function detectDhcpConfigFormat(text: string, fileName?: string): DhcpConfigFormat {
  const sample = text.replace(/^\uFEFF/, '').slice(0, 256 * 1024);
  const xmlBody = stripXmlPreamble(sample);
  if (/^<(?:(?:[\w.-]+):)?(?:dhcpserverexport|dhcpserver)\b/i.test(xmlBody)) return 'microsoft-xml';
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xmlBody) && /<(?:(?:[\w.-]+):)?(?:dhcpserverexport|dhcpserver)\b/i.test(xmlBody)) return 'microsoft-xml';
  if (xmlBody.startsWith('<')) return 'unknown';
  if (/"Dhcp[46]"\s*:/i.test(sample)) return 'kea-json';
  if (/^\s*(?:--)?(?:dhcp-range|dhcp-host|dhcp-option|dhcp-relay|dhcp-authoritative)\b/m.test(sample)) return 'dnsmasq';
  if (/\bsubnet\s+[0-9.]+\s+netmask\s+[0-9.]+\s*\{|\bshared-network\s+|\bfailover\s+peer\s+/i.test(sample)) return 'isc-dhcpd';

  const lowerName = fileName?.toLowerCase() ?? '';
  if (lowerName.endsWith('.xml')) return 'microsoft-xml';
  if (lowerName.endsWith('.json')) return 'kea-json';
  if (/(^|[\\/])dhcpd(?:\.conf)?$/.test(lowerName)) return 'isc-dhcpd';
  if (/(^|[\\/])dnsmasq(?:\.conf)?$/.test(lowerName)) return 'dnsmasq';
  return 'unknown';
}

function stripXmlPreamble(sample: string): string {
  let body = sample.trimStart().replace(/^<\?xml(?:\s[^?]*?)?\?>/i, '').trimStart();
  while (true) {
    const miscellaneous = /^(?:<!--[\s\S]*?-->|<\?[\s\S]*?\?>)\s*/.exec(body);
    if (!miscellaneous) return body;
    body = body.slice(miscellaneous[0].length);
  }
}

export function importDhcpConfiguration(input: ConfigImportInput): ConfigImportResult {
  if (new TextEncoder().encode(input.text).byteLength > MAX_CONFIG_BYTES) {
    throw new ConfigImportError('INPUT_TOO_LARGE', 'DHCP configuration input exceeds the 2 MiB UTF-8 limit.');
  }
  const format = input.format ?? detectDhcpConfigFormat(input.text, input.fileName);
  if (format === 'unknown') throw new ConfigImportError('UNKNOWN_FORMAT', 'DHCP configuration format is not recognized.');

  const configuration = format === 'microsoft-xml'
    ? importMicrosoftXml(input.text, input.fileName)
    : format === 'kea-json'
      ? importKeaJson(input.text, input.fileName)
      : format === 'isc-dhcpd'
        ? importIscDhcpd(input.text, input.fileName)
        : importDnsmasq(input.text, input.fileName);
  return { configuration, warnings: configuration.parserWarnings };
}
