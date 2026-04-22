"use client";

import { useRouter } from "next/navigation";
import { memo, useCallback, useState } from "react";
import { Trash2, Voicemail } from "lucide-react";

import { deleteWorkspaceSmsMessage } from "@/app/workspace/phone/inbox/actions";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { formatDurationSeconds } from "@/lib/crm/patient-hub-detail-display";

export type VoicemailThreadDetail = {
  durationSeconds: number | null;
  transcript: string | null;
};

type Props = {
  conversationId: string;
  messageId: string;
  phoneCallId: string;
  createdAt: string | null;
  body: string | null;
  detail: VoicemailThreadDetail | undefined;
  /** Workspace thread layout (narrow bubbles vs full width). */
  appDesktopSplit?: boolean;
};

export const VoicemailThreadMessageRow = memo(function VoicemailThreadMessageRow({
  conversationId,
  messageId,
  phoneCallId,
  createdAt,
  body,
  detail,
  appDesktopSplit = false,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const when = formatAdminPhoneWhen(typeof createdAt === "string" ? createdAt : null);
  const durationLabel =
    detail?.durationSeconds != null && Number.isFinite(detail.durationSeconds)
      ? formatDurationSeconds(detail.durationSeconds)
      : null;
  const transcript =
    detail?.transcript != null && String(detail.transcript).trim() !== ""
      ? String(detail.transcript).trim()
      : null;

  const onDelete = useCallback(async () => {
    if (busy) return;
    const ok = window.confirm("Delete this voicemail from the thread? The call log stays; audio may be removed after retention.");
    if (!ok) return;
    setBusy(true);
    try {
      const res = await deleteWorkspaceSmsMessage(conversationId, messageId);
      if (!res.ok) {
        window.alert(
          res.error === "forbidden"
            ? "You do not have permission to delete this message."
            : "Could not delete this voicemail. Try again."
        );
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, conversationId, messageId, router]);

  return (
    <div className="flex w-full flex-col items-start gap-0.5 sm:gap-1">
      <div
        className={`relative max-w-[min(92%,22rem)] rounded-[1.05rem] rounded-bl-md border border-sky-200/80 bg-gradient-to-b from-white to-sky-50/40 px-3 pb-2 pt-2.5 text-slate-900 shadow-sm shadow-sky-900/[0.04] sm:rounded-[1.25rem] sm:px-4 sm:pb-2.5 sm:pt-3 ${
          appDesktopSplit ? "max-w-none sm:max-w-[min(92%,28rem)]" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Voicemail className="h-4 w-4 shrink-0 text-sky-700" aria-hidden />
            <p className="truncate text-[13px] font-semibold text-slate-900 sm:text-sm">
              {body?.trim() || "Voicemail"}
              {durationLabel ? ` · ${durationLabel}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onDelete()}
            disabled={busy}
            className="shrink-0 rounded-md border border-rose-200/80 bg-white/90 p-1.5 text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-50 sm:opacity-100"
            title="Delete voicemail"
            aria-label="Delete voicemail"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <audio
          controls
          preload="metadata"
          className="mt-2 w-full"
          src={`/api/workspace/phone/voicemail/${phoneCallId}/audio`}
        >
          Your browser does not support audio playback.
        </audio>

        {transcript ? (
          <p className="mt-2 rounded-lg border border-sky-100/90 bg-white/80 px-2.5 py-2 text-[11px] leading-snug text-slate-800">
            {transcript}
          </p>
        ) : null}
      </div>
      <p className="px-1 text-[10px] font-medium tabular-nums tracking-wide text-slate-400">{when}</p>
    </div>
  );
});
