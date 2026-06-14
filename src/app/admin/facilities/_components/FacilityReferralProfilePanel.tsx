"use client";

import { useCallback, useState } from "react";

import { FacilityReferralProfileAiModal } from "@/app/admin/facilities/_components/FacilityReferralProfileAiModal";
import { FacilityReferralProfileEditModal } from "@/app/admin/facilities/_components/FacilityReferralProfileEditModal";
import type { FacilityReferralProfileSummary } from "@/lib/crm/facility-referral-profile-types";
import { formatFacilityDate, formatFacilityDateTime } from "@/lib/crm/facility-address";

type ContactOption = { id: string; name: string };

type FacilityReferralProfilePanelProps = {
  facilityId: string;
  facilityName: string;
  initialSummary: FacilityReferralProfileSummary;
  contacts: ContactOption[];
  canEdit: boolean;
};

function pill(cls: string, label: string) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${cls}`}>{label}</span>
  );
}

export function FacilityReferralProfilePanel({
  facilityId,
  facilityName,
  initialSummary,
  contacts,
  canEdit,
}: FacilityReferralProfilePanelProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [editOpen, setEditOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/facilities/${facilityId}/referral-profile`);
    const data = (await res.json()) as { ok?: boolean; summary?: FacilityReferralProfileSummary };
    if (data.ok && data.summary) setSummary(data.summary);
  }, [facilityId]);

  async function createFollowUp() {
    setCreatingTask(true);
    try {
      const res = await fetch(`/api/facilities/${facilityId}/referral-profile/create-follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; summary?: FacilityReferralProfileSummary };
      if (data.ok) {
        if (data.summary) setSummary(data.summary);
        setToast("Follow-up task created.");
      } else {
        setToast(data.error === "no_action" ? "No next action to schedule." : "Could not create task.");
      }
    } finally {
      setCreatingTask(false);
    }
  }

  const p = summary.profile;
  const nba = summary.next_best_action;

  return (
    <section className="overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 via-white to-fuchsia-50/40 shadow-sm">
      <div className="border-b border-violet-100/80 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-800">Referral Source Profile</p>
            <p className="mt-0.5 text-sm text-violet-950/80">
              Who handles referrals, how to send them, and what to do next.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <>
                <button
                  type="button"
                  onClick={() => setAiOpen(true)}
                  className="rounded-xl border border-violet-600 bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700"
                >
                  Refresh Profile with AI
                </button>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  Edit Referral Profile
                </button>
              </>
            ) : null}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {p.relationship_status ? pill("bg-sky-100 text-sky-900 ring-sky-200", p.relationship_status) : null}
          {p.referral_potential ? pill("bg-amber-100 text-amber-950 ring-amber-200", p.referral_potential) : null}
          <span className="text-xs text-violet-800">{summary.completeness_pct}% complete</span>
        </div>
      </div>

      {toast ? (
        <div className="mx-5 mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {toast}
        </div>
      ) : null}

      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase text-slate-400">Best contact</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {summary.best_contact?.name ?? p.decision_maker_name ?? "—"}
          </p>
          {(summary.best_contact?.title ?? p.decision_maker_role) ? (
            <p className="text-xs text-slate-600">{summary.best_contact?.title ?? p.decision_maker_role}</p>
          ) : null}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-slate-400">Preferred delivery</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {summary.hints.preferred_method ?? "—"}
          </p>
          {[p.referral_fax, p.referral_email, p.referral_phone].filter(Boolean).length ? (
            <p className="mt-0.5 text-xs text-slate-600">
              {[p.referral_fax ? `Fax: ${p.referral_fax}` : null, p.referral_email, p.referral_phone]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-2">
          <p className="text-[10px] font-bold uppercase text-slate-400">Referral process</p>
          <p className="mt-1 text-sm text-slate-800">{p.referral_process?.trim() || "Not captured yet."}</p>
        </div>
        {p.services_likely_to_refer?.length ? (
          <div className="sm:col-span-2">
            <p className="text-[10px] font-bold uppercase text-slate-400">Services likely to refer</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.services_likely_to_refer.map((s) => (
                <span key={s} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200">
                  {s}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {p.payer_notes ? (
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Payer notes</p>
            <p className="mt-1 text-sm text-slate-700">{p.payer_notes}</p>
          </div>
        ) : null}
        {p.opportunities ? (
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-400">Opportunities</p>
            <p className="mt-1 text-sm text-slate-700">{p.opportunities}</p>
          </div>
        ) : null}
        {summary.last_meaningful_activity ? (
          <div className="sm:col-span-2">
            <p className="text-[10px] font-bold uppercase text-slate-400">Last meaningful activity</p>
            <p className="mt-1 text-sm text-slate-800">{summary.last_meaningful_activity.summary}</p>
            <p className="text-xs text-slate-500">{formatFacilityDateTime(summary.last_meaningful_activity.activity_at)}</p>
          </div>
        ) : null}
        {summary.open_action_items.length ? (
          <div className="sm:col-span-2">
            <p className="text-[10px] font-bold uppercase text-slate-400">Open action items</p>
            <ul className="mt-1 space-y-1">
              {summary.open_action_items.map((item) => (
                <li key={item.key} className="text-sm text-slate-700">
                  · {item.label}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {nba ? (
          <div className="sm:col-span-2 rounded-xl border border-teal-200 bg-teal-50/60 p-3">
            <p className="text-[10px] font-bold uppercase text-teal-800">Next best action</p>
            <p className="mt-1 text-sm font-semibold text-teal-950">{nba.action}</p>
            <p className="mt-0.5 text-xs text-teal-800">{nba.reason}</p>
            {nba.due_at ? (
              <p className="mt-1 text-xs text-teal-700">Due {formatFacilityDate(nba.due_at)}</p>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                disabled={creatingTask}
                onClick={() => void createFollowUp()}
                className="mt-2 rounded-lg border border-teal-700 bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {creatingTask ? "Creating…" : "Create follow-up task"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {editOpen ? (
        <FacilityReferralProfileEditModal
          facilityId={facilityId}
          facilityName={facilityName}
          summary={summary}
          contacts={contacts}
          onClose={() => setEditOpen(false)}
          onSaved={(s) => {
            setSummary(s);
            setEditOpen(false);
            setToast("Profile updated.");
          }}
        />
      ) : null}

      {aiOpen ? (
        <FacilityReferralProfileAiModal
          facilityId={facilityId}
          currentSummary={summary}
          onClose={() => setAiOpen(false)}
          onApplied={(s) => {
            setSummary(s);
            setAiOpen(false);
            setToast("AI suggestions applied.");
          }}
        />
      ) : null}
    </section>
  );
}
