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
import { buildContactSearchOrClause, escapeForIlike } from "@/lib/crm/crm-leads-search";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { staffPrimaryLabel, type CrmLeadRow } from "@/lib/crm/crm-leads-table-helpers";
import {
  routePerfLog,
  routePerfStart,
  routePerfStepsEnabled,
  routePerfTimed,
} from "@/lib/perf/route-perf";
import { isMissingSchemaObjectError } from "@/lib/crm/supabase-migration-fallback";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_SENTINEL = "00000000-0000-0000-0000-000000000000";
const CRM_LEADS_LIST_LIMIT = 100;

/** `public.leads` — shared column list for CRM list (without optional migration-gated columns). */
const CRM_LEADS_LIST_SELECT_BASE =
  "id, contact_id, source, status, lead_type, owner_user_id, created_at, intake_status, referral_source, payer_name, payer_type, primary_payer_type, primary_payer_name, secondary_payer_type, secondary_payer_name, referring_provider_name, next_action, follow_up_date, last_contact_at, last_outcome, service_disciplines, service_type, external_source_metadata, lead_temperature";

const CRM_LEADS_LIST_CONTACTS_EMBED =
  "contacts ( full_name, first_name, last_name, primary_phone, secondary_phone, email )";

/** Includes `waiting_on_doctors_orders` after migration `20260424120000_leads_waiting_on_doctors_orders.sql`. */
const CRM_LEADS_LIST_SELECT_WITH_WAITING = `${CRM_LEADS_LIST_SELECT_BASE}, waiting_on_doctors_orders, ${CRM_LEADS_LIST_CONTACTS_EMBED}`;

const CRM_LEADS_LIST_SELECT_WITHOUT_WAITING = `${CRM_LEADS_LIST_SELECT_BASE}, ${CRM_LEADS_LIST_CONTACTS_EMBED}`;

export default async function AdminCrmLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const perfStart = routePerfStart();
  try {
    const staff = routePerfStepsEnabled()
      ? await routePerfTimed("admin_crm_leads.staff_profile", getStaffProfile)
      : await getStaffProfile();
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
  const showDead = one("showDead").trim() === "1";

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
    if (showDead) u.set("showDead", "1");
    const qs = u.toString();
    return qs ? `/admin/crm/leads?${qs}` : "/admin/crm/leads";
  })();

  const followUpToday = f.followUp.toLowerCase() === "today";
  const todayIso = getCrmCalendarTodayIso();

    const { data: staffRows } = routePerfStepsEnabled()
      ? await routePerfTimed("admin_crm_leads.staff_options", () =>
          supabaseAdmin
            .from("staff_profiles")
            .select("user_id, email, role, full_name")
            .order("email", { ascending: true })
        )
      : await supabaseAdmin
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
  const contactOr = buildContactSearchOrClause(f.q);
  if (contactOr) {
    const { data: hits } = routePerfStepsEnabled()
      ? await routePerfTimed("admin_crm_leads.contact_search", () =>
          contactRowsActiveOnly(supabaseAdmin.from("contacts").select("id").or(contactOr).limit(300))
        )
      : await contactRowsActiveOnly(supabaseAdmin.from("contacts").select("id").or(contactOr).limit(300));
    contactIdFilter = [...new Set((hits ?? []).map((h) => String(h.id)).filter(Boolean))];
    if (contactIdFilter.length === 0) {
      contactIdFilter = [EMPTY_SENTINEL];
    }
  }

  const buildFilteredLeadsQuery = (selectStr: string) => {
    let q = leadRowsActiveOnly(
      supabaseAdmin
        .from("leads")
        .select(selectStr)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(CRM_LEADS_LIST_LIMIT)
    );

    if (contactIdFilter) {
      q = q.in("contact_id", contactIdFilter);
    }

    if (f.status && isValidLeadPipelineStatus(f.status)) {
      q = q.eq("status", f.status);
    }

    if (f.source && LEAD_SOURCE_OPTIONS.some((o) => o.value === f.source)) {
      q = q.eq("source", f.source);
    }

    if (UUID_RE.test(f.owner)) {
      q = q.eq("owner_user_id", f.owner);
    }

    if (followUpToday) {
      q = q.eq("follow_up_date", todayIso);
    }

    if (f.leadType !== "employee") {
      if (f.payerType && PAYER_BROAD_CATEGORY_OPTIONS.includes(f.payerType as (typeof PAYER_BROAD_CATEGORY_OPTIONS)[number])) {
        q = q.eq("payer_type", f.payerType);
      }
      if (f.discipline && SERVICE_DISCIPLINE_CODES.includes(f.discipline as (typeof SERVICE_DISCIPLINE_CODES)[number])) {
        q = q.or(`service_disciplines.ov.{${f.discipline}},service_type.ilike.%${escapeForIlike(f.discipline)}%`);
      }
    }

    if (f.leadType === "employee") {
      q = q.eq("lead_type", "employee");
    } else if (f.leadType === "patient") {
      q = q.is("lead_type", null);
    }

    if (!showDead && !f.status) {
      q = q.neq("status", "dead_lead");
    }

    return q;
  };

  let { data: rows, error } = routePerfStepsEnabled()
    ? await routePerfTimed("admin_crm_leads.leads_query", () =>
        buildFilteredLeadsQuery(CRM_LEADS_LIST_SELECT_WITH_WAITING)
      )
    : await buildFilteredLeadsQuery(CRM_LEADS_LIST_SELECT_WITH_WAITING);
  if (error && isMissingSchemaObjectError(error)) {
    ({ data: rows, error } = routePerfStepsEnabled()
      ? await routePerfTimed("admin_crm_leads.leads_query_legacy", () =>
          buildFilteredLeadsQuery(CRM_LEADS_LIST_SELECT_WITHOUT_WAITING)
        )
      : await buildFilteredLeadsQuery(CRM_LEADS_LIST_SELECT_WITHOUT_WAITING));
  }
  if (error) {
    console.warn("[crm/leads] leads query failed:", error.message);
  }

  const list = (rows ?? []) as unknown as CrmLeadRow[];

  const contactIdsForSms = [
    ...new Set(
      list
        .map((r) => (typeof r.contact_id === "string" ? r.contact_id.trim() : ""))
        .filter((id) => id && UUID_RE.test(id))
    ),
  ];

  const smsConversationIdByContactId: Record<string, string> = {};
  if (contactIdsForSms.length > 0) {
    const { data: convRows, error: convErr } = routePerfStepsEnabled()
      ? await routePerfTimed("admin_crm_leads.sms_thread_lookup", () =>
          supabaseAdmin
            .from("conversations")
            .select("id, primary_contact_id, last_message_at")
            .eq("channel", "sms")
            .in("primary_contact_id", contactIdsForSms)
            .is("deleted_at", null)
        )
      : await supabaseAdmin
          .from("conversations")
          .select("id, primary_contact_id, last_message_at")
          .eq("channel", "sms")
          .in("primary_contact_id", contactIdsForSms)
          .is("deleted_at", null);

    if (convErr) {
      console.warn("[crm/leads] sms thread lookup:", convErr.message);
    } else {
      const sorted = [...(convRows ?? [])].sort((a, b) => {
        const ta = String(a.last_message_at ?? "");
        const tb = String(b.last_message_at ?? "");
        return tb.localeCompare(ta);
      });
      const seen = new Set<string>();
      for (const row of sorted) {
        const pc = typeof row.primary_contact_id === "string" ? row.primary_contact_id.trim() : "";
        const id = typeof row.id === "string" ? row.id.trim() : "";
        if (!pc || !id || seen.has(pc)) continue;
        seen.add(pc);
        smsConversationIdByContactId[pc] = id;
      }
    }
  }

  const employeeOnlyView = f.leadType === "employee";

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
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/crm/leads/import"
              className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Import CSV
            </Link>
            <Link href="/admin/crm/leads/new" className={crmPrimaryCtaCls}>
              + New Lead
            </Link>
          </div>
        }
      />

      <form
        method="get"
        action="/admin/crm/leads"
        className="flex flex-wrap items-end gap-2 rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm"
      >
        <label className="flex min-w-[7.5rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Status
          <select name="status" defaultValue={f.status} className={crmFilterInputCls}>
            <option value="">All</option>
            {LEAD_PIPELINE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[7.5rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Source
          <select name="source" defaultValue={f.source} className={crmFilterInputCls}>
            <option value="">All</option>
            {LEAD_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[9.5rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Owner
          <select name="owner" defaultValue={f.owner} className={crmFilterInputCls}>
            <option value="">All</option>
            {staffOptions.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {staffPrimaryLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[7.5rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Follow-up
          <select name="followUp" defaultValue={followUpToday ? "today" : ""} className={crmFilterInputCls}>
            <option value="">Any</option>
            <option value="today">Today (Central)</option>
          </select>
        </label>
        <label className="flex min-w-[7.5rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Payer type
          <select name="payerType" defaultValue={f.payerType} className={crmFilterInputCls}>
            <option value="">All</option>
            {PAYER_BROAD_CATEGORY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[5.5rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Discipline
          <select name="discipline" defaultValue={f.discipline} className={crmFilterInputCls}>
            <option value="">All</option>
            {SERVICE_DISCIPLINE_CODES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[9.5rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Lead type
          <select name="leadType" defaultValue={f.leadType} className={crmFilterInputCls}>
            <option value="">All (mixed)</option>
            <option value="patient">Patient &amp; referral</option>
            <option value="employee">Employee applicants</option>
          </select>
        </label>
        <div className="flex min-h-[2.25rem] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium text-slate-600">
            <input type="checkbox" name="showDead" value="1" defaultChecked={showDead} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600" />
            Show dead leads
          </label>
        </div>
        <label className="flex min-w-[min(100%,14rem)] flex-1 flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:min-w-[14rem]">
          Search name, phone, or email
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Name, phone, or email…"
            className={`${crmFilterInputCls} min-h-[2.25rem]`}
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
        initialList={list}
        employeeOnlyView={employeeOnlyView}
        staffOptions={staffOptions}
        todayIso={todayIso}
        smsConversationIdByContactId={smsConversationIdByContactId}
      />
    </div>
    );
  } finally {
    if (perfStart) {
      routePerfLog("admin/crm/leads", perfStart);
    }
  }
}
