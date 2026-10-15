export interface Worker {
  id: number;
  box: [number, number, number, number];
  helmet: boolean | number;
  vest: boolean | number;
  mask?: boolean | number;
  helmet_conf: number;
  vest_conf: number;
  mask_conf?: number;
  status: "COMPLIANT" | "NON-COMPLIANT";
  missing: string[];
}

export interface AnalysisSettings {
  require_helmet: boolean;
  require_vest: boolean;
  require_mask?: boolean;
  person_conf: number;
  ppe_conf: number;
  decision_conf: number;
}

export interface AnalysisResult {
  id: string;
  filename: string;
  created_at: string;
  total: number;
  compliant: number;
  violations: number;
  workers: Worker[];
  settings?: AnalysisSettings;
  image_url: string;
}

export interface HistoryItem {
  id: string;
  filename: string;
  created_at: string;
  total: number;
  compliant: number;
  violations: number;
  image_url: string;
}

export interface StatsResponse {
  total_analyses: number;
  total_workers: number;
  total_compliant: number;
  total_violations: number;
  compliance_rate: number;
}

export interface TrackedWorker {
  track_id: number;
  frames_seen: number;
  helmet_pct: number;
  vest_pct: number;
  mask_pct: number;
  status: "COMPLIANT" | "NON-COMPLIANT";
  missing: string[];
}

export interface VideoAnalysisResult {
  id: string;
  filename: string;
  created_at: string;
  duration_seconds: number;
  frames_analyzed: number;
  total_video_frames: number;
  truncated: boolean;
  unique_workers: number;
  compliant: number;
  violations: number;
  workers: TrackedWorker[];
  video_url: string;
  video_codec: string;
  keyframes: string[];
  settings: AnalysisSettings;
}

export interface VideoHistoryItem {
  id: string;
  filename: string;
  created_at: string;
  duration_seconds: number;
  frames_analyzed: number;
  total_video_frames: number;
  truncated: boolean;
  unique_workers: number;
  compliant: number;
  violations: number;
  video_url: string;
  video_codec: string;
  keyframes: string[];
  settings: AnalysisSettings;
}

export interface JobStatusResponse {
  status: "queued" | "processing" | "done" | "failed";
  progress: number;
  message: string;
  result?: VideoAnalysisResult;
}
