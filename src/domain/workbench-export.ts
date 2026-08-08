import { createRedactor } from './redaction';

export type WorkbenchFindingSeverity = 'blocker' | 'warning' | 'info';

export interface WorkbenchReportFinding {
  severity: WorkbenchFindingSeverity;
  title: string;
  detail?: string;
}

export interface WorkbenchReportSource {
  label: string;
  url: string;
}

export interface WorkbenchReportInput {
  toolId: string;
  toolName: string;
  generatedAt: string;
  inputs: Record<string, unknown>;
  findings: WorkbenchReportFinding[];
  assumptions: string[];
  sources: WorkbenchReportSource[];
  sensitiveValues?: string[];
  locale?: 'en' | 'de';
}

export interface WorkbenchReport {
  markdown: string;
  json: string;
}

const severityRank: Record<WorkbenchFindingSeverity, number> = { blocker: 0, warning: 1, info: 2 };
const reportCopy = {
  en: {
    toolId: 'Tool ID', generatedAt: 'Generated at', redaction: 'Redaction', enabled: 'enabled',
    inputs: 'Input summary', findings: 'Findings', assumptions: 'Assumptions and limitations',
    sources: 'Authoritative sources', privacy: 'Privacy', noneInputs: 'No input summary.',
    noneFindings: 'No findings.', noneAssumptions: 'None stated.',
    severities: { blocker: 'BLOCKER', warning: 'WARNING', info: 'INFO' },
    privacyNote: 'Processed locally; no data was uploaded. Imported identifiers are redacted by default.',
  },
  de: {
    toolId: 'Tool-ID', generatedAt: 'Erstellt am', redaction: 'Redaktion', enabled: 'aktiviert',
    inputs: 'Eingabezusammenfassung', findings: 'Hinweise', assumptions: 'Annahmen und Grenzen',
    sources: 'Maßgebliche Quellen', privacy: 'Datenschutz', noneInputs: 'Keine Eingabezusammenfassung.',
    noneFindings: 'Keine Hinweise.', noneAssumptions: 'Keine angegeben.',
    severities: { blocker: 'BLOCKER', warning: 'WARNUNG', info: 'HINWEIS' },
    privacyNote: 'Lokal verarbeitet; es wurden keine Daten hochgeladen. Importierte Identifikatoren werden standardmäßig redigiert.',
  },
} as const;

export function buildWorkbenchReport(input: WorkbenchReportInput): WorkbenchReport {
  const copy = reportCopy[input.locale ?? 'en'];
  const redactor = createRedactor(`workbench:${input.toolId}`);
  const sensitiveValues = [...new Set(input.sensitiveValues?.filter(Boolean) ?? [])]
    .sort((left, right) => right.length - left.length);
  const scrubText = (value: string): string => {
    const replaced = sensitiveValues.reduce(
      (text, sensitive) => text.replaceAll(sensitive, '[redacted]'),
      value,
    );
    return redactor.redactText(replaced);
  };
  const safeInputs = sortValue(scrubUnknown(input.inputs, scrubText)) as Record<string, unknown>;
  const safeFindings = input.findings
    .map((finding) => ({
      severity: finding.severity,
      title: scrubText(finding.title),
      ...(finding.detail ? { detail: scrubText(finding.detail) } : {}),
    }))
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || left.title.localeCompare(right.title));
  const assumptions = input.assumptions.map(scrubText);
  const sources = [...input.sources].sort((left, right) => left.label.localeCompare(right.label));
  const payload = sortValue({
    tool: { id: input.toolId, name: input.toolName },
    generatedAt: input.generatedAt,
    inputs: safeInputs,
    findings: safeFindings,
    assumptions,
    sources,
    privacy: copy.privacyNote,
    redaction: 'enabled',
  });
  const markdown = [
    `# ${input.toolName}`,
    '',
    `${copy.toolId}: ${input.toolId}`,
    `${copy.generatedAt}: ${input.generatedAt}`,
    `${copy.redaction}: ${copy.enabled}`,
    '',
    `## ${copy.inputs}`,
    '',
    ...markdownRecord(safeInputs, copy.noneInputs),
    '',
    `## ${copy.findings}`,
    '',
    ...(safeFindings.length > 0
      ? safeFindings.map((finding) => `- [${copy.severities[finding.severity]}] ${finding.title}${finding.detail ? ` - ${finding.detail}` : ''}`)
      : [`- ${copy.noneFindings}`]),
    '',
    `## ${copy.assumptions}`,
    '',
    ...(assumptions.length > 0 ? assumptions.map((item) => `- ${item}`) : [`- ${copy.noneAssumptions}`]),
    '',
    `## ${copy.sources}`,
    '',
    ...sources.map((source) => `- [${source.label}](${source.url})`),
    '',
    `## ${copy.privacy}`,
    '',
    copy.privacyNote,
    '',
  ].join('\n');
  return { markdown, json: JSON.stringify(payload, null, 2) };
}

export function downloadWorkbenchReport(content: string, filename: string, type = 'text/markdown'): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function scrubUnknown(value: unknown, scrubText: (value: string) => string): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map((entry) => scrubUnknown(entry, scrubText));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, scrubUnknown(entry, scrubText)]));
  }
  return value;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortValue(entry)]),
    );
  }
  return value;
}

function markdownRecord(value: Record<string, unknown>, emptyMessage: string): string[] {
  const entries = Object.entries(value);
  if (entries.length === 0) return [`- ${emptyMessage}`];
  return entries.map(([key, entry]) => `- ${key}: ${formatValue(entry)}`);
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
