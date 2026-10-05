import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, FileText } from 'lucide-react';
import { API_BASE } from '../config';
import type { AnalysisResult } from '../types';
import { formatDate } from '../utils/format';
import { ResultView } from '../components/ResultView';

export const HistoryDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [is404, setIs404] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    setIs404(false);

    try {
      const res = await fetch(`${API_BASE}/history/${id}`);
      if (res.status === 404) {
        setIs404(true);
        return;
      }
      if (!res.ok) {
        throw new Error('Failed to load analysis details');
      }
      const data: AnalysisResult = await res.json();
      setResult(data);
    } catch {
      setError('Cannot reach the server. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn">
        <div className="flex items-center gap-4 pb-2 border-b border-slate-800">
          <div className="w-9 h-9 bg-slate-800 animate-pulse rounded-xl" />
          <div className="space-y-2 flex-1">
            <div className="h-6 w-48 bg-slate-800 animate-pulse rounded-lg" />
            <div className="h-4 w-72 bg-slate-800/60 animate-pulse rounded-lg" />
          </div>
        </div>

        {/* Skeleton Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse p-5" />
          ))}
        </div>

        {/* Skeleton Status Banner */}
        <div className="h-16 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse" />

        {/* Skeleton Image and Worker Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 h-96 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse" />
          <div className="lg:col-span-5 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-slate-900/60 border border-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (is404) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center max-w-md mx-auto space-y-4">
        <div className="p-4 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <FileText className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-100">Analysis Not Found</h3>
          <p className="text-xs text-slate-400 mt-1">
            No inspection record exists for ID &quot;{id}&quot;.
          </p>
        </div>
        <Link
          to="/history"
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to History</span>
        </Link>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 max-w-xl mx-auto flex items-center gap-4">
        <AlertTriangle className="w-8 h-8 shrink-0 text-rose-400" />
        <div>
          <h3 className="font-bold text-base">Error Loading Record</h3>
          <p className="text-xs opacity-90 mt-1">{error || 'Could not fetch record.'}</p>
          <button
            type="button"
            onClick={fetchDetail}
            className="mt-3 px-3.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/30 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <Link
            to="/history"
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
            title="Back to History"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h3 className="text-xl font-bold text-slate-100">{result.filename}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Record ID: <span className="font-mono text-cyan-400">{result.id}</span> • Timestamp:{' '}
              {formatDate(result.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* Shared Result View */}
      <ResultView result={result} />
    </div>
  );
};
