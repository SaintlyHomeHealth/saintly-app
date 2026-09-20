"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type KeyboardEvent } from "react";

import {
  bulkAssignFaxesAction,
  bulkSetFaxTriageAction,
} from "@/app/admin/fax/actions";
import { DeleteFaxButton } from "@/app/admin/fax/_components/DeleteFaxButton";
import { ForwardInboundFaxButton } from "@/app/admin/fax/_components/ForwardInboundFaxButton";
import {
  FaxListRowShell,
  FaxListSelectProvider,
  FaxRowCheckbox,
  FaxSelectAllCheckbox,
  useOptionalFaxListSelect,
} from "@/app/admin/fax/_components/FaxListBulkSelect";
import { OutboundFaxActions } from "@/app/admin/fax/_components/OutboundFaxActions";
import { fx } from "@/app/admin/fax/_components/fax-tokens";
import { classifyFaxFailure, FAX_FAILURE_LABEL, isFaxFailureRetryable } from "@/lib/fax/classify-fax-failure";
import {
  FAX_DOCUMENT_TYPE_LABEL,
  FAX_TRIAGE_LABEL,
  isFaxDocumentType,
  isFaxTriageState,
  type FaxDocumentType,
  type FaxTriageState,
} from "@/lib/fax/fax-extraction-types";
import type { FaxMessageRow } from "@/lib/fax/fax-service";
import { inboundFaxHasDocumentForForward } from "@/lib/fax/inbound-fax-has-document";
import { formatFaxDateTimeDetail, formatFaxRelativeTime } from "@/lib/fax/format-fax-time";
import { formatFaxPhoneDisplay } from "@/lib/fax/format-fax-phone-display";

export type FaxInboxSort = "received" | "patient" | "type" | "pages";

type StaffOption = { userId: string; name: string };

type FaxInboxTableProps = {
  faxes: FaxMessageRow[];
  tab: string;
  currentListPath: string;
  sort: FaxInboxSort;
  dir: "asc" | "desc";
  density: "comfortable" | "compact";
  allowHardDelete: boolean;
  staffOptions: StaffOption[];
  sortHref: (sort: FaxInboxSort) => string;
};

function triageOf(fax: FaxMessageRow): FaxTriageState {
  if (isFaxTriageState(fax.triage_state)) return fax.triage_state;
  if (String(fax.status).toLowerCase().includes("fail")) return "failed";
  if (fax.extraction_status === "needs_review" || fax.extraction_status === "media_missing") {
    return "needs_review";
  }
  return "new";
}

function typeLabel(fax: FaxMessageRow): string {
  return isFaxDocumentType(fax.document_type) ? FAX_DOCUMENT_TYPE_LABEL[fax.document_type as FaxDocumentType] : "—";
}

function patientHref(patientId: string | null | undefined): string | null {
  return patientId ? `/admin/crm/patients/${patientId}` : null;
}

function FaxRow({
  fax,
  currentListPath,
  density,
  allowHardDelete,
  tab,
}: {
  fax: FaxMessageRow;
  currentListPath: string;
  density: "comfortable" | "compact";
  allowHardDelete: boolean;
  tab: string;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const detailHref = `/admin/fax/${fax.id}?returnTo=${encodeURIComponent(currentListPath)}`;
  const patientLink = patientHref(fax.patient_id);
  const triage = triageOf(fax);
  const needsReview = triage === "needs_review" || !fax.patient_name;
  const senderOrg = fax.sender_org || fax.sender_name;
  const senderPhone = formatFaxPhoneDisplay(fax.direction === "inbound" ? fax.from_number : fax.to_number);
  const received = fax.received_at ?? fax.sent_at ?? fax.created_at;
  const rowH = density === "compact" ? "min-h-12 py-1.5" : "min-h-14 py-2";
  const failureKind = classifyFaxFailure(fax.failure_reason, fax.provider_error_code);
  const txFailed = String(fax.status).toLowerCase().includes("fail");

  return (
    <FaxListRowShell
      faxId={fax.id}
      className={`grid grid-cols-[32px_minmax(0,2.2fr)_7.5rem_minmax(8rem,1.1fr)_3.5rem_6.5rem_7.5rem_9rem] items-start gap-2 border-b px-3 text-[13px] [border-color:var(--fx-border)] ${rowH} hover:bg-slate-50/80`}
    >
      <div className="pt-1">
        <FaxRowCheckbox faxId={fax.id} />
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          {needsReview && !fax.patient_name ? (
            <span className={fx.chipWarn}>Needs review</span>
          ) : patientLink ? (
            <Link href={patientLink} className="truncate font-semibold text-[color:var(--fx-text)] hover:underline">
              {fax.patient_name}
            </Link>
          ) : (
            <Link href={detailHref} className="truncate font-semibold text-[color:var(--fx-text)] hover:underline">
              {fax.patient_name || (fax.direction === "outbound" ? fax.recipient_name : "Unknown")}
            </Link>
          )}
        </div>
        {fax.note ? (
          <button
            type="button"
            className={`mt-0.5 w-full text-left text-[12px] text-[color:var(--fx-text-muted)] ${noteOpen ? "" : "line-clamp-2"}`}
            onClick={() => setNoteOpen((v) => !v)}
          >
            {fax.note}
          </button>
        ) : null}
      </div>
      <div className="pt-0.5">
        {typeLabel(fax) === "—" ? (
          <span className={fx.muted}>—</span>
        ) : (
          <span className={fx.chipMuted}>{typeLabel(fax)}</span>
        )}
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="truncate font-medium">{senderOrg || "Unknown"}</p>
        <p className={`${fx.muted} truncate tabular-nums`}>{senderPhone || "—"}</p>
      </div>
      <div className="pt-1 tabular-nums text-[color:var(--fx-text-muted)]">{fax.page_count ?? "—"}</div>
      <div className="pt-1">
        <span className="tabular-nums text-[color:var(--fx-text-muted)]" title={formatFaxDateTimeDetail(received)}>
          {formatFaxRelativeTime(received)}
        </span>
      </div>
      <div className="pt-0.5">
        {tab === "failed" || txFailed ? (
          <div className="space-y-0.5">
            <span className={fx.chipDanger}>{FAX_FAILURE_LABEL[failureKind]}</span>
            {fax.provider_error_code ? (
              <p className={`${fx.muted} tabular-nums`}>{fax.provider_error_code}</p>
            ) : null}
            {fax.failure_reason ? (
              <p className="line-clamp-2 text-[11px] text-rose-800" title={fax.failure_reason}>
                {fax.failure_reason}
              </p>
            ) : null}
            <p className={`${fx.muted} tabular-nums`}>
              {fax.attempt_count ?? 1} attempt{(fax.attempt_count ?? 1) === 1 ? "" : "s"}
              {fax.last_attempt_at || fax.failed_at
                ? ` · ${formatFaxRelativeTime(fax.last_attempt_at ?? fax.failed_at)}`
                : ""}
            </p>
          </div>
        ) : (
          <span
            className={
              triage === "needs_review" ? fx.chipWarn : triage === "failed" ? fx.chipDanger : fx.chipMuted
            }
          >
            {FAX_TRIAGE_LABEL[triage]}
          </span>
        )}
        {txFailed && tab !== "failed" ? (
          <span className="ml-1 inline-block text-rose-600" title={fax.failure_reason ?? "Transmission failed"}>
            ⚠
          </span>
        ) : null}
      </div>
      <div className="relative flex flex-wrap items-center justify-end gap-1 pt-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
        <Link href={detailHref} className={fx.btnGhost}>
          Open
        </Link>
        {fax.direction === "inbound" && inboundFaxHasDocumentForForward(fax) ? (
          <ForwardInboundFaxButton
            faxId={fax.id}
            originalFromDisplay={senderOrg || "Unknown"}
            originalReceivedDisplay={formatFaxDateTimeDetail(received)}
            pageCount={fax.page_count}
            variant="row"
          />
        ) : null}
        {fax.direction === "outbound" ? (
          <OutboundFaxActions
            faxId={fax.id}
            toNumber={fax.to_number}
            note={fax.note ?? null}
            detailHref={detailHref}
            returnTo={currentListPath}
            allowHardDelete={allowHardDelete}
          />
        ) : (
          <div className="relative">
            <button type="button" className={fx.btnGhost} onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
              ⋯
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-40 rounded-[8px] border bg-white py-1 shadow-lg [border-color:var(--fx-border)]">
                <DeleteFaxButton faxId={fax.id} returnTo={currentListPath} allowHardDelete={allowHardDelete} compact />
              </div>
            ) : null}
          </div>
        )}
        {tab === "failed" && isFaxFailureRetryable(failureKind) ? (
          <span className={`${fx.muted} w-full text-right text-[11px]`}>Retryable</span>
        ) : null}
      </div>
    </FaxListRowShell>
  );
}

function SortHeader({
  label,
  id,
  current,
  dir,
  href,
}: {
  label: string;
  id: FaxInboxSort;
  current: FaxInboxSort;
  dir: "asc" | "desc";
  href: string;
}) {
  const active = current === id;
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[color:var(--fx-text-muted)]"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      {active ? <span aria-hidden>{dir === "asc" ? "↑" : "↓"}</span> : null}
    </Link>
  );
}

export function FaxInboxTable(props: FaxInboxTableProps) {
  const { faxes, tab, currentListPath, sort, dir, density, allowHardDelete, staffOptions, sortHref } = props;
  const router = useRouter();
  const [focus, setFocus] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "j") {
        e.preventDefault();
        setFocus((i) => Math.min(faxes.length - 1, i + 1));
      }
      if (e.key === "k") {
        e.preventDefault();
        setFocus((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter" && faxes[focus]) {
        router.push(`/admin/fax/${faxes[focus]!.id}?returnTo=${encodeURIComponent(currentListPath)}`);
      }
    }
    window.addEventListener("keydown", onKey as unknown as EventListener);
    return () => window.removeEventListener("keydown", onKey as unknown as EventListener);
  }, [faxes, focus, router, currentListPath]);

  return (
    <FaxListSelectProvider faxIds={faxes.map((f) => f.id)}>
      <FaxBulkBar staffOptions={staffOptions} allowHardDelete={allowHardDelete} tab={tab} />
      <div className={`${fx.card} overflow-hidden`}>
        <div className="grid grid-cols-[32px_minmax(0,2.2fr)_7.5rem_minmax(8rem,1.1fr)_3.5rem_6.5rem_7.5rem_9rem] items-center gap-2 border-b bg-[var(--fx-surface)] px-3 py-2 [border-color:var(--fx-border)]">
          <FaxSelectAllCheckbox />
          <SortHeader label="Patient" id="patient" current={sort} dir={dir} href={sortHref("patient")} />
          <SortHeader label="Type" id="type" current={sort} dir={dir} href={sortHref("type")} />
          <span className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--fx-text-muted)]">Sender</span>
          <SortHeader label="Pages" id="pages" current={sort} dir={dir} href={sortHref("pages")} />
          <SortHeader label="Received" id="received" current={sort} dir={dir} href={sortHref("received")} />
          <span className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--fx-text-muted)]">State</span>
          <span className="text-right text-[11px] font-bold uppercase tracking-wide text-[color:var(--fx-text-muted)]">
            Actions
          </span>
        </div>
        {faxes.length === 0 ? (
          <div className="px-4 py-12 text-center text-[13px] text-[color:var(--fx-text-muted)]">
            No faxes match these filters.
          </div>
        ) : (
          faxes.map((fax, i) => (
            <div key={fax.id} className={`group ${i === focus ? "ring-1 ring-[color:var(--fx-accent)]" : ""}`}>
              <FaxRow
                fax={fax}
                currentListPath={currentListPath}
                density={density}
                allowHardDelete={allowHardDelete}
                tab={tab}
              />
            </div>
          ))
        )}
      </div>
    </FaxListSelectProvider>
  );
}

function FaxBulkBar({
  staffOptions,
  allowHardDelete,
  tab,
}: {
  staffOptions: StaffOption[];
  allowHardDelete: boolean;
  tab: string;
}) {
  const ctx = useOptionalFaxListSelect();
  const router = useRouter();
  if (!ctx) return null;
  const { selected, someSelected, clearSelected } = ctx;
  const [assignTo, setAssignTo] = useState("");
  const [busy, setBusy] = useState(false);
  const count = selected.size;
  if (!someSelected) return null;

  async function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (result.ok) {
      clearSelected();
      router.refresh();
    }
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[8px] border bg-[var(--fx-surface-raised)] px-3 py-2 [border-color:var(--fx-border)]">
      <span className="text-[13px] font-semibold tabular-nums">{count} selected</span>
      <button
        type="button"
        className={fx.btnSecondary}
        disabled={busy}
        onClick={() => run(() => bulkSetFaxTriageAction(Array.from(selected), "reviewed"))}
      >
        Mark reviewed
      </button>
      <label className="flex items-center gap-1 text-[12px] text-[color:var(--fx-text-muted)]">
        Assign to
        <select
          className={fx.input}
          value={assignTo}
          onChange={(e) => setAssignTo(e.target.value)}
        >
          <option value="">Choose…</option>
          {staffOptions.map((s) => (
            <option key={s.userId} value={s.userId}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={fx.btnSecondary}
        disabled={busy || !assignTo}
        onClick={() => run(() => bulkAssignFaxesAction(Array.from(selected), assignTo))}
      >
        Assign
      </button>
      <button
        type="button"
        className={fx.btnSecondary}
        disabled={busy}
        onClick={() => run(() => bulkSetFaxTriageAction(Array.from(selected), "filed"))}
      >
        Archive
      </button>
      <a
        className={fx.btnSecondary}
        href={`/admin/fax?tab=${tab}&export=1`}
      >
        Export
      </a>
      <span className="flex-1" />
      {allowHardDelete ? (
        <button
          type="button"
          className={fx.btnDanger}
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete ${count} fax${count === 1 ? "" : "es"}? This archives them.`)) {
              void run(() => bulkSetFaxTriageAction(Array.from(selected), "filed"));
            }
          }}
        >
          Delete
        </button>
      ) : null}
    </div>
  );
}
