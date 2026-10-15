import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  History as HistoryIcon,
  Filter,
  AlertTriangle,
  Plus,
  Users,
  ShieldCheck,
  AlertOctagon,
  Video as VideoIcon,
  ScanLine,
  ArrowLeft,
  Film,
} from 'lucide-react';
import { API_BASE } from '../config';
import type { HistoryItem, VideoHistoryItem, VideoAnalysisResult } from '../types';
import { formatDate } from '../utils/format';
import { VideoResultView } from '../components/VideoResultView';

type TabType = 'images' | 'videos';
type FilterType = 'all' | 'violations' | 'compliant';

export const HistoryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('images');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [videoHistory, setVideoHistory] = useState<VideoHistoryItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedVideo, setSelectedVideo] = useState<VideoAnalysisResult | null>(null);
  const [loadingVideoDetail, setLoadingVideoDetail] = useState<boolean>(false);

  const fetchHistory = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [imgRes, vidRes] = await Promise.all([
        fetch(`${API_BASE}/history`),
        fetch(`${API_BASE}/video-history`).catch(() => null),
      ]);

      if (!imgRes.ok) {
        throw new Error('Failed to load image history');
      }
      const imgData: HistoryItem[] = await imgRes.json();
      setHistory(imgData);

      if (vidRes && vidRes.ok) {
        const vidData: VideoHistoryItem[] = await vidRes.json();
        setVideoHistory(vidData);
      }
    } catch {
      setError('Cannot reach the server. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSelectVideo = async (vidId: string) => {
    setLoadingVideoDetail(true);
    try {
      const res = await fetch(`${API_BASE}/video-history/${vidId}`);
      if (!res.ok) throw new Error('Could not load video record');
      const data: VideoAnalysisResult = await res.json();
      setSelectedVideo(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingVideoDetail(false);
    }
  };

  const filteredImageHistory = history.filter((item) => {
    if (filter === 'violations') return item.violations > 0;
    if (filter === 'compliant') return item.total > 0 && item.violations === 0;
    return true;
  });

  const filteredVideoHistory = videoHistory.filter((item) => {
    if (filter === 'violations') return item.violations > 0;
    if (filter === 'compliant') return item.unique_workers > 0 && item.violations === 0;
    return true;
  });

  if (selectedVideo) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn">
        <button
          type="button"
          onClick={() => setSelectedVideo(null)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-800 text-xs font-semibold transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Video History</span>
        </button>

        <VideoResultView result={selectedVideo} onReset={() => setSelectedVideo(null)} />
      </div>
    );
  }

  if (isLoading || loadingVideoDetail) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-slate-800 animate-pulse rounded-lg" />
            <div className="h-4 w-72 bg-slate-800/60 animate-pulse rounded-lg" />
          </div>
          <div className="h-9 w-64 bg-slate-800 animate-pulse rounded-xl" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between animate-pulse space-y-4"
            >
              <div className="rounded-xl bg-slate-950 aspect-video w-full border border-slate-800/60" />
              <div className="space-y-2">
                <div className="h-4 w-3/4 bg-slate-800 rounded" />
                <div className="h-3 w-1/2 bg-slate-800/60 rounded" />
              </div>
              <div className="pt-3 border-t border-slate-800/60 grid grid-cols-3 gap-2">
                <div className="h-8 bg-slate-950/40 rounded-lg" />
                <div className="h-8 bg-slate-950/40 rounded-lg" />
                <div className="h-8 bg-slate-950/40 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
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

  const currentCount = activeTab === 'images' ? history.length : videoHistory.length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <HistoryIcon className="w-6 h-6 text-cyan-400" />
            Analysis History
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Browse and inspect past safety audit records ({currentCount} {activeTab})
          </p>
        </div>

        {/* Media Type Tabs: Images vs Videos */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('images')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'images'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ScanLine className="w-3.5 h-3.5" />
            <span>Images ({history.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('videos')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'videos'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <VideoIcon className="w-3.5 h-3.5" />
            <span>Videos ({videoHistory.length})</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex items-center justify-end">
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === 'all'
                ? 'bg-slate-800 text-slate-200 border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All
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
            With Violations
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
            Fully Compliant
          </button>
        </div>
      </div>

      {/* Content for Images Tab */}
      {activeTab === 'images' && (
        <>
          {filteredImageHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[350px] bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
              <div className="p-4 rounded-2xl bg-slate-800/80 text-slate-400 border border-slate-700/50">
                <Filter className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-200">No Image Records Matching Filter</h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  {history.length === 0
                    ? 'No image analyses recorded yet.'
                    : 'Try selecting a different filter above.'}
                </p>
              </div>
              {history.length === 0 && (
                <Link
                  to="/analysis"
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Perform Image Analysis</span>
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredImageHistory.map((item) => {
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

                      <h4 className="font-bold text-slate-100 text-base truncate group-hover:text-cyan-400 transition-colors">
                        {item.filename}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">{formatDate(item.created_at)}</p>
                    </div>

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
        </>
      )}

      {/* Content for Videos Tab */}
      {activeTab === 'videos' && (
        <>
          {filteredVideoHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[350px] bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
              <div className="p-4 rounded-2xl bg-slate-800/80 text-slate-400 border border-slate-700/50">
                <VideoIcon className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-200">No Video Records Matching Filter</h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  {videoHistory.length === 0
                    ? 'No video analyses recorded yet.'
                    : 'Try selecting a different filter above.'}
                </p>
              </div>
              {videoHistory.length === 0 && (
                <Link
                  to="/video"
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Analyze New Video</span>
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredVideoHistory.map((item) => {
                const statusType =
                  item.unique_workers === 0
                    ? 'none'
                    : item.violations === 0
                    ? 'compliant'
                    : 'violation';

                const thumbnail =
                  item.keyframes && item.keyframes.length > 0
                    ? item.keyframes[0]
                    : null;

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectVideo(item.id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSelectVideo(item.id)}
                    className="group bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 rounded-2xl p-4 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-cyan-500/5 cursor-pointer text-left"
                  >
                    <div>
                      {/* Video Thumbnail or Icon */}
                      <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950 aspect-video mb-4 flex items-center justify-center">
                        {thumbnail ? (
                          <img
                            src={thumbnail}
                            alt={item.filename}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <Film className="w-12 h-12 text-slate-700 group-hover:text-cyan-500 transition-colors" />
                        )}
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

                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-slate-900/80 backdrop-blur-sm text-[10px] text-slate-300 font-medium">
                          {item.duration_seconds}s • {item.frames_analyzed} frames
                        </div>
                      </div>

                      <h4 className="font-bold text-slate-100 text-base truncate group-hover:text-cyan-400 transition-colors">
                        {item.filename}
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">{formatDate(item.created_at)}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="p-1.5 rounded-lg bg-slate-950/40">
                        <div className="flex items-center justify-center gap-1 text-slate-400 mb-0.5">
                          <Users className="w-3 h-3" />
                          <span>Tracked</span>
                        </div>
                        <span className="font-bold text-slate-200">{item.unique_workers}</span>
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
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
