"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { deleteLeadActivity } from "@/app/admin/crm/actions";
import { leadActivityEventLabel, leadActivityThreadClasses } from "@/lib/crm/lead-activity-types";
import type { UnifiedTimelineItem } from "@/lib/crm/lead-activities-timeline";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LeadActivityThread(props: {
  leadId: string;
  items: UnifiedTimelineItem[];
  authorLabel: (userId: string | null | undefined) => string;
}) {
  const { leadId, items, authorLabel } = props;
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="relative">
      <div className="absolute bottom-0 left-[11px] top-0 w-px bg-slate-200/90" aria-hidden />
      <ul className="relative space-y-3">
        {items.map((item) => {
          if (item.kind === "lead_created") {
            return (
              <li key="lead-created" className="relative flex gap-3 pl-1">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300 ring-4 ring-white" />
                <div className="min-w-0 flex-1 rounded-2xl border border-slate-200/90 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">Lead created</p>
                  <p className="mt-0.5 tabular-nums text-[11px] text-slate-500">{formatWhen(new Date(item.sortMs).toISOString())}</p>
                </div>
              </li>
            );
          }
          if (item.kind === "lead_application_notes") {
            return (
              <li key="lead-app-notes" className="relative flex gap-3 pl-1">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300 ring-4 ring-white" />
                <div className="min-w-0 flex-1 rounded-2xl border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lead record notes</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{item.body}</p>
                </div>
              </li>
            );
          }
          if (item.kind === "legacy") {
            const seg = item.seg;
            const isQuick = seg.kind === "quick_note";
            const tone = isQuick
              ? { rail: "bg-slate-300", bubble: "border-slate-200/90 bg-white", label: "text-slate-600" }
              : { rail: "bg-sky-400/90", bubble: "border-sky-200/90 bg-sky-50/80", label: "text-sky-900" };
            return (
              <li key={seg.id} className="relative flex gap-3 pl-1">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.rail} ring-4 ring-white`} />
                <div className={`min-w-0 flex-1 rounded-2xl border px-3 py-2.5 shadow-sm ${tone.bubble}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${tone.label}`}>
                      {isQuick ? "Quick note (legacy log)" : seg.kind === "contact_attempt" ? "Contact attempt (legacy log)" : "Note (legacy)"}
                    </p>
                    <p className="text-[10px] tabular-nums text-slate-400">{seg.meta}</p>
                  </div>
                  {seg.body ? (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{seg.body}</p>
                  ) : null}
                </div>
              </li>
            );
          }
          const act = item.activity;
          const cls = leadActivityThreadClasses(act.event_type);
          const label = leadActivityEventLabel(act.event_type);
          const when = formatWhen(act.created_at);
          const who = authorLabel(act.created_by_user_id);
          const canDelete = act.deletable && act.event_type === "manual_note";

          return (
            <li key={act.id} className="relative flex gap-3 pl-1">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cls.rail} ring-4 ring-white`} />
              <div className={`min-w-0 flex-1 rounded-2xl border px-3 py-2.5 shadow-sm ${cls.bubble}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${cls.label}`}>{label}</p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-slate-400">
                      {when} · {who}
                    </p>
                  </div>
                  {canDelete ? (
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                      title="Delete note"
                      aria-label="Delete note"
                      onClick={() => {
                        if (confirmId !== act.id) {
                          setConfirmId(act.id);
                          return;
                        }
                        startTransition(async () => {
                          const fd = new FormData();
                          fd.set("leadId", leadId);
                          fd.set("activityId", act.id);
                          const r = await deleteLeadActivity(fd);
                          if (r.ok) {
                            setConfirmId(null);
                            router.refresh();
                          }
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                {canDelete && confirmId === act.id ? (
                  <p className="mt-2 text-[11px] font-medium text-rose-800">Click again to confirm delete.</p>
                ) : null}
                {act.body ? (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{act.body}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <div ref={endRef} id="lead-thread-end" className="h-1 scroll-mt-24" />
    </div>
  );
}
