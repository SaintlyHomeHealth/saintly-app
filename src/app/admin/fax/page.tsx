import Link from "next/link";
import { redirect } from "next/navigation";

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
import { missingFaxSchema, type FaxMessageRow } from "@/lib/fax/fax-service";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

import { DeleteFaxButton } from "./_components/DeleteFaxButton";
import { SendFaxButton } from "./_components/SendFaxButton";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const CATEGORIES = [
  ["", "All categories"],
  ["referral", "Referral"],
  ["orders", "Orders"],
  ["signed_docs", "Signed Docs"],
  ["insurance", "Insurance"],
  ["marketing", "Marketing"],
  ["misc", "Misc"],
] as const;

function one(raw: Record<string, string | string[] | undefined>, key: string): string {
  const value = raw[key];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("fail")) return "border-rose-200 bg-rose-50 text-rose-700";
  if (s.includes("delivered") || s.includes("received")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function categoryLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function matchedBadge(fax: FaxMessageRow): { label: string; className: string } {
  if (fax.patient_id) return { label: "Patient", className: "border-indigo-200 bg-indigo-50 text-indigo-700" };
  if (fax.lead_id) return { label: "Lead", className: "border-sky-200 bg-sky-50 text-sky-700" };
  if (fax.facility_id) return { label: "Facility", className: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  return { label: "Unassigned", className: "border-amber-200 bg-amber-50 text-amber-800" };
}

function searchMatches(fax: FaxMessageRow, q: string): boolean {
  if (!q) return true;
  const hay = [
    fax.from_number,
    fax.to_number,
    fax.sender_name,
    fax.recipient_name,
    fax.subject,
    fax.fax_number_label,
    fax.status,
    fax.category,
    fax.tags?.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function filterHref(tab: string): string {
  return `/admin/fax?tab=${tab}`;
}

export default async function AdminFaxCenterPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) redirect("/admin");
  const allowHardDelete = isAdminOrHigher(staff);

  const raw = await searchParams;
  const f = {
    tab: one(raw, "tab") || "inbox",
    q: one(raw, "q").trim(),
    unread: one(raw, "unread") === "1",
    unassigned: one(raw, "unassigned") === "1",
    category: one(raw, "category").trim(),
    from: one(raw, "from").trim(),
    to: one(raw, "to").trim(),
  };
  const currentSearch = new URLSearchParams();
  if (f.tab) currentSearch.set("tab", f.tab);
  if (f.q) currentSearch.set("q", f.q);
  if (f.unread) currentSearch.set("unread", "1");
  if (f.unassigned) currentSearch.set("unassigned", "1");
  if (f.category) currentSearch.set("category", f.category);
  if (f.from) currentSearch.set("from", f.from);
  if (f.to) currentSearch.set("to", f.to);
  const currentListPath = `/admin/fax${currentSearch.size ? `?${currentSearch.toString()}` : ""}`;

  let query = supabaseAdmin
    .from("fax_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (f.tab === "sent") query = query.eq("direction", "outbound").not("status", "ilike", "%failed%");
  else if (f.tab === "failed") query = query.ilike("status", "%failed%");
  else if (f.tab === "archived") query = query.eq("is_archived", true);
  else query = query.eq("direction", "inbound").eq("is_archived", false);
  if (f.unread) query = query.eq("is_read", false);
  if (f.category) query = query.eq("category", f.category);
  if (f.from) query = query.gte("created_at", `${f.from}T00:00:00.000Z`);
  if (f.to) query = query.lte("created_at", `${f.to}T23:59:59.999Z`);

  const { data, error } = await query;
  const schemaMissing = missingFaxSchema(error);
  let faxes = schemaMissing ? [] : ((data ?? []) as FaxMessageRow[]);
  if (f.unassigned) {
    faxes = faxes.filter((fax) => !fax.lead_id && !fax.patient_id && !fax.facility_id);
  }
  if (f.q) faxes = faxes.filter((fax) => searchMatches(fax, f.q));

  const { data: metricRows } = schemaMissing
    ? { data: [] }
    : await supabaseAdmin.from("fax_messages").select("direction, status, category, is_read, is_archived, lead_id, patient_id, facility_id, received_at, created_at").limit(1000);
  const metrics = ((metricRows ?? []) as FaxMessageRow[]).reduce(
    (acc, fax) => {
      if (fax.direction === "inbound" && !fax.is_read && !fax.is_archived) acc.unread += 1;
      if (fax.direction === "inbound" && !fax.is_archived && !fax.lead_id && !fax.patient_id && !fax.facility_id) acc.unassigned += 1;
      if (fax.direction === "outbound" && fax.status.toLowerCase().includes("fail")) acc.failed += 1;
      const received = fax.received_at ? new Date(fax.received_at) : null;
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      if (fax.category === "referral" && received && received >= weekAgo) acc.referralsThisWeek += 1;
      return acc;
    },
    { unread: 0, unassigned: 0, failed: 0, referralsThisWeek: 0 }
  );

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Admin Fax"
        title="Fax Center"
        description="Inbound referrals, orders, signatures, and fax history."
        actions={
          <div className="flex flex-wrap gap-2">
            <SendFaxButton />
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
          ["Unassigned faxes", metrics.unassigned],
          ["Failed outbound", metrics.failed],
          ["Referrals received this week", metrics.referralsThisWeek],
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
        <label className="flex min-w-[14rem] flex-1 flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Search
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Fax number, sender, patient, lead, facility…"
            className={`${crmFilterInputCls} min-w-[14rem]`}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Category
          <select name="category" defaultValue={f.category} className={crmFilterInputCls}>
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
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
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" name="unassigned" value="1" defaultChecked={f.unassigned} />
          Unassigned
        </label>
        <button type="submit" className={crmActionBtnSky}>
          Apply filters
        </button>
      </form>

      <section className={crmListScrollOuterCls}>
        <div className="min-w-[980px] divide-y divide-slate-100">
          <div className="grid grid-cols-[90px_1.2fr_120px_120px_80px_110px_130px_120px_120px] gap-3 bg-slate-50 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <div>Direction</div>
            <div>Sender / recipient</div>
            <div>Matched</div>
            <div>Category</div>
            <div>Pages</div>
            <div>Status</div>
            <div>Time</div>
            <div>Assigned</div>
            <div>Actions</div>
          </div>
          {faxes.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">No faxes match these filters.</div>
          ) : (
            faxes.map((fax) => {
              const match = matchedBadge(fax);
              const primaryPhone = fax.direction === "inbound" ? fax.from_number : fax.to_number;
              const primaryName = fax.direction === "inbound" ? fax.sender_name : fax.recipient_name;
              const primary = formatFaxSenderDisplay(primaryPhone, primaryName);
              const secondary = fax.direction === "inbound" ? fax.to_number : fax.from_number;
              return (
                <div
                  key={fax.id}
                  className={`grid grid-cols-[90px_1.2fr_120px_120px_80px_110px_130px_120px_120px] gap-3 px-4 py-3 text-sm transition ${crmListRowHoverCls}`}
                >
                  <div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${fax.direction === "inbound" ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>
                      {fax.direction === "inbound" ? "Inbound" : "Outbound"}
                    </span>
                  </div>
                  <div>
                    <Link href={`/admin/fax/${fax.id}`} className="block">
                      <p className="font-semibold text-slate-900">{primary || "Unknown sender"}</p>
                    </Link>
                    <p className="text-xs text-slate-500">{primaryPhone ? formatPhoneForDisplay(primaryPhone) : "No primary number"}</p>
                    <p className="text-xs text-slate-500">{secondary ? `Via ${formatPhoneForDisplay(secondary)}` : "No secondary number"}</p>
                    {!fax.is_read && fax.direction === "inbound" ? <p className="mt-1 text-[11px] font-bold text-sky-700">Unread</p> : null}
                  </div>
                  <div>
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${match.className}`}>{match.label}</span>
                  </div>
                  <div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                      {categoryLabel(fax.category)}
                    </span>
                  </div>
                  <div className="text-slate-700">{fax.page_count ?? "—"}</div>
                  <div>
                    <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${statusBadgeClass(fax.status)}`}>{fax.status}</span>
                  </div>
                  <div className="text-xs text-slate-600">{formatDateTime(fax.received_at ?? fax.sent_at ?? fax.created_at)}</div>
                  <div className="text-xs text-slate-600">{fax.assigned_to_user_id ? "Assigned" : "Unassigned"}</div>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/fax/${fax.id}`} className={crmActionBtnMuted}>
                      Open
                    </Link>
                    <DeleteFaxButton
                      faxId={fax.id}
                      returnTo={currentListPath}
                      allowHardDelete={allowHardDelete}
                      compact
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
