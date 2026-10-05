import React, { useEffect, useState } from 'react';
import {
  Sliders,
  Shield,
  HardHat,
  Shirt,
  RotateCcw,
  Save,
  AlertTriangle,
  Info,
  RefreshCw,
} from 'lucide-react';
import { API_BASE } from '../config';
import type { AnalysisSettings } from '../types';
import { useToast } from '../context/ToastContext';

export const SettingsPage: React.FC = () => {
  const [savedSettings, setSavedSettings] = useState<AnalysisSettings | null>(null);
  const [formSettings, setFormSettings] = useState<AnalysisSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { success: toastSuccess, error: toastError } = useToast();

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (!res.ok) {
        throw new Error(`Failed to load settings (${res.status})`);
      }
      const data: AnalysisSettings = await res.json();
      setSavedSettings(data);
      setFormSettings(data);
    } catch {
      setError('Cannot reach the server. Is the backend running?');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleToggleHelmet = () => {
    if (!formSettings) return;
    setFormSettings({
      ...formSettings,
      require_helmet: !formSettings.require_helmet,
    });
  };

  const handleToggleVest = () => {
    if (!formSettings) return;
    setFormSettings({
      ...formSettings,
      require_vest: !formSettings.require_vest,
    });
  };

  const handleSliderChange = (
    key: 'person_conf' | 'ppe_conf' | 'decision_conf',
    value: number
  ) => {
    if (!formSettings) return;
    setFormSettings({
      ...formSettings,
      [key]: value,
    });
  };

  const isInvalid = Boolean(
    formSettings && !formSettings.require_helmet && !formSettings.require_vest
  );

  const isUnchanged = Boolean(
    savedSettings &&
      formSettings &&
      savedSettings.require_helmet === formSettings.require_helmet &&
      savedSettings.require_vest === formSettings.require_vest &&
      Math.abs(savedSettings.person_conf - formSettings.person_conf) < 0.001 &&
      Math.abs(savedSettings.ppe_conf - formSettings.ppe_conf) < 0.001 &&
      Math.abs(savedSettings.decision_conf - formSettings.decision_conf) < 0.001
  );

  const handleSave = async () => {
    if (!formSettings || isInvalid || isUnchanged) return;
    setIsSaving(true);

    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formSettings),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const errMsg = errData?.detail || 'Failed to update settings';
        toastError(errMsg, 'Update Failed');
      } else {
        const updated: AnalysisSettings = await res.json();
        setSavedSettings(updated);
        setFormSettings(updated);
        toastSuccess('Compliance thresholds and requirements updated', 'Settings Saved');
      }
    } catch {
      toastError('Network error while saving settings', 'Connection Error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const res = await fetch(`${API_BASE}/settings/reset`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Failed to reset settings');
      }

      const resetData: AnalysisSettings = await res.json();
      setSavedSettings(resetData);
      setFormSettings(resetData);
      toastSuccess('Restored default compliance parameters', 'Settings Reset');
    } catch {
      toastError('Failed to reset settings to defaults', 'Reset Error');
    } finally {
      setIsResetting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-slate-800 animate-pulse rounded-lg" />
          <div className="h-4 w-80 bg-slate-800/60 animate-pulse rounded-lg" />
        </div>
        <div className="h-48 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse p-6" />
        <div className="h-72 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse p-6" />
      </div>
    );
  }

  if (error || !formSettings) {
    return (
      <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 max-w-xl mx-auto flex items-center gap-4 my-8 animate-fadeIn">
        <AlertTriangle className="w-8 h-8 shrink-0 text-rose-400" />
        <div>
          <h3 className="font-bold text-base">Backend Connection Failure</h3>
          <p className="text-xs opacity-90 mt-1">{error || 'Unable to load configuration.'}</p>
          <button
            type="button"
            onClick={fetchSettings}
            className="mt-3 px-3.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold border border-rose-500/30 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Sliders className="w-6 h-6 text-cyan-400" />
            Detection &amp; Compliance Settings
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure required safety equipment and AI detection sensitivity thresholds
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleReset}
            disabled={isResetting || isSaving}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs border border-slate-800 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset to defaults</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isInvalid || isUnchanged}
            className={`px-4 py-2 rounded-xl font-semibold text-xs flex items-center gap-2 transition-all shadow-md ${
              isSaving || isInvalid || isUnchanged
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/20 active:scale-95'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {/* 1. Required PPE Section */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-base pb-2 border-b border-slate-800/80">
          <Shield className="w-5 h-5 text-cyan-400" />
          <h4>Required PPE Gear</h4>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Select which items are mandatory on site. Workers missing a required item will trigger a violation. Unselected items will still be detected but will not cause compliance violations.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Hardhat / Helmet Toggle Card */}
          <div
            onClick={handleToggleHelmet}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                handleToggleHelmet();
              }
            }}
            className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all duration-200 select-none ${
              formSettings.require_helmet
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 shadow-sm'
                : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  formSettings.require_helmet
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                <HardHat className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-sm text-slate-200">Hardhat / Helmet</p>
                <p className="text-xs text-slate-400">Head protection mandate</p>
              </div>
            </div>

            {/* Switch pill */}
            <div
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                formSettings.require_helmet ? 'bg-cyan-500' : 'bg-slate-800'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  formSettings.require_helmet ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
          </div>

          {/* Safety Vest Toggle Card */}
          <div
            onClick={handleToggleVest}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                handleToggleVest();
              }
            }}
            className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all duration-200 select-none ${
              formSettings.require_vest
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 shadow-sm'
                : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 text-slate-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg ${
                  formSettings.require_vest
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                <Shirt className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-sm text-slate-200">High-Vis Safety Vest</p>
                <p className="text-xs text-slate-400">Body visibility mandate</p>
              </div>
            </div>

            {/* Switch pill */}
            <div
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                formSettings.require_vest ? 'bg-cyan-500' : 'bg-slate-800'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  formSettings.require_vest ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Validation Error Banner */}
        {isInvalid && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 animate-fadeIn"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              At least one PPE item (Helmet or Vest) must remain enabled to perform compliance audits.
            </span>
          </div>
        )}
      </div>

      {/* 2. Detection Sensitivity Section */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-base pb-2 border-b border-slate-800/80">
          <Sliders className="w-5 h-5 text-cyan-400" />
          <h4>Detection Sensitivity &amp; Confidence Thresholds</h4>
        </div>

        <div className="space-y-6">
          {/* Slider 1: Person Detection Confidence */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label
                  htmlFor="person_conf"
                  className="font-semibold text-sm text-slate-200 flex items-center gap-2"
                >
                  <span>Person Detection Confidence (`person_conf`)</span>
                </label>
                <p className="text-xs text-slate-400 mt-0.5">
                  Minimum confidence required by YOLOv8 to detect a worker on site.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-mono font-bold text-xs">
                {formSettings.person_conf.toFixed(2)} ({Math.round(formSettings.person_conf * 100)}%)
              </span>
            </div>
            <input
              id="person_conf"
              type="range"
              min="0.05"
              max="0.95"
              step="0.01"
              value={formSettings.person_conf}
              onChange={(e) => handleSliderChange('person_conf', parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-400 border border-slate-800"
            />
          </div>

          {/* Slider 2: PPE Feature Confidence */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label
                  htmlFor="ppe_conf"
                  className="font-semibold text-sm text-slate-200 flex items-center gap-2"
                >
                  <span>PPE Feature Confidence (`ppe_conf`)</span>
                </label>
                <p className="text-xs text-slate-400 mt-0.5">
                  Model-level sensitivity for identifying hardhat and vest features in cropped worker images.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-mono font-bold text-xs">
                {formSettings.ppe_conf.toFixed(2)} ({Math.round(formSettings.ppe_conf * 100)}%)
              </span>
            </div>
            <input
              id="ppe_conf"
              type="range"
              min="0.05"
              max="0.95"
              step="0.01"
              value={formSettings.ppe_conf}
              onChange={(e) => handleSliderChange('ppe_conf', parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-400 border border-slate-800"
            />
          </div>

          {/* Slider 3: Decision Threshold */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label
                  htmlFor="decision_conf"
                  className="font-semibold text-sm text-slate-200 flex items-center gap-2"
                >
                  <span>Decision Threshold (`decision_conf`)</span>
                </label>
                <p className="text-xs text-slate-400 mt-0.5">
                  Threshold score to accept positive PPE detection over background and negative features.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-mono font-bold text-xs">
                {formSettings.decision_conf.toFixed(2)} ({Math.round(formSettings.decision_conf * 100)}%)
              </span>
            </div>
            <input
              id="decision_conf"
              type="range"
              min="0.05"
              max="0.95"
              step="0.01"
              value={formSettings.decision_conf}
              onChange={(e) => handleSliderChange('decision_conf', parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-cyan-400 border border-slate-800"
            />
          </div>
        </div>

        {/* Informative Note */}
        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            <strong>Sensitivity Guide:</strong> Lower confidence values detect more objects but increase the risk of false detections. Higher thresholds ensure greater certainty but may miss partially occluded items.
          </span>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
