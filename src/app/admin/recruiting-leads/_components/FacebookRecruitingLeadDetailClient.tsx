"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import {
  RecruitingLeadResumeDocumentsPanel,
  type RecruitingLeadResumeDocumentClientRow,
} from "@/components/recruiting/RecruitingLeadResumeDocumentsPanel";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { FACEBOOK_RECRUITING_LEAD_STATUS_OPTIONS } from "@/lib/recruiting/facebook-recruiting-lead-options";

import { updateFacebookRecruitingLead } from "../actions";
import { facebookRecruitingLeadStatusPillClass } from "../recruiting-leads-status-styles";
import {
  RecruitingLeadActivityTimeline,
  type RecruitingLeadActivityRow,
} from "./RecruitingLeadActivityTimeline";
import { MoveRecruitingLeadToPatientLeadsButton } from "./MoveRecruitingLeadToPatientLeadsButton";
import { RecruitingLeadSendEmailModal } from "./RecruitingLeadSendEmailModal";

export type FacebookRecruitingLeadRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  form_name: string | null;
  license_status: string | null;
  home_health_experience: string | null;
  visits_per_week: string | null;
  coverage_area: string | null;
  start_date: string | null;
  contact_preference: string | null;
  lead_type: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const rowActionBtnCls =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-sky-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:shadow-md whitespace-nowrap";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatAppDateTime(iso, "—", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function smsHref(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  return `sms:${digits}`;
}

function telHref(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  return `tel:${digits}`;
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value?.trim() || "—"}</dd>
    </div>
  );
}

type FacebookRecruitingLeadDetailClientProps = {
  lead: FacebookRecruitingLeadRow;
  listBackHref: string;
  activities: RecruitingLeadActivityRow[];
  emailConfigured: boolean;
  resumeDocuments: RecruitingLeadResumeDocumentClientRow[];
  deleteAction?: ReactNode;
};

export function FacebookRecruitingLeadDetailClient({
  lead,
  listBackHref,
  activities,
  emailConfigured,
  resumeDocuments,
  deleteAction,
}: FacebookRecruitingLeadDetailClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState(lead.status);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const returnTo = searchParams?.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  const phoneDisplay = lead.phone ? formatPhoneForDisplay(lead.phone) : "—";
  const callHref = telHref(lead.phone);
  const textHref = smsHref(lead.phone);
  const emailHref = lead.email?.trim() ? `mailto:${lead.email.trim()}` : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={listBackHref} className="text-sm font-medium text-sky-800 hover:underline">
          ← Back to recruiting leads
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setEmailModalOpen(true)} className={rowActionBtnCls}>
            Send template email
          </button>
          {callHref ? (
            <a href={callHref} className={rowActionBtnCls}>
              Call
            </a>
          ) : null}
          {textHref ? (
            <a href={textHref} className={rowActionBtnCls}>
              Text
            </a>
          ) : null}
          {emailHref ? (
            <a href={emailHref} className={rowActionBtnCls}>
              Email
            </a>
          ) : null}
          <MoveRecruitingLeadToPatientLeadsButton leadId={lead.id} leadName={lead.full_name} variant="detail" />
          {deleteAction}
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{lead.full_name}</h2>
            <p className="mt-1 text-sm text-slate-600">
              Submitted {formatWhen(lead.created_at)}
              {lead.updated_at !== lead.created_at ? ` · Updated ${formatWhen(lead.updated_at)}` : ""}
            </p>
          </div>
          <span className={facebookRecruitingLeadStatusPillClass(lead.status)}>{lead.status}</span>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Phone" value={phoneDisplay} />
          <DetailField label="Email" value={lead.email} />
          <DetailField label="City" value={lead.city} />
          <DetailField label="License status" value={lead.license_status} />
          <DetailField label="Home health experience" value={lead.home_health_experience} />
          <DetailField label="Visits per week" value={lead.visits_per_week} />
          <DetailField label="Coverage area" value={lead.coverage_area} />
          <DetailField label="Start date" value={lead.start_date} />
          <DetailField label="Contact preference" value={lead.contact_preference} />
          <DetailField label="Form name" value={lead.form_name} />
          <DetailField label="Source" value={lead.source} />
          <DetailField label="Lead type" value={lead.lead_type} />
        </dl>
      </div>

      <RecruitingLeadResumeDocumentsPanel documents={resumeDocuments} />

      <RecruitingLeadActivityTimeline activities={activities} />

      <form action={updateFacebookRecruitingLead} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <input type="hidden" name="leadId" value={lead.id} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <h3 className="text-sm font-semibold text-slate-900">Admin follow-up</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
            Status
            <select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={crmFilterInputCls}
            >
              {FACEBOOK_RECRUITING_LEAD_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-4 flex flex-col gap-1 text-[11px] font-medium text-slate-600">
          Notes
          <textarea
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            className={`${crmFilterInputCls} min-h-[7rem] resize-y`}
            placeholder="Call notes, interview details, credentialing updates…"
          />
        </label>
        <div className="mt-4">
          <button type="submit" className={crmPrimaryCtaCls}>
            Save changes
          </button>
        </div>
      </form>

      {emailModalOpen ? (
        <RecruitingLeadSendEmailModal
          leadId={lead.id}
          lead={{
            full_name: lead.full_name,
            phone: lead.phone,
            email: lead.email,
            license_status: lead.license_status,
            lead_type: lead.lead_type,
            form_name: lead.form_name,
          }}
          recipientEmail={lead.email}
          emailConfigured={emailConfigured}
          onClose={() => setEmailModalOpen(false)}
          onSent={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
