import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Users,
  AlertOctagon,
  TrendingUp,
  Printer,
  Download,
  ExternalLink,
  AlertTriangle,
  FolderOpen,
  HardHat,
  Shirt,
  ShieldAlert,
  RefreshCw,
  Plus,
  CheckCircle2,
} from 'lucide-react';
import { API_BASE } from '../config';
import type { StatsResponse, HistoryItem, AnalysisResult } from '../types';
import { formatDate } from '../utils/format';
import { StatCard } from '../components/StatCard';
import {
  generateSummaryCsv,
  generateWorkerDetailsCsv,
  downloadCsvFile,
  getCsvFilename,
} from '../utils/csv';
import { useToast } from '../context/ToastContext';

interface ViolationBreakdown {
  helmetOnly: number;
  vestOnly: number;
  both: number;
  totalViolations: number;
  helmetOnlyPct: number;
  vestOnlyPct: number;
  bothPct: number;
}

export const Reports: React.FC = () => {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [detailedRecords, setDetailedRecords] = useState<AnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedDate] = useState<string>(() =>
    new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })
  );

  const fetchReportsData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [statsRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/stats`),
        fetch(`${API_BASE}/history`),
      ]);

      if (!statsRes.ok || !historyRes.ok) {
        throw new Error('Failed to fetch stats or history from backend');
      }

      const statsData: StatsResponse = await statsRes.json();
      const historyData: HistoryItem[] = await historyRes.json();

      setStats(statsData);
      setHistory(historyData);

      // Fetch all detailed records in parallel for worker-level breakdown
      if (historyData.length > 0) {
        const detailPromises = historyData.map(async (item) => {
          const res = await fetch(`${API_BASE}/history/${item.id}`);
          if (!res.ok) {
            throw new Error(`Failed to fetch details for record ${item.id}`);
          }
          const data: AnalysisResult = await res.json();
          return data;
        });

        const detailsList = await Promise.all(detailPromises);
        setDetailedRecords(detailsList);
      } else {
        setDetailedRecords([]);
      }
    } catch {
      setError('Cannot reach the server. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReportsData();
  }, []);

  // Compute violation breakdown across all workers in all detailed records
  const breakdown: ViolationBreakdown = useMemo(() => {
    let helmetOnly = 0;
    let vestOnly = 0;
    let both = 0;

    detailedRecords.forEach((record) => {
      if (record.workers && record.workers.length > 0) {
        record.workers.forEach((w) => {
          const hasHelmet = Boolean(w.helmet);
          const hasVest = Boolean(w.vest);

          if (!hasHelmet && !hasVest) {
            both += 1;
          } else if (!hasHelmet && hasVest) {
            helmetOnly += 1;
          } else if (hasHelmet && !hasVest) {
            vestOnly += 1;
          }
        });
      }
    });

    const totalViolations = helmetOnly + vestOnly + both;
    const helmetOnlyPct = totalViolations > 0 ? Math.round((helmetOnly / totalViolations) * 100) : 0;
    const vestOnlyPct = totalViolations > 0 ? Math.round((vestOnly / totalViolations) * 100) : 0;
    const bothPct = totalViolations > 0 ? Math.round((both / totalViolations) * 100) : 0;

    return {
      helmetOnly,
      vestOnly,
      both,
      totalViolations,
      helmetOnlyPct,
      vestOnlyPct,
      bothPct,
    };
  }, [detailedRecords]);

  const { success: toastSuccess } = useToast();

  // Export handlers
  const handleDownloadSummary = () => {
    if (history.length === 0) return;
    const csvContent = generateSummaryCsv(history);
    const filename = getCsvFilename('ppe_summary');
    downloadCsvFile(filename, csvContent);
    toastSuccess(`Exported summary report as ${filename}`, 'CSV Downloaded');
  };

  const handleDownloadDetails = () => {
    if (detailedRecords.length === 0) return;
    const csvContent = generateWorkerDetailsCsv(detailedRecords);
    const filename = getCsvFilename('ppe_worker_details');
    downloadCsvFile(filename, csvContent);
    toastSuccess(`Exported worker details as ${filename}`, 'CSV Downloaded');
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-slate-800 animate-pulse rounded-lg" />
            <div className="h-4 w-72 bg-slate-800/60 animate-pulse rounded-lg" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-28 bg-slate-800 animate-pulse rounded-xl" />
            <div className="h-10 w-36 bg-slate-800 animate-pulse rounded-xl" />
          </div>
        </div>

        {/* Skeleton Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-900/60 border border-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>

        {/* Skeleton Breakdown */}
        <div className="h-64 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse p-6" />

        {/* Skeleton Table */}
        <div className="h-80 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse p-6" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 max-w-xl mx-auto flex items-center gap-4 my-8">
        <AlertTriangle className="w-8 h-8 shrink-0 text-rose-400" />
        <div>
          <h3 className="font-bold text-base">Backend Connection Failure</h3>
          <p className="text-xs opacity-90 mt-1">{error || 'Unable to load report statistics.'}</p>
          <button
            type="button"
            onClick={fetchReportsData}
            className="mt-3 px-3.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/30 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }

  const isEmpty = stats.total_analyses === 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6 print-page animate-fadeIn">
      {/* Printable Report Header (Visible only in print mode) */}
      <div className="print-only border-b-2 border-slate-800 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">PPE Vision — Safety Compliance Audit Report</h1>
        <p className="text-xs text-slate-600 mt-1">
          Generated on {generatedDate} •
          Audited Analyses: {stats.total_analyses} • Total Workers Inspected: {stats.total_workers} • Compliance Rate: {stats.compliance_rate}%
        </p>
      </div>

      {/* Screen Header & Action Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 no-print pb-2">
        <div>
          <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FileText className="w-6 h-6 text-cyan-400" />
            Compliance Reports &amp; Analytics
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit summary, violation breakdowns, and exportable inspection logs
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={fetchReportsData}
            aria-label="Refresh Report Data"
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            title="Refresh Report Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-semibold text-xs flex items-center gap-2 transition-all active:scale-95 shadow-sm"
          >
            <Printer className="w-4 h-4 text-cyan-400" />
            <span>Print Report</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadSummary}
            disabled={isEmpty}
            className={`px-3.5 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition-all border ${
              isEmpty
                ? 'bg-slate-900/40 text-slate-600 border-slate-850 cursor-not-allowed'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800 hover:border-slate-700 active:scale-95 shadow-sm'
            }`}
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Download CSV (summary)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadDetails}
            disabled={isEmpty}
            className={`px-3.5 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition-all border ${
              isEmpty
                ? 'bg-slate-900/40 text-slate-600 border-slate-850 cursor-not-allowed'
                : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border-cyan-500/30 active:scale-95 shadow-sm'
            }`}
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>Download CSV (worker details)</span>
          </button>
        </div>
      </div>

      {isEmpty ? (
        /* Friendly Empty State */
        <div className="flex flex-col items-center justify-center min-h-[400px] bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
          <div className="p-4 rounded-2xl bg-slate-800/80 text-cyan-400 border border-slate-700/50">
            <FolderOpen className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">No Inspection Records Found</h3>
            <p className="text-sm text-slate-400 max-w-md mt-1">
              There is currently no inspection data available to generate reports. Perform an image analysis to view comprehensive compliance telemetry.
            </p>
          </div>
          <Link
            to="/analysis"
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Perform Image Analysis</span>
          </Link>
        </div>
      ) : (
        <>
          {/* 1. Summary Section (Top Stat Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print-avoid-break">
            <StatCard
              title="Total Analyses"
              value={stats.total_analyses}
              icon={FileText}
              type="total"
            />
            <StatCard
              title="Workers Inspected"
              value={stats.total_workers}
              icon={Users}
              type="total"
            />
            <StatCard
              title="Violations Found"
              value={stats.total_violations}
              icon={AlertOctagon}
              type="violations"
            />
            <StatCard
              title="Compliance Rate"
              value={`${stats.compliance_rate}%`}
              icon={TrendingUp}
              type="compliant"
            />
          </div>

          {/* 2. Violation Breakdown Section */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-5 print-card print-avoid-break">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
              <div>
                <h4 className="text-base font-bold text-slate-100">PPE Violation Breakdown</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Distribution of non-compliance issues across all {stats.total_workers} inspected workers
                </p>
              </div>
              <div className="px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-semibold text-slate-300 self-start sm:self-auto">
                {breakdown.totalViolations} total violation{breakdown.totalViolations !== 1 ? 's' : ''}
              </div>
            </div>

            {breakdown.totalViolations === 0 ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium">
                  Zero violations detected! All inspected workers are 100% compliant with hardhat and safety vest guidelines.
                </span>
              </div>
            ) : (
              <div className="space-y-4 pt-1">
                {/* Bar 1: Missing Helmet Only */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-medium text-slate-200">
                      <div className="p-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <HardHat className="w-3.5 h-3.5" />
                      </div>
                      <span>Missing Helmet Only</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{breakdown.helmetOnly} workers</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-semibold border border-amber-500/20 text-[11px]">
                        {breakdown.helmetOnlyPct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-3.5 w-full bg-slate-950/80 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500 shadow-sm shadow-amber-500/20"
                      style={{ width: `${Math.max(breakdown.helmetOnlyPct, breakdown.helmetOnly > 0 ? 3 : 0)}%` }}
                    />
                  </div>
                </div>

                {/* Bar 2: Missing Vest Only */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-medium text-slate-200">
                      <div className="p-1 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        <Shirt className="w-3.5 h-3.5" />
                      </div>
                      <span>Missing Safety Vest Only</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{breakdown.vestOnly} workers</span>
                      <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-300 font-semibold border border-orange-500/20 text-[11px]">
                        {breakdown.vestOnlyPct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-3.5 w-full bg-slate-950/80 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-600 to-orange-400 transition-all duration-500 shadow-sm shadow-orange-500/20"
                      style={{ width: `${Math.max(breakdown.vestOnlyPct, breakdown.vestOnly > 0 ? 3 : 0)}%` }}
                    />
                  </div>
                </div>

                {/* Bar 3: Missing Both */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-medium text-slate-200">
                      <div className="p-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        <ShieldAlert className="w-3.5 h-3.5" />
                      </div>
                      <span>Missing Both (Helmet &amp; Vest)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{breakdown.both} workers</span>
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 font-semibold border border-rose-500/20 text-[11px]">
                        {breakdown.bothPct}%
                      </span>
                    </div>
                  </div>
                  <div className="h-3.5 w-full bg-slate-950/80 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-600 to-rose-500 transition-all duration-500 shadow-sm shadow-rose-500/20"
                      style={{ width: `${Math.max(breakdown.bothPct, breakdown.both > 0 ? 3 : 0)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. Inspection Log Table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden print-card print-avoid-break">
            <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
              <div>
                <h4 className="text-base font-bold text-slate-100">Inspection Log</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Chronological log of all site analyses ({history.length} records)
                </p>
              </div>
              <div className="text-xs text-slate-400 font-mono hidden sm:block">
                Sorted: Newest First
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs print-table">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4">Date / Time</th>
                    <th className="py-3 px-4">Filename</th>
                    <th className="py-3 px-4 text-center">Workers</th>
                    <th className="py-3 px-4 text-center">Safe</th>
                    <th className="py-3 px-4 text-center">Violations</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right no-print">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {history.map((item) => {
                    const statusType =
                      item.total === 0
                        ? 'none'
                        : item.violations === 0
                        ? 'compliant'
                        : 'violation';

                    return (
                      <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4 text-slate-300 font-medium whitespace-nowrap">
                          {formatDate(item.created_at)}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-200 truncate max-w-[200px]">
                          {item.filename}
                        </td>
                        <td className="py-3.5 px-4 text-center text-slate-300 font-semibold">
                          {item.total}
                        </td>
                        <td className="py-3.5 px-4 text-center text-emerald-400 font-semibold">
                          {item.compliant}
                        </td>
                        <td className="py-3.5 px-4 text-center text-rose-400 font-semibold">
                          {item.violations}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-1 text-[11px] font-semibold rounded-full border ${
                              statusType === 'none'
                                ? 'bg-slate-800 text-slate-400 border-slate-700'
                                : statusType === 'compliant'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}
                          >
                            {statusType === 'none'
                              ? 'No workers'
                              : statusType === 'compliant'
                              ? 'All compliant'
                              : `${item.violations} violation${item.violations !== 1 ? 's' : ''}`}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right no-print whitespace-nowrap">
                          <Link
                            to={`/history/${item.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 font-semibold text-xs transition-colors"
                          >
                            <span>View</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Reports;
