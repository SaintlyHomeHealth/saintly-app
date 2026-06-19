"use client";

import { HEADSHOT_IMAGE_ACCEPT, HEADSHOT_MISSING_STATUS } from "@/lib/employee-headshot";

import { useEmployeeHeadshotAdmin } from "./employee-headshot-admin-context";

type AvatarProps = {
  size?: "sm" | "lg";
  showUploadAction?: boolean;
  className?: string;
};

export function EmployeeHeadshotAdminAvatar({
  size = "sm",
  showUploadAction = true,
  className = "",
}: AvatarProps) {
  const {
    displayName,
    initials,
    headshotViewUrl,
    canManageDocuments,
    isUploading,
    uploadError,
    uploadActionLabel,
    onFileInputChange,
    triggerFilePicker,
    fileInputRef,
  } = useEmployeeHeadshotAdmin();

  const dimensionClass = size === "lg" ? "h-24 w-24" : "h-16 w-16";
  const initialsClass = size === "lg" ? "text-xl" : "text-lg";

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div
        className={`${dimensionClass} flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-sm`}
      >
        {headshotViewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={headshotViewUrl}
            alt={`${displayName} headshot`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className={`${initialsClass} font-bold text-slate-600`}>{initials}</span>
        )}
      </div>

      {showUploadAction && canManageDocuments ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept={HEADSHOT_IMAGE_ACCEPT}
            className="hidden"
            onChange={onFileInputChange}
          />
          <button
            type="button"
            onClick={triggerFilePicker}
            disabled={isUploading}
            className="text-xs font-semibold text-sky-700 underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? "Uploading..." : uploadActionLabel}
          </button>
        </>
      ) : null}

      {uploadError ? <p className="max-w-[12rem] text-center text-[11px] text-red-700">{uploadError}</p> : null}
    </div>
  );
}

type IdentityColumnProps = {
  name: string;
  roleLine: string;
  statusLabel: string;
  statusBadgeClass: string;
  email: string;
  phone: string | null;
  hireDateLabel: string;
  hireDateDisplay: string;
};

export function EmployeeAdminSnapshotIdentityColumn({
  name,
  roleLine,
  statusLabel,
  statusBadgeClass,
  email,
  phone,
  hireDateLabel,
  hireDateDisplay,
}: IdentityColumnProps) {
  const { headshotMissing } = useEmployeeHeadshotAdmin();

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-start gap-3">
        <EmployeeHeadshotAdminAvatar size="sm" />
        <div className="min-w-0 flex-1 space-y-2">
          <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl [overflow-wrap:anywhere]">
            {name}
          </h1>
          <p className="text-sm text-slate-600 [overflow-wrap:anywhere]">{roleLine}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClass}`}
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </div>
      {headshotMissing ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900">
          {HEADSHOT_MISSING_STATUS}
        </p>
      ) : null}
      <div className="space-y-1 text-xs text-slate-600">
        <p className="[overflow-wrap:anywhere]">
          <span className="font-semibold text-slate-500">Email </span>
          {email}
        </p>
        {phone ? (
          <p className="[overflow-wrap:anywhere]">
            <span className="font-semibold text-slate-500">Phone </span>
            {phone}
          </p>
        ) : null}
        <p className="text-slate-500 [overflow-wrap:anywhere]">
          <span className="font-semibold text-slate-500">{hireDateLabel} </span>
          <span className="text-slate-800">{hireDateDisplay}</span>
        </p>
      </div>
    </div>
  );
}
