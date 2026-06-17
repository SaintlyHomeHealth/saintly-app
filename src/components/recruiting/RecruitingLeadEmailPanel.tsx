"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { RecruitingLeadSendEmailModal } from "@/app/admin/recruiting-leads/_components/RecruitingLeadSendEmailModal";
import {
  RecruitingLeadActivityTimeline,
  type RecruitingLeadActivityRow,
} from "@/app/admin/recruiting-leads/_components/RecruitingLeadActivityTimeline";

const rowActionBtnCls =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-sky-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:shadow-md whitespace-nowrap";

type RecruitingLeadEmailPanelProps = {
  recruitingLeadId: string | null;
  recipientEmail: string | null;
  leadFullName?: string | null;
  leadPhone?: string | null;
  leadLicenseStatus?: string | null;
  leadType?: string | null;
  leadFormName?: string | null;
  emailConfigured: boolean;
  leadActivities: RecruitingLeadActivityRow[];
  recruitingLeadHref?: string | null;
  compact?: boolean;
};

export function RecruitingLeadEmailPanel({
  recruitingLeadId,
  recipientEmail,
  leadFullName,
  leadPhone,
  leadLicenseStatus,
  leadType,
  leadFormName,
  emailConfigured,
  leadActivities,
  recruitingLeadHref,
  compact = false,
}: RecruitingLeadEmailPanelProps) {
  const router = useRouter();
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  if (!recruitingLeadId) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 px-6 py-8 text-sm text-slate-600 shadow-sm">
        Not linked to a unified recruiting lead yet. Save or upload a resume to connect this applicant to the recruiting
        pipeline.
      </div>
    );
  }

  const leadHref = recruitingLeadHref ?? `/admin/recruiting-leads/${recruitingLeadId}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setEmailModalOpen(true)} className={rowActionBtnCls}>
          Send template email
        </button>
        <Link href={leadHref} className={rowActionBtnCls}>
          Open recruiting lead
        </Link>
      </div>

      {!compact ? <RecruitingLeadActivityTimeline activities={leadActivities} /> : null}

      {compact && leadActivities.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-700">
          <p className="font-semibold text-slate-900">Latest recruiting email activity</p>
          <p className="mt-1">{leadActivities[0]?.body ?? (typeof leadActivities[0]?.metadata?.subject === "string" ? leadActivities[0].metadata.subject : "—")}</p>
        </div>
      ) : null}

      {emailModalOpen ? (
        <RecruitingLeadSendEmailModal
          leadId={recruitingLeadId}
          lead={{
            full_name: leadFullName ?? "",
            phone: leadPhone,
            email: recipientEmail,
            license_status: leadLicenseStatus,
            lead_type: leadType,
            form_name: leadFormName,
          }}
          recipientEmail={recipientEmail}
          emailConfigured={emailConfigured}
          onClose={() => setEmailModalOpen(false)}
          onSent={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
