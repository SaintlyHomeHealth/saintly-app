"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";

import { quickMarkLeadSpoke } from "@/app/admin/crm/actions";
import {
  LEAD_ACTIVITY_EVENT,
  leadActivityEventLabel,
  leadActivityThreadClasses,
} from "@/lib/crm/lead-activity-types";
import type { LeadActivityRow, UnifiedTimelineItem } from "@/lib/crm/lead-activities-timeline";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { refreshPreservingWindowScroll } from "@/lib/navigation/scroll-preserving-refresh";

import { highlightThreadKeywords } from "./lead-thread-highlight";

function formatWhen(iso: string): string {
  return formatAdminPhoneWhen(iso);
}

function formatCompactWhen(ms: number): string {
  return formatWhen(new Date(ms).toISOString());
}

function softenLegacyMeta(meta: string): string {
  const t = meta.trim();
  if (/^quick\s+note\b/i.test(t)) {
    return t.replace(/^quick\s+note\s+/i, "").trim() || t;
  }
  return t;
}

type RowKind = "note" | "contact" | "system";

function classifyDbEvent(eventType: string): RowKind {
  const t = eventType.trim().toLowerCase();
  if (t === LEAD_ACTIVITY_EVENT.manual_note) return "note";
  if (t === LEAD_ACTIVITY_EVENT.contact_attempt) return "contact";
  return "system";
}

function classifyLegacy(kind: string): RowKind {
  if (kind === "quick_note") return "note";
  if (kind === "contact_attempt") return "contact";
  return "system";
}

function NoteBubble(props: {
  author: string;
  time: string;
  children: ReactNode;
  deleteButton?: ReactNode;
  confirmHint?: boolean;
}) {
  return (
    <div className="flex justify-end">
      <div className="group relative max-w-[min(100%,22rem)]">
        <div className="rounded-2xl rounded-br-md bg-sky-500 px-3.5 py-2.5 text-[15px] leading-snug text-white shadow-sm">
          <div className="[&_strong]:font-semibold [&_strong]:text-sky-100">{props.children}</div>
          <div className="mt-1.5 flex items-center justify-end gap-2 text-[10px] text-sky-100/90">
            <span>{props.author}</span>
            <span className="tabular-nums opacity-90">{props.time}</span>
          </div>
        </div>
        {props.deleteButton ? (
          <div className="absolute -right-1 -top-1 opacity-0 transition-opacity group-hover:opacity-100">{props.deleteButton}</div>
        ) : null}
        {props.confirmHint ? (
          <p className="mt-1 text-right text-[10px] text-rose-600">Tap trash again to delete.</p>
        ) : null}
      </div>
    </div>
  );
}

function SystemLine(props: { time?: string; children: ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[min(100%,26rem)] text-[13px] leading-snug text-slate-600">
        {props.time ? <p className="text-[11px] tabular-nums text-slate-400">{props.time}</p> : null}
        <div className="mt-0.5 text-slate-700">{props.children}</div>
      </div>
    </div>
  );
}

function ContactLine(props: { time: string; children: ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[min(100%,26rem)] border-l-[3px] border-sky-400/70 pl-3 text-[13px] leading-snug text-slate-700">
        <p className="text-[11px] tabular-nums text-slate-400">{props.time}</p>
        <div className="mt-1 [&_strong]:font-semibold [&_strong]:text-slate-900">{props.children}</div>
      </div>
    </div>
  );
}

function LeadCommunicationActivityRow(props: {
  act: LeadActivityRow;
  leadId: string;
  when: string;
  who: string;
}) {
  const { act, leadId, when, who } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [feedback, setFeedback] = useState<null | { type: "ok" | "err"; message: string }>(null);

  const meta =
    act.metadata && typeof act.metadata === "object" && !Array.isArray(act.metadata)
      ? (act.metadata as Record<string, unknown>)
      : {};

  const isCall = act.event_type === LEAD_ACTIVITY_EVENT.communication_phone_call;
  const displayDir = typeof meta.display_direction === "string" ? meta.display_direction : "";
  const dirTitle =
    displayDir === "outgoing" ? "Outgoing call" : displayDir === "missed" ? "Missed call" : "Incoming call";
  const phoneRaw = typeof meta.phone_e164 === "string" ? meta.phone_e164.trim() : "";
  const phoneFmt = phoneRaw ? formatPhoneForDisplay(phoneRaw) || phoneRaw : "";
  const statusRaw = typeof meta.status === "string" ? meta.status.trim() : "";
  const dur =
    typeof meta.duration_seconds === "number" && Number.isFinite(meta.duration_seconds)
      ? meta.duration_seconds
      : null;
  const durLabel =
    dur != null && dur >= 0 ? (dur >= 60 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : `${dur}s`) : null;
  const preview = typeof meta.preview === "string" ? meta.preview.trim() : "";

  const tc = leadActivityThreadClasses(act.event_type);

  const openNoteComposer = () => {
    setFeedback(null);
    setShowNote(true);
    const seed = isCall
      ? `Re: ${dirTitle}${phoneFmt ? ` (${phoneFmt})` : ""} — `
      : `Re: SMS${phoneFmt ? ` (${phoneFmt})` : ""}${preview ? ` — ${preview.slice(0, 80)}` : ""} — `;
    setNoteText((t) => (t.trim() ? t : seed));
    requestAnimationFrame(() => {
      document.getElementById(`quick-note-${leadId}`)?.focus();
    });
  };

  const submitNote = () => {
    const t = noteText.trim();
    if (!t) {
      setFeedback({ type: "err", message: "Enter a note first." });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const res = await fetch("/api/crm/lead-activities/quick-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ leadId, quick_note: t }),
      });
      const r = (await res.json().catch(() => ({ ok: false as const }))) as { ok?: boolean };
      if (res.ok && r.ok) {
        setShowNote(false);
        setNoteText("");
        setFeedback({ type: "ok", message: "Note saved" });
        refreshPreservingWindowScroll(router);
        window.setTimeout(() => setFeedback(null), 1500);
      } else {
        setFeedback({
          type: "err",
          message: "Could not save note.",
        });
      }
    });
  };

  const markSpoke = () => {
    setFeedback(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("leadId", leadId);
      const r = await quickMarkLeadSpoke(fd);
      if (r.ok) {
        setFeedback({ type: "ok", message: "Marked as spoke" });
        refreshPreservingWindowScroll(router);
        window.setTimeout(() => setFeedback(null), 1500);
      } else {
        setFeedback({ type: "err", message: "Could not update." });
      }
    });
  };

  return (
    <div className="flex justify-start">
      <div
        className={`max-w-[min(100%,26rem)] rounded-xl border px-3 py-2.5 text-[13px] leading-snug shadow-sm ${tc.bubble}`}
      >
        <p className={`text-[10px] font-semibold uppercase tracking-wide ${tc.label}`}>
          {leadActivityEventLabel(act.event_type)}
        </p>
        <p className="text-[11px] tabular-nums text-slate-400">
          {when} · {who}
        </p>
        {isCall ? (
          <div className="mt-1.5 space-y-0.5 text-slate-800">
            <p className="font-semibold text-slate-900">{dirTitle}</p>
            {phoneFmt ? <p className="tabular-nums text-slate-700">{phoneFmt}</p> : null}
            <p className="text-xs text-slate-600">
              {durLabel ? <>Duration {durLabel}</> : <>Duration —</>}
              {statusRaw ? (
                <>
                  {" "}
                  · Status {statusRaw}
                </>
              ) : null}
            </p>
          </div>
        ) : (
          <p className="mt-1.5 text-slate-800">{act.body?.trim() || "SMS"}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={openNoteComposer}
            className="rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Add note
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={markSpoke}
            className="rounded-lg border border-emerald-200/90 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-950 shadow-sm hover:bg-emerald-100/90 disabled:opacity-50"
          >
            Mark spoke
          </button>
        </div>
        {showNote ? (
          <div className="mt-2 space-y-1.5 border-t border-slate-200/80 pt-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900"
              placeholder="Note about this touch…"
            />
            <button
              type="button"
              disabled={pending}
              onClick={submitNote}
              className="rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              Save note
            </button>
          </div>
        ) : null}
        {feedback ? (
          <p
            role="status"
            className={`mt-1.5 text-[11px] font-medium ${feedback.type === "ok" ? "text-emerald-800" : "text-rose-700"}`}
          >
            {feedback.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function LeadActivityThread(props: {
  leadId: string;
  items: UnifiedTimelineItem[];
  authorLabels: Record<string, string>;
  currentFollowUpLine?: string | null;
  currentNextActionLine?: string | null;
}) {
  const { leadId, items, authorLabels, currentFollowUpLine, currentNextActionLine } = props;
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const labelForUid = (uid: string | null | undefined) => {
    const u = typeof uid === "string" ? uid.trim() : "";
    return u ? (authorLabels[u] ?? `${u.slice(0, 8)}…`) : "System";
  };

  const empty =
    items.length === 0 && !currentFollowUpLine && !currentNextActionLine;

  return (
    <div className="relative">
      {empty ? <p className="mb-4 py-4 text-center text-sm text-slate-500">No activity yet.</p> : null}
      <ul className="space-y-3">
        {items.map((item) => {
          if (item.kind === "lead_created") {
            return (
              <li key="lead-created">
                <p className="text-center text-[11px] text-slate-400">Lead created · {formatCompactWhen(item.sortMs)}</p>
              </li>
            );
          }

          if (item.kind === "lead_application_notes") {
            return (
              <li key="lead-app-notes">
                <SystemLine time={formatCompactWhen(item.sortMs)}>
                  <span className="text-slate-500">On file · </span>
                  {highlightThreadKeywords(item.body)}
                </SystemLine>
              </li>
            );
          }

          if (item.kind === "legacy") {
            const seg = item.seg;
            const kind = classifyLegacy(seg.kind);
            const timeLine = softenLegacyMeta(seg.meta);
            const bodyText = seg.body?.trim() ?? "";

            if (kind === "note") {
              return (
                <li key={seg.id}>
                  <NoteBubble author="Team" time={timeLine || formatCompactWhen(seg.sortMs)}>
                    {bodyText ? highlightThreadKeywords(bodyText) : null}
                  </NoteBubble>
                </li>
              );
            }
            if (kind === "contact") {
              return (
                <li key={seg.id}>
                  <ContactLine time={timeLine || formatCompactWhen(seg.sortMs)}>
                    {bodyText ? highlightThreadKeywords(bodyText) : <span className="text-slate-500">—</span>}
                  </ContactLine>
                </li>
              );
            }
            return (
              <li key={seg.id}>
                <SystemLine time={timeLine || formatCompactWhen(seg.sortMs)}>
                  {bodyText ? highlightThreadKeywords(bodyText) : <span className="text-slate-400">—</span>}
                </SystemLine>
              </li>
            );
          }

          const act = item.activity;
          const when = formatWhen(act.created_at);
          const who = labelForUid(act.created_by_user_id);

          if (
            act.event_type === LEAD_ACTIVITY_EVENT.communication_phone_call ||
            act.event_type === LEAD_ACTIVITY_EVENT.communication_sms
          ) {
            return (
              <li key={act.id}>
                <LeadCommunicationActivityRow act={act} leadId={leadId} when={when} who={who} />
              </li>
            );
          }

          const canDelete = act.deletable && act.event_type === LEAD_ACTIVITY_EVENT.manual_note;
          const kind = classifyDbEvent(act.event_type);
          const body = (act.body ?? "").trim();

          const deleteBtn = canDelete ? (
            <button
              type="button"
              disabled={pending}
              className="rounded-full bg-white/90 p-1.5 text-slate-500 shadow-sm hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
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
                    refreshPreservingWindowScroll(router);
                  }
                });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : null;

          if (kind === "note") {
            return (
              <li key={act.id}>
                <NoteBubble
                  author={who}
                  time={when}
                  deleteButton={deleteBtn}
                  confirmHint={canDelete && confirmId === act.id}
                >
                  {body ? highlightThreadKeywords(body) : null}
                </NoteBubble>
              </li>
            );
          }

          if (kind === "contact") {
            return (
              <li key={act.id}>
                <ContactLine time={`${when} · ${who}`}>{body ? highlightThreadKeywords(body) : null}</ContactLine>
              </li>
            );
          }

          return (
            <li key={act.id}>
              <SystemLine time={`${when} · ${who}`}>{body ? highlightThreadKeywords(body) : null}</SystemLine>
            </li>
          );
        })}
        {currentFollowUpLine ? (
          <li>
            <SystemLine>{currentFollowUpLine}</SystemLine>
          </li>
        ) : null}
        {currentNextActionLine ? (
          <li>
            <SystemLine>{currentNextActionLine}</SystemLine>
          </li>
        ) : null}
      </ul>
      <div ref={endRef} id="lead-thread-end" className="h-1 scroll-mt-24" />
    </div>
  );
}
