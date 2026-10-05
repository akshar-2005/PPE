import React, { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  type: 'total' | 'compliant' | 'violations';
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, type }) => {
  const [displayValue, setDisplayValue] = useState<string | number>(() => {
    // If reduced motion is preferred, render final value directly
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return value;
    }
    return typeof value === 'number' ? 0 : '0%';
  });

  useEffect(() => {
    // If reduced motion is active, skip animation
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplayValue(value);
      return;
    }

    // Determine target number and format
    let targetNumber = 0;
    let suffix = '';
    let isFloat = false;

    if (typeof value === 'number') {
      targetNumber = value;
    } else {
      const match = String(value).match(/^([\d.]+)(.*)$/);
      if (match) {
        targetNumber = parseFloat(match[1]);
        suffix = match[2];
        isFloat = match[1].includes('.');
      } else {
        setDisplayValue(value);
        return;
      }
    }

    if (isNaN(targetNumber) || targetNumber === 0) {
      setDisplayValue(value);
      return;
    }

    let startTimestamp: number | null = null;
    const duration = 800; // ms
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Ease out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = targetNumber * easeOut;

      if (isFloat) {
        setDisplayValue(`${current.toFixed(1)}${suffix}`);
      } else {
        setDisplayValue(`${Math.round(current)}${suffix}`);
      }

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [value]);

  const styles = {
    total: {
      bg: 'bg-slate-900/80 hover:border-slate-700',
      border: 'border-slate-800',
      iconBg: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:scale-105',
      valueColor: 'text-slate-100',
    },
    compliant: {
      bg: 'bg-emerald-950/20 hover:border-emerald-500/40',
      border: 'border-emerald-500/20',
      iconBg: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-105',
      valueColor: 'text-emerald-400',
    },
    violations: {
      bg: 'bg-rose-950/20 hover:border-rose-500/40',
      border: 'border-rose-500/20',
      iconBg: 'bg-rose-500/10 text-rose-400 border border-rose-500/20 group-hover:scale-105',
      valueColor: 'text-rose-400',
    },
  }[type];

  return (
    <div
      className={`group p-5 rounded-2xl border ${styles.bg} ${styles.border} backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 print-card`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1 pr-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">
            {title}
          </p>
          <p className={`text-3xl font-bold mt-2 tracking-tight ${styles.valueColor}`}>
            {displayValue}
          </p>
        </div>
        <div
          className={`p-3 rounded-xl ${styles.iconBg} transition-transform duration-300 shrink-0`}
        >
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};
