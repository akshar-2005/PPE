import React, { useEffect, useState } from 'react';

interface DonutChartProps {
  compliant: number;
  violations: number;
  complianceRate: number;
}

export const DonutChart: React.FC<DonutChartProps> = ({ compliant, violations, complianceRate }) => {
  const total = compliant + violations;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  const [animatedProgress, setAnimatedProgress] = useState(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return 1;
    }
    return 0;
  });

  const [displayRate, setDisplayRate] = useState<number>(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return complianceRate;
    }
    return 0;
  });

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setAnimatedProgress(1);
      setDisplayRate(complianceRate);
      return;
    }

    let start: number | null = null;
    const duration = 1000;
    let animId: number;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);

      setAnimatedProgress(easeOut);
      setDisplayRate(complianceRate * easeOut);

      if (progress < 1) {
        animId = requestAnimationFrame(animate);
      } else {
        setAnimatedProgress(1);
        setDisplayRate(complianceRate);
      }
    };

    animId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animId);
  }, [complianceRate]);

  const compliantPercent = total > 0 ? compliant / total : 0;
  const targetCompliantDash = compliantPercent * circumference;
  const currentCompliantDash = targetCompliantDash * animatedProgress;
  const currentViolationsDash = circumference - currentCompliantDash;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-6 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 transition-all duration-300 hover:border-slate-700">
      <div className="relative w-44 h-44 flex items-center justify-center shrink-0">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Background Ring */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="stroke-slate-800"
            strokeWidth="12"
            fill="transparent"
          />
          {total > 0 && (
            <>
              {/* Violations Arc (Rose) */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-rose-500"
                strokeWidth="12"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={0}
                fill="transparent"
              />
              {/* Compliant Arc (Emerald) */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-emerald-400"
                strokeWidth="12"
                strokeDasharray={`${currentCompliantDash} ${currentViolationsDash}`}
                strokeDashoffset={0}
                fill="transparent"
                strokeLinecap="round"
              />
            </>
          )}
        </svg>

        {/* Center Text */}
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold text-slate-100 tracking-tight">
            {displayRate.toFixed(1)}%
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Compliance
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-3 w-full sm:w-auto">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Worker Breakdown
        </h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-8 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80 transition-colors hover:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
              <span className="text-slate-300 font-medium text-xs">Compliant</span>
            </div>
            <span className="font-bold text-emerald-400 text-xs">{compliant}</span>
          </div>
          <div className="flex items-center justify-between gap-8 p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/80 transition-colors hover:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500"></span>
              <span className="text-slate-300 font-medium text-xs">Violations</span>
            </div>
            <span className="font-bold text-rose-400 text-xs">{violations}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
