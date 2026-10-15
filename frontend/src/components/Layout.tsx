import React, { useEffect, useState, useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  LayoutDashboard,
  ScanLine,
  Video,
  History as HistoryIcon,
  FileBarChart,
  Settings,
  Menu,
  X,
  Camera,
  Bell,
  Users as UsersIcon,
  ChevronDown,
  LogOut,
  KeyRound,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { API_BASE } from '../config';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const Layout: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState<boolean>(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState<boolean>(false);

  // Change password modal state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);

  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const userMenuRef = useRef<HTMLDivElement>(null);

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

  // Close user dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getPageTitle = () => {
    if (location.pathname === '/' || location.pathname === '/dashboard') {
      return 'Dashboard Overview';
    }
    if (location.pathname === '/live') {
      return 'Live Near-Real-Time Monitor';
    }
    if (location.pathname === '/alerts') {
      return 'Safety Violation Alerts';
    }
    if (location.pathname === '/analysis') {
      return 'Image Analysis';
    }
    if (location.pathname === '/video') {
      return 'Video File Analysis';
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
    if (location.pathname === '/users') {
      return 'User Management';
    }
    return 'PPE Safety Monitoring';
  };

  const getDocumentTitle = () => {
    if (location.pathname === '/' || location.pathname === '/dashboard') {
      return 'Dashboard';
    }
    if (location.pathname === '/live') {
      return 'Live Monitor';
    }
    if (location.pathname === '/alerts') {
      return 'Alerts';
    }
    if (location.pathname === '/analysis') {
      return 'Image Analysis';
    }
    if (location.pathname === '/video') {
      return 'Video Analysis';
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
    if (location.pathname === '/users') {
      return 'Users';
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
    { to: '/live', label: 'Live Monitor', icon: Camera },
    { to: '/alerts', label: 'Alerts', icon: Bell },
    { to: '/analysis', label: 'Image Analysis', icon: ScanLine },
    { to: '/video', label: 'Video Analysis', icon: Video },
    { to: '/history', label: 'History', icon: HistoryIcon },
    { to: '/reports', label: 'Reports', icon: FileBarChart },
    { to: '/settings', label: 'Settings', icon: Settings },
    ...(user?.role === 'admin' ? [{ to: '/users', label: 'Users', icon: UsersIcon }] : []),
  ];

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordError(null);

    if (!currentPassword) {
      setChangePasswordError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setChangePasswordError('New password must be at least 8 characters long.');
      return;
    }

    try {
      setChangePasswordLoading(true);
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        let msg = 'Failed to change password.';
        try {
          const data = await res.json();
          if (data.detail) msg = data.detail;
        } catch {
          // fallback
        }
        setChangePasswordError(msg);
        return;
      }

      showToast({
        type: 'success',
        message: 'Your password has been changed successfully.',
        title: 'Password Updated',
      });

      setIsChangePasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
    } catch {
      setChangePasswordError('Network error while updating password.');
    } finally {
      setChangePasswordLoading(false);
    }
  };

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

          <div className="flex items-center gap-4 shrink-0">
            {/* ONLINE / OFFLINE Status Badge */}
            <div
              className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
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

            {/* User Profile & Role Dropdown */}
            {user && (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  aria-expanded={isUserMenuOpen}
                  aria-haspopup="true"
                  className="flex items-center gap-2.5 p-1.5 pl-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400 cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs uppercase shadow-sm">
                    {user.username.charAt(0)}
                  </div>
                  <div className="text-left hidden md:block">
                    <div className="text-xs font-semibold text-slate-200 leading-tight">
                      {user.username}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                      user.role === 'admin'
                        ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {user.role}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 mr-1" />
                </button>

                {/* Dropdown Menu */}
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95">
                    <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
                      <div className="text-xs text-slate-400">Signed in as</div>
                      <div className="text-xs font-bold text-slate-100 truncate">{user.username}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        setIsChangePasswordOpen(true);
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800/80 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Change password</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/30 flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            )}
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

      {/* Change Password Modal */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative">
            <button
              type="button"
              onClick={() => setIsChangePasswordOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">Change Password</h3>
                <p className="text-xs text-slate-400">Update your account credentials</p>
              </div>
            </div>

            {changePasswordError && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{changePasswordError}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="user-current-password"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Current Password
                </label>
                <div className="relative">
                  <input
                    id="user-current-password"
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    disabled={changePasswordLoading}
                    className="w-full px-3 py-2 pr-10 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="user-new-password"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="user-new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    disabled={changePasswordLoading}
                    className="w-full px-3 py-2 pr-10 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Minimum 8 characters</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsChangePasswordOpen(false)}
                  disabled={changePasswordLoading}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changePasswordLoading}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium text-xs rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {changePasswordLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <KeyRound className="w-3.5 h-3.5" />
                  )}
                  <span>Update Password</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
