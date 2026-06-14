"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ClipboardCheck } from "lucide-react";

import {
  LeadIntakeDecisionModal,
  type LeadIntakeDecisionMode,
} from "@/app/admin/crm/leads/_components/LeadIntakeDecisionModal";
import type { LeadIntakeReadinessSummary } from "@/lib/crm/lead-intake-readiness-types";

type StaffOption = { user_id: string; label: string };

const statusBadge: Record<string, string> = {
  needs_review: "bg-slate-100 text-slate-800 ring-slate-200",
  ready: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  needs_info: "bg-amber-50 text-amber-900 ring-amber-200",
  needs_clinical_review: "bg-violet-50 text-violet-900 ring-violet-200",
  needs_payer_review: "bg-orange-50 text-orange-900 ring-orange-200",
  needs_staffing_review: "bg-indigo-50 text-indigo-900 ring-indigo-200",
  cannot_accept: "bg-red-50 text-red-800 ring-red-200",
  accepted: "bg-teal-50 text-teal-900 ring-teal-200",
  declined: "bg-slate-200 text-slate-800 ring-slate-300",
};

function labelStatus(s: string): string {
  return s.replace(/_/g, " ");
}

function labelSubStatus(s: string | null): string {
  if (!s) return "—";
  return s.replace(/_/g, " ");
}

export function LeadIntakeReadinessPanel(props: {
  leadId: string;
  initial: LeadIntakeReadinessSummary;
  staffOptions?: StaffOption[];
}) {
  const { leadId, initial, staffOptions = [] } = props;
  const router = useRouter();

  const [data, setData] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [modalMode, setModalMode] = useState<LeadIntakeDecisionMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newHandoffId, setNewHandoffId] = useState<string | null>(null);

  const review = data.review;
  const canDecide = data.can_decide && !data.is_terminal;

  const reload = useCallback(async () => {
    const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/intake-readiness`);
    const json = (await res.json().catch(() => ({}))) as LeadIntakeReadinessSummary & { ok?: boolean };
    if (json.ok !== false && json.review) {
      setData({
        review: json.review,
        can_decide: json.can_decide ?? false,
        lead_status: json.lead_status ?? null,
        is_terminal: json.is_terminal ?? false,
      });
    }
    router.refresh();
  }, [leadId, router]);

  async function refreshReview() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/intake-readiness/refresh`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as LeadIntakeReadinessSummary & { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        setError(json.error ?? "Refresh failed.");
        return;
      }
      if (json.review) {
        setData({
          review: json.review,
          can_decide: json.can_decide ?? data.can_decide,
          lead_status: json.lead_status ?? data.lead_status,
          is_terminal: json.is_terminal ?? data.is_terminal,
        });
      }
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  async function markReady() {
    setError(null);
    const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/intake-readiness`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        readiness_status: "ready",
        decision: "pending",
        suggested_next_action: "Ready for intake acceptance review.",
      }),
    });
    if (!res.ok) {
      setError("Could not mark ready.");
      return;
    }
    await reload();
  }

  const badgeCls = statusBadge[review.readiness_status] ?? statusBadge.needs_review;

  return (
    <>
      <section
        id="section-intake-readiness"
        className="scroll-mt-24 rounded-2xl border border-teal-100/90 bg-gradient-to-br from-teal-50/40 to-white p-5 shadow-sm ring-1 ring-teal-100/50"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <ClipboardCheck className="mt-0.5 h-5 w-5 text-teal-700" aria-hidden />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Intake Readiness Review</h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Deterministic checklist — staff confirms accept, decline, or follow-up.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ring-1 ${badgeCls}`}>
              {labelStatus(review.readiness_status)}
            </span>
            {review.readiness_score != null ? (
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                Score {review.readiness_score}
              </span>
            ) : null}
          </div>
        </div>

        {review.suggested_next_action ? (
          <p className="mt-3 text-sm font-medium text-slate-800">{review.suggested_next_action}</p>
        ) : null}

        {review.ai_summary ? (
          <p className="mt-2 rounded-lg bg-white/80 p-3 text-xs text-slate-600 ring-1 ring-slate-100">
            <span className="font-semibold text-slate-700">AI document hint: </span>
            {review.ai_summary.slice(0, 500)}
            {review.ai_summary.length > 500 ? "…" : ""}
          </p>
        ) : null}

        <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <Stat label="Payer" value={labelSubStatus(review.payer_status)} />
          <Stat label="Documents" value={labelSubStatus(review.document_status)} />
          <Stat label="Clinical" value={labelSubStatus(review.clinical_status)} />
          <Stat label="Service area" value={labelSubStatus(review.service_area_status)} />
          <Stat label="Staffing" value={labelSubStatus(review.staffing_status)} />
        </dl>

        {review.missing_items?.length ? (
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Missing items</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {review.missing_items.map((m) => (
                <li key={m} className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-900 ring-1 ring-amber-100">
                  {m}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {review.blockers?.length ? (
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-red-600">Blockers</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {review.blockers.map((b) => (
                <li key={b} className="rounded-md bg-red-50 px-2 py-0.5 text-xs text-red-800 ring-1 ring-red-100">
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {review.warnings?.length ? (
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Warnings</p>
            <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
              {review.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

        {newHandoffId ? (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
            <p className="text-sm font-medium text-indigo-950">Referral accepted — admission handoff created.</p>
            <Link
              href={`/admin/intake/admissions/${newHandoffId}`}
              className="mt-2 inline-flex text-sm font-semibold text-indigo-700 underline"
            >
              Open Admission Handoff
            </Link>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <ActionBtn onClick={() => void refreshReview()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh Review"}
          </ActionBtn>
          {canDecide && review.readiness_status !== "ready" && review.readiness_status !== "accepted" ? (
            <ActionBtn onClick={() => void markReady()}>Mark Ready</ActionBtn>
          ) : null}
          {canDecide && !["accepted", "declined"].includes(review.readiness_status) ? (
            <>
              <ActionBtn onClick={() => setModalMode("request_info")}>Request Missing Info</ActionBtn>
              <ActionBtn onClick={() => setModalMode("clinical_review")}>Send to Clinical Review</ActionBtn>
              {review.payer_status === "needs_verification" || review.readiness_status === "needs_payer_review" ? (
                <ActionBtn onClick={() => setModalMode("payer_review")}>Payer Review</ActionBtn>
              ) : null}
              {(review.readiness_status === "ready" ||
                (review.readiness_score != null && review.readiness_score >= 70)) ? (
                <ActionBtn primary onClick={() => setModalMode("accept")}>
                  Accept Referral
                </ActionBtn>
              ) : null}
              <ActionBtn danger onClick={() => setModalMode("decline")}>
                Decline Referral
              </ActionBtn>
            </>
          ) : null}
        </div>

        {!canDecide && !data.is_terminal ? (
          <p className="mt-2 text-xs text-slate-500">View only — intake decisions require manager access.</p>
        ) : null}
      </section>

      {modalMode ? (
        <LeadIntakeDecisionModal
          open
          mode={modalMode}
          leadId={leadId}
          review={review}
          staffOptions={staffOptions}
          onClose={() => setModalMode(null)}
          onSuccess={(handoffId) => {
            if (handoffId) setNewHandoffId(handoffId);
            void reload();
          }}
        />
      ) : null}
    </>
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

function ActionBtn(props: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const { children, onClick, disabled, primary, danger } = props;
  let cls = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50";
  if (primary) cls = "rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50";
  if (danger) cls = "rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50";
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
