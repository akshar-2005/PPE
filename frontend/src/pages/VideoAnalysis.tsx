import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Video,
  AlertCircle,
  FileVideo,
  Play,
  Loader2,
} from 'lucide-react';
import { API_BASE } from '../config';
import type { VideoAnalysisResult, JobStatusResponse } from '../types';
import { useToast } from '../context/ToastContext';
import { VideoResultView } from '../components/VideoResultView';

const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.webm'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const VideoAnalysis: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);

  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Poll active job status every second
  useEffect(() => {
    if (!activeJobId) return;

    let isMounted = true;
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${activeJobId}`);
        if (!res.ok) {
          if (res.status === 404) {
            clearInterval(pollInterval);
            if (isMounted) {
              setValidationError('Video analysis job not found.');
              setActiveJobId(null);
              showToast({ type: 'error', message: 'Job not found on server.' });
            }
          }
          return;
        }

        const data: JobStatusResponse = await res.json();
        if (!isMounted) return;

        setJobStatus(data);

        if (data.status === 'done' && data.result) {
          clearInterval(pollInterval);
          setResult(data.result);
          setActiveJobId(null);
          showToast({ type: 'success', message: 'Video analysis completed successfully!' });
        } else if (data.status === 'failed') {
          clearInterval(pollInterval);
          setActiveJobId(null);
          setValidationError(data.message || 'Video analysis failed.');
          showToast({ type: 'error', message: data.message || 'Video analysis failed.' });
        }
      } catch (err) {
        console.error('Job polling error:', err);
      }
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [activeJobId, showToast]);

  const validateFile = (file: File): boolean => {
    setValidationError(null);
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setValidationError(
        `Unsupported video format '${ext}'. Allowed formats: ${ALLOWED_EXTENSIONS.join(', ')}`
      );
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      setValidationError(
        `Video size exceeds 50 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`
      );
      return false;
    }
    if (file.size === 0) {
      setValidationError('Uploaded video file is empty.');
      return false;
    }
    return true;
  };

  const handleFileSelect = (file: File) => {
    if (validateFile(file)) {
      setSelectedFile(file);
    } else {
      setSelectedFile(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setIsSubmitting(true);
    setValidationError(null);
    setJobStatus({
      status: 'queued',
      progress: 0,
      message: 'Uploading video file to server...',
    });

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch(`${API_BASE}/analyze-video`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.detail || 'Failed to submit video for analysis.';
        setValidationError(msg);
        showToast({ type: 'error', message: msg });
        setJobStatus(null);
        return;
      }

      const data = await res.json();
      setActiveJobId(data.job_id);
      showToast({ type: 'info', message: 'Video uploaded. Processing in background...' });
    } catch {
      const msg = 'Unable to connect to backend server. Please check your connection.';
      setValidationError(msg);
      showToast({ type: 'error', message: msg });
      setJobStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
    setActiveJobId(null);
    setJobStatus(null);
    setValidationError(null);
  };

  if (result) {
    return <VideoResultView result={result} onReset={handleReset} />;
  }

  const isProcessing = Boolean(activeJobId) || isSubmitting;

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Video className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">Video File PPE Analysis</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Upload site surveillance or inspection video footage for multi-frame PPE tracking and compliance verification.
            </p>
          </div>
        </div>
      </div>

      {/* Upload Zone */}
      {!isProcessing ? (
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer ${
              isDragging
                ? 'border-cyan-400 bg-cyan-500/5 scale-[1.01]'
                : selectedFile
                ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.mov,.avi,.webm"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
            />

            <div className="flex flex-col items-center justify-center gap-3">
              <div
                className={`p-4 rounded-2xl border ${
                  selectedFile
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700'
                }`}
              >
                {selectedFile ? <FileVideo className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
              </div>

              {selectedFile ? (
                <div>
                  <p className="font-semibold text-slate-100 text-base">{selectedFile.name}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to analyze
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-slate-200 text-base">
                    Click to select or drag and drop video
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    MP4, MOV, AVI, WEBM up to 50 MB (samples 4 fps, up to first 15 seconds)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Validation Error Message */}
          {validationError && (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Actions */}
          {selectedFile && (
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-sm font-medium transition-all"
              >
                Clear
              </button>

              <button
                type="button"
                onClick={handleAnalyze}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-cyan-500/25"
              >
                <Play className="w-4 h-4" />
                Analyze Video
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Progress View */
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 backdrop-blur-sm space-y-6 text-center">
          <div className="flex justify-center">
            <div className="p-4 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          </div>

          <div className="space-y-2 max-w-md mx-auto">
            <h3 className="text-lg font-bold text-slate-100">
              {jobStatus?.status === 'queued' ? 'Queued for Analysis...' : 'Analyzing Video...'}
            </h3>
            <p className="text-sm text-slate-400">
              {jobStatus?.message || 'Extracting frames and tracking workers...'}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <span>Progress</span>
              <span className="text-cyan-400">{jobStatus?.progress ?? 0}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.max(5, jobStatus?.progress ?? 5)}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Please wait while the AI models process sampled frames and compute persistent track compliance.
          </p>
        </div>
      )}
    </div>
  );
};
