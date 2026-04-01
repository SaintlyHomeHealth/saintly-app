"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";

import {
  suggestPhoneCallCrmClassification,
  type CrmAiAlternative,
  type CrmAiConfidence,
} from "../crm-ai-suggestion-actions";
import { updatePhoneCallCrmClassification } from "../actions";
import { formatCrmOutcomeLabel, formatCrmTypeLabel, readCrmMetadata } from "../_lib/crm-metadata";
import type { PhoneCallRow } from "../recent-calls-live";

type CrmTypeValue = "" | "patient" | "caregiver" | "referral" | "spam";

type OutcomeValue =
  | ""
  | "booked_assessment"
  | "needs_followup"
  | "not_qualified"
  | "wrong_number";

type PhoneCrmDrawerProps = {
  selectedRow: PhoneCallRow | null;
};

function displayName(row: PhoneCallRow | null): string {
  if (!row) return "—";
  const crm = row.crm_contact_display_name?.trim();
  if (crm) return crm;
  return row.from_e164?.trim() || row.to_e164?.trim() || "—";
}

function phoneLine(row: PhoneCallRow | null): string {
  if (!row) return "—";
  const dir = (row.direction ?? "").trim().toLowerCase();
  const e164 = dir === "inbound" ? row.from_e164 : row.to_e164;
  return e164?.trim() || row.from_e164?.trim() || row.to_e164?.trim() || "—";
}

function initialTypeFromTag(row: PhoneCallRow | null): CrmTypeValue {
  if (!row?.primary_tag?.trim()) return "";
  const t = row.primary_tag.trim().toLowerCase();
  if (t === "patient") return "patient";
  if (t === "caregiver") return "caregiver";
  if (t === "referral") return "referral";
  if (t === "spam") return "spam";
  return "";
}

function deriveType(row: PhoneCallRow | null): CrmTypeValue {
  const stored = readCrmMetadata(row).type.trim().toLowerCase();
  if (stored === "patient" || stored === "caregiver" || stored === "referral" || stored === "spam") {
    return stored;
  }
  return initialTypeFromTag(row);
}

function deriveOutcome(row: PhoneCallRow | null): OutcomeValue {
  const o = readCrmMetadata(row).outcome.trim();
  if (
    o === "booked_assessment" ||
    o === "needs_followup" ||
    o === "not_qualified" ||
    o === "wrong_number"
  ) {
    return o;
  }
  return "";
}

function coerceAiType(raw: string): CrmTypeValue {
  const t = raw.trim().toLowerCase();
  if (t === "patient" || t === "caregiver" || t === "referral" || t === "spam") return t;
  return "";
}

function coerceAiOutcome(raw: string): OutcomeValue {
  const o = raw.trim();
  if (
    o === "booked_assessment" ||
    o === "needs_followup" ||
    o === "not_qualified" ||
    o === "wrong_number"
  ) {
    return o;
  }
  return "";
}

function confidenceBadgeClass(c: CrmAiConfidence): string {
  switch (c) {
    case "high":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "medium":
      return "border-amber-200 bg-amber-50 text-amber-950";
    default:
      return "border-slate-300 bg-slate-100 text-slate-800";
  }
}

function formatAlternativeLine(alt: CrmAiAlternative): string {
  const parts: string[] = [];
  if (alt.type) {
    parts.push(formatCrmTypeLabel(alt.type) ?? alt.type);
  }
  if (alt.outcome) {
    parts.push(formatCrmOutcomeLabel(alt.outcome) ?? alt.outcome);
  }
  return parts.join(" · ");
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-2.5 space-y-2">{children}</div>
    </section>
  );
}

export function PhoneCrmDrawer({ selectedRow }: PhoneCrmDrawerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAiPending, setIsAiPending] = useState(false);
  const [aiInsight, setAiInsight] = useState<{
    confidence: CrmAiConfidence;
    reason: string;
    alternatives: CrmAiAlternative[];
  } | null>(null);

  const [type, setType] = useState<CrmTypeValue>("");
  const [outcome, setOutcome] = useState<OutcomeValue>("");
  const [tagsDraft, setTagsDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  const metadataSyncKey = useMemo(
    () => JSON.stringify(selectedRow?.metadata ?? null),
    [selectedRow?.metadata]
  );

  useEffect(() => {
    const s = readCrmMetadata(selectedRow);
    setType(deriveType(selectedRow));
    setOutcome(deriveOutcome(selectedRow));
    setTagsDraft(s.tags);
    setNoteDraft(s.note);
    setSaveError(null);
    setAiError(null);
    setAiInsight(null);
  }, [selectedRow?.id, metadataSyncKey]);

  async function suggestWithAi() {
    if (!selectedRow?.id) return;
    setAiError(null);
    setAiInsight(null);
    setIsAiPending(true);
    try {
      const res = await suggestPhoneCallCrmClassification(selectedRow.id);
      if (!res.ok) {
        const msg =
          res.error === "forbidden"
            ? "You cannot suggest for this call."
            : res.error === "ai_unconfigured"
              ? "AI is not configured (set OPENAI_API_KEY)."
              : res.error === "invalid_call"
                ? "Invalid call."
                : res.error === "load_failed"
                  ? "Could not load this call."
                  : "Could not get a suggestion. Try again.";
        setAiError(msg);
        return;
      }
      setType(coerceAiType(res.type));
      setOutcome(coerceAiOutcome(res.outcome));
      setTagsDraft(res.tags);
      setAiInsight({
        confidence: res.confidence,
        reason: res.reason,
        alternatives: res.alternatives,
      });
    } finally {
      setIsAiPending(false);
    }
  }

  function save() {
    if (!selectedRow?.id) return;
    setSaveError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("phoneCallId", selectedRow.id);
      fd.set("type", type);
      fd.set("outcome", outcome);
      fd.set("tags", tagsDraft);
      fd.set("note", noteDraft);
      const res = await updatePhoneCallCrmClassification(fd);
      if (res.ok) {
        router.refresh();
      } else {
        setSaveError(res.error === "forbidden" ? "You cannot update this call." : "Could not save.");
      }
    });
  }

  return (
    <div className="flex max-h-[min(70vh,720px)] flex-col gap-3 overflow-y-auto pr-0.5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Intake & classification</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">Saved on this call record (metadata)</p>
      </div>

      <Section title="Caller">
        <div className="grid gap-2 text-xs">
          <div>
            <p className="text-[11px] font-medium text-slate-500">Phone</p>
            <p className="mt-0.5 font-mono text-slate-900">{phoneLine(selectedRow)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-500">Name</p>
            <p className="mt-0.5 text-slate-900">{displayName(selectedRow)}</p>
          </div>
        </div>
      </Section>

      <Section title="Classification">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CrmTypeValue)}
            disabled={!selectedRow}
            className="rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 outline-none ring-slate-300/40 focus:ring-2 disabled:opacity-50"
          >
            <option value="">Select type…</option>
            <option value="patient">Patient</option>
            <option value="caregiver">Caregiver</option>
            <option value="referral">Referral</option>
            <option value="spam">Spam</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Outcome</span>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as OutcomeValue)}
            disabled={!selectedRow}
            className="rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 outline-none ring-slate-300/40 focus:ring-2 disabled:opacity-50"
          >
            <option value="">Select outcome…</option>
            <option value="booked_assessment">Booked assessment</option>
            <option value="needs_followup">Needs follow-up</option>
            <option value="not_qualified">Not qualified</option>
            <option value="wrong_number">Wrong number</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-slate-600">Tags</span>
          <input
            type="text"
            value={tagsDraft}
            onChange={(e) => setTagsDraft(e.target.value)}
            placeholder="Comma-separated or free text"
            disabled={!selectedRow}
            className="rounded-lg border border-dashed border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 disabled:opacity-50"
            autoComplete="off"
          />
        </label>
        <div className="flex flex-col gap-1.5 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void suggestWithAi()}
              disabled={!selectedRow || isAiPending}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-950 hover:bg-indigo-100 disabled:opacity-50"
            >
              {isAiPending ? "Suggesting…" : "Suggest with AI"}
            </button>
            {aiInsight ? (
              <span
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${confidenceBadgeClass(aiInsight.confidence)}`}
              >
                {aiInsight.confidence} confidence
              </span>
            ) : null}
            {aiError ? <span className="text-[11px] text-red-700">{aiError}</span> : null}
          </div>
          {aiInsight?.reason ? (
            <p className="text-[11px] leading-snug text-slate-700">{aiInsight.reason}</p>
          ) : null}
          {aiInsight && aiInsight.alternatives.length > 0 ? (
            <div className="space-y-0.5 rounded-md border border-slate-100 bg-slate-50/80 px-2 py-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Other possibilities
              </p>
              {aiInsight.alternatives.map((alt, i) => (
                <p key={i} className="text-[10px] leading-snug text-slate-500">
                  {formatAlternativeLine(alt)}
                </p>
              ))}
            </div>
          ) : null}
          <p className="text-[10px] text-slate-500">
            Prefills type, outcome, and tags from call context. Review and save — nothing is stored until you save.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => save()}
            disabled={!selectedRow || isPending}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save classification"}
          </button>
          {saveError ? <span className="text-[11px] text-red-700">{saveError}</span> : null}
        </div>
      </Section>

      <Section title="Actions">
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-left text-xs font-semibold text-sky-950 hover:bg-sky-100"
          >
            Create Contact
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Link Existing Contact
            <span className="mt-0.5 block text-[10px] font-normal text-slate-500">Placeholder</span>
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Convert to Patient
            <span className="mt-0.5 block text-[10px] font-normal text-slate-500">Placeholder</span>
          </button>
        </div>
      </Section>

      <Section title="Note">
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          rows={3}
          placeholder="CRM note for this call"
          disabled={!selectedRow}
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => save()}
          disabled={!selectedRow || isPending}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save note"}
        </button>
        <p className="text-[10px] text-slate-500">Same save as classification; also see thread notes for formal logs.</p>
      </Section>
    </div>
  );
}
