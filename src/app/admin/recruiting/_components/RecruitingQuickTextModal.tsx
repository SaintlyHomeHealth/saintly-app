"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  RECRUITING_GENERAL_DISCIPLINE_OUTREACH_TEMPLATE_ID,
  RECRUITING_TEXT_TEMPLATES,
  resolveRecruitingTextTemplateBody,
} from "@/lib/recruiting/recruiting-options";
import {
  buildRecruitingTextVariables,
  renderRecruitingTextTemplate,
  type RecruitingTextContext,
} from "@/lib/recruiting/render-recruiting-text-template";

import { sendRecruitingCandidateText } from "@/app/admin/recruiting/actions";

export type RecruitingQuickTextTarget = RecruitingTextContext & {
  candidateId: string;
  leadId?: string | null;
  smsOptOut?: boolean | null;
};

type Props = {
  open: boolean;
  target: RecruitingQuickTextTarget | null;
  onClose: () => void;
  onSent?: () => void;
};

export function RecruitingQuickTextModal({ open, target, onClose, onSent }: Props) {
  const [pending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState(RECRUITING_GENERAL_DISCIPLINE_OUTREACH_TEMPLATE_ID);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const variables = useMemo(() => {
    if (!target) return {};
    return buildRecruitingTextVariables(target);
  }, [target]);

  const firstName = variables.first_name || "candidate";

  useEffect(() => {
    if (!open || !target) return;
    setError(null);
    setTemplateId(RECRUITING_GENERAL_DISCIPLINE_OUTREACH_TEMPLATE_ID);
    const body = resolveRecruitingTextTemplateBody(
      RECRUITING_GENERAL_DISCIPLINE_OUTREACH_TEMPLATE_ID,
      target.discipline
    );
    setMessage(renderRecruitingTextTemplate(body, buildRecruitingTextVariables(target)));
  }, [open, target]);

  if (!open || !target) return null;

  function applyTemplate(nextId: string) {
    if (!target) return;
    setTemplateId(nextId);
    const body = resolveRecruitingTextTemplateBody(nextId, target.discipline);
    setMessage(renderRecruitingTextTemplate(body, buildRecruitingTextVariables(target)));
  }

  function handleSend() {
    const body = message.trim();
    if (!body) {
      setError("Message cannot be empty.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await sendRecruitingCandidateText({
        candidateId: target.candidateId,
        leadId: target.leadId ?? null,
        body,
        templateId,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      onSent?.();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-[20px] border border-slate-200 bg-white p-4 shadow-2xl"
        role="dialog"
        aria-labelledby="recruiting-quick-text-title"
      >
        <h4 id="recruiting-quick-text-title" className="text-sm font-semibold text-slate-900">
          Text {firstName}
        </h4>
        <p className="mt-1 text-xs text-slate-600">
          To{" "}
          <span className="font-semibold text-slate-800">
            {target.phone?.trim() ? formatPhoneForDisplay(target.phone) : "—"}
          </span>
        </p>

        {RECRUITING_TEXT_TEMPLATES.length > 1 ? (
          <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Template
            <select
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className={`${crmFilterInputCls} mt-1 w-full text-sm`}
              disabled={pending}
            >
              {RECRUITING_TEXT_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Message
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className={`${crmFilterInputCls} mt-1 w-full text-sm`}
            disabled={pending}
          />
        </label>

        {error ? (
          <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-900">
            {error}
          </p>
        ) : null}

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${crmPrimaryCtaCls} !px-3 !py-1.5 !text-xs`}
            disabled={pending || !message.trim()}
            onClick={handleSend}
          >
            {pending ? "Sending…" : "Send text"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function recruitingQuickTextDisabledReason(input: {
  phone?: string | null;
  smsOptOut?: boolean | null;
}): string | null {
  if (!input.phone?.trim()) return "No phone on file";
  if (input.smsOptOut) return "SMS opt-out";
  return null;
}
