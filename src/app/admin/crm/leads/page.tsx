import Link from "next/link";
import { redirect } from "next/navigation";

import { CrmLeadsList } from "@/app/admin/crm/leads/_components/CrmLeadsList";
import { CrmLeadsDensityToggle } from "@/app/admin/crm/leads/_components/CrmLeadsDensityToggle";
import {
  ADMIN_CRM_LEADS_PAGE_SIZE,
  ADMIN_CRM_LEADS_CONTACT_STATUS_URL_VALUES,
  attachAdminCrmLeadListPredicates,
  EMPTY_CONTACT_SENTINEL,
  formatAdminCrmLeadsContactStatusLabel,
  isValidAdminCrmLeadsContactStatusFilter,
  parseAdminCrmLeadsListSearchParams,
  type AdminCrmLeadListUrlFilters,
} from "@/lib/crm/admin-crm-leads-list-filters";
import { harvestLeadsPayerFilterSuggestions } from "@/lib/crm/admin-crm-leads-payer-suggestions";
import { buildAdminCrmLeadsHref, type AdminCrmLeadListHrefState } from "@/lib/crm/admin-crm-leads-list-url";
import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import { contactRowsActiveOnly } from "@/lib/crm/contacts-active";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { LEAD_TEMPERATURE_VALUES, isValidLeadTemperature, leadTemperatureLabel } from "@/lib/crm/lead-temperature";
import { supabaseAdmin } from "@/lib/admin";
import { buildContactSearchOrClause } from "@/lib/crm/crm-leads-search";
import { ExportMarketingEmailsButton } from "@/components/admin/ExportMarketingEmailsButton";
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

const CRM_LEADS_LIST_SELECT_BASE =
  "id, contact_id, source, status, lead_type, owner_user_id, created_at, intake_status, referral_source, payer_name, payer_type, primary_payer_type, primary_payer_name, secondary_payer_type, secondary_payer_name, referring_provider_name, next_action, follow_up_date, follow_up_at, last_contact_at, last_outcome, service_disciplines, service_type, external_source_metadata, lead_temperature";

const CRM_LEADS_LIST_CONTACTS_EMBED =
  "contacts ( full_name, first_name, last_name, primary_phone, secondary_phone, email )";

const CRM_LEADS_LIST_SELECT_WITH_WAITING = `${CRM_LEADS_LIST_SELECT_BASE}, waiting_on_doctors_orders, ${CRM_LEADS_LIST_CONTACTS_EMBED}`;
const CRM_LEADS_LIST_SELECT_WITHOUT_WAITING = `${CRM_LEADS_LIST_SELECT_BASE}, ${CRM_LEADS_LIST_CONTACTS_EMBED}`;

const chipMuted =
  "inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm";

function parsePage(one: (k: string) => string): number {
  const raw = one("page").trim();
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function narrowingFiltersPresent(input: {
  q: string;
  contactStatus: string;
  leadPriority: string;
  owner: string;
  payer: string;
  followUpToday: boolean;
}): boolean {
  return Boolean(
    input.q.trim() ||
      input.owner.trim() ||
      input.payer.trim() ||
      (input.contactStatus.trim() && isValidAdminCrmLeadsContactStatusFilter(input.contactStatus.trim())) ||
      (input.leadPriority.trim() && isValidLeadTemperature(input.leadPriority.trim())) ||
      input.followUpToday
  );
}

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
      return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
    };

    const parsed = parseAdminCrmLeadsListSearchParams(rawSp);
    const followUpToday = parsed.followUp.toLowerCase() === "today";
    const f = {
      contactStatus: parsed.contactStatus,
      leadPriority: parsed.leadPriority,
      owner: parsed.owner,
      payer: parsed.payer,
      followUp: parsed.followUp,
      q: parsed.q,
    };
    const includeDead = parsed.includeDead;
    const todayIso = getCrmCalendarTodayIso();

    const urlFiltersForAttach: AdminCrmLeadListUrlFilters = {
      contactStatus: f.contactStatus,
      leadPriority: f.leadPriority,
      owner: f.owner,
      payer: f.payer,
      followUpToday,
      includeDead,
    };

    const densityRaw = one("density").trim().toLowerCase();
    const density = densityRaw === "comfortable" ? "comfortable" : "compact";

    const toastParam = one("toast").trim();
    const initialPageGuess = parsePage(one);

    const dismissToastHref = buildAdminCrmLeadsHref({
      ...f,
      includeDead,
      followUp: f.followUp,
      page: initialPageGuess,
      density,
    });

    const clearAllFiltersHref = "/admin/crm/leads";

    const { data: staffRows } = routePerfStepsEnabled()
      ? await routePerfTimed("admin_crm_leads.staff_options", () =>
          supabaseAdmin.from("staff_profiles").select("user_id, email, role, full_name").order("email", { ascending: true })
        )
      : await supabaseAdmin.from("staff_profiles").select("user_id, email, role, full_name").order("email", { ascending: true });

    const staffOptions = (staffRows ?? []) as {
      user_id: string;
      email: string | null;
      role: string;
      full_name: string | null;
    }[];

    const payerFilterOptions = routePerfStepsEnabled()
      ? await routePerfTimed("admin_crm_leads.payer_suggestions", () => harvestLeadsPayerFilterSuggestions(supabaseAdmin))
      : await harvestLeadsPayerFilterSuggestions(supabaseAdmin);

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
        contactIdFilter = [EMPTY_CONTACT_SENTINEL];
      }
    }

    const deps = { contactIdFilter, todayIso };

    const execFilteredExactCount = () => {
      let q = leadRowsActiveOnly(supabaseAdmin.from("leads").select("id", { count: "exact", head: true }));
      q = attachAdminCrmLeadListPredicates(q, urlFiltersForAttach, deps) as typeof q;
      return q;
    };

    const execBaselineExactCount = () => {
      return leadRowsActiveOnly(supabaseAdmin.from("leads").select("id", { count: "exact", head: true })).neq(
        "status",
        "dead_lead"
      );
    };

    const needBaseline = narrowingFiltersPresent({ ...f, followUpToday });

    const filteredCountPromise = routePerfStepsEnabled()
      ? routePerfTimed("admin_crm_leads.leads_count", () => execFilteredExactCount())
      : execFilteredExactCount();

    const baselineCountPromise =
      needBaseline && routePerfStepsEnabled()
        ? routePerfTimed("admin_crm_leads.leads_count_baseline", () => execBaselineExactCount())
        : needBaseline
          ? execBaselineExactCount()
          : Promise.resolve({ count: null as number | null, error: null });

    const [{ count: filteredExact, error: countErr }, baselineRes] = await Promise.all([
      filteredCountPromise,
      baselineCountPromise,
    ]);

    if (countErr) {
      console.warn("[crm/leads] leads count:", countErr.message);
    }

    const totalFiltered = typeof filteredExact === "number" ? filteredExact : 0;

    const computedTotalPages = totalFiltered <= 0 ? 1 : Math.max(1, Math.ceil(totalFiltered / ADMIN_CRM_LEADS_PAGE_SIZE));

    const requestedPage = initialPageGuess;
    let safePage = requestedPage > computedTotalPages ? computedTotalPages : requestedPage;
    safePage = Math.max(1, safePage);

    if (requestedPage !== safePage) {
      redirect(
        buildAdminCrmLeadsHref({
          ...f,
          includeDead,
          followUp: f.followUp,
          density,
          page: safePage,
        })
      );
    }

    const execRowsQuery = async (selectStr: string) => {
      const offset = (safePage - 1) * ADMIN_CRM_LEADS_PAGE_SIZE;
      const end = offset + ADMIN_CRM_LEADS_PAGE_SIZE - 1;
      let q = leadRowsActiveOnly(
        supabaseAdmin.from("leads").select(selectStr).order("created_at", { ascending: false }).order("id", { ascending: false })
      );
      q = attachAdminCrmLeadListPredicates(q, urlFiltersForAttach, deps) as typeof q;
      q = q.range(offset, end);
      return q;
    };

    let { data: rows, error } = routePerfStepsEnabled()
      ? await routePerfTimed("admin_crm_leads.leads_query", () => execRowsQuery(CRM_LEADS_LIST_SELECT_WITH_WAITING))
      : await execRowsQuery(CRM_LEADS_LIST_SELECT_WITH_WAITING);

    if (error && isMissingSchemaObjectError(error)) {
      ({ data: rows, error } = routePerfStepsEnabled()
        ? await routePerfTimed("admin_crm_leads.leads_query_legacy", () =>
            execRowsQuery(CRM_LEADS_LIST_SELECT_WITHOUT_WAITING)
          )
        : await execRowsQuery(CRM_LEADS_LIST_SELECT_WITHOUT_WAITING));
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

    const employeeOnlyView = false;

    const rangeStart = list.length === 0 ? 0 : (safePage - 1) * ADMIN_CRM_LEADS_PAGE_SIZE + 1;
    const rangeEnd = (safePage - 1) * ADMIN_CRM_LEADS_PAGE_SIZE + list.length;

    const hidingDeadByDefault = !includeDead;

    const hasSearchOrColumnFilters = narrowingFiltersPresent({ ...f, followUpToday });
    const baselineTotal =
      needBaseline && baselineRes && typeof baselineRes.count === "number" ? baselineRes.count : null;

    const hrefWith = (patch: Partial<AdminCrmLeadListHrefState>) =>
      buildAdminCrmLeadsHref({ ...f, includeDead, followUp: f.followUp, page: safePage, density, ...patch });

    const paginationPrevHref = safePage <= 1 ? null : hrefWith({ page: safePage - 1 });
    const paginationNextHref = safePage >= computedTotalPages ? null : hrefWith({ page: safePage + 1 });

    const ownerStaffRow = UUID_RE.test(f.owner.trim())
      ? staffOptions.find((s) => s.user_id === f.owner.trim())
      : undefined;
    const ownerLabelForChip = ownerStaffRow ? staffPrimaryLabel(ownerStaffRow) : null;

    const toastBanner =
      toastParam === "lead_deleted" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <span>Lead removed from the active list.</span>
          <Link href={dismissToastHref} className="font-semibold text-emerald-900 underline-offset-2 hover:underline">
            Dismiss
          </Link>
        </div>
      ) : toastParam === "lead_delete_failed" ||
        toastParam === "lead_delete_denied" ||
        toastParam === "lead_delete_invalid" ||
        toastParam === "lead_delete_gone" ? (
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

    const summaryPrimary =
      totalFiltered <= 0
        ? hasSearchOrColumnFilters || includeDead || safePage > 1
          ? "No leads match these filters."
          : "No leads found."
        : `Showing ${rangeStart}–${rangeEnd} of ${totalFiltered} leads`;

    const leadsListContextHref = buildAdminCrmLeadsHref({
      ...f,
      includeDead,
      followUp: f.followUp,
      page: safePage,
      density,
    });

    return (
      <div className="space-y-3 p-4 sm:space-y-4 sm:p-6">
        {toastBanner}

        <AdminPageHeader
          eyebrow="Pipeline"
          title="Leads"
          description={
            <>
              Paginated CRM list ({ADMIN_CRM_LEADS_PAGE_SIZE} per page). Rows with{" "}
              <span className="font-medium">Dead / not qualified</span> are hidden by default (use{" "}
              <span className="font-medium">Include dead / not qualified</span>); soft-deleted leads stay archived.
              {error ? <span className="mt-2 block text-sm text-red-700">{error.message}</span> : null}
              {countErr?.message ? (
                <span className="mt-2 block text-sm text-amber-800">Could not compute total ({countErr.message}).</span>
              ) : null}
            </>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <ExportMarketingEmailsButton exportPath="/admin/crm/leads/export-emails" />
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

        {/* Summary strip */}
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-semibold text-slate-900">{summaryPrimary}</div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              {totalFiltered > 0 ? (
                <span>
                  Page {safePage} of {computedTotalPages}
                  {hasSearchOrColumnFilters && baselineTotal !== null ? (
                    <>
                      {" "}
                      — filtered from <span className="font-medium text-slate-800">{baselineTotal}</span> leads with no list
                      filters (still excludes deleted rows and hides dead/not qualified like a fresh visit)
                    </>
                  ) : null}
                </span>
              ) : (
                <span>Open filters can hide rows — check chips below.</span>
              )}
              {hidingDeadByDefault ? (
                <span className="text-sky-900/85">
                  Hiding pipeline &quot;Dead / not qualified&quot; unless you enable Include dead.
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm">
              {paginationPrevHref ? (
                <Link
                  href={paginationPrevHref}
                  prefetch={false}
                  className="rounded-md px-2 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-50"
                >
                  Previous
                </Link>
              ) : (
                <span className="cursor-not-allowed rounded-md px-2 py-1 text-[11px] font-medium text-slate-400">Previous</span>
              )}
              <span className="text-[10px] text-slate-500">·</span>
              {paginationNextHref ? (
                <Link href={paginationNextHref} prefetch={false} className="rounded-md px-2 py-1 text-[11px] font-semibold text-sky-800 hover:bg-sky-50">
                  Next
                </Link>
              ) : (
                <span className="cursor-not-allowed rounded-md px-2 py-1 text-[11px] font-medium text-slate-400">Next</span>
              )}
            </div>
            <Link
              href={clearAllFiltersHref}
              prefetch={false}
              className="inline-flex rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Clear all filters
            </Link>
            <CrmLeadsDensityToggle density={density} />
          </div>
        </div>

        {/* Explicit filter chips (no silent filters) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {!hasSearchOrColumnFilters && !includeDead && safePage <= 1 ? (
            <span className={`${chipMuted} border-emerald-200/80 bg-emerald-50/60 text-emerald-950`}>Default list (no filters)</span>
          ) : null}
          {hidingDeadByDefault && safePage <= 1 ? (
            <span className={`${chipMuted} border-sky-200/80 bg-sky-50/70 text-sky-950`}>Hiding dead / not qualified by default</span>
          ) : null}

          {(() => {
            const cs = f.contactStatus.trim();
            if (!isValidAdminCrmLeadsContactStatusFilter(cs)) return null;
            return (
              <Link href={hrefWith({ contactStatus: "" })} prefetch={false} className={`${chipMuted} hover:border-sky-300 hover:bg-sky-50`}>
                Contact status: {formatAdminCrmLeadsContactStatusLabel(cs)}{" "}
                <span className="font-bold text-slate-500">×</span>
              </Link>
            );
          })()}
          {(() => {
            const lp = f.leadPriority.trim();
            if (!isValidLeadTemperature(lp)) return null;
            return (
              <Link href={hrefWith({ leadPriority: "" })} prefetch={false} className={`${chipMuted} hover:border-sky-300 hover:bg-sky-50`}>
                Priority: {leadTemperatureLabel(lp)}{" "}
                <span className="font-bold text-slate-500">×</span>
              </Link>
            );
          })()}
          {UUID_RE.test(f.owner.trim()) ? (
            <Link href={hrefWith({ owner: "" })} prefetch={false} className={`${chipMuted} hover:border-sky-300 hover:bg-sky-50`}>
              Owner: {ownerLabelForChip ?? f.owner.slice(0, 8)}{" "}
              <span className="font-bold text-slate-500">×</span>
            </Link>
          ) : null}
          {followUpToday ? (
            <Link href={hrefWith({ followUp: "" })} prefetch={false} className={`${chipMuted} hover:border-sky-300 hover:bg-sky-50`}>
              Follow-up: today <span className="font-bold text-slate-500">×</span>
            </Link>
          ) : null}
          {f.payer.trim() ? (
            <Link href={hrefWith({ payer: "" })} prefetch={false} className={`${chipMuted} max-w-[14rem] hover:border-sky-300 hover:bg-sky-50`}>
              <span className="truncate" title={f.payer}>
                Payer: {f.payer.length > 28 ? `${f.payer.slice(0, 28)}…` : f.payer}
              </span>{" "}
              <span className="font-bold text-slate-500">×</span>
            </Link>
          ) : null}
          {includeDead ? (
            <Link href={hrefWith({ includeDead: false })} prefetch={false} className={`${chipMuted} hover:border-sky-300 hover:bg-sky-50`}>
              Include dead / not qualified <span className="font-bold text-slate-500">×</span>
            </Link>
          ) : null}
          {f.q.trim() ? (
            <Link href={hrefWith({ q: "" })} prefetch={false} className={`${chipMuted} max-w-[18rem] hover:border-sky-300 hover:bg-sky-50`}>
              <span className="truncate" title={f.q}>
                Search: {f.q.slice(0, 40)}
                {f.q.length > 40 ? "…" : ""}
              </span>{" "}
              <span className="font-bold text-slate-500">×</span>
            </Link>
          ) : null}
          {safePage > 1 ? (
            <Link href={hrefWith({ page: 1 })} prefetch={false} className={`${chipMuted} hover:border-sky-300 hover:bg-sky-50`}>
              Page {safePage}
              <span className="font-bold text-slate-500">×</span>
            </Link>
          ) : null}
        </div>

        <form
          method="get"
          action="/admin/crm/leads"
          className="flex flex-wrap items-end gap-x-2 gap-y-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:rounded-[22px]"
        >
          {density === "comfortable" ? <input type="hidden" name="density" value="comfortable" /> : null}
          {followUpToday ? <input type="hidden" name="followUp" value="today" /> : null}
          <label className="flex min-w-[7.5rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Contact status
            <select
              name="contactStatus"
              defaultValue={isValidAdminCrmLeadsContactStatusFilter(f.contactStatus.trim()) ? f.contactStatus.trim() : ""}
              className={crmFilterInputCls}
            >
              <option value="">All</option>
              {ADMIN_CRM_LEADS_CONTACT_STATUS_URL_VALUES.map((v) => (
                <option key={v} value={v}>
                  {formatAdminCrmLeadsContactStatusLabel(v)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[7.5rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Lead priority
            <select name="leadPriority" defaultValue={isValidLeadTemperature(f.leadPriority.trim()) ? f.leadPriority.trim() : ""} className={crmFilterInputCls}>
              <option value="">All</option>
              {LEAD_TEMPERATURE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {leadTemperatureLabel(v)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[9rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
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
          <label className="flex min-w-[8.5rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Payer
            <input
              type="text"
              name="payer"
              list="crm-admin-leads-payer-list"
              defaultValue={f.payer}
              placeholder="Keyword (e.g. United, Humana)…"
              autoComplete="off"
              className={crmFilterInputCls}
            />
            <datalist id="crm-admin-leads-payer-list">
              {payerFilterOptions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="flex min-w-[min(100%,12rem)] flex-1 flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:min-w-[12rem]">
            Search name, phone, or email
            <input
              type="search"
              name="q"
              defaultValue={f.q}
              placeholder="Name, phone, or email…"
              className={`${crmFilterInputCls} min-h-[2rem]`}
            />
          </label>
          <label className="flex min-h-[2rem] cursor-pointer items-center gap-1 rounded-md border border-slate-200/90 bg-slate-50/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            <input
              type="checkbox"
              name="includeDead"
              value="1"
              defaultChecked={includeDead}
              className="h-3 w-3 rounded border-slate-300 text-sky-600"
            />
            Include dead
          </label>
          <button
            type="submit"
            className="rounded-lg border border-sky-600 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
          >
            Apply
          </button>
          <Link
            href={clearAllFiltersHref}
            className="inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear all filters
          </Link>
        </form>

        <CrmLeadsList
          initialList={list}
          employeeOnlyView={employeeOnlyView}
          staffOptions={staffOptions}
          todayIso={todayIso}
          smsConversationIdByContactId={smsConversationIdByContactId}
          initialDensity={density}
          leadsListContextHref={leadsListContextHref}
          emptyState={{
            narrowFiltersActive: hasSearchOrColumnFilters || includeDead || safePage > 1,
            clearHref: clearAllFiltersHref,
          }}
        />
      </div>
    );
  } finally {
    if (perfStart) {
      routePerfLog("admin/crm/leads", perfStart);
    }
  }
}
