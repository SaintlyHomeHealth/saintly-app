import Link from "next/link";
import { redirect } from "next/navigation";

import { FacilitiesEmptyState } from "@/app/admin/facilities/_components/FacilitiesEmptyState";
import { FacilityDueBadge } from "@/app/admin/facilities/_components/FacilityDueBadge";
import { FacilityTypeSelect } from "@/app/admin/facilities/_components/FacilityTypeSelect";
import {
  crmActionBtnMuted,
  crmActionBtnSky,
  crmFilterBarCls,
  crmFilterInputCls,
  crmListRowHoverCls,
  crmListScrollOuterCls,
  crmPrimaryCtaCls,
} from "@/components/admin/crm-admin-list-styles";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { buildFacilityFullAddress, formatFacilityDate, googleMapsSearchUrlForAddress } from "@/lib/crm/facility-address";
import { FACILITY_PRIORITY_OPTIONS, FACILITY_STATUS_OPTIONS } from "@/lib/crm/facility-options";
import {
  computeFacilityDueInfo,
  facilityDueCardBorderClass,
  formatDueYmdAsDisplay,
  formatRelationshipStrengthDots,
} from "@/lib/crm/facility-territory-due";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

type FacilityRow = {
  id: string;
  name: string;
  type: string | null;
  status: string;
  priority: string;
  city: string | null;
  main_phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  state: string | null;
  zip: string | null;
  assigned_rep_user_id: string | null;
  last_visit_at: string | null;
  next_follow_up_at: string | null;
  visit_frequency: string | null;
  relationship_strength: number | null;
  is_active: boolean;
};

function matchesSearch(r: FacilityRow, q: string): boolean {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  const hay = [
    r.name,
    r.city,
    r.zip,
    r.main_phone,
    r.type,
    r.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(n);
}

function buildFilterQs(sp: {
  q?: string;
  type?: string;
  status?: string;
  rep?: string;
  city?: string;
  priority?: string;
  showInactive?: string;
}): string {
  const u = new URLSearchParams();
  if (sp.q) u.set("q", sp.q);
  if (sp.type) u.set("type", sp.type);
  if (sp.status) u.set("status", sp.status);
  if (sp.rep) u.set("rep", sp.rep);
  if (sp.city) u.set("city", sp.city);
  if (sp.priority) u.set("priority", sp.priority);
  if (sp.showInactive) u.set("showInactive", sp.showInactive);
  const s = u.toString();
  return s ? `?${s}` : "";
}

export default async function AdminFacilitiesPage({
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
    q: one("q").trim(),
    type: one("type").trim(),
    status: one("status").trim(),
    rep: one("rep").trim(),
    city: one("city").trim(),
    priority: one("priority").trim(),
    showInactive: one("showInactive").trim() === "1",
  };

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

  const staffById: Record<string, (typeof staffOptions)[number]> = {};
  for (const s of staffOptions) {
    staffById[s.user_id] = s;
  }

  let query = supabaseAdmin.from("facilities").select("*").order("name", { ascending: true }).limit(800);

  if (!f.showInactive) {
    query = query.eq("is_active", true);
  }
  if (f.type) {
    query = query.eq("type", f.type);
  }
  if (f.status) {
    query = query.eq("status", f.status);
  }
  if (f.priority) {
    query = query.eq("priority", f.priority);
  }
  if (f.rep) {
    if (f.rep === "unassigned") {
      query = query.is("assigned_rep_user_id", null);
    } else {
      query = query.eq("assigned_rep_user_id", f.rep);
    }
  }
  if (f.city) {
    query = query.ilike("city", `%${f.city}%`);
  }

  const { data: rows, error } = await query;

  let list = (rows ?? []) as FacilityRow[];
  if (error) {
    console.warn("[facilities] list:", error.message);
    list = [];
  }

  if (f.q) {
    list = list.filter((r) => matchesSearch(r, f.q));
  }

  const { data: cityRows } = await supabaseAdmin.from("facilities").select("city").limit(2000);
  const cityOptions = [
    ...new Set(
      (cityRows ?? [])
        .map((r) => (r as { city: string | null }).city)
        .filter((c): c is string => Boolean(c && c.trim()))
    ),
  ].sort((a, b) => a.localeCompare(b));

  const filterQs = buildFilterQs({
    q: f.q,
    type: f.type,
    status: f.status,
    rep: f.rep,
    city: f.city,
    priority: f.priority,
    showInactive: f.showInactive ? "1" : undefined,
  });

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Outside sales CRM"
        title="Facilities"
        description="Track referral-source buildings, contacts, and field visits for your outside sales team."
        actions={
          <Link href="/admin/facilities/new" className={crmPrimaryCtaCls}>
            + Add facility
          </Link>
        }
      />

      <form method="get" action="/admin/facilities" className={crmFilterBarCls}>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Search
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Name, city, phone…"
            className={`${crmFilterInputCls} min-w-[12rem]`}
          />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Type
          <FacilityTypeSelect
            name="type"
            defaultValue={f.type}
            emptyLabel="All"
            triggerClassName={`${crmFilterInputCls} min-w-[12rem]`}
          />
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Status
          <select name="status" defaultValue={f.status} className={`${crmFilterInputCls} min-w-[9rem]`}>
            <option value="">All</option>
            {FACILITY_STATUS_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Priority
          <select name="priority" defaultValue={f.priority} className={crmFilterInputCls}>
            <option value="">All</option>
            {FACILITY_PRIORITY_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Assigned rep
          <select name="rep" defaultValue={f.rep} className={`${crmFilterInputCls} min-w-[11rem]`}>
            <option value="">All</option>
            <option value="unassigned">Unassigned</option>
            <optgroup label="Staff">
              {staffOptions.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {staffPrimaryLabel(s)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          City
          <input
            name="city"
            list="facility-city-options"
            defaultValue={f.city}
            placeholder="Filter…"
            className={crmFilterInputCls}
          />
          <datalist id="facility-city-options">
            {cityOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="flex items-center gap-2 pt-5 text-[11px] font-medium text-slate-600">
          <input type="checkbox" name="showInactive" value="1" defaultChecked={f.showInactive} className="rounded border-slate-300" />
          Show inactive
        </label>
        <button
          type="submit"
          className="rounded-lg border border-sky-600 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
        >
          Apply
        </button>
        <Link
          href="/admin/facilities"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear
        </Link>
      </form>

      {list.length === 0 ? (
        <FacilitiesEmptyState />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {list.map((r) => {
              const addr = buildFacilityFullAddress(r);
              const mapsUrl = googleMapsSearchUrlForAddress(addr);
              const rep = r.assigned_rep_user_id ? staffById[r.assigned_rep_user_id] : null;
              const tel = (r.main_phone ?? "").trim() ? `tel:${r.main_phone!.replace(/[^\d+]/g, "")}` : null;
              const due = computeFacilityDueInfo({
                last_visit_at: r.last_visit_at,
                next_follow_up_at: r.next_follow_up_at,
                visit_frequency: r.visit_frequency,
              });
              return (
                <div
                  key={r.id}
                  className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${facilityDueCardBorderClass(due.band)} ${crmListRowHoverCls}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/admin/facilities/${r.id}`} className="font-semibold text-slate-900 hover:text-sky-800 hover:underline">
                        {r.name}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {[r.type, r.city].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <FacilityDueBadge band={due.band} />
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200/80">
                        {r.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-600">
                    <div>
                      <span className="font-medium text-slate-500">Rep</span>
                      <div className="text-slate-800">{rep ? staffPrimaryLabel(rep) : "—"}</div>
                    </div>
                    <div>
                      <span className="font-medium text-slate-500">Relationship</span>
                      <div className="font-medium text-slate-800">{formatRelationshipStrengthDots(r.relationship_strength)}</div>
                    </div>
                    <div>
                      <span className="font-medium text-slate-500">Last visit</span>
                      <div>{formatFacilityDate(r.last_visit_at)}</div>
                    </div>
                    <div>
                      <span className="font-medium text-slate-500">Next due</span>
                      <div className="text-slate-800">{formatDueYmdAsDisplay(due.effectiveNextDueYmd)}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/admin/facilities/${r.id}`} className={crmActionBtnSky}>
                      Open
                    </Link>
                    <Link href={`/admin/facilities/${r.id}?visit=1`} className={crmActionBtnMuted}>
                      Add visit
                    </Link>
                    {tel ? (
                      <a href={tel} className={crmActionBtnMuted}>
                        Call
                      </a>
                    ) : (
                      <span className={`${crmActionBtnMuted} cursor-not-allowed opacity-50`}>Call</span>
                    )}
                    {mapsUrl ? (
                      <a href={mapsUrl} target="_blank" rel="noreferrer" className={crmActionBtnMuted}>
                        Directions
                      </a>
                    ) : (
                      <span className={`${crmActionBtnMuted} cursor-not-allowed opacity-50`}>Directions</span>
                    )}
                    <Link href={`/admin/facilities/${r.id}/edit`} className={crmActionBtnMuted}>
                      Edit
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className={`${crmListScrollOuterCls} hidden md:block`}>
            <div className="min-w-[1280px] text-sm">
              <div className="grid w-full gap-x-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600 md:grid-cols-[minmax(11rem,1fr)_minmax(5.5rem,0.55fr)_minmax(5.5rem,0.55fr)_minmax(6.5rem,0.65fr)_minmax(7.5rem,0.75fr)_minmax(5rem,0.5fr)_minmax(6.5rem,0.65fr)_minmax(8rem,0.85fr)_minmax(5rem,0.5fr)_minmax(12rem,1fr)]">
                <div>Facility</div>
                <div>Type</div>
                <div>City</div>
                <div>Phone</div>
                <div>Rep</div>
                <div>Status</div>
                <div>Last visit</div>
                <div>Next due</div>
                <div>Rel</div>
                <div className="text-right">Actions</div>
              </div>
              {list.map((r) => {
                const addr = buildFacilityFullAddress(r);
                const mapsUrl = googleMapsSearchUrlForAddress(addr);
                const rep = r.assigned_rep_user_id ? staffById[r.assigned_rep_user_id] : null;
                const tel = (r.main_phone ?? "").trim() ? `tel:${r.main_phone!.replace(/[^\d+]/g, "")}` : null;
                const phoneDisplay = r.main_phone ? formatPhoneForDisplay(r.main_phone) : "—";
                const due = computeFacilityDueInfo({
                  last_visit_at: r.last_visit_at,
                  next_follow_up_at: r.next_follow_up_at,
                  visit_frequency: r.visit_frequency,
                });
                return (
                  <div
                    key={r.id}
                    className={`grid w-full gap-x-3 border-b border-slate-100 px-4 py-3 last:border-0 md:grid-cols-[minmax(11rem,1fr)_minmax(5.5rem,0.55fr)_minmax(5.5rem,0.55fr)_minmax(6.5rem,0.65fr)_minmax(7.5rem,0.75fr)_minmax(5rem,0.5fr)_minmax(6.5rem,0.65fr)_minmax(8rem,0.85fr)_minmax(5rem,0.5fr)_minmax(12rem,1fr)] md:items-center ${facilityDueCardBorderClass(due.band)} ${crmListRowHoverCls}`}
                  >
                    <div className="min-w-0">
                      <Link href={`/admin/facilities/${r.id}`} className="font-semibold text-slate-900 hover:text-sky-800 hover:underline">
                        {r.name}
                      </Link>
                      {!r.is_active ? (
                        <span className="ml-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          Inactive
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-700">{r.type ?? "—"}</div>
                    <div className="text-xs text-slate-700">{r.city ?? "—"}</div>
                    <div className="text-xs text-slate-700">{phoneDisplay}</div>
                    <div className="text-xs text-slate-800">{rep ? staffPrimaryLabel(rep) : "—"}</div>
                    <div className="text-xs text-slate-700">{r.status}</div>
                    <div className="text-xs text-slate-700">{formatFacilityDate(r.last_visit_at)}</div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <FacilityDueBadge band={due.band} />
                      <span className="text-[11px] text-slate-600">{formatDueYmdAsDisplay(due.effectiveNextDueYmd)}</span>
                    </div>
                    <div className="text-xs text-slate-800 tabular-nums">{formatRelationshipStrengthDots(r.relationship_strength)}</div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Link href={`/admin/facilities/${r.id}`} className={crmActionBtnSky}>
                        Open
                      </Link>
                      <Link href={`/admin/facilities/${r.id}?visit=1`} className={crmActionBtnMuted}>
                        Add visit
                      </Link>
                      {tel ? (
                        <a href={tel} className={crmActionBtnMuted}>
                          Call
                        </a>
                      ) : (
                        <span className={`${crmActionBtnMuted} cursor-not-allowed opacity-50`}>Call</span>
                      )}
                      {mapsUrl ? (
                        <a href={mapsUrl} target="_blank" rel="noreferrer" className={crmActionBtnMuted}>
                          Directions
                        </a>
                      ) : (
                        <span className={`${crmActionBtnMuted} cursor-not-allowed opacity-50`}>Directions</span>
                      )}
                      <Link href={`/admin/facilities/${r.id}/edit`} className={crmActionBtnMuted}>
                        Edit
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-center text-xs text-slate-500">
            Showing {list.length} facilit{list.length === 1 ? "y" : "ies"}
            {filterQs ? (
              <>
                {" "}
                ·{" "}
                <Link href="/admin/facilities" className="font-semibold text-sky-800 hover:underline">
                  Clear filters
                </Link>
              </>
            ) : null}
          </p>
        </>
      )}
    </div>
  );
}
