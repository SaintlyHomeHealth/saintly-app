"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { syncLegacyRecruitingCandidatesAction } from "@/app/admin/recruiting/actions";

const btnCls =
  "inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export function SyncLegacyRecruitingCandidatesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function runSync() {
    setMessage(null);
    startTransition(async () => {
      const result = await syncLegacyRecruitingCandidatesAction();
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      const detail =
        result.synced > 0
          ? `Synced ${result.synced} legacy record${result.synced === 1 ? "" : "s"}.`
          : "No unlinked legacy records needed syncing.";
      setMessage(detail);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" className={btnCls} disabled={pending} onClick={runSync}>
        {pending ? "Syncing…" : "Sync legacy uploads"}
      </button>
      {message ? (
        <p className="max-w-xs text-right text-[11px] font-medium text-slate-600" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
