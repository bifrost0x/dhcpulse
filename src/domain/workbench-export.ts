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
}

export interface WorkbenchReport {
  markdown: string;
  json: string;
}

const severityRank: Record<WorkbenchFindingSeverity, number> = { blocker: 0, warning: 1, info: 2 };
const privacyNote = 'Processed locally; no data was uploaded. Imported identifiers are redacted by default.';

export function buildWorkbenchReport(input: WorkbenchReportInput): WorkbenchReport {
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
    privacy: privacyNote,
    redaction: 'enabled',
  });
  const markdown = [
    `# ${input.toolName}`,
    '',
    `Tool ID: ${input.toolId}`,
    `Generated at: ${input.generatedAt}`,
    'Redaction: enabled',
    '',
    '## Input summary',
    '',
    ...markdownRecord(safeInputs),
    '',
    '## Findings',
    '',
    ...(safeFindings.length > 0
      ? safeFindings.map((finding) => `- [${finding.severity.toUpperCase()}] ${finding.title}${finding.detail ? ` - ${finding.detail}` : ''}`)
      : ['- No findings.']),
    '',
    '## Assumptions and limitations',
    '',
    ...(assumptions.length > 0 ? assumptions.map((item) => `- ${item}`) : ['- None stated.']),
    '',
    '## Authoritative sources',
    '',
    ...sources.map((source) => `- [${source.label}](${source.url})`),
    '',
    '## Privacy',
    '',
    privacyNote,
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

function markdownRecord(value: Record<string, unknown>): string[] {
  const entries = Object.entries(value);
  if (entries.length === 0) return ['- No input summary.'];
  return entries.map(([key, entry]) => `- ${key}: ${formatValue(entry)}`);
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
