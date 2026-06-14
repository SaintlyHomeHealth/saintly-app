"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FacilityPacketRequestCard } from "@/app/admin/facilities/_components/FacilityPacketRequestCard";
import { FacilityPacketMaterialsAdmin } from "@/app/admin/facilities/_components/FacilityPacketMaterialsAdmin";
import type { PacketRequestCard } from "@/lib/crm/facility-packet-types";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type StaffOption = { user_id: string; label: string };
type TabId = "pending" | "due_today" | "overdue" | "sent" | "confirmed" | "all";
type PageView = "requests" | "materials";

type FacilityPacketsViewProps = {
  staffOptions: StaffOption[];
  currentUserId: string;
  canManageAll: boolean;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "due_today", label: "Due Today" },
  { id: "overdue", label: "Overdue" },
  { id: "sent", label: "Sent" },
  { id: "confirmed", label: "Confirmed" },
  { id: "all", label: "All" },
];

export function FacilityPacketsView({ staffOptions, currentUserId, canManageAll }: FacilityPacketsViewProps) {
  const [pageView, setPageView] = useState<PageView>("requests");
  const [tab, setTab] = useState<TabId>("pending");
  const [assignedTo, setAssignedTo] = useState(canManageAll ? "" : currentUserId);
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [packetType, setPacketType] = useState("");
  const [city, setCity] = useState("");
  const [requests, setRequests] = useState<PacketRequestCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (tab === "pending") {
      p.set("status", "pending");
    } else if (tab === "due_today") {
      p.set("due", "today");
    } else if (tab === "overdue") {
      p.set("due", "overdue");
    } else if (tab === "sent") {
      p.set("status", "sent");
    } else if (tab === "confirmed") {
      p.set("status", "confirmed_received");
    } else {
      p.set("status", "all");
    }
    if (assignedTo) p.set("assigned_to", assignedTo);
    if (deliveryMethod) p.set("delivery_method", deliveryMethod);
    if (packetType) p.set("packet_type", packetType);
    if (city.trim()) p.set("city", city.trim());
    p.set("limit", "100");
    return p.toString();
  }, [tab, assignedTo, deliveryMethod, packetType, city]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/packet-requests?${query}`);
      const data = (await res.json()) as { ok: boolean; requests?: PacketRequestCard[] };
      if (!data.ok) {
        setError("Could not load packet requests.");
        return;
      }
      setRequests(data.requests ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {(
          [
            ["requests", "Requests"],
            ["materials", "Materials"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPageView(id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              pageView === id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {pageView === "materials" ? (
        <FacilityPacketMaterialsAdmin canManage={canManageAll} />
      ) : (
        <>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === t.id ? "bg-violet-600 text-white" : "border border-slate-200 bg-white text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
        <select value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} className={crmFilterInputCls}>
          <option value="">Any delivery method</option>
          <option value="fax">Fax</option>
          <option value="email">Email</option>
          <option value="print_dropoff">Print / drop-off</option>
          <option value="hand_delivered">Hand delivered</option>
        </select>
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className={crmFilterInputCls} />
        <input value={packetType} onChange={(e) => setPacketType(e.target.value)} placeholder="Packet type key" className={crmFilterInputCls} />
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
      {loading ? (
        <p className="text-sm text-slate-600">Loading packet requests…</p>
      ) : requests.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          No packet requests match these filters.
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <FacilityPacketRequestCard key={r.id} request={r} onUpdated={() => void load()} showCancel={canManageAll} />
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
