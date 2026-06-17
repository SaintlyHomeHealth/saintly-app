"use client";

import { useMemo, useState } from "react";

import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import {
  buildRecruitingPaySummary,
  getRecruitingEmailPayDefaultsForTemplate,
  recruitingEmailTemplateUsesPayFields,
} from "@/lib/recruiting/recruiting-email-pay";
import {
  RECRUITING_EMAIL_TEMPLATES,
  type RecruitingEmailTemplateId,
} from "@/lib/recruiting/recruiting-email-templates";
import { buildRecruitingEmailHtml } from "@/lib/recruiting/recruiting-email-signature";
import { renderRecruitingEmailTemplate } from "@/lib/recruiting/render-recruiting-email-template";

type Props = {
  leadId: string;
  recipientEmail: string | null;
  emailConfigured: boolean;
  onClose: () => void;
  onSent: () => void;
};

const DEFAULT_TEMPLATE_ID: RecruitingEmailTemplateId = "rn_follow_up";
const defaultPay = getRecruitingEmailPayDefaultsForTemplate(DEFAULT_TEMPLATE_ID)!;
const defaultTemplate = RECRUITING_EMAIL_TEMPLATES[0]!;

export function RecruitingLeadSendEmailModal({
  leadId,
  recipientEmail,
  emailConfigured,
  onClose,
  onSent,
}: Props) {
  const [templateId, setTemplateId] = useState<RecruitingEmailTemplateId>(DEFAULT_TEMPLATE_ID);
  const [subject, setSubject] = useState(defaultTemplate.subject);
  const [body, setBody] = useState(defaultTemplate.body);
  const [visitRate, setVisitRate] = useState(defaultPay.visitRate);
  const [socRate, setSocRate] = useState(defaultPay.socRate);
  const [paySummary, setPaySummary] = useState(defaultPay.paySummary);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showPayFields = recruitingEmailTemplateUsesPayFields(templateId);
  const showSocRate = showPayFields && getRecruitingEmailPayDefaultsForTemplate(templateId)?.includeSoc;

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
    const payDefaults = getRecruitingEmailPayDefaultsForTemplate(templateId);
    if (payDefaults?.includeSoc) {
      setPaySummary(buildRecruitingPaySummary(value, socRate, true));
    } else if (payDefaults) {
      setPaySummary(buildRecruitingPaySummary(value, "", false));
    }
  }

  function updateSocRate(value: string) {
    setSocRate(value);
    const payDefaults = getRecruitingEmailPayDefaultsForTemplate(templateId);
    if (payDefaults?.includeSoc) {
      setPaySummary(buildRecruitingPaySummary(visitRate, value, true));
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

  const previewVars: Record<string, string> = useMemo(() => {
    const role =
      templateId === "rn_follow_up"
        ? "RN"
        : templateId === "pt_follow_up"
          ? "PT"
          : templateId === "pta_follow_up"
            ? "PTA"
            : templateId === "lpn_follow_up"
              ? "LPN"
              : "caregiver";
    return {
      first_name: "Alex",
      full_name: "Alex Example",
      role,
      phone: "(480) 555-0100",
      email: recipientEmail ?? "candidate@example.com",
      visit_rate: visitRate,
      soc_rate: socRate,
      pay_summary: paySummary,
      pay_rate: visitRate,
    };
  }, [templateId, recipientEmail, visitRate, socRate, paySummary]);

  const previewSubject = renderRecruitingEmailTemplate(subject, previewVars);
  const previewBody = renderRecruitingEmailTemplate(body, previewVars);
  const previewHtml = useMemo(() => buildRecruitingEmailHtml(previewBody), [previewBody]);

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
                  placeholder="e.g. $60 per visit and $110 for SOC"
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
              Preview (sample data + signature)
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
