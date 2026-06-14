"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { AdmissionHandoffListCard } from "@/lib/crm/lead-admission-handoff-types";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";
import { formatFacilityDate } from "@/lib/crm/facility-address";

type Tab = "needs_review" | "ready_for_soc" | "scheduled" | "on_hold" | "admitted" | "all";

type StaffOption = { user_id: string; label: string };

const tabCls = (active: boolean) =>
  active
    ? "rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
    : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50";

const statusBadge: Record<string, string> = {
  draft: "bg-slate-100 text-slate-800",
  intake_review: "bg-sky-50 text-sky-900",
  ready_for_soc: "bg-emerald-50 text-emerald-900",
  scheduled: "bg-violet-50 text-violet-900",
  admitted: "bg-teal-50 text-teal-900",
  on_hold: "bg-amber-50 text-amber-900",
  canceled: "bg-slate-200 text-slate-700",
};

export function AdmissionHandoffsView({ staffOptions }: { staffOptions: StaffOption[] }) {
  const [tab, setTab] = useState<Tab>("needs_review");
  const [intakeFilter, setIntakeFilter] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [admissions, setAdmissions] = useState<AdmissionHandoffListCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ tab });
      if (intakeFilter) params.set("assigned_intake_owner", intakeFilter);
      if (facilityFilter) params.set("referring_facility_id", facilityFilter);
      if (missingOnly) params.set("has_missing_items", "1");
      const res = await fetch(`/api/intake/admissions?${params.toString()}`);
      const data = (await res.json()) as { ok?: boolean; admissions?: AdmissionHandoffListCard[] };
      if (!data.ok) {
        setError("Could not load admission handoffs.");
        return;
      }
      setAdmissions(data.admissions ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [tab, intakeFilter, facilityFilter, missingOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["needs_review", "Needs Review"],
            ["ready_for_soc", "Ready for SOC"],
            ["scheduled", "Scheduled"],
            ["on_hold", "On Hold"],
            ["admitted", "Admitted"],
            ["all", "All"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" className={tabCls(tab === key)} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Intake owner
          <select value={intakeFilter} onChange={(e) => setIntakeFilter(e.target.value)} className={crmFilterInputCls}>
            <option value="">All</option>
            {staffOptions.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Facility ID
          <input
            type="text"
            value={facilityFilter}
            onChange={(e) => setFacilityFilter(e.target.value)}
            className={crmFilterInputCls}
            placeholder="Filter by facility…"
          />
        </label>
        <label className="flex items-center gap-2 self-end pb-1 text-xs font-medium text-slate-700">
          <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
          Has missing items
        </label>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-600">Loading…</p> : null}

      {!loading && admissions.length === 0 ? (
        <p className="text-sm text-slate-600">No admission handoffs in this view.</p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {admissions.map((a) => (
          <article key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-900">{a.patient_name}</h3>
                <p className="text-xs text-slate-600">{a.facility_name ?? "—"}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadge[a.status] ?? statusBadge.draft}`}
              >
                {a.status.replace(/_/g, " ")}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
              <div>
                <dt className="text-slate-500">Payer</dt>
                <dd>{a.payer_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Priority</dt>
                <dd>{a.admission_priority}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Target SOC</dt>
                <dd>{a.target_soc_date ? formatFacilityDate(a.target_soc_date) : "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Clinician</dt>
                <dd>{a.assigned_clinician_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Checklist</dt>
                <dd>
                  {a.checklist_complete}/{a.checklist_total}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Missing</dt>
                <dd>{a.missing_item_count}</dd>
              </div>
            </dl>
            {a.blocker_count > 0 ? (
              <p className="mt-2 text-xs font-medium text-red-700">{a.blocker_count} blocker(s)</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/admin/intake/admissions/${a.id}`}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Open
              </Link>
              <Link
                href={`/admin/crm/leads/${a.lead_id}`}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800"
              >
                Open Lead
              </Link>
              {a.facility_id ? (
                <Link
                  href={`/admin/facilities/${a.facility_id}`}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800"
                >
                  Open Facility
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
