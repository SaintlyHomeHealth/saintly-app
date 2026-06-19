"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { bulkSoftDeleteLeads } from "@/app/admin/crm/actions";
import { CrmLeadCard } from "@/app/admin/crm/leads/_components/CrmLeadCard";
import { AdminEmptyState } from "@/components/admin/design-system";
import { type CrmLeadRow } from "@/lib/crm/crm-leads-table-helpers";
import { ADMIN_CRM_LEADS_LIST_PATH_PREFIX } from "@/lib/crm/admin-crm-leads-list-url";
import { CrmLeadListRowErrorBoundary } from "@/components/admin/CrmLeadListRowErrorBoundary";

type StaffOpt = {
  user_id: string;
  email: string | null;
  role: string;
  full_name: string | null;
};

type Props = {
  initialList: CrmLeadRow[];
  employeeOnlyView: boolean;
  staffOptions: StaffOpt[];
  /** `staff_profiles.user_id` → display name for producing sales agents on list rows. */
  producedByAgentNameByUserId?: Record<string, string>;
  /** Central CRM calendar YYYY-MM-DD for urgency + last-contact copy */
  todayIso: string;
  /** Latest SMS thread id per CRM contact for "Text" deep-links (navigation only). */
  smsConversationIdByContactId?: Record<string, string>;
  /** Mirrors URL `density` — default Compact for admins. Does not alter server filtering. */
  initialDensity?: "compact" | "comfortable";
  /** Current list URL (pathname + filters) for lead detail `returnTo`. */
  leadsListContextHref?: string;
  emptyState?: {
    narrowFiltersActive: boolean;
    clearHref: string;
  };
};

function CrmLeadsListEmpty({
  emptyState,
}: {
  emptyState?: { narrowFiltersActive: boolean; clearHref: string };
}) {
  return (
    <AdminEmptyState
      title={emptyState?.narrowFiltersActive ? "No leads match these filters." : "No leads found."}
      description={
        emptyState?.narrowFiltersActive
          ? "Adjust search or filters, check pagination, or clear all filters."
          : "No open leads match the default list (dead / not qualified are hidden unless you include them)."
      }
      actionHref={emptyState?.narrowFiltersActive ? emptyState.clearHref : undefined}
      actionLabel={emptyState?.narrowFiltersActive ? "Clear all filters" : undefined}
      className="md:text-left"
    />
  );
}

export function CrmLeadsList({
  initialList,
  employeeOnlyView,
  staffOptions,
  producedByAgentNameByUserId = {},
  todayIso,
  smsConversationIdByContactId = {},
  initialDensity = "compact",
  leadsListContextHref = ADMIN_CRM_LEADS_LIST_PATH_PREFIX,
  emptyState,
}: Props) {
  const router = useRouter();
  const compact = initialDensity !== "comfortable";

  const [rows, setRows] = useState(initialList);

  useEffect(() => {
    setRows(initialList);
  }, [initialList]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [listToast, setListToast] = useState<null | { type: "ok" | "err"; message: string }>(null);

  useEffect(() => {
    if (!listToast) return;
    const t = window.setTimeout(() => setListToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [listToast]);

  const patchLeadCallAttemptCount = useCallback((leadId: string, next: number) => {
    setRows((prev) => prev.map((row) => (row.id === leadId ? { ...row, call_attempt_count: next } : row)));
  }, []);

  /** "+ Attempt" bumps count and last_contact_at together (matches server). */
  const patchLeadAfterAttemptBump = useCallback((leadId: string, next: number) => {
    const lastContactAt = new Date().toISOString();
    setRows((prev) =>
      prev.map((row) =>
        row.id === leadId ? { ...row, call_attempt_count: next, last_contact_at: lastContactAt } : row
      )
    );
  }, []);

  const staffById = useMemo(() => new Map(staffOptions.map((s) => [s.user_id, s])), [staffOptions]);

  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (rowIds.length === 0) return new Set();
      const all = rowIds.every((id) => prev.has(id));
      if (all) return new Set();
      return new Set(rowIds);
    });
  }, [rowIds]);

  const runBulkDelete = useCallback(() => {
    const idsToDelete = Array.from(selected);
    if (idsToDelete.length === 0) return;
    const remove = new Set(idsToDelete);
    startTransition(async () => {
      const result = await bulkSoftDeleteLeads(idsToDelete);
      if (result.ok) {
        setRows((prev) => prev.filter((r) => !remove.has(r.id)));
        setSelected(new Set());
        setBulkConfirmOpen(false);
        router.refresh();
      }
    });
  }, [selected, router]);

  const bulkBar = (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-2.5 text-sm shadow-sm shadow-slate-200/40">
      <label className="flex items-center gap-2 font-medium text-slate-700">
        <input
          ref={selectAllRef}
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500/30"
          checked={allSelected}
          onChange={toggleAll}
          disabled={rowIds.length === 0}
          aria-label="Select all leads"
        />
        {someSelected ? `${selected.size} selected` : "Select all"}
      </label>
      {someSelected ? (
        <button
          type="button"
          onClick={() => setBulkConfirmOpen(true)}
          className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 shadow-sm hover:bg-rose-50"
        >
          Delete Selected
        </button>
      ) : null}
    </div>
  );

  const bulkModal = bulkConfirmOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={() => !pending && setBulkConfirmOpen(false)}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="crm-bulk-delete-title"
        className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="crm-bulk-delete-title" className="text-lg font-semibold text-slate-900">
          Delete {selected.size} lead{selected.size === 1 ? "" : "s"}?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          This will remove the selected leads from the active CRM list but keep historical records.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            onClick={() => setBulkConfirmOpen(false)}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-800 bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            onClick={runBulkDelete}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      {listToast ? (
        <div
          role="status"
          className={`pointer-events-none fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
            listToast.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-rose-200 bg-rose-50 text-rose-950"
          }`}
        >
          {listToast.message}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <CrmLeadsListEmpty emptyState={emptyState} />
      ) : (
        <>
          {bulkBar}
          <div className="space-y-3">
            {rows.map((r) => (
              <CrmLeadListRowErrorBoundary key={r.id} leadId={r.id}>
                <CrmLeadCard
                  row={r}
                  employeeOnlyView={employeeOnlyView}
                  compact={compact}
                  selected={selected.has(r.id)}
                  onToggleSelect={toggleOne}
                  todayIso={todayIso}
                  leadsListContextHref={leadsListContextHref}
                  staffById={staffById}
                  producedByAgentNameByUserId={producedByAgentNameByUserId}
                  smsConversationIdByContactId={smsConversationIdByContactId}
                  onIncrementCommitted={patchLeadAfterAttemptBump}
                  onCountCommitted={patchLeadCallAttemptCount}
                  onToast={setListToast}
                />
              </CrmLeadListRowErrorBoundary>
            ))}
          </div>
        </>
      )}

      {bulkModal}
    </div>
  );
}
