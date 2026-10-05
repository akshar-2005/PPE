import React, { useRef, useState } from 'react';
import { UploadCloud, FileImage, X, AlertCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface UploadZoneProps {
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
}

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const UploadZone: React.FC<UploadZoneProps> = ({ selectedFile, onFileSelect, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { error: toastError } = useToast();

  const validateFile = (file: File): boolean => {
    setValidationError(null);

    // Check extension and mime type
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    const isExtValid = ALLOWED_EXTENSIONS.includes(fileExt);
    const isMimeValid = ALLOWED_MIME_TYPES.includes(file.type);

    if (!isExtValid && !isMimeValid) {
      const msg = `Unsupported file format "${fileExt || file.type}". Allowed formats: JPG, JPEG, PNG, WEBP.`;
      setValidationError(msg);
      toastError(msg, 'Invalid File Type');
      return false;
    }

    // Check size limit (10MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const msg = `File size (${sizeMB} MB) exceeds maximum limit of 10 MB.`;
      setValidationError(msg);
      toastError(msg, 'File Too Large');
      return false;
    }

    return true;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        onFileSelect(file);
      } else {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        onFileSelect(file);
      } else {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    setValidationError(null);
    onFileSelect(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const previewUrl = selectedFile ? URL.createObjectURL(selectedFile) : null;

  return (
    <div className="w-full space-y-3">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={disabled}
      />

      {!selectedFile ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          aria-label="Upload inspection image by clicking or dragging and dropping"
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
            isDragging
              ? 'border-cyan-400 bg-cyan-500/15 ring-4 ring-cyan-500/20 scale-[1.01]'
              : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/60'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div
            className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-transform duration-200 ${
              isDragging
                ? 'bg-cyan-500/20 text-cyan-300 scale-110'
                : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
            }`}
          >
            <UploadCloud className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-200">
            Click to upload <span className="font-normal text-slate-400">or drag and drop</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1.5">PNG, JPG, JPEG, or WEBP (Max 10 MB)</p>
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 overflow-hidden min-w-0">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Selected upload preview"
                className="w-16 h-16 object-cover rounded-lg border border-slate-800 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                <FileImage className="w-8 h-8" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-200 truncate">{selectedFile.name}</p>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            aria-label="Remove selected image"
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:outline-none"
            title="Remove image"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Client-side Validation Inline Warning */}
      {validationError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2.5 animate-fadeIn"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
};
