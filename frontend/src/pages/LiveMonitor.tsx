import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  Camera,
  Play,
  Square,
  Volume2,
  VolumeX,
  AlertTriangle,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  Maximize2,
  RefreshCw,
  Info
} from 'lucide-react';
import { API_BASE } from '../config';
import type { LiveWorker, LiveAlert, LiveFrameResponse } from '../types';
import { ImageViewerModal } from '../components/ImageViewerModal';

export const LiveMonitor: React.FC = () => {
  // Source selection
  const [sourceType, setSourceType] = useState<'webcam' | 'video'>('video');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedVideoFile, setSelectedVideoFile] = useState<File | null>(null);
  const [loopVideo, setLoopVideo] = useState<boolean>(true);

  // Runtime state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isAlertFlashing, setIsAlertFlashing] = useState<boolean>(false);

  // Telemetry & Results
  const [annotatedImage, setAnnotatedImage] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; compliant: number; violations: number }>({
    total: 0,
    compliant: 0,
    violations: 0,
  });
  const [activeWorkers, setActiveWorkers] = useState<LiveWorker[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<LiveAlert[]>([]);
  const [processingMs, setProcessingMs] = useState<number>(0);
  const [measuredFps, setMeasuredFps] = useState<number>(0);
  const [cycleTimeSeconds, setCycleTimeSeconds] = useState<number>(0.5);

  // Full-screen modal
  const [viewerOpen, setViewerOpen] = useState<boolean>(false);
  const [viewerImage, setViewerImage] = useState<string>('');
  const [viewerTitle, setViewerTitle] = useState<string>('');

  // Refs for video & canvas
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoObjectUrlRef = useRef<string | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  // Enumerate video devices on mount
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setVideoDevices(videoInputs);
          if (videoInputs.length > 0) {
            setSelectedDeviceId(videoInputs[0].deviceId);
          }
        })
        .catch(() => {
          // Camera enumeration unavailable
        });
    }
  }, []);

  // Web Audio alert beep
  const playAlertSound = useCallback(() => {
    if (isMuted) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx();
        }
      }
      const ctx = audioCtxRef.current;
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.28);
      }
    } catch {
      // Audio autoplay blocked or unsupported
    }
  }, [isMuted]);

  // Stop session helper
  const stopMonitoring = useCallback(async () => {
    activeRef.current = false;
    setIsRunning(false);
    setIsReconnecting(false);

    // Stop camera stream tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    // Pause video
    if (videoRef.current) {
      videoRef.current.pause();
    }

    // Call /live/stop
    const currentSid = sessionIdRef.current;
    if (currentSid) {
      sessionIdRef.current = null;
      setSessionId(null);
      try {
        const formData = new FormData();
        formData.append('session_id', currentSid);
        await fetch(`${API_BASE}/live/stop`, {
          method: 'POST',
          body: formData,
        });
      } catch {
        // Ignore stop failure on exit
      }
    }
  }, []);

  // Frame processing loop
  const processNextFrame = useCallback(async () => {
    if (!activeRef.current || !videoRef.current || !canvasRef.current || !sessionIdRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Check video readiness
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      if (activeRef.current) {
        setTimeout(processNextFrame, 200);
      }
      return;
    }

    const targetWidth = 640;
    const scale = targetWidth / video.videoWidth;
    const targetHeight = Math.max(1, Math.round(video.videoHeight * scale));

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    canvas.toBlob(
      async (blob) => {
        if (!blob || !activeRef.current || !sessionIdRef.current) return;

        const currentSid = sessionIdRef.current;
        const formData = new FormData();
        formData.append('session_id', currentSid);
        formData.append('file', blob, 'frame.jpg');

        try {
          const res = await fetch(`${API_BASE}/live/frame`, {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            if (res.status === 404) {
              // Session expired on backend
              setIsReconnecting(true);
              // Restart session
              const startRes = await fetch(`${API_BASE}/live/start`, { method: 'POST' });
              if (startRes.ok) {
                const sData = (await startRes.json()) as { session_id: string };
                sessionIdRef.current = sData.session_id;
                setSessionId(sData.session_id);
                setIsReconnecting(false);
              }
            } else {
              throw new Error(`Frame request returned status ${res.status}`);
            }
          } else {
            const data = (await res.json()) as LiveFrameResponse;
            setIsReconnecting(false);
            setAnnotatedImage(data.annotated_image);
            setStats({
              total: data.total,
              compliant: data.compliant,
              violations: data.violations,
            });
            setActiveWorkers(data.workers);
            setProcessingMs(data.processing_ms);

            // Calculate FPS & cycle time
            const now = performance.now();
            if (lastFrameTimeRef.current > 0) {
              const deltaSec = (now - lastFrameTimeRef.current) / 1000.0;
              if (deltaSec > 0) {
                const instantFps = 1.0 / deltaSec;
                setMeasuredFps((prev) => Number((prev * 0.7 + instantFps * 0.3).toFixed(1)));
                setCycleTimeSeconds(Number(deltaSec.toFixed(1)));
              }
            }
            lastFrameTimeRef.current = now;

            // Handle new alerts
            if (data.new_alerts && data.new_alerts.length > 0) {
              setRecentAlerts((prev) => [...data.new_alerts, ...prev].slice(0, 30));
              setIsAlertFlashing(true);
              playAlertSound();
              setTimeout(() => setIsAlertFlashing(false), 1500);
            }
          }
        } catch {
          setIsReconnecting(true);
        }

        // Wait ~300ms before sending the next frame (never overlap)
        if (activeRef.current) {
          setTimeout(processNextFrame, 300);
        }
      },
      'image/jpeg',
      0.7
    );
  }, [playAlertSound]);

  // Start Monitoring handler
  const startMonitoring = async () => {
    setCameraError(null);
    setIsReconnecting(false);

    // Initialize Web Audio context on user gesture
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx && !audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    } catch {
      // Audio context initialization fallback
    }

    // 1. Setup Source
    if (sourceType === 'webcam') {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera API is not supported in this browser environment. Please use Video file mode.');
        }

        const constraints: MediaStreamConstraints = {
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
            : { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        mediaStreamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err: unknown) {
        const error = err as Error;
        const msg = error.name === 'NotAllowedError'
          ? 'Camera access permission was denied. Please allow camera permissions or switch to "Video file (simulation)" mode.'
          : error.name === 'NotFoundError'
          ? 'No camera found on this device. Please select "Video file (simulation)" mode.'
          : error.message || 'Failed to start camera. Please use Video file mode.';
        setCameraError(msg);
        return;
      }
    } else {
      // Video file mode
      if (!selectedVideoFile) {
        setCameraError('Please select a video file (.mp4, .mov, .avi, .webm) first.');
        return;
      }
      if (videoObjectUrlRef.current) {
        URL.revokeObjectURL(videoObjectUrlRef.current);
      }
      const url = URL.createObjectURL(selectedVideoFile);
      videoObjectUrlRef.current = url;

      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = url;
        videoRef.current.loop = loopVideo;
        await videoRef.current.play();
      }
    }

    // 2. Call /live/start
    try {
      const res = await fetch(`${API_BASE}/live/start`, { method: 'POST' });
      if (!res.ok) {
        throw new Error('Failed to start live session on backend');
      }
      const data = (await res.json()) as { session_id: string };
      sessionIdRef.current = data.session_id;
      setSessionId(data.session_id);
      activeRef.current = true;
      setIsRunning(true);
      lastFrameTimeRef.current = 0;

      // Start processing loop
      setTimeout(processNextFrame, 400);
    } catch (err: unknown) {
      const error = err as Error;
      setCameraError(`Backend connection failed: ${error.message}`);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    }
  };

  // Cleanup on unmount or page change
  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (videoObjectUrlRef.current) {
        URL.revokeObjectURL(videoObjectUrlRef.current);
      }
      const sid = sessionIdRef.current;
      if (sid) {
        const formData = new FormData();
        formData.append('session_id', sid);
        fetch(`${API_BASE}/live/stop`, {
          method: 'POST',
          body: formData,
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Camera className="w-6 h-6 text-emerald-400" />
              Live Near-Real-Time PPE Monitoring
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Automated worker tracking, body-region PPE verification, and smoothing alert detection.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Audio Mute Toggle */}
            <button
              onClick={() => setIsMuted((prev) => !prev)}
              className={`p-2.5 rounded-lg border text-sm font-medium transition-colors flex items-center gap-1.5 ${
                isMuted
                  ? 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                  : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400'
              }`}
              title={isMuted ? 'Alert sounds muted (click to unmute)' : 'Alert sounds active (click to mute)'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Sound On'}</span>
            </button>

            {/* Start / Stop Toggle Button */}
            {!isRunning ? (
              <button
                onClick={startMonitoring}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all hover:scale-[1.02]"
              >
                <Play className="w-4 h-4 fill-current" />
                Start Live Monitor
              </button>
            ) : (
              <button
                onClick={stopMonitoring}
                className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-lg shadow-rose-900/30 transition-all hover:scale-[1.02]"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop Monitor
              </button>
            )}
          </div>
        </div>

        {/* Source Selector Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              disabled={isRunning}
              onClick={() => {
                setSourceType('video');
                setCameraError(null);
              }}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                sourceType === 'video'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white disabled:opacity-50'
              }`}
            >
              <Video className="w-4 h-4" />
              Video file (simulation)
            </button>
            <button
              disabled={isRunning}
              onClick={() => {
                setSourceType('webcam');
                setCameraError(null);
              }}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                sourceType === 'webcam'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white disabled:opacity-50'
              }`}
            >
              <Camera className="w-4 h-4" />
              Webcam
            </button>
          </div>

          {/* Conditional Controls per source */}
          {sourceType === 'webcam' ? (
            <div className="flex items-center gap-3">
              {videoDevices.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-xs">Camera:</span>
                  <select
                    disabled={isRunning}
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    {videoDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Camera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                disabled={isRunning}
                accept=".mp4,.mov,.avi,.webm"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setSelectedVideoFile(e.target.files[0]);
                    setCameraError(null);
                  }
                }}
                className="text-xs text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-medium file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
              />
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isRunning}
                  checked={loopVideo}
                  onChange={(e) => setLoopVideo(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                />
                Loop video
              </label>
            </div>
          )}
        </div>

        {/* Camera or Configuration Error Banner */}
        {cameraError && (
          <div className="mt-4 p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-300 text-sm flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{cameraError}</p>
              {sourceType === 'webcam' && (
                <p className="text-xs text-amber-400/80 mt-1">
                  Tip: If no webcam is available or permission is blocked, switch to &quot;Video file (simulation)&quot; mode above and choose a sample video.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status & Telemetry Banner */}
      <div
        className={`p-3.5 rounded-xl border transition-all duration-300 flex flex-wrap items-center justify-between gap-3 text-sm ${
          isAlertFlashing
            ? 'bg-rose-950/80 border-rose-600 text-rose-200 shadow-lg shadow-rose-950/50'
            : isReconnecting
            ? 'bg-amber-950/50 border-amber-700/60 text-amber-300'
            : isRunning
            ? 'bg-slate-900 border-emerald-800/50 text-slate-200'
            : 'bg-slate-900/60 border-slate-800 text-slate-400'
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`w-3 h-3 rounded-full ${
              isRunning
                ? isAlertFlashing
                  ? 'bg-rose-500 animate-ping'
                  : 'bg-emerald-500 animate-pulse'
                : 'bg-slate-600'
            }`}
          />
          <span className="font-semibold text-white tracking-wide uppercase text-xs">
            {isReconnecting
              ? 'Reconnecting to Server...'
              : isRunning
              ? isAlertFlashing
                ? 'VIOLATION DETECTED'
                : 'Live Telemetry Active'
              : 'Standby / Stopped'}
          </span>
          {sessionId && (
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
              Session: {sessionId}
            </span>
          )}
        </div>

        {isRunning && (
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Inference: <strong className="text-white">{processingMs} ms</strong>
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              Framerate: <strong className="text-white">{measuredFps} FPS</strong>
            </span>
            <span className="text-slate-400 flex items-center gap-1">
              <Info className="w-3.5 h-3.5 text-slate-500" />
              Near-real-time: about 1 analysis every ~{cycleTimeSeconds}s
            </span>
          </div>
        )}
      </div>

      {/* Main Grid: Video Stream + Alerts & Workers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Primary Annotated Video Display */}
        <div className="lg:col-span-2 space-y-4">
          <div className="relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden aspect-video flex items-center justify-center shadow-xl">
            {annotatedImage ? (
              <>
                <img
                  src={annotatedImage}
                  alt="Live Annotated Feed"
                  className="w-full h-full object-contain"
                />
                <button
                  onClick={() => {
                    setViewerImage(annotatedImage);
                    setViewerTitle('Live Annotated Frame');
                    setViewerOpen(true);
                  }}
                  className="absolute top-3 right-3 bg-slate-900/80 hover:bg-slate-800 text-white p-2 rounded-lg border border-slate-700/80 shadow-md backdrop-blur transition-colors"
                  title="Full-screen view"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="text-center p-8 space-y-3">
                <Video className="w-12 h-12 text-slate-600 mx-auto" />
                <p className="text-slate-400 text-sm font-medium">
                  {isRunning ? 'Analyzing incoming video frames...' : 'Live monitor feed is idle.'}
                </p>
                <p className="text-slate-500 text-xs max-w-sm mx-auto">
                  Click &quot;Start Live Monitor&quot; above to begin near-real-time detection.
                </p>
              </div>
            )}

            {/* Small Picture-in-Picture Raw Source in Corner */}
            <div
              className={`absolute bottom-3 right-3 w-40 aspect-video rounded-lg overflow-hidden border border-slate-700 bg-black/80 shadow-lg ${
                isRunning ? 'block' : 'hidden'
              }`}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-1 left-1.5 text-[9px] font-mono text-slate-300 bg-black/70 px-1 rounded">
                Raw Source
              </span>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-950/60 text-blue-400 border border-blue-800/40">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">Workers</p>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">Compliant</p>
                <p className="text-2xl font-bold text-emerald-400">{stats.compliant}</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-rose-950/60 text-rose-400 border border-rose-800/40">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">Violations</p>
                <p className="text-2xl font-bold text-rose-400">{stats.violations}</p>
              </div>
            </div>
          </div>

          {/* Active Tracked Workers List */}
          {activeWorkers.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                Active Tracked Personnel in Scene ({activeWorkers.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {activeWorkers.map((w) => (
                  <div
                    key={w.track_id}
                    className={`p-3 rounded-lg border text-xs flex flex-col justify-between gap-1.5 ${
                      w.status === 'COMPLIANT'
                        ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                        : 'bg-rose-950/20 border-rose-800/40 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">Worker {w.track_id}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          w.status === 'COMPLIANT'
                            ? 'bg-emerald-800/60 text-emerald-200'
                            : 'bg-rose-800/60 text-rose-200'
                        }`}
                      >
                        {w.status}
                      </span>
                    </div>
                    {w.missing && w.missing.length > 0 ? (
                      <p className="text-[11px] text-rose-400">
                        Missing: {w.missing.join(', ')}
                      </p>
                    ) : (
                      <p className="text-[11px] text-emerald-400">All required PPE verified</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Real-Time Alerts Feed */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[520px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                Live Alerts Feed
              </h2>
              <span className="text-xs bg-rose-950 text-rose-400 border border-rose-800/50 px-2 py-0.5 rounded-full font-semibold">
                {recentAlerts.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 mt-3 pr-1">
              {recentAlerts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                  <CheckCircle2 className="w-8 h-8 text-slate-600 mb-2" />
                  <p className="text-xs font-medium">No alerts raised</p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Alerts trigger when a worker track is non-compliant in 3 of 5 observed frames.
                  </p>
                </div>
              ) : (
                recentAlerts.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 bg-rose-950/25 border border-rose-800/40 rounded-lg flex items-start gap-3 hover:border-rose-700 transition-colors"
                  >
                    {a.snapshot_path ? (
                      <img
                        src={`${API_BASE}${a.snapshot_path}`}
                        alt="Alert Snapshot"
                        onClick={() => {
                          setViewerImage(`${API_BASE}${a.snapshot_path}`);
                          setViewerTitle(`Alert: ${a.message}`);
                          setViewerOpen(true);
                        }}
                        className="w-14 h-14 object-cover rounded border border-rose-800/50 cursor-pointer shrink-0 hover:opacity-90"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded bg-rose-900/40 border border-rose-800/50 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-6 h-6 text-rose-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-rose-200 truncate">
                        {a.message}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Track #{a.track_id} • {new Date(a.created_at).toLocaleTimeString()}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {a.missing_items &&
                          a.missing_items.map((item) => (
                            <span
                              key={item}
                              className="text-[9px] bg-rose-900/60 text-rose-200 px-1.5 py-0.5 rounded font-medium"
                            >
                              Missing {item}
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {recentAlerts.length > 0 && (
              <div className="pt-3 border-t border-slate-800 text-center">
                <button
                  onClick={() => setRecentAlerts([])}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1 mx-auto"
                >
                  <RefreshCw className="w-3 h-3" />
                  Clear feed display
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full-screen Image Viewer Modal */}
      <ImageViewerModal
        isOpen={viewerOpen}
        imageUrl={viewerImage}
        title={viewerTitle}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  );
};
