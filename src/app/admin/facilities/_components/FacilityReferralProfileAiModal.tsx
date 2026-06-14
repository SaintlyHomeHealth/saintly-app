"use client";

import { useState } from "react";

import type {
  FacilityReferralProfileAiEvidence,
  FacilityReferralProfileAiSuggestion,
  FacilityReferralProfileSummary,
} from "@/lib/crm/facility-referral-profile-types";

const FIELD_KEYS: (keyof FacilityReferralProfileAiSuggestion)[] = [
  "relationship_status",
  "referral_potential",
  "best_contact_name",
  "best_contact_role",
  "referral_process",
  "preferred_referral_method",
  "preferred_packet_method",
  "preferred_contact_method",
  "referral_fax",
  "referral_email",
  "referral_phone",
  "services_likely_to_refer",
  "payer_notes",
  "objections",
  "opportunities",
  "next_best_action",
  "next_best_action_due_at",
];

function formatFieldLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function displayValue(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.join(", ") || "—";
  return String(v);
}

type FacilityReferralProfileAiModalProps = {
  facilityId: string;
  currentSummary: FacilityReferralProfileSummary;
  onClose: () => void;
  onApplied: (summary: FacilityReferralProfileSummary) => void;
};

export function FacilityReferralProfileAiModal({
  facilityId,
  currentSummary,
  onClose,
  onApplied,
}: FacilityReferralProfileAiModalProps) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<FacilityReferralProfileAiSuggestion | null>(null);
  const [evidence, setEvidence] = useState<FacilityReferralProfileAiEvidence[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  async function runRefresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/facilities/${facilityId}/referral-profile/ai-refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookback_days: 180 }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        suggested_profile?: FacilityReferralProfileAiSuggestion;
        evidence?: FacilityReferralProfileAiEvidence[];
        warnings?: string[];
      };
      if (!data.ok) {
        setError(
          data.error === "ai_not_configured"
            ? "AI profile refresh is not configured. You can update the profile manually."
            : "AI refresh failed. Try again or edit manually."
        );
        return;
      }
      setSuggested(data.suggested_profile ?? null);
      setEvidence(data.evidence ?? []);
      setWarnings(data.warnings ?? []);
      setAiSummary(data.suggested_profile?.referral_process ?? null);
      setSelected(new Set(FIELD_KEYS.filter((k) => {
        const v = data.suggested_profile?.[k];
        return v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== "");
      })));
    } finally {
      setLoading(false);
    }
  }

  async function applySelected() {
    if (!suggested) return;
    setApplying(true);
    const fields: Partial<FacilityReferralProfileAiSuggestion> = {};
    for (const key of selected) {
      const k = key as keyof FacilityReferralProfileAiSuggestion;
      (fields as Record<string, unknown>)[k] = suggested[k];
    }
    const res = await fetch(`/api/facilities/${facilityId}/referral-profile/apply-ai-suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields,
        ai_summary: aiSummary,
        confidence: suggested.confidence,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; summary?: FacilityReferralProfileSummary };
    setApplying(false);
    if (data.ok && data.summary) onApplied(data.summary);
    else setError("Could not apply suggestions.");
  }

  const current = currentSummary.profile;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[94vh] w-full max-w-3xl flex-col rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl">
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <p className="text-[11px] font-bold uppercase text-violet-700">AI Profile Refresh</p>
          <h2 className="text-lg font-semibold text-slate-900">Review suggested updates</h2>
          <p className="mt-1 text-sm text-slate-600">Nothing is saved until you accept selected fields.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!suggested ? (
            <div className="text-center">
              <p className="text-sm text-slate-600">AI will review recent activities, packets, and referrals.</p>
              <button
                type="button"
                disabled={loading}
                onClick={() => void runRefresh()}
                className="mt-4 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {loading ? "Analyzing…" : "Run AI Analysis"}
              </button>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-violet-800">
                Confidence: {Math.round((suggested.confidence ?? 0) * 100)}%
              </p>
              {warnings.length ? (
                <ul className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  {warnings.map((w) => (
                    <li key={w}>· {w}</li>
                  ))}
                </ul>
              ) : null}
              <div className="space-y-3">
                {FIELD_KEYS.map((key) => {
                  const cur = (current as Record<string, unknown>)[key];
                  const sug = suggested[key];
                  if (sug == null || (Array.isArray(sug) && !sug.length) || (typeof sug === "string" && !sug.trim())) {
                    return null;
                  }
                  return (
                    <label
                      key={key}
                      className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(key);
                          else next.delete(key);
                          setSelected(next);
                        }}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase text-slate-400">{formatFieldLabel(key)}</p>
                        <div className="mt-1 grid gap-2 sm:grid-cols-2">
                          <div>
                            <p className="text-[10px] text-slate-400">Current</p>
                            <p className="text-sm text-slate-600">{displayValue(cur)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-violet-600">Suggested</p>
                            <p className="text-sm font-medium text-violet-950">{displayValue(sug)}</p>
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              {evidence.length ? (
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase text-slate-400">Evidence</p>
                  <ul className="mt-1 space-y-1 text-xs text-slate-600">
                    {evidence.slice(0, 6).map((ev, i) => (
                      <li key={`${ev.source}-${i}`}>
                        · [{ev.source}] {ev.summary}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold">
            Cancel
          </button>
          {suggested ? (
            <>
              <button
                type="button"
                disabled={applying || selected.size === 0}
                onClick={() => void applySelected()}
                className="flex-[2] rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {applying ? "Applying…" : `Accept selected (${selected.size})`}
              </button>
              <button
                type="button"
                disabled={applying}
                onClick={() => {
                  setSelected(new Set(FIELD_KEYS));
                  void applySelected();
                }}
                className="flex-1 rounded-xl border border-violet-600 py-3 text-sm font-semibold text-violet-800"
              >
                Accept all
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
