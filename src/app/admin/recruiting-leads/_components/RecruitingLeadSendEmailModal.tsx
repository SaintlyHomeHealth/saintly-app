"use client";

import { useMemo, useState } from "react";

import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import {
  RECRUITING_EMAIL_TEMPLATES,
  type RecruitingEmailTemplateId,
} from "@/lib/recruiting/recruiting-email-templates";

type Props = {
  leadId: string;
  recipientEmail: string | null;
  emailConfigured: boolean;
  onClose: () => void;
  onSent: () => void;
};

function renderPreview(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) => variables[key.trim().toLowerCase()] ?? "");
}

export function RecruitingLeadSendEmailModal({
  leadId,
  recipientEmail,
  emailConfigured,
  onClose,
  onSent,
}: Props) {
  const [templateId, setTemplateId] = useState<RecruitingEmailTemplateId>("lpn_follow_up");
  const [subject, setSubject] = useState(RECRUITING_EMAIL_TEMPLATES[0]!.subject);
  const [body, setBody] = useState(RECRUITING_EMAIL_TEMPLATES[0]!.body);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templateOptions = useMemo(() => RECRUITING_EMAIL_TEMPLATES, []);

  function applyTemplate(id: RecruitingEmailTemplateId) {
    const tpl = RECRUITING_EMAIL_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setTemplateId(id);
    setSubject(tpl.subject);
    setBody(tpl.body);
    setError(null);
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

  const previewVars: Record<string, string> = {
    first_name: "Alex",
    full_name: "Alex Example",
    role: "LPN",
    phone: "(480) 555-0100",
    email: recipientEmail ?? "candidate@example.com",
    city: "Phoenix",
    pay_rate: "$60",
    soc_rate: "$110",
  };

  const previewSubject = renderPreview(subject, previewVars);
  const previewBody = renderPreview(body, previewVars);

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
              {templateOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

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
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Preview (sample data)</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{previewSubject}</p>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{previewBody}</pre>
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
