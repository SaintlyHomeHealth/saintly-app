import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  crmActionBtnMuted,
  crmActionBtnSky,
  crmFilterBarCls,
  crmFilterInputCls,
  crmListRowHoverCls,
  crmListScrollOuterCls,
  crmPrimaryCtaCls,
} from "@/components/admin/crm-admin-list-styles";
import { supabaseAdmin } from "@/lib/admin";
import {
  FAX_FILING_TABS,
  applyFaxInboxFilingFilter,
  faxInboxStatus,
  faxPdfFilename,
  parseFaxFilingBucket,
  type FaxFilingBucket,
} from "@/lib/fax/fax-ehr-filing";
import { formatFaxSenderDisplay } from "@/lib/fax/format-fax-sender";
import { formatFaxDateTimeDetail, formatFaxDateTimeList } from "@/lib/fax/format-fax-time";
import { inboundFaxHasDocumentForForward } from "@/lib/fax/forward-inbound-fax";
import {
  FAX_ARRIVED_LABELS,
  FAX_ARRIVED_PRESETS,
  FAX_METRIC_SPAN_LABELS,
  FAX_METRIC_SPANS,
  faxArrivedWindow,
  faxPeriodOrFilter,
  parseFaxArrivedPreset,
  resolveFaxMetricPeriod,
  type FaxArrivedPreset,
  type FaxMetricSpan,
} from "@/lib/fax/fax-metric-period";
import { applyFaxListKeywordOrFilters, missingFaxSchema, type FaxMessageRow } from "@/lib/fax/fax-service";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

import { DeleteFaxButton } from "./_components/DeleteFaxButton";
import { FaxCenterComposeControls } from "./_components/FaxCenterComposeControls";
import { FaxDisplayTitleEditor } from "./_components/FaxDisplayTitleEditor";
import { FaxInboxStatusBadge } from "./_components/FaxInboxStatusBadge";
import {
  FaxBulkDeleteBar,
  FaxListRowShell,
  FaxListSelectProvider,
  FaxRowCheckbox,
  FaxSelectAllCheckbox,
} from "./_components/FaxListBulkSelect";
import { FaxNoteListCell } from "./_components/FaxNoteListCell";
import { MarkFaxFiledButton } from "./_components/MarkFaxFiledButton";
import { ForwardInboundFaxButton } from "./_components/ForwardInboundFaxButton";
import { OutboundFaxActions } from "./_components/OutboundFaxActions";

export const dynamic = "force-dynamic";

const FAX_LIST_PAGE_SIZE = 20;
const FAX_LIST_GRID_CLS =
  "grid grid-cols-[32px_92px_minmax(180px,1fr)_minmax(280px,2fr)_56px_minmax(140px,180px)_128px_220px] gap-3";

type FaxListFilters = {
  tab: string;
  filing: FaxFilingBucket;
  /** When false, the inbox shows every filing status so filed faxes stay visible. */
  filingExplicit: boolean;
  arrived: FaxArrivedPreset;
  q: string;
  unread: boolean;
  from: string;
  to: string;
  span: FaxMetricSpan;
  day: string;
};

function faxCenterListPath(filters: FaxListFilters, page: number, todayYmd: string): string {
  const p = new URLSearchParams();
  p.set("tab", filters.tab);
  if (filters.tab === "inbox" && filters.filingExplicit) p.set("filing", filters.filing);
  if (filters.tab === "inbox") p.set("arrived", filters.arrived);
  if (filters.q) p.set("q", filters.q);
  if (filters.unread) p.set("unread", "1");
  if (filters.from) p.set("from", filters.from);
  if (filters.to) p.set("to", filters.to);
  if (filters.span !== "day") p.set("span", filters.span);
  if (filters.day && filters.day !== todayYmd) p.set("day", filters.day);
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return `/admin/fax${qs ? `?${qs}` : ""}`;
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(raw: Record<string, string | string[] | undefined>, key: string): string {
  const value = raw[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("fail")) return "border-rose-200 bg-rose-50 text-rose-700";
  if (s.includes("delivered") || s.includes("received")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function filterHref(tab: string, filters: FaxListFilters, todayYmd: string): string {
  return faxCenterListPath(
    {
      tab,
      filing: "unfiled",
      filingExplicit: false,
      arrived: tab === "inbox" ? "today" : "all",
      q: "",
      unread: false,
      from: "",
      to: "",
      span: filters.span,
      day: filters.day,
    },
    1,
    todayYmd
  );
}

function filingHref(filing: FaxFilingBucket, filters: FaxListFilters, todayYmd: string): string {
  return faxCenterListPath(
    {
      tab: "inbox",
      filing,
      filingExplicit: true,
      arrived: filters.arrived,
      q: "",
      unread: false,
      from: "",
      to: "",
      span: filters.span,
      day: filters.day,
    },
    1,
    todayYmd
  );
}

function arrivedHref(arrived: FaxArrivedPreset, filters: FaxListFilters, todayYmd: string): string {
  return faxCenterListPath(
    {
      ...filters,
      tab: "inbox",
      arrived,
      filingExplicit: false,
      q: "",
      unread: false,
      from: "",
      to: "",
    },
    1,
    todayYmd
  );
}

function metricPeriodHref(
  filters: FaxListFilters,
  span: FaxMetricSpan,
  day: string,
  todayYmd: string,
  page: number
): string {
  return faxCenterListPath({ ...filters, span, day }, page, todayYmd);
}

function isMissingInboxStatusColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return (
    msg.includes("inbox_status") ||
    msg.includes("status_note") ||
    msg.includes("status_changed_at") ||
    msg.includes("status_changed_by")
  );
}

type FaxCountResult = { count: number | null; error: { message?: string } | null };

interface FaxCountQuery extends PromiseLike<FaxCountResult> {
  eq: (column: string, value: unknown) => FaxCountQuery;
  or: (filters: string) => FaxCountQuery;
  not: (column: string, operator: string, value: unknown) => FaxCountQuery;
  ilike: (column: string, pattern: string) => FaxCountQuery;
}

/** Head-only count. Tab switches do not download inbox rows to total them in memory. */
async function countFaxRows(build: (query: FaxCountQuery) => FaxCountQuery): Promise<number | null> {
  const query = supabaseAdmin.from("fax_messages").select("id", { count: "exact", head: true });
  const { count, error } = await build(query as unknown as FaxCountQuery);
  if (error) return null;
  return count ?? 0;
}

/** Preserve list filters/tab when opening a fax from the Fax Center grid. */
function faxDetailHref(faxId: string, listReturnPath: string): string {
  const q = new URLSearchParams();
  q.set("returnTo", listReturnPath);
  return `/admin/fax/${faxId}?${q.toString()}`;
}

export default async function AdminFaxCenterPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) redirect("/admin");
  const allowHardDelete = isAdminOrHigher(staff);

  const raw = await searchParams;
  const pageRaw = one(raw, "page");
  const pageParsed = Number.parseInt(pageRaw, 10);
  const page = Number.isFinite(pageParsed) && pageParsed > 0 ? pageParsed : 1;

  const now = new Date();
  const period = resolveFaxMetricPeriod({
    spanRaw: one(raw, "span"),
    dayRaw: one(raw, "day"),
    now,
  });
  const todayYmd = period.todayYmd;
  const tab = one(raw, "tab") || "inbox";
  const filingRaw = one(raw, "filing").trim();
  const arrivedRaw = one(raw, "arrived").trim();
  const filingExplicit = tab === "inbox" && filingRaw.length > 0;
  const arrived: FaxArrivedPreset =
    tab !== "inbox" ? "all" : arrivedRaw ? parseFaxArrivedPreset(arrivedRaw) : filingExplicit ? "all" : "today";
  const arrivedWindow = faxArrivedWindow(arrived, now);

  const f: FaxListFilters = {
    tab,
    filing: parseFaxFilingBucket(filingRaw),
    filingExplicit,
    arrived,
    q: one(raw, "q").trim(),
    unread: one(raw, "unread") === "1",
    from: one(raw, "from").trim(),
    to: one(raw, "to").trim(),
    span: period.span,
    day: period.anchorYmd,
  };
  const currentListPath = faxCenterListPath(f, page, todayYmd);
  const inboxUnfiled = f.tab === "inbox" && f.filingExplicit && f.filing === "unfiled";

  let listQuery = supabaseAdmin.from("fax_messages").select("*");
  if (f.tab === "inbox") {
    listQuery = listQuery
      .order("received_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    listQuery = listQuery.order("created_at", { ascending: false });
  }

  if (f.tab === "sent") listQuery = listQuery.eq("direction", "outbound").not("status", "ilike", "%failed%");
  else if (f.tab === "failed") listQuery = listQuery.ilike("status", "%failed%");
  else if (f.tab === "archived") listQuery = listQuery.eq("is_archived", true);
  else if (f.filingExplicit) listQuery = applyFaxInboxFilingFilter(listQuery, f.filing);
  else listQuery = listQuery.eq("direction", "inbound").eq("is_archived", false);
  if (f.tab === "inbox" && arrivedWindow.startIso && arrivedWindow.endIso) {
    listQuery = listQuery.or(faxPeriodOrFilter("received_at", arrivedWindow.startIso, arrivedWindow.endIso));
  }
  if (f.unread) listQuery = listQuery.eq("is_read", false);
  if (f.from) listQuery = listQuery.gte("created_at", `${f.from}T00:00:00.000Z`);
  if (f.to) listQuery = listQuery.lte("created_at", `${f.to}T23:59:59.999Z`);
  if (f.q) listQuery = applyFaxListKeywordOrFilters(listQuery, f.q);

  const rangeFrom = (page - 1) * FAX_LIST_PAGE_SIZE;
  const rangeTo = rangeFrom + FAX_LIST_PAGE_SIZE; // fetch pageSize + 1 rows (inclusive end index)
  listQuery = listQuery.range(rangeFrom, rangeTo);

  const incomingOr = faxPeriodOrFilter("received_at", period.startIso, period.endIso);
  const sentOr = faxPeriodOrFilter("sent_at", period.startIso, period.endIso);
  const failedOr = faxPeriodOrFilter("failed_at", period.startIso, period.endIso);

  const [listResult, tabCounts, arrivedCounts, incomingCount, sentCount, failedPeriodCount] = await Promise.all([
    listQuery,
    Promise.all(
      FAX_FILING_TABS.map(async (tab) => {
        const total = await countFaxRows((query) => applyFaxInboxFilingFilter(query, tab.id));
        return [tab.id, total] as const;
      })
    ),
    Promise.all(
      FAX_ARRIVED_PRESETS.map(async (preset) => {
        const window = faxArrivedWindow(preset, now);
        const total = await countFaxRows((query) => {
          const inbound = query.eq("direction", "inbound").eq("is_archived", false);
          if (!window.startIso || !window.endIso) return inbound;
          return inbound.or(faxPeriodOrFilter("received_at", window.startIso, window.endIso));
        });
        return [preset, total] as const;
      })
    ),
    countFaxRows((query) => query.eq("direction", "inbound").not("status", "ilike", "%fail%").or(incomingOr)),
    countFaxRows((query) => query.eq("direction", "outbound").not("status", "ilike", "%fail%").or(sentOr)),
    countFaxRows((query) => query.ilike("status", "%fail%").or(failedOr)),
  ]);

  const { data, error } = listResult;
  const schemaMissing = missingFaxSchema(error);
  const inboxStatusMissing = schemaMissing && isMissingInboxStatusColumn(error);
  const pageSlice = schemaMissing ? [] : ((data ?? []) as FaxMessageRow[]);
  const hasNextPage = pageSlice.length > FAX_LIST_PAGE_SIZE;
  const faxes = hasNextPage ? pageSlice.slice(0, FAX_LIST_PAGE_SIZE) : pageSlice;
  const rangeStart = faxes.length === 0 ? 0 : rangeFrom + 1;
  const rangeEnd = rangeFrom + faxes.length;

  const filingCounts = Object.fromEntries(tabCounts) as Record<FaxFilingBucket, number | null>;
  const arrivedCountByPreset = Object.fromEntries(arrivedCounts) as Record<FaxArrivedPreset, number | null>;
  const metrics = {
    incoming: schemaMissing ? 0 : (incomingCount ?? 0),
    sent: schemaMissing ? 0 : (sentCount ?? 0),
    failed: schemaMissing ? 0 : (failedPeriodCount ?? 0),
  };
  const previousPeriodHref = metricPeriodHref(f, period.span, period.previousAnchorYmd, todayYmd, page);
  const nextPeriodHref = metricPeriodHref(f, period.span, period.nextAnchorYmd, todayYmd, page);

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Admin Fax"
        title="Fax Center"
        description="See every fax that came in today, yesterday, this week, or all — including ones already filed. Notes stay separate from the Alora record name."
        actions={
          <div className="flex flex-wrap gap-2">
            <Suspense fallback={null}>
              <FaxCenterComposeControls />
            </Suspense>
            <Link href="/admin/fax/templates" className={crmActionBtnSky}>
              Cover templates
            </Link>
            <Link href="/admin/fax/document-templates" className={crmActionBtnSky}>
              Document templates
            </Link>
            <Link
              href={faxCenterListPath(
                {
                  tab: "inbox",
                  filing: "unfiled",
                  filingExplicit: true,
                  arrived: "all",
                  q: "",
                  unread: true,
                  from: "",
                  to: "",
                  span: f.span,
                  day: f.day,
                },
                1,
                todayYmd
              )}
              className={crmPrimaryCtaCls}
            >
              Review unread
            </Link>
            <span className="rounded-[20px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
              Saintly fax: {formatPhoneForDisplay("+14803934119")}
            </span>
          </div>
        }
      />

      {schemaMissing ? (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {inboxStatusMissing
            ? "Fax filing statuses are not in the database yet. Apply supabase/migrations/20260926120000_fax_messages_inbox_status.sql, then reload this page."
            : "The Fax Center migration has not been applied yet. Apply the new Supabase migration to create fax tables and storage policies."}
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={previousPeriodHref} className={crmActionBtnMuted} aria-label={`Previous ${period.span}`}>
              Previous
            </Link>
            <p className="min-w-[12rem] text-sm font-semibold text-slate-900">{period.label}</p>
            {period.canGoNext ? (
              <Link href={nextPeriodHref} className={crmActionBtnMuted} aria-label={`Next ${period.span}`}>
                Next
              </Link>
            ) : (
              <span
                className={`${crmActionBtnMuted} pointer-events-none cursor-not-allowed opacity-45 shadow-none hover:shadow-none`}
                aria-disabled="true"
              >
                Next
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Count period">
            {FAX_METRIC_SPANS.map((span) => (
              <Link
                key={span}
                href={metricPeriodHref(f, span, period.anchorYmd, todayYmd, page)}
                aria-current={period.span === span ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  period.span === span
                    ? "border-sky-300 bg-sky-50 text-sky-800"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {FAX_METRIC_SPAN_LABELS[span]}
              </Link>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["Incoming faxes", metrics.incoming],
              ["Sent faxes", metrics.sent],
              ["Failed faxes", metrics.failed],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">Counts use Arizona time.</p>
      </section>

      <div className="flex flex-wrap gap-2">
        {[
          ["inbox", "Inbox"],
          ["sent", "Sent"],
          ["failed", "Failed"],
          ["archived", "Archived"],
        ].map(([tab, label]) => (
          <Link
            key={tab}
            href={filterHref(tab, f, todayYmd)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              f.tab === tab ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {f.tab === "inbox" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Faxes that came in">
            {FAX_ARRIVED_PRESETS.map((preset) => (
              <Link
                key={preset}
                href={arrivedHref(preset, f, todayYmd)}
                aria-current={f.arrived === preset ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  f.arrived === preset
                    ? "border-sky-300 bg-sky-50 text-sky-800"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {FAX_ARRIVED_LABELS[preset]}
                <span className="ml-1.5 tabular-nums text-[11px] font-bold">
                  ({schemaMissing ? "—" : (arrivedCountByPreset[preset] ?? "—")})
                </span>
              </Link>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {f.arrived === "all"
              ? "Every inbound fax, newest first, including ones already filed."
              : `${arrivedWindow.label}. Newest first, including faxes already filed.`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {FAX_FILING_TABS.map((tab) => (
              <Link
                key={tab.id}
                href={filingHref(tab.id, f, todayYmd)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  f.filingExplicit && f.filing === tab.id
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 tabular-nums text-[11px] font-bold">
                  ({schemaMissing ? "—" : (filingCounts[tab.id] ?? "—")})
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <form method="get" action="/admin/fax" className={crmFilterBarCls}>
        <input type="hidden" name="tab" value={f.tab} />
        {f.tab === "inbox" && f.filingExplicit ? <input type="hidden" name="filing" value={f.filing} /> : null}
        {f.tab === "inbox" ? <input type="hidden" name="arrived" value={f.arrived} /> : null}
        {f.span !== "day" ? <input type="hidden" name="span" value={f.span} /> : null}
        {f.day && f.day !== todayYmd ? <input type="hidden" name="day" value={f.day} /> : null}
        <label className="flex min-w-[16rem] flex-[2] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Keyword search
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Record names, notes, fax numbers, names, subject, status…"
            className={`${crmFilterInputCls} min-w-[16rem]`}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          From
          <input type="date" name="from" defaultValue={f.from} className={crmFilterInputCls} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          To
          <input type="date" name="to" defaultValue={f.to} className={crmFilterInputCls} />
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" name="unread" value="1" defaultChecked={f.unread} />
          Unread
        </label>
        <button type="submit" className={crmActionBtnSky}>
          Apply
        </button>
      </form>

      <section className={crmListScrollOuterCls}>
        <FaxListSelectProvider faxIds={faxes.map((fax) => fax.id)}>
        <FaxBulkDeleteBar allowHardDelete={allowHardDelete} showDownloadSelected={inboxUnfiled} />
        <div className="min-w-[1280px] divide-y divide-slate-100">
          <div className={`${FAX_LIST_GRID_CLS} items-center bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500`}>
            <div>
              <FaxSelectAllCheckbox />
            </div>
            <div>Direction</div>
            <div>Sender / recipient</div>
            <div>Record name / note</div>
            <div>Pages</div>
            <div>Status</div>
            <div>Time</div>
            <div>Actions</div>
          </div>
          {faxes.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              {f.tab === "inbox" && !f.filingExplicit && !f.q && !f.unread && !f.from && !f.to && f.arrived === "today"
                ? "No faxes came in today."
                : f.tab === "inbox" && !f.filingExplicit && !f.q && !f.unread && !f.from && !f.to && f.arrived === "yesterday"
                  ? "No faxes came in yesterday."
                  : f.tab === "inbox" && !f.filingExplicit && !f.q && !f.unread && !f.from && !f.to && f.arrived === "week"
                    ? "No faxes came in this week."
                    : "No faxes match these filters."}
            </div>
          ) : (
            faxes.map((fax) => {
              const primaryPhone = fax.direction === "inbound" ? fax.from_number : fax.to_number;
              const primaryName = fax.direction === "inbound" ? fax.sender_name : fax.recipient_name;
              const primary = formatFaxSenderDisplay(primaryPhone, primaryName);
              const secondary = fax.direction === "inbound" ? fax.to_number : fax.from_number;
              const originalFromDisplay = [
                formatFaxSenderDisplay(fax.from_number, fax.sender_name) || null,
                fax.from_number ? formatPhoneForDisplay(fax.from_number) : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Unknown";
              const originalReceivedDisplay = formatFaxDateTimeDetail(fax.received_at ?? fax.created_at);
              return (
                <FaxListRowShell
                  key={fax.id}
                  faxId={fax.id}
                  className={`${FAX_LIST_GRID_CLS} items-start px-4 py-3 text-sm transition ${crmListRowHoverCls}`}
                >
                  <div>
                    <FaxRowCheckbox faxId={fax.id} />
                  </div>
                  <div className="pt-0.5">
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                        fax.direction === "inbound" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"
                      }`}
                    >
                      {fax.direction === "inbound" ? "Inbound" : "Outbound"}
                    </span>
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <Link href={faxDetailHref(fax.id, currentListPath)} className="block">
                      <p className="font-semibold text-slate-900">{primary || "Unknown sender"}</p>
                    </Link>
                    <p className="text-xs text-slate-500">{primaryPhone ? formatPhoneForDisplay(primaryPhone) : "No primary number"}</p>
                    <p className="text-xs text-slate-500">{secondary ? `Via ${formatPhoneForDisplay(secondary)}` : "No secondary number"}</p>
                    {!fax.is_read && fax.direction === "inbound" ? <p className="mt-1 text-[11px] font-bold text-sky-700">Unread</p> : null}
                  </div>
                  <div className="min-w-0 space-y-1">
                    {fax.direction === "inbound" ? (
                      <FaxDisplayTitleEditor faxId={fax.id} initialTitle={fax.display_title ?? null} variant="row" />
                    ) : null}
                    <FaxNoteListCell
                      faxId={fax.id}
                      initialNote={fax.note ?? null}
                      autoSummarize={
                        fax.direction === "inbound" &&
                        fax.status !== "failed" &&
                        Boolean(fax.storage_path || fax.media_url)
                      }
                    />
                  </div>
                  <div className="pt-2 text-slate-700">{fax.page_count ?? "—"}</div>
                  <div className="flex flex-col items-start gap-1 pt-1.5">
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${statusBadgeClass(fax.status)}`}>{fax.status}</span>
                    {fax.direction === "inbound" ? <FaxInboxStatusBadge status={faxInboxStatus(fax)} /> : null}
                    {fax.direction === "inbound" && fax.status_note ? (
                      <p className="line-clamp-3 max-w-[11rem] text-[11px] leading-snug text-slate-600" title={fax.status_note}>
                        {fax.status_note}
                      </p>
                    ) : null}
                  </div>
                  <div className="pt-2 text-xs text-slate-600">
                    {formatFaxDateTimeList(fax.received_at ?? fax.sent_at ?? fax.created_at)}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {fax.direction === "outbound" ? (
                      <OutboundFaxActions
                        faxId={fax.id}
                        toNumber={fax.to_number}
                        note={fax.note ?? null}
                        detailHref={faxDetailHref(fax.id, currentListPath)}
                        returnTo={currentListPath}
                        allowHardDelete={allowHardDelete}
                      />
                    ) : (
                      <>
                        <Link href={faxDetailHref(fax.id, currentListPath)} className={crmActionBtnMuted}>
                          Open
                        </Link>
                        {inboundFaxHasDocumentForForward(fax) ? (
                          <a
                            href={`/admin/fax/${fax.id}/pdf`}
                            download={faxPdfFilename({
                              displayTitle: fax.display_title,
                              note: fax.note,
                              faxId: fax.id,
                            })}
                            className={crmActionBtnMuted}
                          >
                            Download PDF
                          </a>
                        ) : null}
                        {inboundFaxHasDocumentForForward(fax) && !fax.filed_to_ehr_at ? (
                          <MarkFaxFiledButton faxId={fax.id} compact />
                        ) : null}
                        {inboundFaxHasDocumentForForward(fax) ? (
                          <ForwardInboundFaxButton
                            faxId={fax.id}
                            originalFromDisplay={originalFromDisplay}
                            originalReceivedDisplay={originalReceivedDisplay}
                            pageCount={fax.page_count}
                            variant="row"
                          />
                        ) : null}
                        <DeleteFaxButton faxId={fax.id} returnTo={currentListPath} allowHardDelete={allowHardDelete} compact />
                      </>
                    )}
                  </div>
                </FaxListRowShell>
              );
            })
          )}
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium">
            {schemaMissing
              ? "—"
              : faxes.length === 0
                ? "No results"
                : `Showing ${rangeStart}–${rangeEnd}`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {page <= 1 ? (
              <span
                className={`${crmActionBtnMuted} pointer-events-none cursor-not-allowed opacity-45 shadow-none hover:shadow-none`}
                aria-disabled="true"
              >
                Previous
              </span>
            ) : (
              <Link href={faxCenterListPath(f, page - 1, todayYmd)} className={crmActionBtnMuted}>
                Previous
              </Link>
            )}
            {hasNextPage ? (
              <Link href={faxCenterListPath(f, page + 1, todayYmd)} className={crmActionBtnMuted}>
                Next
              </Link>
            ) : (
              <span
                className={`${crmActionBtnMuted} pointer-events-none cursor-not-allowed opacity-45 shadow-none hover:shadow-none`}
                aria-disabled="true"
              >
                Next
              </span>
            )}
          </div>
        </div>
        </FaxListSelectProvider>
      </section>
    </div>
  );
}
