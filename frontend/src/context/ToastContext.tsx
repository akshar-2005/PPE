import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { CheckCircle2, AlertOctagon, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (toast: { type: ToastType; message: string; title?: string; duration?: number }) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({
      type,
      message,
      title,
      duration = 4000,
    }: {
      type: ToastType;
      message: string;
      title?: string;
      duration?: number;
    }) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newToast: ToastItem = { id, type, message, title, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string, title?: string) => showToast({ type: 'success', message, title }),
    [showToast]
  );

  const error = useCallback(
    (message: string, title?: string) => showToast({ type: 'error', message, title }),
    [showToast]
  );

  const info = useCallback(
    (message: string, title?: string) => showToast({ type: 'info', message, title }),
    [showToast]
  );

  const warning = useCallback(
    (message: string, title?: string) => showToast({ type: 'warning', message, title }),
    [showToast]
  );

  const contextValue = useMemo(
    () => ({ showToast, success, error, info, warning, removeToast }),
    [showToast, success, error, info, warning, removeToast]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Toast Container */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((toast) => {
          const typeStyles = {
            success: {
              border: 'border-emerald-500/30',
              bg: 'bg-slate-900/95 text-emerald-400',
              icon: CheckCircle2,
              iconColor: 'text-emerald-400',
              badgeBg: 'bg-emerald-500/10',
            },
            error: {
              border: 'border-rose-500/30',
              bg: 'bg-slate-900/95 text-rose-400',
              icon: AlertOctagon,
              iconColor: 'text-rose-400',
              badgeBg: 'bg-rose-500/10',
            },
            warning: {
              border: 'border-amber-500/30',
              bg: 'bg-slate-900/95 text-amber-400',
              icon: AlertTriangle,
              iconColor: 'text-amber-400',
              badgeBg: 'bg-amber-500/10',
            },
            info: {
              border: 'border-cyan-500/30',
              bg: 'bg-slate-900/95 text-cyan-400',
              icon: Info,
              iconColor: 'text-cyan-400',
              badgeBg: 'bg-cyan-500/10',
            },
          }[toast.type];

          const IconComponent = typeStyles.icon;

          return (
            <div
              key={toast.id}
              role="alert"
              onClick={() => removeToast(toast.id)}
              className={`pointer-events-auto p-4 rounded-xl border shadow-xl backdrop-blur-md flex items-start gap-3 transition-all duration-300 animate-slideIn ${typeStyles.bg} ${typeStyles.border} cursor-pointer hover:opacity-90`}
            >
              <div className={`p-1.5 rounded-lg ${typeStyles.badgeBg} ${typeStyles.iconColor} shrink-0 mt-0.5`}>
                <IconComponent className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                {toast.title && (
                  <h4 className="font-semibold text-xs text-slate-100 mb-0.5">{toast.title}</h4>
                )}
                <p className="text-xs text-slate-300 leading-relaxed break-words">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
                aria-label="Dismiss notification"
                className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800/60 transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
