import { translate, type CopyKey, type Locale } from '../content/copy';
import type { PlanResult, ScenarioInput } from './types';

export function createMarkdownPlan(
  input: ScenarioInput,
  result: PlanResult,
  locale: Locale,
): string {
  const t = (key: CopyKey) => translate(locale, key);
  const lines = [
    `# ${t('export.title')}`,
    '',
    t('export.generated'),
    '',
    `## ${t('export.scenario')}`,
    '',
    `**${t('export.scenario')}:** ${t(`scenario.${input.scenarioType}` as CopyKey)}`,
    `**${t('export.currentLease')}:** ${formatDuration(input.leaseDurationHours, locale)}`,
    `**${t('export.clients')}:** ${input.clientCount}`,
    '',
    `## ${t('export.assessment')}`,
    '',
    `**${t(`verdict.${result.verdict}` as CopyKey)}**`,
    '',
    t(result.summaryKey as CopyKey),
    '',
    `## ${t('export.timeline')}`,
    '',
    ...result.timeline.events.map(
      (event) =>
        `- ${t(`timeline.${event.kind}` as CopyKey)}: ${formatDuration(event.offsetHours, locale)} ${locale === 'en' ? 'after lease acquisition' : 'nach Lease-Erhalt'}`,
    ),
    '',
    `## ${t('export.findings')}`,
    '',
    ...(result.findings.length > 0
      ? result.findings.flatMap((finding) => [
          `- **${t(`finding.${finding.key}` as CopyKey)}**`,
          `  ${t(`finding.${finding.key}.detail` as CopyKey)}`,
        ])
      : [`- ${t('finding.none')}`]),
    '',
    `## ${t('export.checklist')}`,
    '',
    ...result.checklist.flatMap((phase) => [
      `### ${t(`phase.${phase.phase}` as CopyKey)}`,
      '',
      ...phase.actionKeys.map((key) => `- [ ] ${t(`action.${key}` as CopyKey)}`),
      '',
    ]),
    `## ${t('export.rollback')}`,
    '',
    ...result.rollbackKeys.map((key) => `- ${t(`rollback.${key}` as CopyKey)}`),
    '',
    `## ${t('export.assumptions')}`,
    '',
    ...result.assumptionKeys.map((key) => `- ${t(`assumption.${key}` as CopyKey)}`),
    '',
  ];

  return lines.join('\n');
}

export function createJsonPlan(input: ScenarioInput, result: PlanResult, locale: Locale): string {
  return JSON.stringify({
    tool: { id: 'lease', name: translate(locale, 'export.title') },
    locale,
    scenario: input,
    assessment: result,
    privacy: translate(locale, 'privacy.description'),
  }, null, 2);
}

export function formatDuration(hours: number, locale: Locale): string {
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes >= 1440 && totalMinutes % 1440 === 0) {
    const days = totalMinutes / 1440;
    return `${days} ${translate(locale, days === 1 ? 'duration.day' : 'duration.days')}`;
  }

  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (wholeHours > 0) {
    parts.push(`${wholeHours} ${translate(locale, wholeHours === 1 ? 'duration.hour' : 'duration.hours')}`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} ${translate(locale, minutes === 1 ? 'duration.minute' : 'duration.minutes')}`);
  }
  return parts.join(' ');
}

export function downloadMarkdown(content: string, filename = 'dhcpulse-change-plan.md'): void {
  downloadFile(content, filename, 'text/markdown');
}

export function downloadJson(content: string, filename = 'dhcpulse-change-plan.json'): void {
  downloadFile(content, filename, 'application/json');
}

function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
