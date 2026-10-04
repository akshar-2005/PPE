import React from 'react';

interface DonutChartProps {
  compliant: number;
  violations: number;
  complianceRate: number;
}

export const DonutChart: React.FC<DonutChartProps> = ({ compliant, violations, complianceRate }) => {
  const total = compliant + violations;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  const compliantPercent = total > 0 ? compliant / total : 0;
  const compliantDash = compliantPercent * circumference;
  const violationsDash = circumference - compliantDash;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-6 p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
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
              {/* Violations Arc (Red) */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-rose-500 transition-all duration-500 ease-out"
                strokeWidth="12"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={0}
                fill="transparent"
              />
              {/* Compliant Arc (Green) */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="stroke-emerald-400 transition-all duration-500 ease-out"
                strokeWidth="12"
                strokeDasharray={`${compliantDash} ${violationsDash}`}
                strokeDashoffset={0}
                fill="transparent"
              />
            </>
          )}
        </svg>

        {/* Center Text */}
        <div className="absolute flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold text-slate-100">{complianceRate.toFixed(1)}%</span>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Compliance</span>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-3 w-full sm:w-auto">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Worker Breakdown</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-8 p-2 rounded-lg bg-slate-950/40 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
              <span className="text-slate-300 font-medium">Compliant</span>
            </div>
            <span className="font-bold text-emerald-400">{compliant}</span>
          </div>
          <div className="flex items-center justify-between gap-8 p-2 rounded-lg bg-slate-950/40 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500"></span>
              <span className="text-slate-300 font-medium">Violations</span>
            </div>
            <span className="font-bold text-rose-400">{violations}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
