import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ProtectedRoute: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex">
        {/* Skeleton Sidebar */}
        <div className="w-64 border-r border-slate-800 bg-slate-900/50 p-4 hidden md:flex flex-col gap-4 animate-pulse">
          <div className="h-10 bg-slate-800 rounded-lg w-3/4 mb-4" />
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-9 bg-slate-800/60 rounded-lg" />
            ))}
          </div>
        </div>

        {/* Skeleton Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Skeleton Topbar */}
          <div className="h-16 border-b border-slate-800 bg-slate-900/50 px-6 flex items-center justify-between animate-pulse">
            <div className="h-6 bg-slate-800 rounded w-48" />
            <div className="flex items-center gap-3">
              <div className="h-8 w-24 bg-slate-800 rounded-full" />
              <div className="h-8 w-8 bg-slate-800 rounded-full" />
            </div>
          </div>

          {/* Skeleton Body */}
          <div className="p-6 md:p-8 space-y-6 flex-1 animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="h-28 bg-slate-900/60 border border-slate-800 rounded-2xl" />
              <div className="h-28 bg-slate-900/60 border border-slate-800 rounded-2xl" />
              <div className="h-28 bg-slate-900/60 border border-slate-800 rounded-2xl" />
            </div>
            <div className="h-96 bg-slate-900/60 border border-slate-800 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
};
