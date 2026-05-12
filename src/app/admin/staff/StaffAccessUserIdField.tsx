"use client";

import { CopyTextButton } from "@/components/credentialing/CopyTextButton";

/**
 * Compact auth UID row for Staff Access (admin/super_admin only).
 * Clipboard receives the raw UUID only (see CopyTextButton).
 */
export function StaffAccessUserIdField({
  userId,
  label = "User ID",
}: {
  userId: string | null | undefined;
  label?: string;
}) {
  const uid = typeof userId === "string" ? userId.trim() : "";
  if (!uid) {
    return (
      <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="shrink-0 text-[10px] font-semibold text-slate-500">{label}</span>
        <span className="text-[10px] text-slate-400">— (no login)</span>
      </div>
    );
  }

  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="shrink-0 text-[10px] font-semibold text-slate-500">{label}</span>
      <div className="min-w-0 max-w-full flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
        <code className="block whitespace-nowrap font-mono text-[10px] leading-snug text-slate-700 [overflow-wrap:normal]">
          {uid}
        </code>
      </div>
      <CopyTextButton text={uid} label="Copy ID" className="shrink-0" />
    </div>
  );
}
