"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

import { deleteRecruitingCandidateActivity } from "@/app/admin/recruiting/actions";
import type { RecruitingTimelineEntry } from "@/lib/recruiting/recruiting-timeline";
import { formatRecruitingTimelineTimestamp } from "@/lib/recruiting/recruiting-timeline";

import { RecruitingNoteComposer } from "./RecruitingNoteComposer";

export function RecruitingTimelinePanel(props: {
  candidateId: string;
  entries: RecruitingTimelineEntry[];
  actorLabels: Record<string, string>;
  viewerUserId: string;
}) {
  const { candidateId, entries, actorLabels, viewerUserId } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const actorName = useCallback(
    (userId: string | null) => {
      if (!userId) return "System";
      if (userId === viewerUserId) return "You";
      return actorLabels[userId] ?? "Staff";
    },
    [actorLabels, viewerUserId]
  );

  const requestDelete = useCallback(
    (entry: RecruitingTimelineEntry) => {
      if (!entry.deletable || pending) return;
      if (
        !confirm(
          "Remove this timeline entry? Contact roll-up times will be recalculated from remaining activity."
        )
      ) {
        return;
      }
      startTransition(async () => {
        const res = await deleteRecruitingCandidateActivity({
          candidateId,
          activityId: entry.id,
        });
        if (!res.ok) {
          window.alert(res.message);
          return;
        }
        router.refresh();
      });
    },
    [candidateId, pending, router]
  );

  return (
    <section
      aria-label="Communication timeline"
      className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-sm"
    >
      <div className="shrink-0 border-b border-slate-200/80 bg-white/90 px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold text-slate-900">Timeline</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Notes in blue · Quick-logged outcomes in gray · Times in Phoenix
        </p>
      </div>

      <div className="min-h-0 max-h-[min(52vh,24rem)] flex-1 overflow-y-auto bg-slate-100/80 px-3 py-3 sm:px-4">
        <div className="mx-auto max-w-3xl space-y-2.5">
          {entries.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-slate-500">
              No messages yet. Save a note below or use quick actions — everything stays on this thread.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {entries.map((e) => {
                const when = formatRecruitingTimelineTimestamp(e.created_at);
                const who = actorName(e.created_by);
                const showDelete = e.deletable;

                if (e.kind === "note") {
                  return (
                    <li key={e.id} className="group/tl relative flex w-full flex-col items-end gap-1">
                      <div className="max-w-[85%] rounded-[1.25rem] rounded-br-md bg-[#007AFF] px-4 py-2.5 text-white shadow-md sm:max-w-[75%]">
                        <p className="whitespace-pre-wrap break-words text-[15px] leading-snug [word-break:break-word]">
                          {e.body}
                        </p>
                      </div>
                      <div className="flex max-w-[85%] flex-wrap items-center justify-end gap-x-2 gap-y-0.5 pr-1 text-[10px] tabular-nums text-slate-500 sm:max-w-[75%]">
                        {showDelete ? (
                          <button
                            type="button"
                            title="Remove entry"
                            aria-label="Remove timeline entry"
                            disabled={pending}
                            onClick={() => requestDelete(e)}
                            className="order-last -mr-0.5 inline-flex shrink-0 rounded-full p-0.5 text-slate-400 opacity-0 transition hover:bg-slate-200/90 hover:text-rose-700 group-hover/tl:opacity-100 disabled:opacity-30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        <span>{when}</span>
                        <span className="text-slate-400">·</span>
                        <span className={who === "You" ? "font-semibold text-slate-600" : ""}>{who}</span>
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={e.id} className="group/tl relative flex w-full justify-start">
                    <div className="relative max-w-[min(100%,28rem)] rounded-2xl border border-slate-200/90 bg-slate-50 px-3 py-2 pr-8 text-[12px] leading-snug text-slate-700 shadow-sm">
                      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                        <span className="font-medium text-slate-800">{e.headline}</span>
                        <span className="text-[10px] tabular-nums text-slate-400">{when}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-[10px] text-slate-500">{who}</span>
                      </div>
                      {e.body ? (
                        <p className="mt-1.5 whitespace-pre-wrap break-words text-[12px] text-slate-600">{e.body}</p>
                      ) : null}
                      {showDelete ? (
                        <button
                          type="button"
                          title="Remove entry"
                          aria-label="Remove timeline entry"
                          disabled={pending}
                          onClick={() => requestDelete(e)}
                          className="absolute right-1.5 top-1.5 inline-flex rounded-full p-0.5 text-slate-400 opacity-0 transition hover:bg-white hover:text-rose-700 group-hover/tl:opacity-100 disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200/80 bg-white px-4 py-3 sm:px-5">
        <label
          className="mb-2 block text-[11px] font-semibold text-slate-700"
          htmlFor={`recruiting-note-${candidateId}`}
        >
          Add note
        </label>
        <RecruitingNoteComposer candidateId={candidateId} />
      </div>
    </section>
  );
}
