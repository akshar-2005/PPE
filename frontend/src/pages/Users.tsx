import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users as UsersIcon,
  UserPlus,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Trash2,
  Lock,
  User,
  Shield,
  Loader2,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { API_BASE } from '../config';
import type { User as UserType } from '../types';

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New user form state
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset password modal state
  const [resetTargetUser, setResetTargetUser] = useState<UserType | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Delete confirmation modal state
  const [deleteTargetUser, setDeleteTargetUser] = useState<UserType | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/auth/users`, { credentials: 'include' });
      if (!res.ok) {
        throw new Error('Failed to load users');
      }
      const data = await res.json();
      setUsers(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error fetching users';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchUsers();
    }
  }, [currentUser, fetchUsers]);

  // Non-admin guard
  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 mb-4">
          <ShieldAlert className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Not Authorized</h1>
        <p className="text-slate-400 max-w-md text-sm mb-6">
          You do not have permission to view or manage system users. Only administrators can access this section.
        </p>
        <Link
          to="/"
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (newUsername.trim().length < 3 || newUsername.trim().length > 32) {
      setCreateError('Username must be between 3 and 32 characters.');
      return;
    }
    if (newPassword.length < 8) {
      setCreateError('Password must be at least 8 characters long.');
      return;
    }

    try {
      setCreateLoading(true);
      const res = await fetch(`${API_BASE}/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        let msg = 'Failed to create user';
        try {
          const data = await res.json();
          if (data.detail) msg = data.detail;
        } catch {
          // fallback
        }
        setCreateError(msg);
        return;
      }

      showToast({
        type: 'success',
        message: `User '${newUsername.trim()}' created successfully.`,
        title: 'User Created',
      });

      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      fetchUsers();
    } catch {
      setCreateError('Network error while creating user.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser || !resetTargetUser.id) return;
    setResetError(null);

    if (resetNewPassword.length < 8) {
      setResetError('New password must be at least 8 characters long.');
      return;
    }

    try {
      setResetLoading(true);
      const res = await fetch(`${API_BASE}/auth/users/${resetTargetUser.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetNewPassword }),
        credentials: 'include',
      });

      if (!res.ok) {
        let msg = 'Failed to reset password';
        try {
          const data = await res.json();
          if (data.detail) msg = data.detail;
        } catch {
          // fallback
        }
        setResetError(msg);
        return;
      }

      showToast({
        type: 'success',
        message: `Password updated for ${resetTargetUser.username}.`,
        title: 'Password Reset',
      });

      setResetTargetUser(null);
      setResetNewPassword('');
    } catch {
      setResetError('Network error while resetting password.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTargetUser || !deleteTargetUser.id) return;
    setDeleteError(null);

    try {
      setDeleteLoading(true);
      const res = await fetch(`${API_BASE}/auth/users/${deleteTargetUser.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        let msg = 'Failed to delete user';
        try {
          const data = await res.json();
          if (data.detail) msg = data.detail;
        } catch {
          // fallback
        }
        setDeleteError(msg);
        return;
      }

      showToast({
        type: 'success',
        message: `User '${deleteTargetUser.username}' deleted.`,
        title: 'User Deleted',
      });

      setDeleteTargetUser(null);
      fetchUsers();
    } catch {
      setDeleteError('Network error while deleting user.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <UsersIcon className="w-6 h-6 text-cyan-400" />
          <span>User Management</span>
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Manage system users, define security roles, and control access permissions.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Create User Card (Left Column) */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Add New User</h2>
              <p className="text-xs text-slate-400">Create an operator or administrator account</p>
            </div>
          </div>

          {createError && (
            <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{createError}</span>
            </div>
          )}

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <label htmlFor="create-username" className="block text-xs font-medium text-slate-300 mb-1.5">
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  id="create-username"
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="e.g. john_doe"
                  required
                  disabled={createLoading}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all disabled:opacity-50"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">3–32 characters (letters, numbers, underscore, dot)</p>
            </div>

            <div>
              <label htmlFor="create-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  id="create-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={createLoading}
                  className="w-full pl-9 pr-10 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Minimum 8 characters</p>
            </div>

            <div>
              <label htmlFor="create-role" className="block text-xs font-medium text-slate-300 mb-1.5">
                Role
              </label>
              <div className="relative">
                <Shield className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <select
                  id="create-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
                  disabled={createLoading}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <option value="user">User (Analysis & view only)</option>
                  <option value="admin">Admin (Full system control)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={createLoading}
              className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-cyan-500/10 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {createLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating user...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Add User</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* User List Table (Right Column) */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Registered Accounts</h2>
              <p className="text-xs text-slate-400">Total users: {users.length}</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mb-2" />
              <span className="text-xs">Loading user accounts...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">No users registered yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 px-3 font-medium">User</th>
                    <th className="py-2.5 px-3 font-medium">Role</th>
                    <th className="py-2.5 px-3 font-medium">Created</th>
                    <th className="py-2.5 px-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users.map((u) => {
                    const isSelf = u.username.toLowerCase() === currentUser?.username.toLowerCase();
                    const createdFormatted = u.created_at
                      ? new Date(u.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—';

                    return (
                      <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold text-xs uppercase">
                              {u.username.charAt(0)}
                            </div>
                            <div>
                              <span className="font-semibold text-slate-100">{u.username}</span>
                              {isSelf && (
                                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                  You
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          {u.role === 'admin' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/25">
                              <ShieldCheck className="w-3 h-3 text-purple-400" />
                              <span>Admin</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                              <User className="w-3 h-3 text-slate-400" />
                              <span>User</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-400">{createdFormatted}</td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setResetTargetUser(u);
                                setResetNewPassword('');
                                setResetError(null);
                              }}
                              title="Reset Password"
                              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 border border-slate-700/60 transition-colors cursor-pointer"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteTargetUser(u);
                                setDeleteError(null);
                              }}
                              disabled={isSelf}
                              title={isSelf ? 'Cannot delete your own account' : 'Delete User'}
                              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-red-950/80 text-slate-300 hover:text-red-400 border border-slate-700/60 hover:border-red-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Reset Password Modal */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative">
            <button
              type="button"
              onClick={() => setResetTargetUser(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">Reset Password</h3>
                <p className="text-xs text-slate-400">Target user: {resetTargetUser.username}</p>
              </div>
            </div>

            {resetError && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{resetError}</span>
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label htmlFor="reset-new-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    id="reset-new-password"
                    type={showResetPassword ? 'text' : 'password'}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={resetLoading}
                    className="w-full pl-9 pr-10 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                  >
                    {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Must be at least 8 characters long</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  disabled={resetLoading}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  {resetLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Save Password</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deleteTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">Delete User Account</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            {deleteError && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <p className="text-sm text-slate-300 mb-6">
              Are you sure you want to permanently delete user{' '}
              <span className="font-semibold text-white">'{deleteTargetUser.username}'</span>?
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTargetUser(null)}
                disabled={deleteLoading}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleteLoading}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold text-xs rounded-xl transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {deleteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
