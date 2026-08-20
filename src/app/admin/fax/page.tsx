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
import { formatFaxSenderDisplay } from "@/lib/fax/format-fax-sender";
import { formatFaxDateTimeDetail, formatFaxDateTimeList } from "@/lib/fax/format-fax-time";
import { inboundFaxHasDocumentForForward } from "@/lib/fax/forward-inbound-fax";
import { applyFaxListKeywordOrFilters, missingFaxSchema, type FaxMessageRow } from "@/lib/fax/fax-service";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

import { DeleteFaxButton } from "./_components/DeleteFaxButton";
import { FaxCenterComposeControls } from "./_components/FaxCenterComposeControls";
import {
  FaxBulkDeleteBar,
  FaxListRowShell,
  FaxListSelectProvider,
  FaxRowCheckbox,
  FaxSelectAllCheckbox,
} from "./_components/FaxListBulkSelect";
import { FaxNoteListCell } from "./_components/FaxNoteListCell";
import { ForwardInboundFaxButton } from "./_components/ForwardInboundFaxButton";
import { OutboundFaxActions } from "./_components/OutboundFaxActions";

export const dynamic = "force-dynamic";

const FAX_LIST_PAGE_SIZE = 20;
const FAX_LIST_GRID_CLS =
  "grid grid-cols-[32px_92px_minmax(180px,1fr)_minmax(320px,2.2fr)_56px_104px_128px_168px] gap-3";

type FaxListFilters = {
  tab: string;
  q: string;
  unread: boolean;
  from: string;
  to: string;
};

function faxCenterListPath(filters: FaxListFilters, page: number): string {
  const p = new URLSearchParams();
  p.set("tab", filters.tab);
  if (filters.q) p.set("q", filters.q);
  if (filters.unread) p.set("unread", "1");
  if (filters.from) p.set("from", filters.from);
  if (filters.to) p.set("to", filters.to);
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

function filterHref(tab: string): string {
  return `/admin/fax?tab=${tab}`;
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

  const f: FaxListFilters = {
    tab: one(raw, "tab") || "inbox",
    q: one(raw, "q").trim(),
    unread: one(raw, "unread") === "1",
    from: one(raw, "from").trim(),
    to: one(raw, "to").trim(),
  };
  const currentListPath = faxCenterListPath(f, page);

  let listQuery = supabaseAdmin.from("fax_messages").select("*").order("created_at", { ascending: false });

  if (f.tab === "sent") listQuery = listQuery.eq("direction", "outbound").not("status", "ilike", "%failed%");
  else if (f.tab === "failed") listQuery = listQuery.ilike("status", "%failed%");
  else if (f.tab === "archived") listQuery = listQuery.eq("is_archived", true);
  else listQuery = listQuery.eq("direction", "inbound").eq("is_archived", false);
  if (f.unread) listQuery = listQuery.eq("is_read", false);
  if (f.from) listQuery = listQuery.gte("created_at", `${f.from}T00:00:00.000Z`);
  if (f.to) listQuery = listQuery.lte("created_at", `${f.to}T23:59:59.999Z`);
  if (f.q) listQuery = applyFaxListKeywordOrFilters(listQuery, f.q);

  const rangeFrom = (page - 1) * FAX_LIST_PAGE_SIZE;
  const rangeTo = rangeFrom + FAX_LIST_PAGE_SIZE; // fetch pageSize + 1 rows (inclusive end index)
  listQuery = listQuery.range(rangeFrom, rangeTo);

  const { data, error } = await listQuery;
  const schemaMissing = missingFaxSchema(error);
  const pageSlice = schemaMissing ? [] : ((data ?? []) as FaxMessageRow[]);
  const hasNextPage = pageSlice.length > FAX_LIST_PAGE_SIZE;
  const faxes = hasNextPage ? pageSlice.slice(0, FAX_LIST_PAGE_SIZE) : pageSlice;
  const rangeStart = faxes.length === 0 ? 0 : rangeFrom + 1;
  const rangeEnd = rangeFrom + faxes.length;

  const { data: metricRows } = schemaMissing
    ? { data: [] }
    : await supabaseAdmin
        .from("fax_messages")
        .select("direction, status, is_read, is_archived, received_at, sent_at, created_at")
        .limit(1500);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const metrics = ((metricRows ?? []) as Pick<
    FaxMessageRow,
    "direction" | "status" | "is_read" | "is_archived" | "received_at" | "sent_at" | "created_at"
  >[]).reduce(
    (acc, fax) => {
      if (fax.direction === "inbound" && !fax.is_read && !fax.is_archived) acc.unread += 1;
      if (fax.direction === "inbound" && !fax.is_archived) acc.inbox += 1;
      if (fax.direction === "outbound" && fax.status.toLowerCase().includes("fail")) acc.failed += 1;
      const ts = fax.received_at ?? fax.sent_at ?? fax.created_at;
      if (ts && new Date(ts) >= weekAgo) acc.thisWeek += 1;
      return acc;
    },
    { unread: 0, inbox: 0, failed: 0, thisWeek: 0 }
  );

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Admin Fax"
        title="Fax Center"
        description="Inbound and outbound fax history with quick notes for every document."
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
            <Link href="/admin/fax?tab=inbox&unread=1" className={crmPrimaryCtaCls}>
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
          The Fax Center migration has not been applied yet. Apply the new Supabase migration to create fax tables and storage policies.
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["New unread faxes", metrics.unread],
          ["In inbox (active)", metrics.inbox],
          ["Failed outbound", metrics.failed],
          ["Faxes (last 7 days)", metrics.thisWeek],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
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
            href={filterHref(tab)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              f.tab === tab ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <form method="get" action="/admin/fax" className={crmFilterBarCls}>
        <input type="hidden" name="tab" value={f.tab} />
        <label className="flex min-w-[16rem] flex-[2] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Keyword search
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Notes, fax numbers, names, subject, status, inbound/outbound…"
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
        <FaxBulkDeleteBar allowHardDelete={allowHardDelete} />
        <div className="min-w-[1080px] divide-y divide-slate-100">
          <div className={`${FAX_LIST_GRID_CLS} items-center bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500`}>
            <div>
              <FaxSelectAllCheckbox />
            </div>
            <div>Direction</div>
            <div>Sender / recipient</div>
            <div>Note / description</div>
            <div>Pages</div>
            <div>Status</div>
            <div>Time</div>
            <div>Actions</div>
          </div>
          {faxes.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">No faxes match these filters.</div>
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
                  <div className="min-w-0">
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
                  <div className="pt-1.5">
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${statusBadgeClass(fax.status)}`}>{fax.status}</span>
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
              <Link href={faxCenterListPath(f, page - 1)} className={crmActionBtnMuted}>
                Previous
              </Link>
            )}
            {hasNextPage ? (
              <Link href={faxCenterListPath(f, page + 1)} className={crmActionBtnMuted}>
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
