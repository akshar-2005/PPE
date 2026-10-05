import React, { useState } from 'react';
import { RotateCcw, Loader2, Sparkles, AlertOctagon } from 'lucide-react';
import { API_BASE } from '../config';
import type { AnalysisResult } from '../types';
import { UploadZone } from '../components/UploadZone';
import { ResultView } from '../components/ResultView';
import { useToast } from '../context/ToastContext';

export const ImageAnalysis: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const errMsg = errData?.detail || `Server error (${res.status})`;
        setError(errMsg);
        toastError(errMsg, 'Analysis Failed');
      } else {
        const data: AnalysisResult = await res.json();
        setResult(data);
        toastSuccess(
          `Analysis complete: ${data.total} worker${data.total !== 1 ? 's' : ''}, ${data.violations} violation${data.violations !== 1 ? 's' : ''}`,
          'Scan Complete'
        );
      }
    } catch {
      const errMsg = 'Cannot reach the server. Is the backend running?';
      setError(errMsg);
      toastError(errMsg, 'Connection Error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
    setError(null);
    setIsLoading(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Upload and Form Section */}
      {!result && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                Upload Inspection Image
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload a construction or worksite image to detect workers and verify PPE compliance.
              </p>
            </div>
          </div>

          <UploadZone
            selectedFile={selectedFile}
            onFileSelect={setSelectedFile}
            disabled={isLoading}
          />

          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3 text-rose-400 text-sm">
              <AlertOctagon className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!selectedFile || isLoading}
              className={`px-6 py-3 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all duration-200 shadow-lg ${
                !selectedFile || isLoading
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20 active:scale-95'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing workers and PPE...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Analyze Image</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Results View */}
      {result && (
        <div className="space-y-6">
          {/* Top Control Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div>
              <h3 className="text-xl font-bold text-slate-100">Inspection Analysis Results</h3>
              <p className="text-xs text-slate-400 mt-0.5">File: {result.filename}</p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-medium text-sm flex items-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4 text-cyan-400" />
              <span>Analyze another image</span>
            </button>
          </div>

          {/* Shared Result View */}
          <ResultView result={result} />
        </div>
      )}
    </div>
  );
};
