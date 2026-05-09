"use client";

import { Pencil } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  incrementLeadCallAttemptFromList,
  setLeadCallAttemptCountFromList,
} from "@/app/admin/crm/actions";
import {
  crmActionBtnMuted,
  crmActionBtnSky,
  crmFilterInputCls,
} from "@/components/admin/crm-admin-list-styles";
import type { CrmLeadRow } from "@/lib/crm/crm-leads-table-helpers";

const NOTE_MAX = 4000;

function normalizeAttemptCount(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.max(0, Math.floor(v));
  }
  return 0;
}

function addNoteButtonCls(compact?: boolean): string {
  return compact
    ? "inline-flex w-fit max-w-full items-center justify-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-semibold text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
    : "inline-flex w-fit max-w-full items-center justify-center rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50";
}

function attemptIncBtnCls(compact?: boolean): string {
  return compact
    ? "inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-1.5 py-px text-[9px] font-semibold text-slate-800 shadow-sm hover:border-sky-300 hover:bg-sky-50/80 disabled:opacity-50"
    : "inline-flex shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-800 shadow-sm hover:border-sky-300 hover:bg-sky-50/80 disabled:opacity-50";
}

function attemptsPillCls(compact?: boolean): string {
  return compact
    ? "inline-flex shrink-0 items-center rounded-full border border-slate-200/90 bg-slate-50 px-1.5 py-px text-[9px] font-semibold tabular-nums text-slate-800"
    : "inline-flex shrink-0 items-center rounded-full border border-slate-200/90 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-800";
}

export function LeadListRowQuickNote({
  leadId,
  compact,
  onToast,
}: {
  leadId: string;
  compact?: boolean;
  onToast: (t: { type: "ok" | "err"; message: string }) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function cancel() {
    setText("");
    setOpen(false);
  }

  const save = useCallback(() => {
    const trimmed = text.trim().slice(0, NOTE_MAX);
    if (!trimmed) {
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/crm/lead-activities/quick-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ leadId, quick_note: trimmed }),
      });
      const r = (await res.json().catch(() => ({ ok: false as const }))) as {
        ok: boolean;
        error?: string;
      };
      if (res.ok && r.ok) {
        setText("");
        setOpen(false);
        onToast({ type: "ok", message: "Note added" });
        router.refresh();
        return;
      }
      onToast({ type: "err", message: "Could not save note. Please try again." });
    });
  }, [leadId, onToast, router, text]);

  if (open) {
    return (
      <div className="flex min-w-0 w-full max-w-[16.5rem] flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
        <textarea
          value={text}
          maxLength={NOTE_MAX}
          onChange={(e) => setText(e.target.value)}
          rows={compact ? 2 : 2}
          placeholder="Add quick note…"
          disabled={pending}
          className={`${crmFilterInputCls} min-h-[44px] w-full resize-y ${compact ? "text-[10px]" : "text-[11px]"}`}
          aria-label="Quick note"
        />
        <div className="flex flex-wrap gap-1">
          <button type="button" className={crmActionBtnSky} onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" className={crmActionBtnMuted} onClick={cancel} disabled={pending}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" className={addNoteButtonCls(compact)} onClick={() => setOpen(true)} title="Add a quick note">
      Add note
    </button>
  );
}

function LeadListRowCallAttempts({
  leadId,
  row,
  compact,
  onCountCommitted,
  onToast,
}: {
  leadId: string;
  row: CrmLeadRow;
  compact?: boolean;
  onCountCommitted: (leadId: string, next: number) => void;
  onToast: (t: { type: "ok" | "err"; message: string }) => void;
}) {
  const initial = normalizeAttemptCount(row.call_attempt_count);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(initial));
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setDraft(String(normalizeAttemptCount(row.call_attempt_count)));
  }, [row.call_attempt_count]);

  const incCls = attemptIncBtnCls(compact);
  const pillCls = attemptsPillCls(compact);

  function bump() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("leadId", leadId);
      const r = await incrementLeadCallAttemptFromList(fd);
      if (!r.ok) {
        onToast({
          type: "err",
          message: "Could not update attempts. Please try again.",
        });
        return;
      }
      onCountCommitted(leadId, r.call_attempt_count);
      onToast({ type: "ok", message: "Attempt logged" });
    });
  }

  function cancelEdit() {
    setDraft(String(normalizeAttemptCount(row.call_attempt_count)));
    setEditing(false);
  }

  function saveEdit() {
    const prevStored = normalizeAttemptCount(row.call_attempt_count);
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("call_attempt_count", draft.trim());
    startTransition(async () => {
      const r = await setLeadCallAttemptCountFromList(fd);
      if (!r.ok) {
        if (r.error === "invalid_count") {
          onToast({ type: "err", message: "Use a whole number 0 or higher." });
          return;
        }
        onToast({
          type: "err",
          message: "Could not save attempts. Please try again.",
        });
        return;
      }
      onCountCommitted(leadId, r.call_attempt_count);
      setEditing(false);
      if (prevStored !== r.call_attempt_count) {
        onToast({ type: "ok", message: "Attempts updated" });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5" onClick={(e) => e.stopPropagation()}>
      {editing ? (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
            disabled={pending}
            className={`${crmFilterInputCls} w-12 tabular-nums ${compact ? "text-[10px]" : "text-[11px]"}`}
            aria-label="Call attempt count"
          />
          <button type="button" className={crmActionBtnSky} onClick={saveEdit} disabled={pending}>
            OK
          </button>
          <button type="button" className={crmActionBtnMuted} onClick={cancelEdit} disabled={pending}>
            Cancel
          </button>
        </div>
      ) : (
        <>
          <span className={pillCls}>Attempts: {normalizeAttemptCount(row.call_attempt_count)}</span>
          <button type="button" className={incCls} onClick={bump} disabled={pending} title="Log one more call attempt">
            + Attempt
          </button>
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center rounded-full p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            title="Edit attempt count"
            aria-label="Edit attempt count"
            onClick={() => {
              setDraft(String(normalizeAttemptCount(row.call_attempt_count)));
              setEditing(true);
            }}
          >
            <Pencil className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden strokeWidth={2} />
          </button>
        </>
      )}
    </div>
  );
}

/** CRM list row: attempts line + add-note — sits in the Engagement column between Pipeline and Contact. */
export function LeadListRowEngagementColumn({
  leadId,
  row,
  compact,
  onCountCommitted,
  onToast,
}: {
  leadId: string;
  row: CrmLeadRow;
  compact?: boolean;
  onCountCommitted: (leadId: string, next: number) => void;
  onToast: (t: { type: "ok" | "err"; message: string }) => void;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 md:self-center ${compact ? "text-[10px]" : "text-[11px]"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <LeadListRowCallAttempts
        leadId={leadId}
        row={row}
        compact={compact}
        onCountCommitted={onCountCommitted}
        onToast={onToast}
      />
      <LeadListRowQuickNote leadId={leadId} compact={compact} onToast={onToast} />
    </div>
  );
}
