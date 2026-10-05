export interface Worker {
  id: number;
  box: [number, number, number, number];
  helmet: boolean | number;
  vest: boolean | number;
  helmet_conf: number;
  vest_conf: number;
  status: "COMPLIANT" | "NON-COMPLIANT";
  missing: string[];
}

export interface AnalysisSettings {
  require_helmet: boolean;
  require_vest: boolean;
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
