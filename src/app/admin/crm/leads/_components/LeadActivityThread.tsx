"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";

import { LEAD_ACTIVITY_EVENT } from "@/lib/crm/lead-activity-types";
import type { UnifiedTimelineItem } from "@/lib/crm/lead-activities-timeline";

import { highlightThreadKeywords } from "./lead-thread-highlight";

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

function formatCompactWhen(ms: number): string {
  return formatWhen(new Date(ms).toISOString());
}

/** Strip noisy prefix from legacy quick-note meta for a cleaner time line. */
function softenLegacyMeta(meta: string): string {
  const t = meta.trim();
  if (/^quick\s+note\b/i.test(t)) {
    return t.replace(/^quick\s+note\s+/i, "").trim() || t;
  }
  return t;
}

type RowTone = "message" | "call" | "system";

function classifyDbEvent(eventType: string): RowTone {
  const t = eventType.trim().toLowerCase();
  if (t === LEAD_ACTIVITY_EVENT.manual_note) return "message";
  if (t === LEAD_ACTIVITY_EVENT.contact_attempt) return "call";
  return "system";
}

function classifyLegacy(kind: string): RowTone {
  if (kind === "quick_note") return "message";
  if (kind === "contact_attempt") return "call";
  return "system";
}

function MessageRow(props: {
  author: string;
  time: string;
  children: ReactNode;
  tone: "message" | "call";
  deleteButton?: ReactNode;
  footer?: ReactNode;
}) {
  const { author, time, children, tone, deleteButton, footer } = props;
  const callAccent = tone === "call" ? "border-l-[3px] border-sky-400/45 pl-3" : "";
  return (
    <div className={`group relative ${callAccent}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold tracking-tight text-slate-900">{author}</span>
            <span className="text-[11px] font-normal tabular-nums text-slate-400">{time}</span>
          </div>
          <div className="mt-1.5 text-[15px] leading-snug text-slate-800">{children}</div>
          {footer}
        </div>
        {deleteButton ? (
          <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">{deleteButton}</div>
        ) : null}
      </div>
    </div>
  );
}

function SystemRow(props: { time: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] tabular-nums text-slate-400">{props.time}</p>
      <div className="text-[13px] leading-relaxed text-slate-500">{props.children}</div>
    </div>
  );
}

export function LeadActivityThread(props: {
  leadId: string;
  items: UnifiedTimelineItem[];
  authorLabels: Record<string, string>;
}) {
  const { leadId, items, authorLabels } = props;
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const labelForUid = (uid: string | null | undefined) => {
    const u = typeof uid === "string" ? uid.trim() : "";
    return u ? (authorLabels[u] ?? `${u.slice(0, 8)}…`) : "System";
  };

  return (
    <div className="relative">
      <div className="border-l border-slate-200/80 pl-4">
        <ul className="space-y-6">
          {items.map((item) => {
            if (item.kind === "lead_created") {
              return (
                <li key="lead-created" className="relative">
                  <p className="text-[12px] leading-relaxed text-slate-400">
                    Lead created · {formatCompactWhen(item.sortMs)}
                  </p>
                </li>
              );
            }

            if (item.kind === "lead_application_notes") {
              return (
                <li key="lead-app-notes" className="relative">
                  <MessageRow author="On file" time={formatCompactWhen(item.sortMs)} tone="message">
                    {highlightThreadKeywords(item.body)}
                  </MessageRow>
                </li>
              );
            }

            if (item.kind === "legacy") {
              const seg = item.seg;
              const tone = classifyLegacy(seg.kind);
              const timeLine = softenLegacyMeta(seg.meta);
              const bodyText = seg.body?.trim() ?? "";

              if (tone === "message") {
                return (
                  <li key={seg.id} className="relative">
                    <MessageRow author="Team" time={timeLine || formatCompactWhen(seg.sortMs)} tone="message">
                      {bodyText ? highlightThreadKeywords(bodyText) : null}
                    </MessageRow>
                  </li>
                );
              }
              if (tone === "call") {
                return (
                  <li key={seg.id} className="relative">
                    <MessageRow author="Call" time={timeLine || formatCompactWhen(seg.sortMs)} tone="call">
                      {bodyText ? highlightThreadKeywords(bodyText) : <span className="text-slate-500">—</span>}
                    </MessageRow>
                  </li>
                );
              }
              return (
                <li key={seg.id} className="relative">
                  <SystemRow time={timeLine || formatCompactWhen(seg.sortMs)}>
                    {bodyText ? highlightThreadKeywords(bodyText) : <span className="text-slate-400">—</span>}
                  </SystemRow>
                </li>
              );
            }

            const act = item.activity;
            const when = formatWhen(act.created_at);
            const who = labelForUid(act.created_by_user_id);
            const canDelete = act.deletable && act.event_type === LEAD_ACTIVITY_EVENT.manual_note;
            const tone = classifyDbEvent(act.event_type);
            const body = (act.body ?? "").trim();

            const deleteBtn = canDelete ? (
              <button
                type="button"
                disabled={pending}
                className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                title="Delete note"
                aria-label="Delete note"
                onClick={() => {
                  if (confirmId !== act.id) {
                    setConfirmId(act.id);
                    return;
                  }
                  startTransition(async () => {
                    const res = await fetch("/api/crm/lead-activities/delete", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "same-origin",
                      body: JSON.stringify({ leadId, activityId: act.id }),
                    });
                    const r = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean };
                    if (res.ok && r.ok) {
                      setConfirmId(null);
                      router.refresh();
                    }
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null;

            if (tone === "message") {
              return (
                <li key={act.id} className="relative">
                  <MessageRow
                    author={who}
                    time={when}
                    tone="message"
                    deleteButton={deleteBtn}
                    footer={
                      canDelete && confirmId === act.id ? (
                        <p className="mt-2 text-[11px] text-rose-700/90">Tap again to delete.</p>
                      ) : null
                    }
                  >
                    {body ? highlightThreadKeywords(body) : null}
                  </MessageRow>
                </li>
              );
            }

            if (tone === "call") {
              return (
                <li key={act.id} className="relative">
                  <MessageRow author={who} time={when} tone="call">
                    {body ? highlightThreadKeywords(body) : null}
                  </MessageRow>
                </li>
              );
            }

            return (
              <li key={act.id} className="relative">
                <SystemRow time={`${when} · ${who}`}>{body ? highlightThreadKeywords(body) : null}</SystemRow>
              </li>
            );
          })}
        </ul>
      </div>
      <div ref={endRef} id="lead-thread-end" className="h-1 scroll-mt-24" />
    </div>
  );
}
