import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Users,
  AlertOctagon,
  TrendingUp,
  Plus,
  ArrowRight,
  AlertTriangle,
  FolderOpen,
} from 'lucide-react';
import { API_BASE } from '../config';
import type { StatsResponse, HistoryItem } from '../types';
import { formatDate } from '../utils/format';
import { StatCard } from '../components/StatCard';
import { DonutChart } from '../components/DonutChart';

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [recent, setRecent] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [statsRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/stats`),
        fetch(`${API_BASE}/history`),
      ]);

      if (!statsRes.ok || !historyRes.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const statsData: StatsResponse = await statsRes.json();
      const historyData: HistoryItem[] = await historyRes.json();

      setStats(statsData);
      setRecent(historyData.slice(0, 5));
    } catch {
      setError('Cannot reach the server. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-44 bg-slate-800 animate-pulse rounded-lg" />
            <div className="h-4 w-64 bg-slate-800/60 animate-pulse rounded-lg" />
          </div>
          <div className="h-10 w-32 bg-slate-800 animate-pulse rounded-xl" />
        </div>

        {/* Skeleton Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse p-5">
              <div className="flex justify-between items-center">
                <div className="space-y-2 flex-1">
                  <div className="h-3 w-24 bg-slate-800 rounded" />
                  <div className="h-7 w-16 bg-slate-800 rounded" />
                </div>
                <div className="w-12 h-12 rounded-xl bg-slate-800/80" />
              </div>
            </div>
          ))}
        </div>

        {/* Skeleton Donut and Recent List */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 h-64 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse p-6" />
          <div className="lg:col-span-7 h-64 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse p-6 space-y-4">
            <div className="h-4 w-32 bg-slate-800 rounded" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-slate-950/40 rounded-xl border border-slate-800/60" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 max-w-xl mx-auto flex items-center gap-4">
        <AlertTriangle className="w-8 h-8 shrink-0 text-rose-400" />
        <div>
          <h3 className="font-bold text-base">Backend Connection Failure</h3>
          <p className="text-xs opacity-90 mt-1">{error || 'Unable to load statistics.'}</p>
          <button
            type="button"
            onClick={fetchDashboardData}
            className="mt-3 px-3.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/30 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const isEmpty = stats.total_analyses === 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Action Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-100">Executive Overview</h3>
          <p className="text-xs text-slate-400 mt-0.5">Real-time PPE safety compliance summary</p>
        </div>
        <Link
          to="/analysis"
          className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>New Analysis</span>
        </Link>
      </div>

      {isEmpty ? (
        /* Friendly Empty State */
        <div className="flex flex-col items-center justify-center min-h-[350px] bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
          <div className="p-4 rounded-2xl bg-slate-800/80 text-cyan-400 border border-slate-700/50">
            <FolderOpen className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-100">No Inspection Records Yet</h3>
            <p className="text-sm text-slate-400 max-w-md mt-1">
              Upload your first construction or worksite image to begin monitoring safety compliance.
            </p>
          </div>
          <Link
            to="/analysis"
            className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Upload First Image</span>
          </Link>
        </div>
      ) : (
        <>
          {/* Four Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              value={Math.round(stats.compliance_rate)}
              icon={TrendingUp}
              type="compliant"
            />
          </div>

          {/* Donut Chart & Recent Activity Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* SVG Donut Chart Column */}
            <div className="lg:col-span-5">
              <DonutChart
                compliant={stats.total_compliant}
                violations={stats.total_violations}
                complianceRate={stats.compliance_rate}
              />
            </div>

            {/* Recent Analyses Column */}
            <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                    Recent Analyses
                  </h4>
                  <Link
                    to="/history"
                    className="text-xs font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1 hover:underline"
                  >
                    <span>View All</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="divide-y divide-slate-800/60">
                  {recent.map((item) => {
                    const statusType =
                      item.total === 0
                        ? 'none'
                        : item.violations === 0
                        ? 'compliant'
                        : 'violation';

                    return (
                      <Link
                        key={item.id}
                        to={`/history/${item.id}`}
                        className="py-3 flex items-center justify-between gap-4 group hover:bg-slate-800/30 px-2 rounded-xl transition-colors"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <img
                            src={item.image_url}
                            alt={item.filename}
                            className="w-12 h-12 object-cover rounded-lg border border-slate-800 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-200 truncate group-hover:text-cyan-400 transition-colors">
                              {item.filename}
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {formatDate(item.created_at)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                            {item.total} Worker{item.total !== 1 ? 's' : ''}
                          </span>
                          <span
                            className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
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
                              ? 'All Compliant'
                              : `${item.violations} Violation${item.violations !== 1 ? 's' : ''}`}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
