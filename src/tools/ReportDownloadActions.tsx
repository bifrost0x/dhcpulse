import type { WorkbenchReport } from '../domain/workbench-export';
import { downloadWorkbenchReport } from '../domain/workbench-export';

interface ReportDownloadActionsProps {
  createReport: () => WorkbenchReport | null;
  filename: string;
  locale: 'en' | 'de';
  disabled?: boolean;
}

export function ReportDownloadActions({ createReport, filename, locale, disabled = false }: ReportDownloadActionsProps) {
  const download = (format: 'markdown' | 'json') => {
    const report = createReport();
    if (!report) return;
    if (format === 'markdown') {
      downloadWorkbenchReport(report.markdown, `${filename}.md`, 'text/markdown');
      return;
    }
    downloadWorkbenchReport(report.json, `${filename}.json`, 'application/json');
  };

  return <>
    <button type="button" className="secondary-button" disabled={disabled} onClick={() => download('markdown')}>{locale === 'de' ? 'Markdown herunterladen' : 'Download Markdown'}</button>
    <button type="button" className="primary-button" disabled={disabled} onClick={() => download('json')}>{locale === 'de' ? 'JSON herunterladen' : 'Download JSON'}</button>
  </>;
}
