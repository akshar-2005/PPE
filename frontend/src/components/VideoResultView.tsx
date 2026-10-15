import React, { useState } from 'react';
import {
  Users,
  ShieldCheck,
  AlertTriangle,
  Film,
  Download,
  Clock,
  Layers,
  Info,
  Maximize2,
  RefreshCw,
} from 'lucide-react';
import type { VideoAnalysisResult } from '../types';
import { StatCard } from './StatCard';
import { StatusBanner } from './StatusBanner';
import { TrackedWorkerCard } from './TrackedWorkerCard';
import { ImageViewerModal } from './ImageViewerModal';

interface VideoResultViewProps {
  result: VideoAnalysisResult;
  onReset?: () => void;
}

export const VideoResultView: React.FC<VideoResultViewProps> = ({ result, onReset }) => {
  const [selectedKeyframe, setSelectedKeyframe] = useState<string | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Banner */}
      <StatusBanner
        total={result.unique_workers}
        violations={result.violations}
      />

      {/* Truncated Notice if applicable */}
      {result.truncated && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          <Info className="w-5 h-5 shrink-0 text-amber-400" />
          <div>
            <span className="font-semibold">Video Truncated:</span> Analyzed the first 15 seconds (60 sampled frames) to ensure rapid response.
          </div>
        </div>
      )}

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Unique Workers"
          value={result.unique_workers}
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
          icon={AlertTriangle}
          type="violations"
        />
        <StatCard
          title="Frames Analyzed"
          value={result.frames_analyzed}
          icon={Layers}
          type="total"
        />
      </div>

      {/* Video Player & Download Section */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Film className="w-5 h-5 text-cyan-400" />
              Annotated Output Video
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{result.filename} • {result.duration_seconds}s • Codec: {result.video_codec.toUpperCase()}</span>
              {result.analyzed_by && (
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60 text-[11px]">
                  Analyzed by <strong className="text-cyan-400 font-semibold">{result.analyzed_by}</strong>
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <a
              href={result.video_url}
              download={result.filename || 'annotated_video.mp4'}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-cyan-500/20 w-full sm:w-auto"
            >
              <Download className="w-4 h-4" />
              Download Video
            </a>
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-all border border-slate-700"
              >
                <RefreshCw className="w-4 h-4" />
                Analyze Another
              </button>
            )}
          </div>
        </div>

        {/* MP4V Codec Notice */}
        {result.video_codec === 'mp4v' && (
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              <strong>Note:</strong> Some web browsers cannot stream MP4V codec video directly. If the video below does not play in your browser, please click <strong>Download Video</strong> to view it locally, or inspect the extracted key frames below.
            </span>
          </div>
        )}

        {/* Video Player Container */}
        <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video max-h-[520px] flex items-center justify-center">
          <video
            controls
            playsInline
            crossOrigin="use-credentials"
            src={result.video_url}
            className="w-full h-full object-contain"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </div>

      {/* Keyframe Gallery */}
      {result.keyframes && result.keyframes.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Sampled Key Frames ({result.keyframes.length})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Frames captured during moments with highest worker density and PPE violations
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {result.keyframes.map((kfUrl, idx) => (
              <div
                key={kfUrl}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedKeyframe(kfUrl)}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedKeyframe(kfUrl)}
                className="group relative rounded-xl overflow-hidden border border-slate-800 hover:border-cyan-500/50 bg-slate-950 aspect-video cursor-pointer transition-all"
              >
                <img
                  crossOrigin="use-credentials"
                  src={kfUrl}
                  alt={`Keyframe ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white font-medium text-xs">
                  <Maximize2 className="w-4 h-4" />
                  <span>Enlarge</span>
                </div>
                <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded bg-slate-900/80 backdrop-blur-sm text-[10px] font-semibold text-slate-200">
                  Frame {idx + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tracked Workers List */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-400" />
          Tracked Workers Aggregated Compliance ({result.workers.length})
        </h3>

        {result.workers.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-sm">
            No persistent workers (seen in &ge; 2 frames) detected in this video clip.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {result.workers.map((worker) => (
              <TrackedWorkerCard
                key={worker.track_id}
                worker={worker}
                settings={result.settings}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fullscreen Keyframe Viewer Modal */}
      {selectedKeyframe && (
        <ImageViewerModal
          isOpen={Boolean(selectedKeyframe)}
          imageUrl={selectedKeyframe}
          title="Video Sampled Key Frame"
          onClose={() => setSelectedKeyframe(null)}
        />
      )}
    </div>
  );
};
