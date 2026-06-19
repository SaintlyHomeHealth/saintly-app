import Link from "next/link";
import { redirect } from "next/navigation";

import { CrmLeadsList } from "@/app/admin/crm/leads/_components/CrmLeadsList";
import { CrmLeadsDensityToggle } from "@/app/admin/crm/leads/_components/CrmLeadsDensityToggle";
import { CrmLeadsStatsCards } from "@/app/admin/crm/leads/_components/CrmLeadsStatsCards";
import {
  ADMIN_CRM_LEADS_PAGE_SIZE,
  ADMIN_CRM_LEADS_CONTACT_STATUS_URL_VALUES,
  attachAdminCrmLeadListPredicates,
  formatAdminCrmLeadsContactStatusLabel,
  isValidAdminCrmLeadsContactStatusFilter,
  parseAdminCrmLeadsListSearchParams,
  type AdminCrmLeadListUrlFilters,
} from "@/lib/crm/admin-crm-leads-list-filters";
import { resolveAdminCrmLeadsKeywordLeadSearchOr } from "@/lib/crm/admin-crm-leads-keyword-search";
import { harvestLeadsPayerFilterSuggestions } from "@/lib/crm/admin-crm-leads-payer-suggestions";
import {
  ADMIN_CRM_LEADS_LIST_PATH_PREFIX,
  buildAdminCrmLeadDetailHref,
  buildAdminCrmLeadsHref,
  type AdminCrmLeadListHrefState,
} from "@/lib/crm/admin-crm-leads-list-url";
import { crmLeadsIdDebugEnabled, logCrmLeadIdDebug } from "@/lib/crm/crm-lead-id";
import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import { attachExcludeRecruitingCrmLeadsPredicates } from "@/lib/crm/crm-recruiting-lead-exclusion";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { LEAD_TEMPERATURE_VALUES, isValidLeadTemperature, leadTemperatureLabel } from "@/lib/crm/lead-temperature";
import { supabaseAdmin } from "@/lib/admin";
import { ExportMarketingEmailsButton } from "@/components/admin/ExportMarketingEmailsButton";
import {
  AdminBadge,
  AdminFilterLabel,
  AdminFilterPanel,
  AdminHeroHeader,
  AdminListToolbar,
  AdminPageShell,
  AdminPaginationBar,
  AdminRemovableBadge,
  adminAlertErrorCls,
  adminAlertSuccessCls,
  adminSecondaryBtnCls,
} from "@/components/admin/design-system";
import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { normalizeCrmLeadRowForClient, staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import {
  isSalesAgentProducedLead,
  resolveSalesAgentStaffDisplayBatch,
} from "@/lib/crm/sales-agent-produced-by";
import {
  routePerfLog,
  routePerfStart,
  routePerfStepsEnabled,
  routePerfTimed,
} from "@/lib/perf/route-perf";
import { isMissingSchemaObjectError } from "@/lib/crm/supabase-migration-fallback";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isNextControlFlowError(error: unknown): boolean {
  const digest = error && typeof error === "object" && "digest" in error ? String(error.digest) : "";
  return (
    digest.startsWith("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") ||
    digest === "DYNAMIC_SERVER_USAGE"
  );
}

/** Omit `external_source_metadata` — large JSONB; hydrate only employee rows via a narrow follow-up query. */
const CRM_LEADS_LIST_SELECT_BASE_CORE =
  "id, contact_id, source, status, lead_type, owner_user_id, produced_by_sales_agent_id, ownership_locked, assigned_to_staff_id, created_at, intake_status, referral_source, payer_name, payer_type, primary_payer_type, primary_payer_name, secondary_payer_type, secondary_payer_name, referring_provider_name, next_action, follow_up_date, follow_up_at, last_contact_at, last_outcome, service_disciplines, service_type, lead_temperature, notes";

const CRM_LEADS_LIST_SELECT_BASE = `${CRM_LEADS_LIST_SELECT_BASE_CORE}, call_attempt_count`;

const CRM_LEADS_LIST_CONTACTS_EMBED =
  "contacts ( full_name, first_name, last_name, primary_phone, secondary_phone, email, city )";

const CRM_LEADS_LIST_SELECT_WITH_WAITING = `${CRM_LEADS_LIST_SELECT_BASE}, waiting_on_doctors_orders, waiting_on_insurance_verification, ${CRM_LEADS_LIST_CONTACTS_EMBED}`;
const CRM_LEADS_LIST_SELECT_DOCTORS_HOLD_ONLY = `${CRM_LEADS_LIST_SELECT_BASE}, waiting_on_doctors_orders, ${CRM_LEADS_LIST_CONTACTS_EMBED}`;
const CRM_LEADS_LIST_SELECT_WITHOUT_WAITING = `${CRM_LEADS_LIST_SELECT_BASE}, ${CRM_LEADS_LIST_CONTACTS_EMBED}`;

/** Before migration `20260509120000_leads_call_attempt_count.sql`. */
const CRM_LEADS_LIST_SELECT_WITH_WAITING_PRE_CALL_ATTEMPTS = `${CRM_LEADS_LIST_SELECT_BASE_CORE}, waiting_on_doctors_orders, waiting_on_insurance_verification, ${CRM_LEADS_LIST_CONTACTS_EMBED}`;
const CRM_LEADS_LIST_SELECT_DOCTORS_HOLD_ONLY_PRE_CALL_ATTEMPTS = `${CRM_LEADS_LIST_SELECT_BASE_CORE}, waiting_on_doctors_orders, ${CRM_LEADS_LIST_CONTACTS_EMBED}`;
const CRM_LEADS_LIST_SELECT_WITHOUT_WAITING_PRE_CALL_ATTEMPTS = `${CRM_LEADS_LIST_SELECT_BASE_CORE}, ${CRM_LEADS_LIST_CONTACTS_EMBED}`;

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
  salesAgent: string;
  followUpToday: boolean;
}): boolean {
  return Boolean(
    input.q.trim() ||
      input.owner.trim() ||
      input.payer.trim() ||
      input.salesAgent.trim() ||
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
    if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
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
      salesAgent: parsed.salesAgent,
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
      salesAgent: f.salesAgent,
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

    const salesAgentOptions = staffOptions.filter((s) => (s.role ?? "").trim() === "sales_agent");

    const payerFilterOptions = routePerfStepsEnabled()
      ? await routePerfTimed("admin_crm_leads.payer_suggestions", () => harvestLeadsPayerFilterSuggestions(supabaseAdmin))
      : await harvestLeadsPayerFilterSuggestions(supabaseAdmin);

    const keywordLeadSearchOr =
      f.q.trim().length > 0
        ? routePerfStepsEnabled()
          ? await routePerfTimed("admin_crm_leads.keyword_search", () =>
              resolveAdminCrmLeadsKeywordLeadSearchOr(supabaseAdmin, f.q)
            )
          : await resolveAdminCrmLeadsKeywordLeadSearchOr(supabaseAdmin, f.q)
        : null;

    const deps = { todayIso, keywordLeadSearchOr };

    const execFilteredExactCount = () => {
      let q = leadRowsActiveOnly(supabaseAdmin.from("leads").select("id", { count: "exact", head: true }));
      q = attachAdminCrmLeadListPredicates(q, urlFiltersForAttach, deps) as typeof q;
      return q;
    };

    const execBaselineExactCount = () => {
      let q = leadRowsActiveOnly(supabaseAdmin.from("leads").select("id", { count: "exact", head: true }))
        .neq("status", "dead_lead");
      q = attachExcludeRecruitingCrmLeadsPredicates(q) as typeof q;
      return q;
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
        ? await routePerfTimed("admin_crm_leads.leads_query_doctors_hold_only", () =>
            execRowsQuery(CRM_LEADS_LIST_SELECT_DOCTORS_HOLD_ONLY)
          )
        : await execRowsQuery(CRM_LEADS_LIST_SELECT_DOCTORS_HOLD_ONLY));
    }
    if (error && isMissingSchemaObjectError(error)) {
      ({ data: rows, error } = routePerfStepsEnabled()
        ? await routePerfTimed("admin_crm_leads.leads_query_legacy", () =>
            execRowsQuery(CRM_LEADS_LIST_SELECT_WITHOUT_WAITING)
          )
        : await execRowsQuery(CRM_LEADS_LIST_SELECT_WITHOUT_WAITING));
    }
    if (error && isMissingSchemaObjectError(error)) {
      ({ data: rows, error } = routePerfStepsEnabled()
        ? await routePerfTimed("admin_crm_leads.leads_query_pre_call_attempts", () =>
            execRowsQuery(CRM_LEADS_LIST_SELECT_WITH_WAITING_PRE_CALL_ATTEMPTS)
          )
        : await execRowsQuery(CRM_LEADS_LIST_SELECT_WITH_WAITING_PRE_CALL_ATTEMPTS));
    }
    if (error && isMissingSchemaObjectError(error)) {
      ({ data: rows, error } = routePerfStepsEnabled()
        ? await routePerfTimed("admin_crm_leads.leads_query_doctors_pre_call_attempts", () =>
            execRowsQuery(CRM_LEADS_LIST_SELECT_DOCTORS_HOLD_ONLY_PRE_CALL_ATTEMPTS)
          )
        : await execRowsQuery(CRM_LEADS_LIST_SELECT_DOCTORS_HOLD_ONLY_PRE_CALL_ATTEMPTS));
    }
    if (error && isMissingSchemaObjectError(error)) {
      ({ data: rows, error } = routePerfStepsEnabled()
        ? await routePerfTimed("admin_crm_leads.leads_query_legacy_pre_call_attempts", () =>
            execRowsQuery(CRM_LEADS_LIST_SELECT_WITHOUT_WAITING_PRE_CALL_ATTEMPTS)
          )
        : await execRowsQuery(CRM_LEADS_LIST_SELECT_WITHOUT_WAITING_PRE_CALL_ATTEMPTS));
    }
    if (error) {
      console.warn("[crm/leads] leads query failed:", error.message);
    }

    const list = (rows ?? []).map((row) =>
      normalizeCrmLeadRowForClient(row as Record<string, unknown>)
    );

    if (crmLeadsIdDebugEnabled()) {
      const qLower = f.q.trim().toLowerCase();
      const debugRows = qLower.includes("kofi") ? list : list.slice(0, 8);
      for (const r of debugRows) {
        logCrmLeadIdDebug("admin_crm_leads.list_row", {
          rawFromDb: r.id,
          normalized: r.id,
          openHref: buildAdminCrmLeadDetailHref(r.id, ADMIN_CRM_LEADS_LIST_PATH_PREFIX),
        });
      }
    }

    const employeeLeadIdsForMeta = [
      ...new Set(
        list
          .filter((r) => (r.lead_type ?? "").trim().toLowerCase() === "employee")
          .map((r) => String(r.id).trim())
          .filter((id) => id && UUID_RE.test(id))
      ),
    ];
    if (employeeLeadIdsForMeta.length > 0) {
      const { data: metaRows, error: metaErr } = routePerfStepsEnabled()
        ? await routePerfTimed("admin_crm_leads.employee_external_metadata", () =>
            leadRowsActiveOnly(
              supabaseAdmin
                .from("leads")
                .select("id, external_source_metadata")
                .in("id", employeeLeadIdsForMeta)
            )
          )
        : await leadRowsActiveOnly(
            supabaseAdmin.from("leads").select("id, external_source_metadata").in("id", employeeLeadIdsForMeta)
          );
      if (metaErr) {
        console.warn("[crm/leads] employee metadata batch:", metaErr.message);
      } else {
        const byId = new Map<string, unknown>();
        for (const mr of metaRows ?? []) {
          const id = typeof (mr as { id?: unknown }).id === "string" ? String((mr as { id: string }).id).trim() : "";
          if (id) byId.set(id, (mr as Record<string, unknown>).external_source_metadata ?? null);
        }
        for (const r of list) {
          const lid = typeof r.id === "string" ? r.id.trim() : "";
          if (!lid || !byId.has(lid)) continue;
          (r as { external_source_metadata?: unknown }).external_source_metadata = byId.get(lid) ?? null;
        }
      }
    }

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

    const salesAgentProducerRefs = [
      ...new Set(
        list
          .filter((r) =>
            isSalesAgentProducedLead({
              source: r.source,
              producedBySalesAgentId: r.produced_by_sales_agent_id,
              ownershipLocked: r.ownership_locked,
            })
          )
          .map((r) => (r.produced_by_sales_agent_id ?? "").trim())
          .filter(Boolean)
      ),
    ];
    const producedByAgentNameByUserId: Record<string, string> = {};
    if (salesAgentProducerRefs.length > 0) {
      const resolved = await resolveSalesAgentStaffDisplayBatch(supabaseAdmin, salesAgentProducerRefs);
      for (const [uid, name] of resolved.entries()) {
        producedByAgentNameByUserId[uid] = name;
      }
    }

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

    const salesAgentStaffRow = UUID_RE.test(f.salesAgent.trim())
      ? salesAgentOptions.find((s) => s.user_id === f.salesAgent.trim())
      : undefined;
    const salesAgentLabelForChip = salesAgentStaffRow ? staffPrimaryLabel(salesAgentStaffRow) : null;

    const toastBanner =
      toastParam === "lead_deleted" ? (
        <div className={`${adminAlertSuccessCls} flex flex-wrap items-center justify-between gap-2`}>
          <span>Lead removed from the active list.</span>
          <Link href={dismissToastHref} className="font-semibold text-emerald-900 underline-offset-2 hover:underline">
            Dismiss
          </Link>
        </div>
      ) : toastParam === "lead_delete_failed" ||
        toastParam === "lead_delete_denied" ||
        toastParam === "lead_delete_invalid" ||
        toastParam === "lead_delete_gone" ? (
        <div className={`${adminAlertErrorCls} flex flex-wrap items-center justify-between gap-2`}>
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
      <AdminPageShell>
        {toastBanner}

        <AdminHeroHeader
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
              <Link href="/admin/crm/leads/import" className={adminSecondaryBtnCls}>
                Import CSV
              </Link>
              <Link href="/admin/crm/leads/new" className={crmPrimaryCtaCls}>
                + New Lead
              </Link>
            </div>
          }
        />

        <CrmLeadsStatsCards
          totalFiltered={totalFiltered}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          baselineTotal={baselineTotal}
          hasActiveFilters={hasSearchOrColumnFilters}
          hidingDeadByDefault={hidingDeadByDefault}
          page={safePage}
          totalPages={computedTotalPages}
        />

        <AdminListToolbar
          primary={summaryPrimary}
          secondary={
            <>
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
            </>
          }
          actions={
            <>
              <AdminPaginationBar
                page={safePage}
                totalPages={computedTotalPages}
                prevHref={paginationPrevHref}
                nextHref={paginationNextHref}
                ariaLabel="Leads pagination"
              />
              <Link href={clearAllFiltersHref} prefetch={false} className={adminSecondaryBtnCls}>
                Clear all filters
              </Link>
              <CrmLeadsDensityToggle density={density} />
            </>
          }
        />

        {/* Explicit filter chips (no silent filters) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {!hasSearchOrColumnFilters && !includeDead && safePage <= 1 ? (
            <AdminBadge variant="emerald">Default list (no filters)</AdminBadge>
          ) : null}
          {hidingDeadByDefault && safePage <= 1 ? (
            <AdminBadge variant="sky">Hiding dead / not qualified by default</AdminBadge>
          ) : null}

          {(() => {
            const cs = f.contactStatus.trim();
            if (!isValidAdminCrmLeadsContactStatusFilter(cs)) return null;
            return (
              <AdminRemovableBadge href={hrefWith({ contactStatus: "" })} variant="neutral">
                Contact status: {formatAdminCrmLeadsContactStatusLabel(cs)}
              </AdminRemovableBadge>
            );
          })()}
          {(() => {
            const lp = f.leadPriority.trim();
            if (!isValidLeadTemperature(lp)) return null;
            return (
              <AdminRemovableBadge href={hrefWith({ leadPriority: "" })} variant="neutral">
                Priority: {leadTemperatureLabel(lp)}
              </AdminRemovableBadge>
            );
          })()}
          {UUID_RE.test(f.owner.trim()) ? (
            <AdminRemovableBadge href={hrefWith({ owner: "" })} variant="neutral">
              Owner: {ownerLabelForChip ?? f.owner.slice(0, 8)}
            </AdminRemovableBadge>
          ) : null}
          {UUID_RE.test(f.salesAgent.trim()) ? (
            <AdminRemovableBadge href={hrefWith({ salesAgent: "" })} variant="neutral">
              Sales agent: {salesAgentLabelForChip ?? f.salesAgent.slice(0, 8)}
            </AdminRemovableBadge>
          ) : null}
          {followUpToday ? (
            <AdminRemovableBadge href={hrefWith({ followUp: "" })} variant="neutral">
              Follow-up: today
            </AdminRemovableBadge>
          ) : null}
          {f.payer.trim() ? (
            <AdminRemovableBadge href={hrefWith({ payer: "" })} variant="neutral" className="max-w-[14rem]">
              <span className="truncate" title={f.payer}>
                Payer: {f.payer.length > 28 ? `${f.payer.slice(0, 28)}…` : f.payer}
              </span>
            </AdminRemovableBadge>
          ) : null}
          {includeDead ? (
            <AdminRemovableBadge href={hrefWith({ includeDead: false })} variant="neutral">
              Include dead / not qualified
            </AdminRemovableBadge>
          ) : null}
          {f.q.trim() ? (
            <AdminRemovableBadge href={hrefWith({ q: "" })} variant="neutral" className="max-w-[18rem]">
              <span className="truncate" title={f.q}>
                Search: {f.q.slice(0, 40)}
                {f.q.length > 40 ? "…" : ""}
              </span>
            </AdminRemovableBadge>
          ) : null}
          {safePage > 1 ? (
            <AdminRemovableBadge href={hrefWith({ page: 1 })} variant="neutral">
              Page {safePage}
            </AdminRemovableBadge>
          ) : null}
        </div>

        <AdminFilterPanel
          method="get"
          action="/admin/crm/leads"
          footer={
            <>
              <button type="submit" className={crmPrimaryCtaCls}>
                Apply filters
              </button>
              <Link href={clearAllFiltersHref} className={adminSecondaryBtnCls}>
                Clear all filters
              </Link>
            </>
          }
        >
          {density === "comfortable" ? <input type="hidden" name="density" value="comfortable" /> : null}
          {followUpToday ? <input type="hidden" name="followUp" value="today" /> : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <label className="flex flex-col gap-1.5">
              <AdminFilterLabel>Contact status</AdminFilterLabel>
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
            <label className="flex flex-col gap-1.5">
              <AdminFilterLabel>Lead priority</AdminFilterLabel>
              <select name="leadPriority" defaultValue={isValidLeadTemperature(f.leadPriority.trim()) ? f.leadPriority.trim() : ""} className={crmFilterInputCls}>
                <option value="">All</option>
                {LEAD_TEMPERATURE_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {leadTemperatureLabel(v)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <AdminFilterLabel>Owner</AdminFilterLabel>
              <select name="owner" defaultValue={f.owner} className={crmFilterInputCls}>
                <option value="">All</option>
                {staffOptions.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {staffPrimaryLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <AdminFilterLabel>Sales agent</AdminFilterLabel>
              <select name="salesAgent" defaultValue={f.salesAgent} className={crmFilterInputCls}>
                <option value="">All</option>
                {salesAgentOptions.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {staffPrimaryLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <AdminFilterLabel>Payer</AdminFilterLabel>
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
            <label className="flex min-w-[min(100%,12rem)] flex-1 flex-col gap-1.5 sm:min-w-[12rem] lg:col-span-2">
              <AdminFilterLabel>Keyword search</AdminFilterLabel>
              <input
                type="search"
                name="q"
                defaultValue={f.q}
                placeholder="Search patient, phone, payer, sales agent…"
                className={`${crmFilterInputCls} min-h-[2rem]`}
                aria-describedby="crm-leads-q-hint"
              />
              <span id="crm-leads-q-hint" className="text-[10px] font-normal text-slate-500">
                Name, phone, email, payer, address, or sales agent (e.g. Kofi)
              </span>
            </label>
            <label className="flex min-h-[2rem] cursor-pointer items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/60 px-3 py-2 text-[11px] font-medium text-slate-600">
              <input
                type="checkbox"
                name="includeDead"
                value="1"
                defaultChecked={includeDead}
                className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600"
              />
              Include dead / not qualified
            </label>
          </div>
        </AdminFilterPanel>

        <CrmLeadsList
          initialList={list}
          employeeOnlyView={employeeOnlyView}
          staffOptions={staffOptions}
          producedByAgentNameByUserId={producedByAgentNameByUserId}
          todayIso={todayIso}
          smsConversationIdByContactId={smsConversationIdByContactId}
          initialDensity={density}
          leadsListContextHref={leadsListContextHref}
          emptyState={{
            narrowFiltersActive: hasSearchOrColumnFilters || includeDead || safePage > 1,
            clearHref: clearAllFiltersHref,
          }}
        />
      </AdminPageShell>
    );
  } catch (e) {
    if (isNextControlFlowError(e)) {
      throw e;
    }
    console.error("[crm/leads] list page failed", e);
    return (
      <AdminPageShell>
        <div className={`${adminAlertErrorCls}`}>
          <p className="font-semibold">Could not load leads</p>
          <p className="mt-1 text-rose-800/90">Try refreshing. If this continues, contact admin.</p>
          <Link href="/admin/crm/leads" className="mt-2 inline-block font-semibold text-rose-900 underline-offset-2 hover:underline">
            Reload leads list
          </Link>
        </div>
      </AdminPageShell>
    );
  } finally {
    if (perfStart) {
      routePerfLog("admin/crm/leads", perfStart);
    }
  }
}
