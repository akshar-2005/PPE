import type { AnalysisResult, HistoryItem } from '../types';

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateSummaryCsv(analyses: HistoryItem[]): string {
  const headers = ['id', 'filename', 'date', 'total_workers', 'compliant', 'violations'];
  const rows = analyses.map((item) => [
    escapeCsvCell(item.id),
    escapeCsvCell(item.filename),
    escapeCsvCell(item.created_at),
    escapeCsvCell(item.total),
    escapeCsvCell(item.compliant),
    escapeCsvCell(item.violations),
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
}

export function generateWorkerDetailsCsv(details: AnalysisResult[]): string {
  const headers = [
    'analysis_id',
    'filename',
    'date',
    'worker_id',
    'helmet',
    'vest',
    'mask',
    'status',
    'missing',
  ];

  const rows: string[][] = [];

  details.forEach((record) => {
    const reqHelmet = record.settings ? record.settings.require_helmet !== false : true;
    const reqVest = record.settings ? record.settings.require_vest !== false : true;
    const reqMask = record.settings ? Boolean(record.settings.require_mask) : false;

    if (record.workers && record.workers.length > 0) {
      record.workers.forEach((worker) => {
        const helmetStr = worker.helmet ? 'Yes' : reqHelmet ? 'No' : 'Not required';
        const vestStr = worker.vest ? 'Yes' : reqVest ? 'No' : 'Not required';
        const maskStr = worker.mask ? 'Yes' : reqMask ? 'No' : 'Not required';
        const missingStr =
          worker.missing && worker.missing.length > 0 ? worker.missing.join('; ') : 'None';

        rows.push([
          escapeCsvCell(record.id),
          escapeCsvCell(record.filename),
          escapeCsvCell(record.created_at),
          escapeCsvCell(worker.id),
          escapeCsvCell(helmetStr),
          escapeCsvCell(vestStr),
          escapeCsvCell(maskStr),
          escapeCsvCell(worker.status),
          escapeCsvCell(missingStr),
        ]);
      });
    }
  });

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
}

export function getCsvFilename(prefix: 'ppe_summary' | 'ppe_worker_details'): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${prefix}_${year}-${month}-${day}.csv`;
}

export function downloadCsvFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
