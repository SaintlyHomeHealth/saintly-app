"use client";

import { useState } from "react";

import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  recruitingLeadRoleBadge,
  recruitingLeadRoleBadgeClass,
} from "@/lib/recruiting/recruiting-lead-role-display";

import { facebookRecruitingLeadStatusPillClass } from "../recruiting-leads-status-styles";
import { RecruitingLeadActionsMenu } from "./RecruitingLeadActionsMenu";
import { RecruitingLeadSourceBadge } from "./RecruitingLeadDeleteButton";

export type RecruitingLeadListRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  license_status: string | null;
  lead_type: string | null;
  home_health_experience: string | null;
  visits_per_week: string | null;
  coverage_area: string | null;
  start_date: string | null;
  source: string | null;
  form_name: string | null;
  raw_payload: unknown;
  status: string;
  notes: string | null;
  created_at: string;
};

type Props = {
  row: RecruitingLeadListRow;
  detailHref: string;
  emailConfigured: boolean;
};

function formatListDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatAppDateTime(iso, "—", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRawAnswers(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const root = rawPayload as Record<string, unknown>;
  const latest = root.latest;
  if (!latest || typeof latest !== "object") return null;
  try {
    return JSON.stringify(latest, null, 2);
  } catch {
    return String(latest);
  }
}

function DetailBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm text-slate-700">{value.trim()}</p>
    </div>
  );
}

const cardCls =
  "rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm shadow-slate-200/40 transition hover:border-sky-200/80 hover:shadow-md hover:shadow-sky-100/50";

const metaCls = "text-xs text-slate-600";

export function RecruitingLeadListCard({ row, detailHref, emailConfigured }: Props) {
  const [expanded, setExpanded] = useState(false);
  const role = recruitingLeadRoleBadge({
    license_status: row.license_status,
    lead_type: row.lead_type,
    form_name: row.form_name,
  });
  const rawAnswers = formatRawAnswers(row.raw_payload);
  const hasDetails =
    Boolean(row.home_health_experience?.trim()) ||
    Boolean(row.license_status?.trim()) ||
    Boolean(row.notes?.trim()) ||
    Boolean(rawAnswers);

  return (
    <article className={cardCls}>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] lg:items-center lg:gap-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900">{row.full_name}</h3>
            <span className={recruitingLeadRoleBadgeClass(role)}>{role}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RecruitingLeadSourceBadge
              source={row.source}
              formName={row.form_name}
              rawPayload={row.raw_payload}
            />
            <span className={facebookRecruitingLeadStatusPillClass(row.status)}>{row.status}</span>
          </div>
          <p className={metaCls}>Added {formatListDate(row.created_at)}</p>
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <div className="min-w-0 space-y-1">
            <p className={metaCls}>
              <span className="font-medium text-slate-700">Phone:</span>{" "}
              {row.phone ? formatPhoneForDisplay(row.phone) : "—"}
            </p>
            <p className="line-clamp-1 min-w-0 break-all text-xs text-slate-600">
              <span className="font-medium text-slate-700">Email:</span> {row.email?.trim() || "—"}
            </p>
          </div>
          <div className="min-w-0 space-y-1">
            <p className="line-clamp-1 min-w-0 text-xs text-slate-600">
              <span className="font-medium text-slate-700">Coverage:</span> {row.coverage_area ?? "—"}
            </p>
            <p className={metaCls}>
              <span className="font-medium text-slate-700">Start:</span> {row.start_date ?? "—"}
            </p>
            <p className={metaCls}>
              <span className="font-medium text-slate-700">Visits/week:</span> {row.visits_per_week ?? "—"}
            </p>
          </div>
        </div>

        <div className="lg:justify-self-end">
          <RecruitingLeadActionsMenu
            leadId={row.id}
            leadName={row.full_name}
            email={row.email}
            phone={row.phone}
            licenseStatus={row.license_status}
            leadType={row.lead_type}
            formName={row.form_name}
            detailHref={detailHref}
            emailConfigured={emailConfigured}
          />
        </div>
      </div>

      {hasDetails ? (
        <div className="border-t border-slate-100 px-4 py-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-semibold text-sky-800 hover:text-sky-900 hover:underline"
          >
            {expanded ? "Hide details" : "View details"}
          </button>
          {expanded ? (
            <div className="mt-3 grid gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2">
              <DetailBlock label="Home health experience" value={row.home_health_experience} />
              <DetailBlock label="License status" value={row.license_status} />
              <DetailBlock label="Notes" value={row.notes} />
              {rawAnswers ? (
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Original form answers
                  </p>
                  <pre className="mt-1 max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-[11px] leading-relaxed text-slate-700">
                    {rawAnswers}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
