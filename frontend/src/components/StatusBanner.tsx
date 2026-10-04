import React from 'react';
import { Users, CheckCircle2, AlertTriangle } from 'lucide-react';

interface StatusBannerProps {
  total: number;
  violations: number;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({ total, violations }) => {
  if (total === 0) {
    return (
      <div className="p-4 rounded-xl border flex items-center gap-3 bg-slate-900/90 border-slate-800 text-slate-400">
        <Users className="w-6 h-6 shrink-0 text-slate-500" />
        <div>
          <h4 className="font-bold text-base tracking-wide text-slate-300">
            NO WORKERS DETECTED IN THIS IMAGE
          </h4>
          <p className="text-xs opacity-80 mt-0.5">
            No personnel were identified in the uploaded image.
          </p>
        </div>
      </div>
    );
  }

  if (violations === 0) {
    return (
      <div className="p-4 rounded-xl border flex items-center justify-between bg-emerald-950/30 border-emerald-500/30 text-emerald-400">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-400" />
          <div>
            <h4 className="font-bold text-base tracking-wide">ALL WORKERS COMPLIANT</h4>
            <p className="text-xs opacity-80 mt-0.5">
              All detected personnel are equipped with mandatory safety hardhats and vests.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl border flex items-center justify-between bg-rose-950/30 border-rose-500/30 text-rose-400">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 shrink-0 text-rose-400" />
        <div>
          <h4 className="font-bold text-base tracking-wide">SAFETY VIOLATIONS DETECTED</h4>
          <p className="text-xs opacity-80 mt-0.5">
            {violations} worker(s) flagged for missing personal protective equipment.
          </p>
        </div>
      </div>
    </div>
  );
};
