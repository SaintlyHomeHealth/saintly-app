"use client";

import Link from "next/link";

import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  recruitingLeadRoleBadge,
  recruitingLeadRoleBadgeClass,
} from "@/lib/recruiting/recruiting-lead-role-display";

import { facebookRecruitingLeadStatusPillClass } from "@/app/admin/recruiting/recruiting-leads-status-styles";
import { RecruitingLeadActionsMenu } from "./RecruitingLeadActionsMenu";
import { RecruitingLeadSourceBadge } from "./RecruitingLeadDeleteButton";

export type RecruitingLeadListRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  license_status: string | null;
  lead_type: string | null;
  visits_per_week: string | null;
  coverage_area: string | null;
  start_date: string | null;
  source: string | null;
  form_name: string | null;
  status: string;
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

const cardCls =
  "rounded-2xl border border-slate-200/90 bg-white/95 shadow-sm shadow-slate-200/40 transition hover:border-sky-200/80 hover:shadow-md hover:shadow-sky-100/50";

const metaCls = "text-xs text-slate-600";

export function RecruitingLeadListCard({ row, detailHref, emailConfigured }: Props) {
  const role = recruitingLeadRoleBadge({
    license_status: row.license_status,
    lead_type: row.lead_type,
    form_name: row.form_name,
  });

  return (
    <article className={cardCls}>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] lg:items-center lg:gap-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900">{row.full_name}</h3>
            <span className={recruitingLeadRoleBadgeClass(role)}>{role}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RecruitingLeadSourceBadge source={row.source} formName={row.form_name} />
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

      <div className="border-t border-slate-100 px-4 py-2">
        <Link
          href={detailHref}
          className="text-xs font-semibold text-sky-800 hover:text-sky-900 hover:underline"
        >
          View details
        </Link>
      </div>
    </article>
  );
}
