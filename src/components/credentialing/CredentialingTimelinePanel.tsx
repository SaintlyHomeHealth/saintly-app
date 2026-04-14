"use client";

import { useCallback, useState } from "react";

import {
  formatCredentialingActivityTypeLabel,
  PAYER_CREDENTIALING_ACTIVITY_TYPES,
} from "@/lib/crm/credentialing-activity-types";
import { CREDENTIALING_DISPLAY_TIMEZONE, formatCredentialingDateTime } from "@/lib/crm/credentialing-datetime";

type ActivityRow = {
  id: string;
  activity_type: string;
  summary: string;
  details: string | null;
  created_at: string;
  created_by_user_id: string | null;
};

function bubbleBody(a: ActivityRow): string {
  const d = a.details?.trim();
  if (d) return d;
  return (a.summary ?? "").trim() || "—";
}

function isBlueBubble(activityType: string): boolean {
  const t = activityType.trim();
  return t === "note" || t === PAYER_CREDENTIALING_ACTIVITY_TYPES.manual_note;
}

export function CredentialingTimelinePanel({
  conversation,
  system,
  actorLabels,
  viewerUserId,
}: {
  conversation: ActivityRow[];
  system: ActivityRow[];
  actorLabels: Record<string, string>;
  viewerUserId: string;
}) {
  const [showSystem, setShowSystem] = useState(false);

  const hasSystem = system.length > 0;

  const actorName = useCallback(
    (userId: string | null) => {
      if (!userId) return "System";
      if (userId === viewerUserId) return "You";
      return actorLabels[userId] ?? "Staff";
    },
    [actorLabels, viewerUserId]
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-slate-100/80">
      <div className="shrink-0 border-b border-slate-200/80 bg-white/95 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Your notes first · Times in {CREDENTIALING_DISPLAY_TIMEZONE}
            </p>
          </div>
          {hasSystem ? (
            <label className="inline-flex cursor-pointer select-none items-center gap-2 text-[11px] font-medium text-slate-600">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                checked={showSystem}
                onChange={(e) => setShowSystem(e.target.checked)}
              />
              Show system activity
            </label>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {conversation.length === 0 ? (
            <p className="px-2 text-center text-sm text-slate-500">
              No notes yet. Send a quick update below — calls, emails, and next steps stay here.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {conversation.map((a) => {
                const when = formatCredentialingDateTime(a.created_at);
                const who = actorName(a.created_by_user_id);
                const body = bubbleBody(a);
                const blue = isBlueBubble(a.activity_type);

                return (
                  <li key={a.id} className="flex w-full flex-col items-end gap-1">
                    {blue ? (
                      <div className="max-w-[85%] rounded-[1.25rem] rounded-br-md bg-[#007AFF] px-4 py-2.5 text-white shadow-md sm:max-w-[75%]">
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-snug [word-break:break-word]">
                          {body}
                        </p>
                      </div>
                    ) : (
                      <div className="max-w-[85%] rounded-[1.25rem] rounded-br-md bg-gradient-to-b from-emerald-600 to-emerald-700 px-4 py-2.5 text-white shadow-md sm:max-w-[75%]">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-100/95">
                          Follow-up
                        </p>
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-snug [word-break:break-word]">
                          {body}
                        </p>
                      </div>
                    )}
                    <div className="flex max-w-[85%] flex-wrap items-center justify-end gap-x-2 gap-y-0.5 pr-1 text-[11px] text-slate-500 sm:max-w-[75%]">
                      <span className="tabular-nums">{when}</span>
                      <span className="text-slate-400">·</span>
                      <span className={who === "You" ? "font-semibold text-slate-600" : ""}>{who}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {showSystem && hasSystem ? (
            <div className="mt-6 border-t border-slate-200/90 pt-4">
              <p className="mb-3 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">System</p>
              <ul className="flex flex-col gap-2">
                {system.map((a) => {
                  const when = formatCredentialingDateTime(a.created_at);
                  const who = actorName(a.created_by_user_id);
                  const label = formatCredentialingActivityTypeLabel(a.activity_type);
                  return (
                    <li key={a.id} className="flex w-full justify-start">
                      <div className="max-w-full rounded-2xl border border-slate-200/80 bg-slate-100/90 px-3 py-2 text-[11px] leading-snug text-slate-600">
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                          <span className="font-medium text-slate-700">{a.summary}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-400">{label}</span>
                          <span className="text-slate-400">·</span>
                          <span className="tabular-nums text-slate-400">{when}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-slate-500">{who}</span>
                        </div>
                        {a.details?.trim() ? (
                          <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-[11px] text-slate-500">
                            {a.details.trim()}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
