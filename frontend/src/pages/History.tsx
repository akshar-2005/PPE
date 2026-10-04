import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  History as HistoryIcon,
  Filter,
  Loader2,
  AlertTriangle,
  Plus,
  Users,
  ShieldCheck,
  AlertOctagon,
} from 'lucide-react';
import { API_BASE } from '../config';
import type { HistoryItem } from '../types';
import { formatDate } from '../utils/format';

type FilterType = 'all' | 'violations' | 'compliant';

export const HistoryPage: React.FC = () => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/history`);
      if (!res.ok) {
        throw new Error('Failed to load history');
      }
      const data: HistoryItem[] = await res.json();
      setHistory(data);
    } catch {
      setError('Cannot reach the server. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filteredHistory = history.filter((item) => {
    if (filter === 'violations') return item.violations > 0;
    if (filter === 'compliant') return item.total > 0 && item.violations === 0;
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <p className="text-sm">Loading analysis history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 max-w-xl mx-auto flex items-center gap-4">
        <AlertTriangle className="w-8 h-8 shrink-0 text-rose-400" />
        <div>
          <h3 className="font-bold text-base">History Load Error</h3>
          <p className="text-xs opacity-90 mt-1">{error}</p>
          <button
            type="button"
            onClick={fetchHistory}
            className="mt-3 px-3.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/30 transition-colors"
          >
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <HistoryIcon className="w-6 h-6 text-cyan-400" />
            Analysis History
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Browse and inspect past safety audit records ({history.length} total)
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === 'all'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All ({history.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('violations')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === 'violations'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            With Violations ({history.filter((i) => i.violations > 0).length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('compliant')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === 'compliant'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Fully Compliant ({history.filter((i) => i.total > 0 && i.violations === 0).length})
          </button>
        </div>
      </div>

      {/* Empty State */}
      {filteredHistory.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[350px] bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
          <div className="p-4 rounded-2xl bg-slate-800/80 text-slate-400 border border-slate-700/50">
            <Filter className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-200">No Records Matching Filter</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              {history.length === 0
                ? 'No inspection analyses recorded yet.'
                : 'Try selecting a different filter above or perform a new analysis.'}
            </p>
          </div>
          {history.length === 0 && (
            <Link
              to="/analysis"
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Perform Analysis</span>
            </Link>
          )}
        </div>
      ) : (
        /* History Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredHistory.map((item) => {
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
                className="group bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-cyan-500/5"
              >
                <div>
                  {/* Thumbnail */}
                  <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950 aspect-video mb-4">
                    <img
                      src={item.image_url}
                      alt={item.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-2.5 right-2.5">
                      <span
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-full border shadow-md backdrop-blur-md ${
                          statusType === 'none'
                            ? 'bg-slate-900/80 text-slate-400 border-slate-700'
                            : statusType === 'compliant'
                            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                            : 'bg-rose-950/80 text-rose-400 border-rose-500/40'
                        }`}
                      >
                        {statusType === 'none'
                          ? 'No workers'
                          : statusType === 'compliant'
                          ? 'All Compliant'
                          : `${item.violations} Violation${item.violations !== 1 ? 's' : ''}`}
                      </span>
                    </div>
                  </div>

                  {/* Title & Date */}
                  <h4 className="font-bold text-slate-100 text-base truncate group-hover:text-cyan-400 transition-colors">
                    {item.filename}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">{formatDate(item.created_at)}</p>
                </div>

                {/* Numbers Summary Footer */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-1.5 rounded-lg bg-slate-950/40">
                    <div className="flex items-center justify-center gap-1 text-slate-400 mb-0.5">
                      <Users className="w-3 h-3" />
                      <span>Total</span>
                    </div>
                    <span className="font-bold text-slate-200">{item.total}</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-emerald-950/20 border border-emerald-500/10">
                    <div className="flex items-center justify-center gap-1 text-emerald-400 mb-0.5">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Safe</span>
                    </div>
                    <span className="font-bold text-emerald-400">{item.compliant}</span>
                  </div>
                  <div className="p-1.5 rounded-lg bg-rose-950/20 border border-rose-500/10">
                    <div className="flex items-center justify-center gap-1 text-rose-400 mb-0.5">
                      <AlertOctagon className="w-3 h-3" />
                      <span>Violations</span>
                    </div>
                    <span className="font-bold text-rose-400">{item.violations}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};
