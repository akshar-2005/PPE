import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Trash2,
  RefreshCw,
  Clock,
  ShieldAlert,
  Maximize2,
  CheckCircle2,
} from 'lucide-react';
import { API_BASE } from '../config';
import type { LiveAlert } from '../types';
import { ImageViewerModal } from '../components/ImageViewerModal';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

export const AlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isClearing, setIsClearing] = useState<boolean>(false);

  // Full-screen Image Viewer
  const [viewerOpen, setViewerOpen] = useState<boolean>(false);
  const [viewerImage, setViewerImage] = useState<string>('');
  const [viewerTitle, setViewerTitle] = useState<string>('');

  const { success, error } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/alerts?limit=50`);
      if (res.ok) {
        const data = (await res.json()) as LiveAlert[];
        setAlerts(data);
      } else {
        error('Failed to load alerts');
      }
    } catch {
      error('Error connecting to backend for alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleClearAlerts = async () => {
    if (!isAdmin) return;
    if (!window.confirm('Are you sure you want to delete all stored alerts and snapshot files?')) {
      return;
    }
    setIsClearing(true);
    try {
      const res = await fetch(`${API_BASE}/alerts/clear`, {
        method: 'POST',
      });
      if (res.ok) {
        setAlerts([]);
        success('All alerts and snapshot files deleted successfully');
      } else {
        error('Failed to clear alerts');
      }
    } catch {
      error('Error clearing alerts');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
            Safety Violation Alerts History
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Historical log of persistent non-compliance incidents detected during near-real-time live monitoring.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAlerts}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {isAdmin && (
            <button
              onClick={handleClearAlerts}
              disabled={isClearing || alerts.length === 0}
              className="px-4 py-2 bg-rose-950/80 hover:bg-rose-900/90 border border-rose-800/60 text-rose-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4" />
              {isClearing ? 'Clearing...' : 'Clear All Alerts'}
            </button>
          )}
        </div>
      </div>

      {/* Alert Feed Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div
              key={idx}
              className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse space-y-3"
            >
              <div className="w-full h-44 bg-slate-800 rounded-lg" />
              <div className="h-4 bg-slate-800 rounded w-3/4" />
              <div className="h-3 bg-slate-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center max-w-lg mx-auto space-y-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">No Alerts Recorded</h2>
          <p className="text-sm text-slate-400">
            No safety violations have triggered alerts yet. Live monitoring alerts will appear here with annotated snapshots.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden shadow-lg transition-all flex flex-col justify-between"
            >
              {/* Snapshot Image Container */}
              <div className="relative aspect-video bg-black/60 group overflow-hidden">
                {alert.snapshot_path ? (
                  <img
                    crossOrigin="use-credentials"
                    src={`${API_BASE}${alert.snapshot_path}`}
                    alt={alert.message}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 cursor-pointer"
                    onClick={() => {
                      setViewerImage(`${API_BASE}${alert.snapshot_path}`);
                      setViewerTitle(`Alert: ${alert.message}`);
                      setViewerOpen(true);
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <AlertTriangle className="w-12 h-12" />
                  </div>
                )}

                <button
                  onClick={() => {
                    setViewerImage(`${API_BASE}${alert.snapshot_path}`);
                    setViewerTitle(`Alert: ${alert.message}`);
                    setViewerOpen(true);
                  }}
                  className="absolute bottom-2.5 right-2.5 p-1.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded-lg border border-slate-700 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Expand snapshot"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>

                <div className="absolute top-2.5 left-2.5">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-600 text-white shadow">
                    Violation
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-white text-sm line-clamp-1">
                    {alert.message}
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                    Track #{alert.track_id}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {alert.missing_items &&
                    alert.missing_items.map((item) => (
                      <span
                        key={item}
                        className="text-[10px] bg-rose-950/60 border border-rose-800/50 text-rose-300 px-2 py-0.5 rounded font-medium"
                      >
                        Missing {item}
                      </span>
                    ))}
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {new Date(alert.created_at).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                    Sess: {alert.session_id}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full-screen Image Modal */}
      <ImageViewerModal
        isOpen={viewerOpen}
        imageUrl={viewerImage}
        title={viewerTitle}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  );
};
