import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FaxCenterComposeControls } from "./_components/FaxCenterComposeControls";
import { FaxInboxTable, type FaxInboxSort } from "./_components/FaxInboxTable";
import { ResendAllRetryableButton } from "./_components/ResendAllRetryableButton";
import { fx } from "./_components/fax-tokens";
import { supabaseAdmin } from "@/lib/admin";
import { applyFaxListKeywordOrFilters, missingFaxSchema, type FaxMessageRow } from "@/lib/fax/fax-service";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

const PAGE_SIZES = [25, 50, 100] as const;

type FaxListFilters = {
  tab: string;
  q: string;
  from: string;
  to: string;
  sort: FaxInboxSort;
  dir: "asc" | "desc";
  density: "comfortable" | "compact";
  pageSize: number;
};

function faxCenterListPath(filters: FaxListFilters, page: number): string {
  const p = new URLSearchParams();
  p.set("tab", filters.tab);
  if (filters.q) p.set("q", filters.q);
  if (filters.from) p.set("from", filters.from);
  if (filters.to) p.set("to", filters.to);
  if (filters.sort !== "received") p.set("sort", filters.sort);
  if (filters.dir !== "desc") p.set("dir", filters.dir);
  if (filters.density !== "comfortable") p.set("density", filters.density);
  if (filters.pageSize !== 25) p.set("pageSize", String(filters.pageSize));
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return `/admin/fax${qs ? `?${qs}` : ""}`;
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(raw: Record<string, string | string[] | undefined>, key: string): string {
  const value = raw[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function parseSort(raw: string): FaxInboxSort {
  if (raw === "patient" || raw === "type" || raw === "pages" || raw === "received") return raw;
  return "received";
}

const SORT_COLUMN: Record<FaxInboxSort, string> = {
  received: "received_at",
  patient: "patient_name",
  type: "document_type",
  pages: "page_count",
};

export default async function AdminFaxCenterPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) redirect("/admin");
  const allowHardDelete = isAdminOrHigher(staff);

  const raw = await searchParams;
  const pageRaw = one(raw, "page");
  const pageParsed = Number.parseInt(pageRaw, 10);
  const page = Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : 1;
  const pageSizeRaw = Number.parseInt(one(raw, "pageSize"), 10);
  const pageSize = PAGE_SIZES.includes(pageSizeRaw as (typeof PAGE_SIZES)[number]) ? pageSizeRaw : 25;

  const f: FaxListFilters = {
    tab: one(raw, "tab") || "inbox",
    q: one(raw, "q").trim(),
    from: one(raw, "from").trim(),
    to: one(raw, "to").trim(),
    sort: parseSort(one(raw, "sort")),
    dir: one(raw, "dir") === "asc" ? "asc" : "desc",
    density: one(raw, "density") === "compact" ? "compact" : "comfortable",
    pageSize,
  };
  const currentListPath = faxCenterListPath(f, page);

  const sortCol = SORT_COLUMN[f.sort];
  let listQuery = supabaseAdmin
    .from("fax_messages")
    .select("*", { count: "exact" })
    .order(sortCol, { ascending: f.dir === "asc", nullsFirst: false })
    .order("created_at", { ascending: false });

  if (f.tab === "sent") listQuery = listQuery.eq("direction", "outbound").not("status", "ilike", "%failed%");
  else if (f.tab === "failed") listQuery = listQuery.ilike("status", "%failed%");
  else if (f.tab === "archived") listQuery = listQuery.eq("is_archived", true);
  else if (f.tab === "needs_review") {
    listQuery = listQuery
      .eq("direction", "inbound")
      .eq("is_archived", false)
      .or("triage_state.eq.needs_review,extraction_status.eq.needs_review,extraction_status.eq.media_missing");
  } else listQuery = listQuery.eq("direction", "inbound").eq("is_archived", false);
  if (f.from) listQuery = listQuery.gte("received_at", `${f.from}T00:00:00.000Z`);
  if (f.to) listQuery = listQuery.lte("received_at", `${f.to}T23:59:59.999Z`);
  if (f.q) listQuery = applyFaxListKeywordOrFilters(listQuery, f.q);

  const rangeFrom = (page - 1) * f.pageSize;
  const rangeTo = rangeFrom + f.pageSize - 1;
  listQuery = listQuery.range(rangeFrom, rangeTo);

  const { data, error, count } = await listQuery;
  const schemaMissing = missingFaxSchema(error);
  const faxes = schemaMissing ? [] : ((data ?? []) as FaxMessageRow[]);
  const total = schemaMissing ? 0 : (count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / f.pageSize));
  const rangeStart = faxes.length === 0 ? 0 : rangeFrom + 1;
  const rangeEnd = rangeFrom + faxes.length;

  const { data: metricRows } = schemaMissing
    ? { data: [] }
    : await supabaseAdmin
        .from("fax_messages")
        .select("direction, status, is_archived, received_at, sent_at, created_at, triage_state, extraction_status")
        .limit(2000);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const metrics = ((metricRows ?? []) as Pick<
    FaxMessageRow,
    "direction" | "status" | "is_archived" | "received_at" | "sent_at" | "created_at" | "triage_state" | "extraction_status"
  >[]).reduce(
    (acc, fax) => {
      if (fax.direction === "inbound" && !fax.is_archived) acc.inbox += 1;
      if (
        fax.direction === "inbound" &&
        !fax.is_archived &&
        (fax.triage_state === "needs_review" ||
          fax.extraction_status === "needs_review" ||
          fax.extraction_status === "media_missing")
      ) {
        acc.needsReview += 1;
      }
      if (fax.direction === "outbound" && fax.status.toLowerCase().includes("fail")) acc.failed += 1;
      const ts = fax.received_at ?? fax.sent_at ?? fax.created_at;
      if (ts && new Date(ts) >= weekAgo) acc.thisWeek += 1;
      if (fax.direction === "inbound" && !fax.is_archived && (fax.triage_state === "new" || !fax.triage_state)) {
        acc.unread += 1;
      }
      return acc;
    },
    { unread: 0, inbox: 0, failed: 0, thisWeek: 0, needsReview: 0 }
  );

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .eq("is_active", true)
    .in("role", ["manager", "don", "admin", "super_admin"])
    .limit(80);
  const staffOptions = ((staffRows ?? []) as { user_id: string; full_name: string | null; email: string | null }[]).map(
    (s) => ({ userId: s.user_id, name: s.full_name || s.email || s.user_id })
  );

  const tabs = [
    ["inbox", "Inbox"],
    ["needs_review", "Needs review"],
    ["sent", "Sent"],
    ["failed", "Failed"],
    ["archived", "Archived"],
  ] as const;

  const statChips = [
    { tab: "needs_review", label: "Needs review", value: metrics.needsReview, warn: true },
    { tab: "inbox", label: "Inbox", value: metrics.inbox },
    { tab: "failed", label: "Failed outbound", value: metrics.failed, danger: true },
    { tab: "inbox", label: "Last 7 days", value: metrics.thisWeek },
    { tab: "inbox", label: "New", value: metrics.unread },
  ];

  function sortHref(sort: FaxInboxSort): string {
    const nextDir = f.sort === sort && f.dir === "desc" ? "asc" : "desc";
    return faxCenterListPath({ ...f, sort, dir: nextDir }, 1);
  }

  return (
    <div className={`${fx.page} space-y-3 px-4 py-3 sm:px-6`}>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[20px] font-bold tracking-tight">Fax Center</h1>
        <span className={`${fx.chipMuted} tabular-nums`}>{formatPhoneForDisplay("+14803934119")}</span>
        <span className="flex-1" />
        <Suspense fallback={null}>
          <FaxCenterComposeControls />
        </Suspense>
        <details className="relative">
          <summary className={`${fx.btnSecondary} cursor-pointer list-none`}>⋯</summary>
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-[8px] border bg-[var(--fx-surface)] p-1 shadow-lg [border-color:var(--fx-border)]">
            <Link href="/admin/fax/templates" className="block rounded-[8px] px-3 py-2 text-[13px] hover:bg-slate-50">
              Cover templates
            </Link>
            <Link
              href="/admin/fax/document-templates"
              className="block rounded-[8px] px-3 py-2 text-[13px] hover:bg-slate-50"
            >
              Document templates
            </Link>
          </div>
        </details>
      </div>

      {schemaMissing ? (
        <section className={`${fx.card} border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900`}>
          The Fax Center migration has not been applied yet.
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {statChips.map((chip) => (
          <Link
            key={chip.label}
            href={`/admin/fax?tab=${chip.tab}`}
            className={`flex h-16 min-w-[8.5rem] flex-col justify-center rounded-[12px] border px-3 ${
              f.tab === chip.tab ? "border-[color:var(--fx-accent)]" : "[border-color:var(--fx-border)]"
            } bg-[var(--fx-surface)]`}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--fx-text-muted)]">
              {chip.label}
            </span>
            <span
              className={`text-[20px] font-bold tabular-nums ${
                chip.warn ? "text-amber-800" : chip.danger ? "text-rose-800" : ""
              }`}
            >
              {chip.value}
            </span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map(([tab, label]) => (
          <Link
            key={tab}
            href={`/admin/fax?tab=${tab}`}
            className={f.tab === tab ? fx.chipAccent : fx.chipMuted}
          >
            {label}
          </Link>
        ))}
        <form method="get" action="/admin/fax" className="ml-auto flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value={f.tab} />
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Search notes, names, numbers…"
            className={`${fx.input} w-56`}
          />
          <input type="date" name="from" defaultValue={f.from} className={fx.input} />
          <input type="date" name="to" defaultValue={f.to} className={fx.input} />
          <button type="submit" className={fx.btnSecondary}>
            Apply
          </button>
          <Link
            href={faxCenterListPath({ ...f, density: f.density === "compact" ? "comfortable" : "compact" }, page)}
            className={fx.btnGhost}
          >
            {f.density === "compact" ? "Comfortable" : "Compact"}
          </Link>
        </form>
      </div>

      {f.tab === "failed" ? (
        <ResendAllRetryableButton
          faxes={faxes.map((fax) => ({
            id: fax.id,
            toNumber: fax.to_number,
            failureReason: fax.failure_reason,
            providerErrorCode: fax.provider_error_code ?? null,
          }))}
        />
      ) : null}

      <FaxInboxTable
        faxes={faxes}
        tab={f.tab}
        currentListPath={currentListPath}
        sort={f.sort}
        dir={f.dir}
        density={f.density}
        allowHardDelete={allowHardDelete}
        staffOptions={staffOptions}
        sortHref={sortHref}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[color:var(--fx-text-muted)]">
        <span className="tabular-nums font-medium">
          {schemaMissing ? "—" : faxes.length === 0 ? "No results" : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {page > 1 ? (
            <Link href={faxCenterListPath(f, page - 1)} className={fx.btnGhost}>
              Previous
            </Link>
          ) : (
            <span className={`${fx.btnGhost} opacity-40`}>Previous</span>
          )}
          {Array.from({ length: Math.min(totalPages, 8) }, (_, i) => {
            const p = totalPages <= 8 ? i + 1 : Math.max(1, Math.min(totalPages - 7, page - 3)) + i;
            return (
              <Link
                key={p}
                href={faxCenterListPath(f, p)}
                className={p === page ? fx.chipAccent : fx.btnGhost}
              >
                <span className="tabular-nums">{p}</span>
              </Link>
            );
          })}
          {page < totalPages ? (
            <Link href={faxCenterListPath(f, page + 1)} className={fx.btnGhost}>
              Next
            </Link>
          ) : (
            <span className={`${fx.btnGhost} opacity-40`}>Next</span>
          )}
          <span className="tabular-nums">{totalPages} pages</span>
          {[25, 50, 100].map((n) => (
            <Link
              key={n}
              href={faxCenterListPath({ ...f, pageSize: n }, 1)}
              className={f.pageSize === n ? fx.chipAccent : fx.btnGhost}
            >
              <span className="tabular-nums">{n}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
