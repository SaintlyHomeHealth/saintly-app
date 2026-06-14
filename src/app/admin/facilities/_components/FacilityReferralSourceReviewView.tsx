"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AttachReferralSourceModal } from "@/app/admin/facilities/_components/AttachReferralSourceModal";
import type {
  ReferralSourceReviewItem,
  ReferralSourceReviewStatus,
  ReferralSourceReviewSummary,
} from "@/lib/crm/facility-referral-source-review-types";
import { formatFacilityDate } from "@/lib/crm/facility-address";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { crmActionBtnMuted, crmActionBtnSky, crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type FacilityReferralSourceReviewViewProps = {
  canManage: boolean;
  initialLeadId?: string;
};

function badgeCls(badge: string) {
  if (badge === "strong") return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  if (badge === "possible") return "bg-amber-100 text-amber-950 ring-amber-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function sourceTypeLabel(type: string | null) {
  if (!type) return "Unknown";
  return type.replace(/_/g, " ");
}

export function FacilityReferralSourceReviewView({
  canManage,
  initialLeadId = "",
}: FacilityReferralSourceReviewViewProps) {
  const [status, setStatus] = useState<ReferralSourceReviewStatus>("needs_review");
  const [search, setSearch] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [items, setItems] = useState<ReferralSourceReviewItem[]>([]);
  const [summary, setSummary] = useState<ReferralSourceReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<ReferralSourceReviewItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status });
      if (search.trim()) params.set("search", search.trim());
      if (sourceType) params.set("source_type", sourceType);
      const res = await fetch(`/api/facilities/referral-source-review?${params.toString()}`);
      const data = (await res.json()) as {
        ok?: boolean;
        items?: ReferralSourceReviewItem[];
        summary?: ReferralSourceReviewSummary;
      };
      if (!data.ok) {
        setError("Could not load review queue.");
        return;
      }
      setItems(data.items ?? []);
      setSummary(data.summary ?? null);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [search, sourceType, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!initialLeadId || !items.length) return;
    const match = items.find((i) => i.lead_id === initialLeadId);
    if (match) setActiveItem(match);
  }, [initialLeadId, items]);

  return (
    <div className="space-y-5">
      {summary ? (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Needs review", summary.pending, summary.pending > 0],
            ["Reviews completed", summary.reviewed, false],
            ["Matched after review", summary.matchedAfterReview, false],
            ["Facilities created", summary.facilitiesCreatedFromReview, false],
            ["Avg hrs to review", summary.avgHoursToReview ?? "—", false],
          ].map(([label, value, alert]) => (
            <div
              key={String(label)}
              className={`rounded-xl border p-3 shadow-sm ${alert ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}
            >
              <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
            </div>
          ))}
        </section>
      ) : null}

      {summary && summary.pending > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {summary.pending} referral source{summary.pending === 1 ? "" : "s"} need review.
        </div>
      ) : null}

      {summary && summary.topUnmatchedOfficeNames.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-slate-600">Top unmatched offices:</span>
          {summary.topUnmatchedOfficeNames.map((o) => (
            <span key={o.name} className="rounded-full bg-white px-2 py-0.5 text-xs font-medium ring-1 ring-slate-200">
              {o.name} ({o.count})
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(["needs_review", "reviewed", "all"] as ReferralSourceReviewStatus[]).map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={tabCls(status === s)}>
            {s === "needs_review" ? "Needs review" : s === "reviewed" ? "Reviewed" : "All"}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Search patient or office
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={crmFilterInputCls}
            placeholder="Name or office…"
          />
        </label>
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Source type
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className={crmFilterInputCls}>
            <option value="">All types</option>
            <option value="unmatched_printed_qr">Unmatched printed QR</option>
            <option value="printed_qr">Printed QR</option>
            <option value="packet_link">Packet link</option>
          </select>
        </label>
      </div>

      {loading ? <p className="text-sm text-slate-600">Loading review queue…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && items.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          No referrals match this review filter.
        </p>
      ) : null}

      <div className="space-y-4">
        {items.map((item) => (
          <ReviewCard
            key={item.lead_id}
            item={item}
            canManage={canManage}
            onReview={() => setActiveItem(item)}
          />
        ))}
      </div>

      {activeItem && canManage ? (
        <AttachReferralSourceModal
          item={activeItem}
          onClose={() => setActiveItem(null)}
          onDone={() => {
            setActiveItem(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function ReviewCard({
  item,
  canManage,
  onReview,
}: {
  item: ReferralSourceReviewItem;
  canManage: boolean;
  onReview: () => void;
}) {
  const typed = item.typed_source;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{item.patient_name}</h3>
          <p className="text-xs text-slate-600">
            {sourceTypeLabel(item.referral_source_type)} · {item.status} · {formatFacilityDate(item.created_at)}
          </p>
        </div>
        {item.needs_referral_source_review ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900">
            Needs review
          </span>
        ) : (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-900">
            Reviewed
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="text-[10px] font-bold uppercase text-slate-500">Lead</p>
          <p>{item.phone ? formatPhoneForDisplay(item.phone) : "—"}</p>
          <p className="text-slate-600">{item.service_needed ?? "—"}</p>
          <p className="text-slate-600">{item.payer ?? "—"}</p>
        </section>
        <section className="rounded-lg bg-amber-50/60 p-3 text-sm">
          <p className="text-[10px] font-bold uppercase text-amber-900">Typed source</p>
          <p className="font-medium">{typed.referring_office_name ?? "—"}</p>
          <p className="text-slate-700">{typed.referring_contact_name ?? "—"}</p>
          <p className="text-xs text-slate-600">
            {[typed.office_city, typed.office_phone, typed.referring_contact_email].filter(Boolean).join(" · ") || "—"}
          </p>
          {typed.link_type ? (
            <p className="mt-1 text-xs text-violet-800">
              {typed.link_type}
              {typed.token ? ` · /refer/t/${typed.token}` : ""}
            </p>
          ) : null}
        </section>
      </div>

      <p className="mt-2 text-xs text-slate-600">
        Match: {item.match_confidence != null ? `${Math.round(item.match_confidence * 100)}%` : "—"}
        {item.match_reason ? ` · ${item.match_reason}` : ""}
      </p>

      {item.suggestions.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-bold uppercase text-slate-500">Suggested matches</p>
          {item.suggestions.slice(0, 3).map((s) => (
            <div key={s.facility_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
              <div>
                <Link href={`/admin/facilities/${s.facility_id}`} className="font-semibold text-sky-800 hover:underline">
                  {s.facility_name}
                </Link>
                <p className="text-xs text-slate-600">
                  {[s.city, s.phone].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${badgeCls(s.match_badge)}`}>
                {s.match_badge === "strong" ? "Strong" : s.match_badge === "possible" ? "Possible" : "Weak"} ·{" "}
                {Math.round(s.match_confidence * 100)}%
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/admin/crm/leads/${item.lead_id}`} className={crmActionBtnSky}>
          Open Lead
        </Link>
        {canManage && item.needs_referral_source_review ? (
          <button type="button" className={crmActionBtnMuted} onClick={onReview}>
            Review Source
          </button>
        ) : null}
      </div>
    </article>
  );
}

function tabCls(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-xs font-semibold ${
    active ? "border-amber-600 bg-amber-600 text-white" : "border-slate-200 bg-white text-slate-700"
  }`;
}
