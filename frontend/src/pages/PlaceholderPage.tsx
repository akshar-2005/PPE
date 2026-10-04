import React from 'react';
import { Layers } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center">
      <div className="p-4 rounded-2xl bg-slate-800/80 text-cyan-400 mb-4 border border-slate-700/50">
        <Layers className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-bold text-slate-100">{title}</h3>
      <p className="text-sm text-slate-400 mt-2 max-w-md">
        Overview coming in a later phase.
      </p>
    </div>
  );
};
