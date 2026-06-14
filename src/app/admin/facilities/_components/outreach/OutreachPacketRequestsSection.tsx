"use client";

import { useCallback, useEffect, useState } from "react";

import { FacilityPacketRequestCard } from "@/app/admin/facilities/_components/FacilityPacketRequestCard";
import type { PacketRequestCard } from "@/lib/crm/facility-packet-types";
import type { OutreachSectionPage } from "@/lib/crm/facility-outreach-types";
import { trackOutreachApiCall } from "@/lib/perf/outreach-dev-perf";

import { OutreachSectionSkeleton } from "./OutreachLazySection";

const sectionTitle = "text-sm font-bold uppercase tracking-wide text-slate-500";

type PacketResponse = {
  ok: boolean;
  data?: OutreachSectionPage<PacketRequestCard>;
};

export function OutreachPacketRequestsSection({ onUpdated }: { onUpdated?: () => void }) {
  const [requests, setRequests] = useState<PacketRequestCard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const t0 = Date.now();
    try {
      const res = await fetch("/api/facilities/outreach-dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "section", section: "packet_requests_due", limit: 20, offset: 0 }),
      });
      const json = (await res.json()) as PacketResponse;
      trackOutreachApiCall("section:packet_requests_due", Date.now() - t0, json.data?.items.length ?? 0);
      if (json.ok && json.data) setRequests(json.data.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="space-y-3">
        <h2 className={sectionTitle}>Packet requests due</h2>
        <OutreachSectionSkeleton rows={2} />
      </section>
    );
  }

  if (requests.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className={sectionTitle}>Packet requests due</h2>
      <div className="space-y-3">
        {requests.map((r) => (
          <FacilityPacketRequestCard
            key={r.id}
            request={r}
            onUpdated={() => {
              void load();
              onUpdated?.();
            }}
            compact
          />
        ))}
      </div>
    </section>
  );
}
