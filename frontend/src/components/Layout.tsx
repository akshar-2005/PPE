import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  LayoutDashboard,
  ScanLine,
  History as HistoryIcon,
  FileBarChart,
  Settings,
  Menu,
  X,
} from 'lucide-react';
import { API_BASE } from '../config';

export const Layout: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const location = useLocation();

  const checkHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
      setIsOnline(res.ok);
    } catch {
      setIsOnline(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const getPageTitle = () => {
    if (location.pathname === '/' || location.pathname === '/dashboard') {
      return 'Dashboard Overview';
    }
    if (location.pathname === '/analysis') {
      return 'Image Analysis';
    }
    if (location.pathname.startsWith('/history')) {
      return location.pathname === '/history' ? 'Analysis History' : 'Analysis Record Detail';
    }
    if (location.pathname === '/reports') {
      return 'Compliance Reports';
    }
    if (location.pathname === '/settings') {
      return 'System Settings';
    }
    return 'PPE Safety Monitoring';
  };

  const getDocumentTitle = () => {
    if (location.pathname === '/' || location.pathname === '/dashboard') {
      return 'Dashboard';
    }
    if (location.pathname === '/analysis') {
      return 'Image Analysis';
    }
    if (location.pathname.startsWith('/history')) {
      return location.pathname === '/history' ? 'History' : 'History Detail';
    }
    if (location.pathname === '/reports') {
      return 'Reports';
    }
    if (location.pathname === '/settings') {
      return 'Settings';
    }
    return 'PPE Safety';
  };

  // Sync document title per page
  useEffect(() => {
    document.title = `${getDocumentTitle()} | PPE Vision Safety`;
  }, [location.pathname]);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/analysis', label: 'Image Analysis', icon: ScanLine },
    { to: '/history', label: 'History', icon: HistoryIcon },
    { to: '/reports', label: 'Reports', icon: FileBarChart },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          role="presentation"
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Desktop Sidebar / Mobile Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900/95 border-r border-slate-800 flex flex-col shrink-0 transition-transform duration-300 lg:static lg:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo Section */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <Link
            to="/dashboard"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg p-1"
          >
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-slate-100 text-base leading-tight">PPE Vision</h1>
              <p className="text-xs text-slate-400 font-medium">Safety Monitor</p>
            </div>
          </Link>

          {/* Close button for mobile drawer */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close navigation menu"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.to === '/dashboard'
                ? location.pathname === '/' || location.pathname === '/dashboard'
                : location.pathname.startsWith(item.to);

            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* System Footnote */}
        <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
          PPE Vision Safety v1.0
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/40 px-4 sm:px-6 flex items-center justify-between shrink-0 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger Button (Mobile / Tablet below 1024px) */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 lg:hidden border border-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-base sm:text-lg font-semibold text-slate-100 truncate">
              {getPageTitle()}
            </h2>
          </div>

          {/* ONLINE / OFFLINE Status Badge */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                isOnline
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}
            >
              <span className="relative flex h-2 w-2">
                {isOnline && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isOnline ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                ></span>
              </span>
              <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950 flex flex-col justify-between">
          <div className="flex-1">
            <Outlet />
          </div>

          {/* Page Footer */}
          <footer className="mt-12 pt-6 border-t border-slate-900 text-center text-xs text-slate-600 no-print">
            PPE Vision Safety • Automated AI Compliance Monitoring System
          </footer>
        </main>
      </div>
    </div>
  );
};
