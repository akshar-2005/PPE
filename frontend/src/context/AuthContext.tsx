import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config';
import { useToast } from './ToastContext';
import { setOnUnauthorized } from '../api';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const fetchCurrentUser = useCallback(async (): Promise<User | null> => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const userData: User = { username: data.username, role: data.role };
        setUser(userData);
        return userData;
      }
      setUser(null);
      return null;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  // Check session on startup
  useEffect(() => {
    let mounted = true;
    fetchCurrentUser().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [fetchCurrentUser]);

  // Wire global 401 handler for session expiration
  useEffect(() => {
    setOnUnauthorized(() => {
      setUser(null);
      showToast({
        type: 'error',
        message: 'Session expired. Please sign in again.',
        title: 'Session Expired',
      });
      navigate('/login', { replace: true });
    });

    return () => {
      setOnUnauthorized(null);
    };
  }, [navigate, showToast]);

  const login = useCallback(
    async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          credentials: 'include',
        });

        if (!res.ok) {
          let errDetail = 'Invalid username or password';
          try {
            const errJson = await res.json();
            if (errJson.detail) {
              errDetail = errJson.detail;
            }
          } catch {
            // keep default error
          }
          return { success: false, error: errDetail };
        }

        const data = await res.json();
        const loggedInUser: User = { username: data.username, role: data.role };
        setUser(loggedInUser);
        return { success: true };
      } catch {
        return { success: false, error: 'Network error. Could not connect to authentication service.' };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore logout network errors
    } finally {
      setUser(null);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const refreshUser = useCallback(async () => {
    await fetchCurrentUser();
  }, [fetchCurrentUser]);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshUser,
    }),
    [user, loading, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
