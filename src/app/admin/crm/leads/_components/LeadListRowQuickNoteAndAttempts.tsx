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

function listQuickBtnCls(compact?: boolean): string {
  return compact
    ? "inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-1 py-px text-[9px] font-medium text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
    : "inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50";
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
      <div
        className="flex min-w-0 max-w-full flex-col gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <textarea
          value={text}
          maxLength={NOTE_MAX}
          onChange={(e) => setText(e.target.value)}
          rows={compact ? 2 : 3}
          placeholder="Add quick note…"
          disabled={pending}
          className={`${crmFilterInputCls} min-h-[48px] w-full max-w-[min(100%,20rem)] resize-y ${compact ? "text-[10px]" : "text-[11px]"}`}
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
    <button type="button" className={listQuickBtnCls(compact)} onClick={() => setOpen(true)} title="Add a quick note">
      Note
    </button>
  );
}

export function LeadListRowCallAttempts({
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

  const labelCls = compact ? "text-[9px] text-slate-600" : "text-[10px] text-slate-600";
  const qcls = listQuickBtnCls(compact);

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
            className={`${crmFilterInputCls} w-14 tabular-nums ${compact ? "text-[10px]" : "text-[11px]"}`}
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
          <span className={`shrink-0 tabular-nums font-medium text-slate-800 ${labelCls}`}>
            Attempts: {normalizeAttemptCount(row.call_attempt_count)}
          </span>
          <button
            type="button"
            className={`inline-flex items-center justify-center rounded border border-slate-200 bg-white p-0.5 text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50 ${compact ? "h-5 w-5" : "h-6 w-6"}`}
            title="Edit attempt count"
            aria-label="Edit attempt count"
            onClick={() => {
              setDraft(String(normalizeAttemptCount(row.call_attempt_count)));
              setEditing(true);
            }}
          >
            <Pencil className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden />
          </button>
          <button type="button" className={qcls} onClick={bump} disabled={pending} title="Log one more call attempt">
            + Attempt
          </button>
        </>
      )}
    </div>
  );
}
