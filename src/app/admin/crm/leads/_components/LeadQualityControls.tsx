"use client";

import { useState } from "react";

type LeadQuality = "qualified" | "unqualified" | null;

function parseInitial(raw: string | null | undefined): LeadQuality {
  if (raw === "qualified" || raw === "unqualified") return raw;
  return null;
}

export function LeadQualityControls(props: { leadId: string; initialLeadQuality: string | null }) {
  const { leadId, initialLeadQuality } = props;
  const [quality, setQuality] = useState<LeadQuality>(() => parseInitial(initialLeadQuality));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setLeadQuality(next: "qualified" | "unqualified") {
    if (pending) return;
    const prev = quality;
    setError(null);
    setQuality(next);
    setPending(true);
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
      setPending(false);
    }
  }

  return (
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
            disabled={pending}
            onClick={() => void setLeadQuality("qualified")}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            Mark as Qualified
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void setLeadQuality("unqualified")}
            className="rounded-lg bg-slate-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-600 disabled:opacity-60"
          >
            Mark as Unqualified
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
