import React from 'react';
import { CheckCircle2, XCircle, MinusCircle, HardHat, Shirt, AlertTriangle } from 'lucide-react';
import type { Worker, AnalysisSettings } from '../types';

interface WorkerCardProps {
  worker: Worker;
  settings?: AnalysisSettings;
}

export const WorkerCard: React.FC<WorkerCardProps> = ({ worker, settings }) => {
  const isHelmetOK = Boolean(worker.helmet);
  const isVestOK = Boolean(worker.vest);
  const isCompliant = worker.status === 'COMPLIANT';

  const isHelmetRequired = settings ? settings.require_helmet !== false : true;
  const isVestRequired = settings ? settings.require_vest !== false : true;

  const helmetPercent = isHelmetOK ? Math.round(worker.helmet_conf * 100) : 0;
  const vestPercent = isVestOK ? Math.round(worker.vest_conf * 100) : 0;

  return (
    <div
      className={`p-5 rounded-xl border transition-all duration-200 ${
        isCompliant
          ? 'bg-slate-900/60 border-slate-800 hover:border-emerald-500/30'
          : 'bg-rose-950/10 border-rose-500/20 hover:border-rose-500/40'
      }`}
    >
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-100 text-lg">Worker {worker.id}</span>
        </div>
        <span
          className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
            isCompliant
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
          }`}
        >
          {worker.status}
        </span>
      </div>

      <div className="space-y-2.5 text-sm">
        {/* Helmet Row */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2 text-slate-300">
            <HardHat className="w-4 h-4 text-slate-400" />
            <span>Hardhat / Helmet</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            {isHelmetOK ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">OK ({helmetPercent}%)</span>
              </>
            ) : !isHelmetRequired ? (
              <>
                <MinusCircle className="w-4 h-4 text-slate-500" />
                <span className="text-slate-400">Not required</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-rose-400" />
                <span className="text-rose-400">Missing</span>
              </>
            )}
          </div>
        </div>

        {/* Vest Row */}
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2 text-slate-300">
            <Shirt className="w-4 h-4 text-slate-400" />
            <span>Safety Vest</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            {isVestOK ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">OK ({vestPercent}%)</span>
              </>
            ) : !isVestRequired ? (
              <>
                <MinusCircle className="w-4 h-4 text-slate-500" />
                <span className="text-slate-400">Not required</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-rose-400" />
                <span className="text-rose-400">Missing</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Missing Items Alert Banner */}
      {worker.missing && worker.missing.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2 text-xs font-medium text-rose-400 bg-rose-500/5 p-2 rounded-lg border border-rose-500/10">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Missing: {worker.missing.join(', ')}</span>
        </div>
      )}
    </div>
  );
};
