import React, { useState } from 'react';
import { Users, ShieldCheck, AlertOctagon, ExternalLink, Maximize2, Sliders } from 'lucide-react';
import type { AnalysisResult } from '../types';
import { StatCard } from './StatCard';
import { StatusBanner } from './StatusBanner';
import { WorkerCard } from './WorkerCard';
import { ImageViewerModal } from './ImageViewerModal';

interface ResultViewProps {
  result: AnalysisResult;
}

export const ResultView: React.FC<ResultViewProps> = ({ result }) => {
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Full-screen Image Modal */}
      <ImageViewerModal
        isOpen={isViewerOpen}
        imageUrl={result.image_url}
        title={`Annotated Result — ${result.filename}`}
        onClose={() => setIsViewerOpen(false)}
      />

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

      {/* Audit Settings Line Under Banner */}
      {result.settings && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>
              <strong className="text-slate-300">Mandated Equipment:</strong>{' '}
              {[
                result.settings.require_helmet !== false ? 'Hardhat' : null,
                result.settings.require_vest !== false ? 'Safety Vest' : null,
                result.settings.require_mask ? 'Mask' : null,
              ]
                .filter(Boolean)
                .join(', ') || 'None'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
            <span>Person Conf: {result.settings.person_conf.toFixed(2)}</span>
            <span>PPE Conf: {result.settings.ppe_conf.toFixed(2)}</span>
            <span>Decision: {result.settings.decision_conf.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Annotated Image & Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Annotated Image Column */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsViewerOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsViewerOpen(true);
              }
            }}
            aria-label="Click to enlarge annotated image in full screen"
            className="relative group overflow-hidden rounded-xl border border-slate-800 bg-slate-950 cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
          >
            <img
              src={result.image_url}
              alt={`Annotated detection results for ${result.filename}`}
              className="w-full h-auto max-h-[500px] object-contain rounded-xl transition-transform duration-300 group-hover:scale-[1.01]"
            />
            {/* Click to expand hover overlay badge */}
            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <span className="px-3.5 py-1.5 rounded-full bg-slate-900/90 text-cyan-400 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-sm">
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Click to expand full screen</span>
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Click image to enlarge</span>
            </span>
            <button
              type="button"
              onClick={() => setIsViewerOpen(true)}
              className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 font-medium hover:underline focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none rounded"
            >
              <span>Full screen view</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
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
                <WorkerCard
                  key={worker.id}
                  worker={worker}
                  settings={result.settings}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultView;
