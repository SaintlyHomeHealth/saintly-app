"use client";

import { useEffect, useRef, useState } from "react";

import { validatePhotoFiles } from "@/lib/crm/facility-photo-client";

export type PendingPhoto = {
  localId: string;
  file: File;
  previewUrl: string;
};

type FacilityPhotoPickerProps = {
  photos: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
  disabled?: boolean;
  label?: string;
};

export function FacilityPhotoPicker({
  photos,
  onChange,
  disabled = false,
  label = "Photos",
}: FacilityPhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      for (const p of photos) URL.revokeObjectURL(p.previewUrl);
    };
  }, [photos]);

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const incoming = Array.from(fileList);
    const merged = [...photos.map((p) => p.file), ...incoming];
    const validation = validatePhotoFiles(merged);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    const next = [
      ...photos,
      ...incoming.map((file) => ({
        localId: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ];
    onChange(next);
  }

  function removePhoto(localId: string) {
    const target = photos.find((p) => p.localId === localId);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(photos.filter((p) => p.localId !== localId));
  }

  return (
    <fieldset className={disabled ? "opacity-60" : ""}>
      <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p.localId} className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
            {!disabled ? (
              <button
                type="button"
                onClick={() => removePhoto(p.localId)}
                className="absolute right-0 top-0 rounded-bl-lg bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-bold text-white"
                aria-label="Remove photo"
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        {!disabled ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs font-semibold text-slate-600 hover:border-violet-300 hover:bg-violet-50"
          >
            + Add
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </fieldset>
  );
}

export function pendingPhotoFiles(photos: PendingPhoto[]): File[] {
  return photos.map((p) => p.file);
}
