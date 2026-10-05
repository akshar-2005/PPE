import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileQuestion, ArrowLeft, Home } from 'lucide-react';

export const NotFound: React.FC = () => {
  useEffect(() => {
    document.title = 'Page Not Found | PPE Vision Safety';
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[450px] bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center max-w-lg mx-auto space-y-6 my-12 animate-fadeIn">
      <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center mx-auto">
        <FileQuestion className="w-8 h-8" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-100">404 — Page Not Found</h1>
        <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
          The safety module or resource you requested cannot be found. Check the URL or return to the dashboard.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20 active:scale-95 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
        >
          <Home className="w-4 h-4" />
          <span>Dashboard</span>
        </Link>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm flex items-center gap-2 transition-colors border border-slate-700 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go Back</span>
        </button>
      </div>
    </div>
  );
};
