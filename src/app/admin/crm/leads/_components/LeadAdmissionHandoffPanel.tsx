"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClipboardList } from "lucide-react";

import type { LeadAdmissionHandoffPanelData } from "@/lib/crm/lead-admission-handoff";
import { formatFacilityDate, formatFacilityDateTime } from "@/lib/crm/facility-address";

export function LeadAdmissionHandoffPanel(props: {
  leadId: string;
  initial: LeadAdmissionHandoffPanelData;
}) {
  const { leadId, initial } = props;
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const h = data.handoff;

  if (!data.accepted && !h) {
    return (
      <section
        id="section-admission-handoff"
        className="scroll-mt-24 rounded-2xl border border-slate-200 bg-slate-50/50 p-5 text-sm text-slate-600"
      >
        <p>Admission handoff becomes available after referral is accepted.</p>
      </section>
    );
  }

  async function createHandoff() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/admission-handoff`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; handoff?: LeadAdmissionHandoffPanelData["handoff"]; error?: string };
      if (!res.ok || !json.ok || !json.handoff) {
        setError(json.error ?? "Could not create handoff.");
        return;
      }
      setData((prev) => ({
        ...prev,
        handoff: json.handoff!,
        checklist_total: 12,
        checklist_complete: 0,
      }));
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <section
      id="section-admission-handoff"
      className="scroll-mt-24 rounded-2xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/40 to-white p-5 shadow-sm ring-1 ring-indigo-100/50"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <ClipboardList className="mt-0.5 h-5 w-5 text-indigo-700" aria-hidden />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Admission Handoff</h2>
            <p className="mt-0.5 text-xs text-slate-600">SOC planning, payer/auth, Alora entry, and checklist.</p>
          </div>
        </div>
        {h ? (
          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold uppercase text-indigo-900">
            {h.status.replace(/_/g, " ")}
          </span>
        ) : null}
      </div>

      {h ? (
        <>
          <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Target SOC" value={h.target_soc_date ? formatFacilityDate(h.target_soc_date) : "—"} />
            <Stat
              label="Scheduled SOC"
              value={h.scheduled_soc_at ? formatFacilityDateTime(h.scheduled_soc_at) : "—"}
            />
            <Stat label="Discipline" value={h.primary_discipline ?? "—"} />
            <Stat label="Clinician" value={h.assigned_clinician_name ?? "—"} />
            <Stat label="Payer" value={h.payer_status ?? "—"} />
            <Stat label="Alora" value={h.alora_status ?? "not started"} />
            <Stat label="Checklist" value={`${data.checklist_complete}/${data.checklist_total}`} />
          </dl>
          {h.missing_items?.length ? (
            <p className="mt-2 text-xs text-amber-800">Missing: {h.missing_items.slice(0, 4).join(", ")}</p>
          ) : null}
          <Link
            href={`/admin/intake/admissions/${h.id}`}
            className="mt-4 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Open Handoff
          </Link>
        </>
      ) : data.can_edit ? (
        <>
          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
          <button
            type="button"
            disabled={creating}
            onClick={() => void createHandoff()}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create Handoff"}
          </button>
        </>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/70 px-3 py-2 ring-1 ring-slate-100">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-semibold capitalize text-slate-800">{value}</dd>
    </div>
  );
}
