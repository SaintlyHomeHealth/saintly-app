import Link from "next/link";
import { redirect } from "next/navigation";

import { CrmLeadsList } from "@/app/admin/crm/leads/_components/CrmLeadsList";
import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import {
  isValidLeadPipelineStatus,
  LEAD_PIPELINE_STATUS_OPTIONS,
} from "@/lib/crm/lead-pipeline-status";
import { LEAD_SOURCE_OPTIONS } from "@/lib/crm/lead-source-options";
import { PAYER_BROAD_CATEGORY_OPTIONS } from "@/lib/crm/payer-type-options";
import { contactRowsActiveOnly } from "@/lib/crm/contacts-active";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { SERVICE_DISCIPLINE_CODES } from "@/lib/crm/service-disciplines";
import { supabaseAdmin } from "@/lib/admin";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  contactDisplayName,
  normalizeContact,
  staffPrimaryLabel,
  type CrmLeadRow,
  type CrmLeadsContactEmb,
} from "@/lib/crm/crm-leads-table-helpers";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

function matchesDisciplineLead(
  serviceDisciplines: string[] | null,
  serviceType: string | null,
  disc: string
): boolean {
  const sd = Array.isArray(serviceDisciplines) ? serviceDisciplines : [];
  if (sd.includes(disc)) return true;
  const legacy = (serviceType ?? "").trim();
  if (!legacy) return false;
  return legacy.split(",").some((x) => x.trim() === disc);
}

function matchesSearchLead(contact: CrmLeadsContactEmb | null, q: string): boolean {
  if (!q.trim()) return true;
  const n = contactDisplayName(contact).toLowerCase();
  const phone = (contact?.primary_phone ?? "").toLowerCase();
  const needle = q.trim().toLowerCase();
  const phoneDigits = normalizePhone(contact?.primary_phone ?? "");
  const needleDigits = normalizePhone(q);
  if (needleDigits && phoneDigits.includes(needleDigits)) return true;
  return n.includes(needle) || phone.includes(needle);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_SENTINEL = "00000000-0000-0000-0000-000000000000";

function escapeIlikeToken(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/[(),]/g, " ");
}

export default async function AdminCrmLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const rawSp = await searchParams;
  const one = (k: string) => {
    const v = rawSp[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : "";
  };

  const f = {
    status: one("status").trim(),
    source: one("source").trim(),
    owner: one("owner").trim(),
    followUp: one("followUp").trim(),
    payerType: one("payerType").trim(),
    discipline: one("discipline").trim(),
    leadType: one("leadType").trim(),
    q: one("q").trim(),
  };

  const toastParam = one("toast").trim();
  const dismissToastHref = (() => {
    const u = new URLSearchParams();
    if (f.status) u.set("status", f.status);
    if (f.source) u.set("source", f.source);
    if (f.owner) u.set("owner", f.owner);
    if (f.followUp) u.set("followUp", f.followUp);
    if (f.payerType) u.set("payerType", f.payerType);
    if (f.discipline) u.set("discipline", f.discipline);
    if (f.leadType) u.set("leadType", f.leadType);
    if (f.q) u.set("q", f.q);
    const qs = u.toString();
    return qs ? `/admin/crm/leads?${qs}` : "/admin/crm/leads";
  })();

  const followUpToday = f.followUp.toLowerCase() === "today";
  const todayIso = getCrmCalendarTodayIso();

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, role, full_name")
    .order("email", { ascending: true });

  const staffOptions = (staffRows ?? []) as {
    user_id: string;
    email: string | null;
    role: string;
    full_name: string | null;
  }[];

  let contactIdFilter: string[] | null = null;
  if (f.q.trim()) {
    const needle = escapeIlikeToken(f.q.trim().slice(0, 120));
    const { data: hits } = await contactRowsActiveOnly(
      supabaseAdmin
        .from("contacts")
        .select("id")
        .or(`full_name.ilike.%${needle}%,primary_phone.ilike.%${needle}%`)
        .limit(300)
    );
    contactIdFilter = [...new Set((hits ?? []).map((h) => String(h.id)).filter(Boolean))];
    if (contactIdFilter.length === 0) {
      contactIdFilter = [EMPTY_SENTINEL];
    }
  }

  let query = leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select(
        "id, contact_id, source, status, lead_type, owner_user_id, created_at, intake_status, referral_source, payer_name, payer_type, referring_provider_name, next_action, follow_up_date, last_contact_at, last_outcome, service_disciplines, service_type, notes, external_source_metadata, contacts ( full_name, first_name, last_name, primary_phone, email )"
      )
      .order("created_at", { ascending: false })
      .limit(500)
  );

  if (contactIdFilter) {
    query = query.in("contact_id", contactIdFilter);
  }

  if (f.status && isValidLeadPipelineStatus(f.status)) {
    query = query.eq("status", f.status);
  }

  if (f.source && LEAD_SOURCE_OPTIONS.some((o) => o.value === f.source)) {
    query = query.eq("source", f.source);
  }

  if (UUID_RE.test(f.owner)) {
    query = query.eq("owner_user_id", f.owner);
  }

  if (followUpToday) {
    query = query.eq("follow_up_date", todayIso);
  }

  if (f.leadType !== "employee") {
    if (f.payerType && PAYER_BROAD_CATEGORY_OPTIONS.includes(f.payerType as (typeof PAYER_BROAD_CATEGORY_OPTIONS)[number])) {
      query = query.eq("payer_type", f.payerType);
    }
  }

  if (f.leadType === "employee") {
    query = query.eq("lead_type", "employee");
  } else if (f.leadType === "patient") {
    query = query.is("lead_type", null);
  }

  const { data: rows, error } = await query;

  let list = (rows ?? []) as CrmLeadRow[];

  if (f.leadType !== "employee" && f.discipline && SERVICE_DISCIPLINE_CODES.includes(f.discipline as (typeof SERVICE_DISCIPLINE_CODES)[number])) {
    list = list.filter((r) => matchesDisciplineLead(r.service_disciplines, r.service_type, f.discipline));
  }

  if (f.q.trim()) {
    list = list.filter((r) => matchesSearchLead(normalizeContact(r.contacts), f.q));
  }

  list = list.slice(0, 100);

  const employeeOnlyView = f.leadType === "employee";

  const filterInputCls =
    "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 shadow-sm";
  const addLeadCls =
    "inline-flex shrink-0 items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm shadow-sky-200/60 transition hover:-translate-y-px hover:shadow-md hover:shadow-sky-200/80 sm:text-sm";

  const toastBanner =
    toastParam === "lead_deleted" ? (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <span>Lead removed from the active list.</span>
        <Link href={dismissToastHref} className="font-semibold text-emerald-900 underline-offset-2 hover:underline">
          Dismiss
        </Link>
      </div>
    ) : toastParam === "lead_delete_failed" || toastParam === "lead_delete_denied" || toastParam === "lead_delete_invalid" || toastParam === "lead_delete_gone" ? (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
        <span>
          {toastParam === "lead_delete_denied"
            ? "You do not have permission to delete that lead."
            : toastParam === "lead_delete_gone"
              ? "That lead is no longer available (it may already be archived)."
              : toastParam === "lead_delete_invalid"
                ? "Could not delete that lead (missing reference)."
                : "Could not delete that lead. Try again."}
        </span>
        <Link href={dismissToastHref} className="font-semibold text-rose-900 underline-offset-2 hover:underline">
          Dismiss
        </Link>
      </div>
    ) : null;

  return (
    <div className="space-y-6 p-6">
      {toastBanner}
      <AdminPageHeader
        eyebrow="Pipeline"
        title="Leads"
        description={
          <>
            Intake and follow-ups — up to 100 rows after filters. Open a lead for full detail.
            {error ? <span className="mt-2 block text-sm text-red-700">{error.message}</span> : null}
          </>
        }
        actions={
          <Link href="/admin/crm/leads/new" className={addLeadCls}>
            + New Lead
          </Link>
        }
      />

      <form
        method="get"
        action="/admin/crm/leads"
        className="flex flex-wrap items-end gap-3 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Status
          <select name="status" defaultValue={f.status} className={filterInputCls}>
            <option value="">All</option>
            {LEAD_PIPELINE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Source
          <select name="source" defaultValue={f.source} className={filterInputCls}>
            <option value="">All</option>
            {LEAD_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Owner
          <select name="owner" defaultValue={f.owner} className={filterInputCls}>
            <option value="">All</option>
            {staffOptions.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {staffPrimaryLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Follow-up
          <select name="followUp" defaultValue={followUpToday ? "today" : ""} className={filterInputCls}>
            <option value="">Any</option>
            <option value="today">Today (Central)</option>
          </select>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Payer type
          <select name="payerType" defaultValue={f.payerType} className={filterInputCls}>
            <option value="">All</option>
            {PAYER_BROAD_CATEGORY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[6rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Discipline
          <select name="discipline" defaultValue={f.discipline} className={filterInputCls}>
            <option value="">All</option>
            {SERVICE_DISCIPLINE_CODES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Lead type
          <select name="leadType" defaultValue={f.leadType} className={filterInputCls}>
            <option value="">All (mixed)</option>
            <option value="patient">Patient &amp; referral</option>
            <option value="employee">Employee applicants</option>
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Search name / phone
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Name or phone…"
            className={filterInputCls}
          />
        </label>
        <button
          type="submit"
          className="rounded-lg border border-sky-600 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
        >
          Apply
        </button>
        <Link
          href="/admin/crm/leads"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear
        </Link>
      </form>

      {employeeOnlyView ? (
        <p className="text-xs text-slate-500">
          Applicant view: payer type and discipline filters are not applied. Use pipeline status and search as needed.
        </p>
      ) : null}

      <CrmLeadsList
        key={list.map((r) => r.id).join("|")}
        initialList={list}
        employeeOnlyView={employeeOnlyView}
        staffOptions={staffOptions}
      />
    </div>
  );
}
