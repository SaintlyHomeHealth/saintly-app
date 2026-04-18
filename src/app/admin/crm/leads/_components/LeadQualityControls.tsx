"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type LeadQuality = "qualified" | "unqualified" | null;

function parseInitial(raw: string | null | undefined): LeadQuality {
  if (raw === "qualified" || raw === "unqualified") return raw;
  return null;
}

function isAdmittedStatus(raw: string | null | undefined): boolean {
  return typeof raw === "string" && raw.trim().toLowerCase() === "admitted";
}

export function LeadQualityControls(props: {
  leadId: string;
  initialLeadQuality: string | null;
  /** `leads.status` — used to show Admit / Admitted state. */
  pipelineStatus: string;
}) {
  const { leadId, initialLeadQuality, pipelineStatus } = props;
  const router = useRouter();

  const [quality, setQuality] = useState<LeadQuality>(() => parseInitial(initialLeadQuality));
  const [admitted, setAdmitted] = useState(() => isAdmittedStatus(pipelineStatus));

  const [qualityPending, setQualityPending] = useState(false);
  const [admitPending, setAdmitPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<null | { type: "ok" | "err"; message: string }>(null);

  const busy = qualityPending || admitPending;

  useEffect(() => {
    setAdmitted(isAdmittedStatus(pipelineStatus));
  }, [pipelineStatus]);

  useEffect(() => {
    if (!toast) return;
    const ms = toast.type === "ok" ? 4500 : 5500;
    const t = window.setTimeout(() => setToast(null), ms);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function setLeadQuality(next: "qualified" | "unqualified") {
    if (busy) return;
    const prev = quality;
    setError(null);
    setQuality(next);
    setQualityPending(true);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_quality: next }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setQuality(prev);
        setError("Could not save. Try again.");
        return;
      }
    } catch {
      setQuality(prev);
      setError("Could not save. Try again.");
    } finally {
      setQualityPending(false);
    }
  }

  async function admitPatient() {
    if (busy || admitted) return;
    setError(null);
    setAdmitPending(true);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "admitted" }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setToast({ type: "err", message: "Could not admit patient. Try again." });
        return;
      }
      setAdmitted(true);
      setToast({ type: "ok", message: "Patient admitted" });
      router.refresh();
    } catch {
      setToast({ type: "err", message: "Could not admit patient. Try again." });
    } finally {
      setAdmitPending(false);
    }
  }

  const btnBase =
    "rounded-lg px-3 py-2 text-sm font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="relative">
      {toast ? (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-rose-200 bg-rose-50 text-rose-950"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lead quality</span>
            {quality === "qualified" ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                Qualified
              </span>
            ) : quality === "unqualified" ? (
              <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                Unqualified
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                Not set
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void setLeadQuality("qualified")}
              className={`${btnBase} bg-emerald-600 text-white hover:bg-emerald-700`}
            >
              Mark as Qualified
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void setLeadQuality("unqualified")}
              className={`${btnBase} bg-slate-500 text-white hover:bg-slate-600`}
            >
              Mark as Unqualified
            </button>
            <button
              type="button"
              disabled={busy || admitted}
              onClick={() => void admitPatient()}
              className={`${btnBase} ${
                admitted
                  ? "cursor-not-allowed border border-emerald-600/40 bg-emerald-600/35 text-white"
                  : "border border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {admitPending ? "Admitting..." : admitted ? "Admitted ✓" : "Admit Patient"}
            </button>
          </div>
        </div>
        {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      </div>
    </div>
  );
}
