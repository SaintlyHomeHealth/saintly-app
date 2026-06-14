"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { RoutePlanCard } from "@/lib/crm/facility-route-types";
import { ROUTE_PLAN_STATUS_LABELS } from "@/lib/crm/facility-route-types";
import { formatRouteListForCopy } from "@/lib/crm/facility-route-builder";
import { crmActionBtnMuted, crmActionBtnSky, crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type StaffOption = { user_id: string; label: string };

type FacilityRoutesViewProps = {
  staffOptions: StaffOption[];
  currentUserId: string;
  canManageAll: boolean;
};

type GroupKey = "today" | "upcoming" | "in_progress" | "completed" | "canceled";

function groupRoutes(routes: RoutePlanCard[], today: string): Record<GroupKey, RoutePlanCard[]> {
  const groups: Record<GroupKey, RoutePlanCard[]> = {
    today: [],
    upcoming: [],
    in_progress: [],
    completed: [],
    canceled: [],
  };
  for (const r of routes) {
    if (r.status === "canceled") groups.canceled.push(r);
    else if (r.status === "completed") groups.completed.push(r);
    else if (r.status === "in_progress") groups.in_progress.push(r);
    else if (r.route_date === today) groups.today.push(r);
    else if (r.route_date > today) groups.upcoming.push(r);
    else groups.today.push(r);
  }
  return groups;
}

export function FacilityRoutesView({ staffOptions, currentUserId, canManageAll }: FacilityRoutesViewProps) {
  const [assignedTo, setAssignedTo] = useState(canManageAll ? "" : currentUserId);
  const [status, setStatus] = useState("all");
  const [routes, setRoutes] = useState<RoutePlanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams();
      if (assignedTo) p.set("assigned_rep_id", assignedTo);
      if (status !== "all") p.set("status", status);
      p.set("limit", "100");
      const res = await fetch(`/api/facilities/routes?${p}`);
      const data = (await res.json()) as { ok: boolean; routes?: RoutePlanCard[] };
      if (!data.ok) {
        setError("Could not load routes.");
        return;
      }
      setRoutes(data.routes ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [assignedTo, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => groupRoutes(routes, today), [routes, today]);

  async function copyRouteList(routeId: string) {
    const res = await fetch(`/api/facilities/routes/${routeId}`);
    const data = (await res.json()) as { ok: boolean; route?: { stops: Array<{ name: string; address?: string | null }> } };
    if (!data.ok || !data.route) return;
    const text = formatRouteListForCopy(
      data.route.stops.map((s, i) => ({
        localId: String(i),
        name: s.name,
        address: s.address ?? undefined,
        addedAt: new Date().toISOString(),
      }))
    );
    await navigator.clipboard.writeText(text);
  }

  function RouteCard({ route }: { route: RoutePlanCard }) {
    return (
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Link href={`/admin/facilities/routes/${route.id}`} className="text-base font-semibold text-slate-900 hover:text-teal-800">
              {route.name}
            </Link>
            <p className="text-sm text-slate-600">
              {route.route_date} · {route.assigned_rep_label ?? "Unassigned"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {route.stop_count} stops · {route.completed_count} completed · {route.skipped_count} skipped · {route.pending_count} pending
            </p>
          </div>
          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-900 ring-1 ring-teal-200">
            {ROUTE_PLAN_STATUS_LABELS[route.status]}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/admin/facilities/routes/${route.id}`} className={crmActionBtnSky}>
            {route.status === "in_progress" ? "Continue" : "Open Route"}
          </Link>
          {route.status === "planned" || route.status === "draft" ? (
            <button
              type="button"
              className={crmActionBtnSky}
              onClick={() => void fetch(`/api/facilities/routes/${route.id}/start`, { method: "POST", body: "{}" }).then(() => load())}
            >
              Start
            </button>
          ) : null}
          <button type="button" className={crmActionBtnMuted} onClick={() => void copyRouteList(route.id)}>
            Copy Route List
          </button>
        </div>
      </article>
    );
  }

  const sections: Array<{ key: GroupKey; label: string }> = [
    { key: "in_progress", label: "In Progress" },
    { key: "today", label: "Today" },
    { key: "upcoming", label: "Upcoming" },
    { key: "completed", label: "Completed" },
    { key: "canceled", label: "Canceled" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {canManageAll ? (
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={crmFilterInputCls}>
            <option value="">All reps</option>
            {staffOptions.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.label}
              </option>
            ))}
          </select>
        ) : null}
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={crmFilterInputCls}>
          <option value="all">All statuses</option>
          <option value="planned">Planned</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="canceled">Canceled</option>
        </select>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-600">Loading routes…</p> : null}

      {!loading
        ? sections.map(({ key, label }) =>
            groups[key].length ? (
              <section key={key}>
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{label}</h2>
                <div className="mt-2 space-y-3">
                  {groups[key].map((r) => (
                    <RouteCard key={r.id} route={r} />
                  ))}
                </div>
              </section>
            ) : null
          )
        : null}

      {!loading && routes.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          No saved routes yet. Build a route in Route Builder and click Save Route Plan.
        </p>
      ) : null}
    </div>
  );
}
