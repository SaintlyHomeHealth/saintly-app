"use client";

import { useMemo, useState } from "react";

import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import {
  buildRecruitingPaySummary,
  buildRnRecruitingPaySummary,
  getRecruitingEmailPayDefaultsForTemplate,
  inferRecruitingEmailTemplateIdForLead,
  recruitingEmailTemplateUsesPayFields,
} from "@/lib/recruiting/recruiting-email-pay";
import {
  RECRUITING_EMAIL_TEMPLATES,
  type RecruitingEmailTemplateId,
} from "@/lib/recruiting/recruiting-email-templates";
import { buildRecruitingEmailHtml } from "@/lib/recruiting/recruiting-email-signature";
import {
  buildRecruitingEmailVariables,
  findUnresolvedRecruitingEmailPlaceholders,
  type RecruitingLeadEmailContext,
  renderRecruitingEmailTemplate,
} from "@/lib/recruiting/render-recruiting-email-template";

export type RecruitingLeadSendEmailLeadProps = RecruitingLeadEmailContext;

type Props = {
  leadId: string;
  lead: RecruitingLeadSendEmailLeadProps;
  recipientEmail: string | null;
  emailConfigured: boolean;
  onClose: () => void;
  onSent: () => void;
};

function initialTemplateId(lead: RecruitingLeadSendEmailLeadProps): RecruitingEmailTemplateId {
  return inferRecruitingEmailTemplateIdForLead(lead);
}

function initialTemplateState(lead: RecruitingLeadSendEmailLeadProps) {
  const templateId = initialTemplateId(lead);
  const tpl = RECRUITING_EMAIL_TEMPLATES.find((t) => t.id === templateId) ?? RECRUITING_EMAIL_TEMPLATES[0]!;
  const payDefaults = getRecruitingEmailPayDefaultsForTemplate(templateId);
  return {
    templateId,
    subject: tpl.subject,
    body: tpl.body,
    visitRate: payDefaults?.visitRate ?? "",
    socRate: payDefaults?.socRate ?? "",
    paySummary: payDefaults?.paySummary ?? "",
  };
}

export function RecruitingLeadSendEmailModal({
  leadId,
  lead,
  recipientEmail,
  emailConfigured,
  onClose,
  onSent,
}: Props) {
  const initial = initialTemplateState(lead);
  const [templateId, setTemplateId] = useState<RecruitingEmailTemplateId>(initial.templateId);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [visitRate, setVisitRate] = useState(initial.visitRate);
  const [socRate, setSocRate] = useState(initial.socRate);
  const [paySummary, setPaySummary] = useState(initial.paySummary);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leadContext: RecruitingLeadEmailContext = useMemo(
    () => ({
      full_name: lead.full_name,
      phone: lead.phone,
      email: recipientEmail ?? lead.email,
      license_status: lead.license_status,
      lead_type: lead.lead_type,
      form_name: lead.form_name,
    }),
    [lead, recipientEmail]
  );

  const showPayFields = recruitingEmailTemplateUsesPayFields(templateId);
  const showSocRate = showPayFields && getRecruitingEmailPayDefaultsForTemplate(templateId)?.includeSoc;

  const previewVariables = useMemo(
    () =>
      buildRecruitingEmailVariables(leadContext, {
        visit_rate: showPayFields ? visitRate : undefined,
        soc_rate: showPayFields && showSocRate ? socRate : undefined,
        pay_summary: showPayFields ? paySummary : undefined,
        template_id: templateId,
      }),
    [leadContext, showPayFields, showSocRate, visitRate, socRate, paySummary, templateId]
  );

  function applyTemplate(id: RecruitingEmailTemplateId) {
    const tpl = RECRUITING_EMAIL_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setTemplateId(id);
    setSubject(tpl.subject);
    setBody(tpl.body);
    const payDefaults = getRecruitingEmailPayDefaultsForTemplate(id);
    if (payDefaults) {
      setVisitRate(payDefaults.visitRate);
      setSocRate(payDefaults.socRate);
      setPaySummary(payDefaults.paySummary);
    }
    setError(null);
  }

  function updateVisitRate(value: string) {
    setVisitRate(value);
    if (templateId === "rn_follow_up") return;
    const payDefaults = getRecruitingEmailPayDefaultsForTemplate(templateId);
    if (payDefaults?.includeSoc) {
      setPaySummary(buildRecruitingPaySummary(value, socRate, true, templateId));
    } else if (payDefaults) {
      setPaySummary(buildRecruitingPaySummary(value, "", false, templateId));
    }
  }

  function updateSocRate(value: string) {
    setSocRate(value);
    if (templateId === "rn_follow_up") {
      setPaySummary(buildRnRecruitingPaySummary(value));
      return;
    }
    const payDefaults = getRecruitingEmailPayDefaultsForTemplate(templateId);
    if (payDefaults?.includeSoc) {
      setPaySummary(buildRecruitingPaySummary(visitRate, value, true, templateId));
    }
  }

  async function handleSend() {
    setError(null);
    if (!recipientEmail?.trim()) {
      setError("This lead has no email address on file.");
      return;
    }
    if (!emailConfigured) {
      setError("Email is not configured on the server (RESEND_API_KEY).");
      return;
    }

    const renderedSubject = renderRecruitingEmailTemplate(subject, previewVariables);
    const renderedBody = renderRecruitingEmailTemplate(body, previewVariables);
    const unresolved = [
      ...findUnresolvedRecruitingEmailPlaceholders(renderedSubject),
      ...findUnresolvedRecruitingEmailPlaceholders(renderedBody),
    ];
    if (unresolved.length > 0) {
      setError(
        `Email still has unresolved placeholders: ${unresolved.join(", ")}. Fill in or remove them before sending.`
      );
      return;
    }

    setPending(true);
    try {
      const res = await fetch(`/api/recruiting-leads/${encodeURIComponent(leadId)}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          subject,
          body,
          visit_rate: showPayFields ? visitRate : undefined,
          soc_rate: showPayFields && showSocRate ? socRate : undefined,
          pay_summary: showPayFields ? paySummary : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to send email.");
        return;
      }
      onSent();
      onClose();
    } catch {
      setError("Network error while sending email.");
    } finally {
      setPending(false);
    }
  }

  const previewSubject = renderRecruitingEmailTemplate(subject, previewVariables);
  const previewBody = renderRecruitingEmailTemplate(body, previewVariables);
  const previewHtml = useMemo(() => buildRecruitingEmailHtml(previewBody), [previewBody]);

  const previewLeadLabel = lead.full_name?.trim() || "this lead";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        role="dialog"
        aria-labelledby="recruiting-send-email-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="recruiting-send-email-title" className="text-lg font-semibold text-slate-900">
              Send template email
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              To: {recipientEmail?.trim() || "— (no email on file)"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
            Template
            <select
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value as RecruitingEmailTemplateId)}
              className={crmFilterInputCls}
            >
              {RECRUITING_EMAIL_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {showPayFields ? (
            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
                Visit rate
                <input
                  type="text"
                  value={visitRate}
                  onChange={(e) => updateVisitRate(e.target.value)}
                  placeholder="e.g. $60–$80"
                  className={crmFilterInputCls}
                />
              </label>
              {showSocRate ? (
                <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
                  SOC rate
                  <input
                    type="text"
                    value={socRate}
                    onChange={(e) => updateSocRate(e.target.value)}
                    placeholder="e.g. $110"
                    className={crmFilterInputCls}
                  />
                </label>
              ) : null}
              <label
                className={`flex flex-col gap-1 text-[11px] font-medium text-slate-600 ${showSocRate ? "sm:col-span-2" : ""}`}
              >
                Pay summary (shown in email)
                <input
                  type="text"
                  value={paySummary}
                  onChange={(e) => setPaySummary(e.target.value)}
                  placeholder="Pay wording inserted into the email body"
                  className={crmFilterInputCls}
                />
              </label>
            </div>
          ) : null}

          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
            Subject
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={crmFilterInputCls}
            />
          </label>

          <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
            Body
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className={`${crmFilterInputCls} min-h-[12rem] resize-y font-mono text-xs`}
            />
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Preview with {previewLeadLabel}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{previewSubject}</p>
            <div
              className="mt-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>

          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleSend} disabled={pending} className={crmPrimaryCtaCls}>
              {pending ? "Sending…" : "Send email"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
