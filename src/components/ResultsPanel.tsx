import { AlertTriangle, Check, Clipboard, Download, Info, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { createJsonPlan, createMarkdownPlan, downloadJson, downloadMarkdown, formatDuration } from '../domain/export';
import { translate, type CopyKey, type Locale } from '../content/copy';
import type { PlanResult, ScenarioInput } from '../domain/types';
import { Checklist } from './Checklist';
import { Timeline } from './Timeline';
import { PrivacyNote } from './PrivacyNote';

export function ResultsPanel({ input, result, locale }: { input: ScenarioInput; result: PlanResult; locale: Locale }) {
  const [copied, setCopied] = useState(false);
  const t = (key: CopyKey) => translate(locale, key);
  const markdown = createMarkdownPlan(input, result, locale);
  const json = createJsonPlan(input, result, locale);
  const icon = result.verdict === 'ready' ? <Check aria-hidden="true" /> : result.verdict === 'caution' ? <AlertTriangle aria-hidden="true" /> : <ShieldAlert aria-hidden="true" />;
  const renewal = result.timeline.waves[0]?.clientsWithinFirstHour ?? 0;
  const rebindingStart = result.timeline.waves[1]?.startsAfterHours ?? 0;

  async function copyPlan() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      downloadMarkdown(markdown);
    }
  }

  return (
    <section className="planner-card results-card" role="region" aria-label={t('results.title')}>
      <div className={`verdict verdict-${result.verdict}`}>
        <div className="verdict-icon">{icon}</div>
        <div><span>{t('results.title')}</span><h2>{t(`verdict.${result.verdict}` as CopyKey)}</h2><p>{t(result.summaryKey as CopyKey)}</p></div>
      </div>

      <div className="metric-grid">
        <div className="metric"><span>{t('metric.renewNow')}</span><strong className="metric-value">{renewal}</strong><small>{formatPercent(renewal, input.clientCount)}</small></div>
        <div className="metric"><span>{t('metric.rebindNow')}</span><strong className="metric-duration">{formatDuration(rebindingStart, locale)}</strong></div>
        <div className="metric"><span>{t('metric.oldLeasesGone')}</span><strong className="metric-duration">{formatDuration(input.leaseDurationHours, locale)}</strong></div>
      </div>

      <Timeline timeline={result.timeline} locale={locale} />

      <section className="result-section" aria-labelledby="findings-heading">
        <div className="result-section-heading"><Info size={18} aria-hidden="true" /><h3 id="findings-heading">{t('findings.title')}</h3></div>
        <div className="findings-list">
          {result.findings.length === 0 ? <p className="empty-finding"><Check size={16} aria-hidden="true" />{t('finding.none')}</p> : result.findings.map((finding) => (
            <article key={finding.key} className={`finding finding-${finding.severity}`}>
              <span className="severity">{t(`severity.${finding.severity}` as CopyKey)}</span>
              <div><strong>{t(`finding.${finding.key}` as CopyKey)}</strong><p>{t(`finding.${finding.key}.detail` as CopyKey)}</p></div>
            </article>
          ))}
        </div>
      </section>

      <Checklist phases={result.checklist} locale={locale} />

      <section className="result-section rollback-section">
        <div className="result-section-heading"><ShieldAlert size={18} aria-hidden="true" /><h3>{t('rollback.title')}</h3></div>
        <ul>{result.rollbackKeys.map((key) => <li key={key}>{t(`rollback.${key}` as CopyKey)}</li>)}</ul>
      </section>

      <details className="assumptions"><summary>{t('assumptions.title')}</summary><ul>{result.assumptionKeys.map((key) => <li key={key}>{t(`assumption.${key}` as CopyKey)}</li>)}</ul></details>

      <div className="export-bar">
        <button type="button" className="secondary-button" onClick={copyPlan}>{copied ? <Check size={17} aria-hidden="true" /> : <Clipboard size={17} aria-hidden="true" />}{t(copied ? 'export.copied' : 'export.copy')}</button>
        <button type="button" className="primary-button" onClick={() => downloadMarkdown(markdown)}><Download size={17} aria-hidden="true" />{t('export.download')}</button>
        <button type="button" className="primary-button" onClick={() => downloadJson(json)}><Download size={17} aria-hidden="true" />{t('export.downloadJson')}</button>
      </div>

      <PrivacyNote locale={locale} />
    </section>
  );
}

function formatPercent(value: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((value / total) * 100)}%`;
}
