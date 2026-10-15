import React from 'react';
import { ShieldCheck, AlertTriangle, HardHat, Sparkles } from 'lucide-react';
import type { TrackedWorker, AnalysisSettings } from '../types';

interface TrackedWorkerCardProps {
  worker: TrackedWorker;
  settings?: AnalysisSettings;
}

export const TrackedWorkerCard: React.FC<TrackedWorkerCardProps> = ({ worker, settings }) => {
  const isCompliant = worker.status === 'COMPLIANT';
  const reqHelmet = settings?.require_helmet ?? true;
  const reqVest = settings?.require_vest ?? true;
  const reqMask = settings?.require_mask ?? false;

  return (
    <div
      className={`rounded-2xl border p-5 transition-all bg-slate-900/60 backdrop-blur-sm ${
        isCompliant
          ? 'border-emerald-500/30 hover:border-emerald-500/50 shadow-sm'
          : 'border-rose-500/30 hover:border-rose-500/50 shadow-sm'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="text-base font-bold text-slate-100">Worker {worker.track_id}</span>
          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-medium">
            {worker.frames_seen} frames seen
          </span>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
            isCompliant
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}
        >
          {isCompliant ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5" />
              COMPLIANT
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5" />
              VIOLATION
            </>
          )}
        </span>
      </div>

      {/* PPE Presence Percentages */}
      <div className="space-y-2.5 text-sm">
        {/* Helmet */}
        <div>
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="flex items-center gap-1.5 text-slate-300 font-medium">
              <HardHat className="w-3.5 h-3.5 text-amber-400" />
              Helmet Presence {reqHelmet && <span className="text-cyan-400 text-[10px]">(Req)</span>}
            </span>
            <span
              className={`font-semibold ${
                worker.helmet_pct >= 60 ? 'text-emerald-400' : reqHelmet ? 'text-rose-400' : 'text-slate-400'
              }`}
            >
              {worker.helmet_pct}%
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                worker.helmet_pct >= 60 ? 'bg-emerald-400' : reqHelmet ? 'bg-rose-500' : 'bg-slate-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, worker.helmet_pct))}%` }}
            />
          </div>
        </div>

        {/* Vest */}
        <div>
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="flex items-center gap-1.5 text-slate-300 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-orange-400" />
              Safety Vest Presence {reqVest && <span className="text-cyan-400 text-[10px]">(Req)</span>}
            </span>
            <span
              className={`font-semibold ${
                worker.vest_pct >= 60 ? 'text-emerald-400' : reqVest ? 'text-rose-400' : 'text-slate-400'
              }`}
            >
              {worker.vest_pct}%
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                worker.vest_pct >= 60 ? 'bg-emerald-400' : reqVest ? 'bg-rose-500' : 'bg-slate-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, worker.vest_pct))}%` }}
            />
          </div>
        </div>

        {/* Mask (if required or detected) */}
        {(reqMask || worker.mask_pct > 0) && (
          <div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                Protective Mask Presence {reqMask && <span className="text-cyan-400 text-[10px]">(Req)</span>}
              </span>
              <span
                className={`font-semibold ${
                  worker.mask_pct >= 60 ? 'text-emerald-400' : reqMask ? 'text-rose-400' : 'text-slate-400'
                }`}
              >
                {worker.mask_pct}%
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  worker.mask_pct >= 60 ? 'bg-emerald-400' : reqMask ? 'bg-rose-500' : 'bg-slate-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, worker.mask_pct))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Missing Items Warning */}
      {worker.missing.length > 0 && (
        <div className="mt-3.5 pt-3 border-t border-slate-800 text-xs text-rose-400 flex items-center gap-1.5 font-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Missing: {worker.missing.join(', ')} (&lt; 60% presence)</span>
        </div>
      )}
    </div>
  );
};
