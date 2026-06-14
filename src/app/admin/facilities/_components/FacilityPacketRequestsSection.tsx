"use client";

import { useCallback, useEffect, useState } from "react";

import { FacilityPacketRequestCard } from "@/app/admin/facilities/_components/FacilityPacketRequestCard";
import { FacilityPacketRequestModal } from "@/app/admin/facilities/_components/FacilityPacketRequestModal";
import type { PacketRequestCard } from "@/lib/crm/facility-packet-types";
import { formatFacilityDate } from "@/lib/crm/facility-address";

type ContactOption = { id: string; name: string };
type StaffOption = { user_id: string; label: string };

type FacilityPacketRequestsSectionProps = {
  facilityId: string;
  facilityName: string;
  contacts?: ContactOption[];
  staffOptions?: StaffOption[];
  defaultAssignedTo?: string | null;
  canManage?: boolean;
};

export function FacilityPacketRequestsSection({
  facilityId,
  facilityName,
  contacts = [],
  staffOptions = [],
  defaultAssignedTo,
  canManage = true,
}: FacilityPacketRequestsSectionProps) {
  const [requests, setRequests] = useState<PacketRequestCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/facilities/packet-requests?facility_id=${facilityId}&status=all&limit=20`);
      const data = (await res.json()) as { ok: boolean; requests?: PacketRequestCard[] };
      if (data.ok) setRequests(data.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = requests.filter((r) => r.status === "pending");
  const sent = requests.filter((r) => r.status === "sent");
  const confirmed = requests.filter((r) => r.status === "confirmed_received");
  const lastSent = requests
    .filter((r) => r.sent_at)
    .sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))[0];

  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-violet-900">Packet Requests</h2>
        {canManage ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-lg border border-violet-600 bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
          >
            New Packet Request
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Pending", pending.length],
          ["Sent", sent.length],
          ["Confirmed", confirmed.length],
          ["Last sent", lastSent?.sent_at ? formatFacilityDate(lastSent.sent_at) : "—"],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-white/80 px-3 py-2 text-center shadow-sm">
            <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
            <p className="text-sm font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-slate-600">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">No packet requests for this facility.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {requests.slice(0, 5).map((r) => (
            <FacilityPacketRequestCard key={r.id} request={r} compact onUpdated={() => void load()} />
          ))}
        </div>
      )}

      {canManage ? (
        <FacilityPacketRequestModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          facilityId={facilityId}
          facilityName={facilityName}
          contacts={contacts}
          staffOptions={staffOptions}
          defaultAssignedTo={defaultAssignedTo}
          source="manual"
          onCreated={() => void load()}
        />
      ) : null}
    </section>
  );
}
