import Link from "next/link";
import { redirect } from "next/navigation";

import {
  crmActionBtnSky,
  crmFilterBarCls,
  crmFilterInputCls,
  crmListRowHoverCls,
  crmListScrollOuterCls,
  crmPrimaryCtaCls,
} from "@/components/admin/crm-admin-list-styles";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { isPhoenixSameCalendarDay, phoenixEndOfTodayIso, phoenixYmdEndIso, phoenixYmdStartIso } from "@/lib/recruiting/phoenix-time";
import {
  RECRUITING_DISCIPLINE_OPTIONS,
  RECRUITING_INTEREST_LEVEL_OPTIONS,
  RECRUITING_SOURCE_OPTIONS,
  RECRUITING_STATUS_OPTIONS,
} from "@/lib/recruiting/recruiting-options";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { recruitingInterestPillClass, recruitingStatusPillClass } from "./recruiting-status-styles";

type CandidateRow = {
  id: string;
  full_name: string;
  discipline: string | null;
  city: string | null;
  coverage_area: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string | null;
  interest_level: string | null;
  recruiting_tags: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
};

function formatListDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildFilterQs(sp: {
  status?: string;
  discipline?: string;
  area?: string;
  city?: string;
  coverage?: string;
  source?: string;
  followUp?: string;
  interest?: string;
  tags?: string;
  lastContactFrom?: string;
  lastContactTo?: string;
}): string {
  const u = new URLSearchParams();
  if (sp.status) u.set("status", sp.status);
  if (sp.discipline) u.set("discipline", sp.discipline);
  if (sp.area) u.set("area", sp.area);
  if (sp.city) u.set("city", sp.city);
  if (sp.coverage) u.set("coverage", sp.coverage);
  if (sp.source) u.set("source", sp.source);
  if (sp.followUp) u.set("followUp", sp.followUp);
  if (sp.interest) u.set("interest", sp.interest);
  if (sp.tags) u.set("tags", sp.tags);
  if (sp.lastContactFrom) u.set("lastContactFrom", sp.lastContactFrom);
  if (sp.lastContactTo) u.set("lastContactTo", sp.lastContactTo);
  const s = u.toString();
  return s ? `?${s}` : "";
}

export default async function AdminRecruitingListPage({
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
    discipline: one("discipline").trim(),
    area: one("area").trim(),
    city: one("city").trim(),
    coverage: one("coverage").trim(),
    source: one("source").trim(),
    followUp: one("followUp").trim(),
    interest: one("interest").trim(),
    tags: one("tags").trim(),
    lastContactFrom: one("lastContactFrom").trim(),
    lastContactTo: one("lastContactTo").trim(),
  };

  let query = supabaseAdmin.from("recruiting_candidates").select("*").order("updated_at", { ascending: false }).limit(2000);

  if (f.status) {
    query = query.eq("status", f.status);
  }
  if (f.discipline) {
    query = query.eq("discipline", f.discipline);
  }
  if (f.source) {
    query = query.eq("source", f.source);
  }
  if (f.interest) {
    query = query.eq("interest_level", f.interest);
  }
  if (f.tags) {
    const t = `%${f.tags}%`;
    query = query.ilike("recruiting_tags", t);
  }
  if (f.city) {
    const c = `%${f.city}%`;
    query = query.ilike("city", c);
  }
  if (f.coverage) {
    const c = `%${f.coverage}%`;
    query = query.ilike("coverage_area", c);
  }
  if (!f.city && !f.coverage && f.area) {
    const a = `%${f.area}%`;
    query = query.or(`coverage_area.ilike.${a},city.ilike.${a}`);
  }
  if (f.lastContactFrom) {
    const iso = phoenixYmdStartIso(f.lastContactFrom);
    if (iso) query = query.gte("last_contact_at", iso);
  }
  if (f.lastContactTo) {
    const iso = phoenixYmdEndIso(f.lastContactTo);
    if (iso) query = query.lte("last_contact_at", iso);
  }
  if (f.followUp === "due") {
    const end = phoenixEndOfTodayIso();
    query = query.not("next_follow_up_at", "is", null).lte("next_follow_up_at", end);
  }

  const { data: rows, error } = await query;

  let list = (rows ?? []) as CandidateRow[];
  if (error) {
    console.warn("[recruiting] list:", error.message);
    list = [];
  }

  const ids = list.map((r) => r.id);
  const countById = new Map<string, number>();
  if (ids.length) {
    const { data: naRows } = await supabaseAdmin
      .from("recruiting_candidate_activities")
      .select("candidate_id")
      .eq("outcome", "no_answer")
      .in("candidate_id", ids);
    for (const r of naRows ?? []) {
      const id = (r as { candidate_id: string }).candidate_id;
      countById.set(id, (countById.get(id) ?? 0) + 1);
    }
  }

  const { data: areaRows } = await supabaseAdmin.from("recruiting_candidates").select("coverage_area").limit(2000);
  const areaOptions = [
    ...new Set(
      (areaRows ?? [])
        .map((r) => (r as { coverage_area: string | null }).coverage_area)
        .filter((c): c is string => Boolean(c && c.trim()))
    ),
  ].sort((a, b) => a.localeCompare(b));

  const filterQs = buildFilterQs(f);

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Talent pipeline"
        title="Recruiting"
        description="Track Indeed candidates with a fast call/text workflow and a permanent activity history."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/admin/recruiting/bulk-upload"
              className="inline-flex items-center justify-center rounded-[20px] border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 shadow-sm hover:bg-violet-100"
            >
              Bulk resumes
            </Link>
            <Link
              href="/admin/recruiting/new-from-resume"
              className="inline-flex items-center justify-center rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm hover:bg-sky-100"
            >
              + From resume
            </Link>
            <Link href="/admin/recruiting/new" className={crmPrimaryCtaCls}>
              + Add candidate
            </Link>
          </div>
        }
      />

      <form method="get" action="/admin/recruiting" className={`${crmFilterBarCls} flex-wrap`}>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Status
          <select name="status" defaultValue={f.status} className={`${crmFilterInputCls} min-w-[9rem]`}>
            <option value="">All</option>
            {RECRUITING_STATUS_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Interest
          <select name="interest" defaultValue={f.interest} className={`${crmFilterInputCls} min-w-[9rem]`}>
            <option value="">All</option>
            {RECRUITING_INTEREST_LEVEL_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Discipline
          <select name="discipline" defaultValue={f.discipline} className={`${crmFilterInputCls} min-w-[9rem]`}>
            <option value="">All</option>
            {RECRUITING_DISCIPLINE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          City
          <input
            name="city"
            defaultValue={f.city}
            placeholder="Contains…"
            className={`${crmFilterInputCls} min-w-[9rem]`}
          />
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Coverage area
          <input
            name="coverage"
            list="recruiting-area-options"
            defaultValue={f.coverage}
            placeholder="Area or region…"
            className={`${crmFilterInputCls} min-w-[11rem]`}
          />
          <datalist id="recruiting-area-options">
            {areaOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          City or area (legacy)
          <input
            name="area"
            defaultValue={f.area}
            placeholder="Combined search…"
            className={`${crmFilterInputCls} min-w-[11rem]`}
          />
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Source
          <select name="source" defaultValue={f.source} className={`${crmFilterInputCls} min-w-[9rem]`}>
            <option value="">All</option>
            {RECRUITING_SOURCE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[8rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Tags
          <input
            name="tags"
            defaultValue={f.tags}
            placeholder="Contains…"
            className={`${crmFilterInputCls} min-w-[9rem]`}
          />
        </label>
        <label className="flex min-w-[9rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Last contact from
          <input
            name="lastContactFrom"
            type="date"
            defaultValue={f.lastContactFrom}
            className={`${crmFilterInputCls} min-w-[10rem]`}
          />
        </label>
        <label className="flex min-w-[9rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Last contact to
          <input
            name="lastContactTo"
            type="date"
            defaultValue={f.lastContactTo}
            className={`${crmFilterInputCls} min-w-[10rem]`}
          />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Follow-up
          <select name="followUp" defaultValue={f.followUp} className={`${crmFilterInputCls} min-w-[11rem]`}>
            <option value="">All</option>
            <option value="due">Due (today or overdue)</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg border border-sky-600 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
        >
          Apply
        </button>
        <Link
          href="/admin/recruiting"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear
        </Link>
      </form>

      {list.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 px-6 py-16 text-center text-sm text-slate-600 shadow-sm">
          No candidates match these filters.{" "}
          <Link href="/admin/recruiting/new" className="font-semibold text-sky-800 hover:underline">
            Add a candidate
          </Link>{" "}
          to get started.
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {list.map((r) => {
              const loc = [r.city, r.coverage_area].filter(Boolean).join(" · ") || "—";
              const noAnswerCount = countById.get(r.id) ?? 0;
              const dueToday = Boolean(r.next_follow_up_at && isPhoenixSameCalendarDay(r.next_follow_up_at));
              const dueBucket = Boolean(r.next_follow_up_at && r.next_follow_up_at <= phoenixEndOfTodayIso());
              return (
                <div
                  key={r.id}
                  className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${crmListRowHoverCls} ${
                    dueToday ? "ring-2 ring-amber-300/80" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/recruiting/${r.id}${filterQs}`}
                        className="font-semibold text-slate-900 hover:text-sky-800 hover:underline"
                      >
                        {r.full_name}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {[r.discipline, loc].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className={recruitingStatusPillClass(r.status ?? "")}>{r.status ?? "—"}</span>
                      {r.interest_level?.trim() ? (
                        <span className={recruitingInterestPillClass(r.interest_level)}>
                          {r.interest_level.replace(/_/g, " ")}
                        </span>
                      ) : null}
                      {dueBucket ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
                          {dueToday ? "Due today" : "Follow-up due"}
                        </span>
                      ) : null}
                      {noAnswerCount >= 2 ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-900 ring-1 ring-rose-200">
                          No response
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-600">
                    <div>
                      <span className="font-medium text-slate-500">Phone</span>
                      <div className="text-slate-800">{r.phone ? formatPhoneForDisplay(r.phone) : "—"}</div>
                    </div>
                    <div>
                      <span className="font-medium text-slate-500">Email</span>
                      <div className="text-slate-800">{r.email?.trim() || "—"}</div>
                    </div>
                    <div>
                      <span className="font-medium text-slate-500">Source</span>
                      <div>{r.source ?? "—"}</div>
                    </div>
                    <div>
                      <span className="font-medium text-slate-500">Last contact</span>
                      <div>{formatListDate(r.last_contact_at)}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium text-slate-500">Next follow-up</span>
                      <div className="text-slate-800">{formatListDate(r.next_follow_up_at)}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/admin/recruiting/${r.id}${filterQs}`} className={crmActionBtnSky}>
                      Open
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={`${crmListScrollOuterCls} hidden md:block`}>
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50/90 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Discipline</th>
                  <th className="px-4 py-3">Location / area</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Interest</th>
                  <th className="px-4 py-3">Last contact</th>
                  <th className="px-4 py-3">Next follow-up</th>
                  <th className="px-4 py-3"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((r) => {
                  const loc = [r.city, r.coverage_area].filter(Boolean).join(" · ") || "—";
                  const noAnswerCount = countById.get(r.id) ?? 0;
                  const dueToday = Boolean(r.next_follow_up_at && isPhoenixSameCalendarDay(r.next_follow_up_at));
                  const dueBucket = Boolean(r.next_follow_up_at && r.next_follow_up_at <= phoenixEndOfTodayIso());
                  return (
                    <tr
                      key={r.id}
                      className={`bg-white/90 ${crmListRowHoverCls} ${dueToday ? "bg-amber-50/50" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/recruiting/${r.id}${filterQs}`}
                            className="font-semibold text-slate-900 hover:text-sky-800 hover:underline"
                          >
                            {r.full_name}
                          </Link>
                          {dueBucket ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
                              {dueToday ? "Due today" : "Due"}
                            </span>
                          ) : null}
                          {noAnswerCount >= 2 ? (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-900 ring-1 ring-rose-200">
                              No response
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">{r.discipline ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{loc}</td>
                      <td className="px-4 py-3 text-xs text-slate-700">{r.phone ? formatPhoneForDisplay(r.phone) : "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{r.email?.trim() || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{r.source ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={recruitingStatusPillClass(r.status ?? "")}>{r.status ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {r.interest_level?.trim() ? (
                          <span className={recruitingInterestPillClass(r.interest_level)}>
                            {r.interest_level.replace(/_/g, " ")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{formatListDate(r.last_contact_at)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{formatListDate(r.next_follow_up_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/recruiting/${r.id}${filterQs}`} className={crmActionBtnSky}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
