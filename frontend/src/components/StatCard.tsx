import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  type: 'total' | 'compliant' | 'violations';
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, type }) => {
  const styles = {
    total: {
      bg: 'bg-slate-900/80',
      border: 'border-slate-800',
      iconBg: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
      valueColor: 'text-slate-100',
    },
    compliant: {
      bg: 'bg-emerald-950/20',
      border: 'border-emerald-500/20',
      iconBg: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      valueColor: 'text-emerald-400',
    },
    violations: {
      bg: 'bg-rose-950/20',
      border: 'border-rose-500/20',
      iconBg: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
      valueColor: 'text-rose-400',
    },
  }[type];

  return (
    <div className={`p-5 rounded-xl border ${styles.bg} ${styles.border} backdrop-blur-sm transition-all duration-200`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
          <p className={`text-3xl font-bold mt-2 ${styles.valueColor}`}>{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${styles.iconBg}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};
