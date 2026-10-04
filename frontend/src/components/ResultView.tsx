import React from 'react';
import { Users, ShieldCheck, AlertOctagon, ExternalLink } from 'lucide-react';
import type { AnalysisResult } from '../types';
import { StatCard } from './StatCard';
import { StatusBanner } from './StatusBanner';
import { WorkerCard } from './WorkerCard';

interface ResultViewProps {
  result: AnalysisResult;
}

export const ResultView: React.FC<ResultViewProps> = ({ result }) => {
  return (
    <div className="space-y-6">
      {/* Three Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Workers Detected"
          value={result.total}
          icon={Users}
          type="total"
        />
        <StatCard
          title="Compliant Workers"
          value={result.compliant}
          icon={ShieldCheck}
          type="compliant"
        />
        <StatCard
          title="Safety Violations"
          value={result.violations}
          icon={AlertOctagon}
          type="violations"
        />
      </div>

      {/* Overall Status Banner */}
      <StatusBanner total={result.total} violations={result.violations} />

      {/* Annotated Image & Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Annotated Image Column */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div className="relative group overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <img
              src={result.image_url}
              alt="Annotated detection results"
              className="w-full h-auto max-h-[500px] object-contain rounded-xl"
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Annotated Bounding Box Visualizer</span>
            <a
              href={result.image_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 font-medium hover:underline"
            >
              <span>Open full size</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Individual Worker Cards Column */}
        <div className="lg:col-span-5 space-y-4">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 px-1">
            Worker Compliance Breakdown ({result.workers.length})
          </h4>
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {result.workers.length === 0 ? (
              <div className="p-8 rounded-xl border border-slate-800 bg-slate-900/40 text-center text-slate-500 text-sm">
                No workers detected in this image.
              </div>
            ) : (
              result.workers.map((worker) => (
                <WorkerCard key={worker.id} worker={worker} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
