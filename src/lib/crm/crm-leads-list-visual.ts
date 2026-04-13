import { formatLeadContactOutcomeLabel, formatLeadLastContactSummary } from "@/lib/crm/lead-contact-outcome";
import { formatLeadPipelineStatusLabel } from "@/lib/crm/lead-pipeline-status";

import type { CrmLeadRow } from "./crm-leads-table-helpers";

/**
 * Contact stage (glance badge) — driven by `last_contact_at` + `last_outcome`, not `leads.status` pipeline.
 * "New" only when we have never logged a contact time.
 */
export function contactStageBadgeLabel(row: CrmLeadRow): { label: string; badgeClass: string } {
  const lastAt = (row.last_contact_at ?? "").trim();
  if (!lastAt) {
    return { label: "New", badgeClass: "bg-sky-50 text-sky-950 ring-sky-200/70" };
  }

  const raw = (row.last_outcome ?? "").trim();
  if (!raw) {
    return { label: "Contacted", badgeClass: "bg-slate-100 text-slate-700 ring-slate-200/80" };
  }

  const lo = raw.toLowerCase();
  return {
    label: contactStageShortLabel(lo, raw),
    badgeClass: contactStageBadgeClassForOutcome(lo),
  };
}

function contactStageShortLabel(outcomeLower: string, outcomeRaw: string): string {
  switch (outcomeLower) {
    case "spoke":
    case "spoke_scheduled":
      return "Spoke";
    case "left_voicemail":
      return "Left VM";
    case "text_sent":
      return "Texted";
    case "no_answer":
      return "No answer";
    case "not_interested":
      return "Not interested";
    case "wrong_number":
      return "Wrong number";
    default:
      return formatLeadContactOutcomeLabel(outcomeRaw);
  }
}

function contactStageBadgeClassForOutcome(outcomeLower: string): string {
  switch (outcomeLower) {
    case "spoke":
    case "spoke_scheduled":
      return "bg-purple-50 text-purple-950 ring-purple-200/70";
    case "left_voicemail":
      return "bg-amber-50 text-amber-950 ring-amber-200/70";
    case "text_sent":
      return "bg-sky-50 text-sky-950 ring-sky-200/70";
    case "no_answer":
      return "bg-amber-50 text-amber-950 ring-amber-200/70";
    case "not_interested":
      return "bg-rose-50 text-rose-900 ring-rose-200/70";
    case "wrong_number":
      return "bg-slate-100 text-slate-700 ring-slate-200/80";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200/80";
  }
}

/** Show pipeline label next to source when it adds info beyond default "new". */
export function shouldShowPipelineStatusOnLeadRow(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s !== "" && s !== "new" && s !== "new_applicant";
}

export type PipelineHeat = "HOT" | "WARM" | "NEW" | "COLD" | "DEAD";

export function derivePipelineHeat(row: CrmLeadRow, todayIso: string): PipelineHeat {
  const s = (row.status ?? "").trim().toLowerCase();
  if (s === "dead_lead") return "DEAD";
  if (s === "converted") return "COLD";
  const fu = row.follow_up_date?.slice(0, 10) ?? "";
  if (fu && fu <= todayIso) return "HOT";
  if (s === "ready_to_convert" || s === "intake_in_progress") return "HOT";
  if (
    s === "attempted_contact" ||
    s === "spoke" ||
    s === "waiting_on_referral" ||
    s === "waiting_on_documents" ||
    s === "verify_insurance"
  ) {
    return "WARM";
  }
  if (s === "new" || s === "new_applicant") return "NEW";
  return "COLD";
}

export function pipelineHeatBadgeClass(h: PipelineHeat): string {
  switch (h) {
    case "HOT":
      return "bg-orange-50 text-orange-950 ring-orange-200/80";
    case "WARM":
      return "bg-amber-50 text-amber-950 ring-amber-200/80";
    case "NEW":
      return "bg-sky-50 text-sky-950 ring-sky-200/80";
    case "COLD":
      return "bg-slate-100 text-slate-700 ring-slate-200/80";
    case "DEAD":
      return "bg-rose-50 text-rose-900 ring-rose-200/80";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200/80";
  }
}

/** Soft status pill colors — consistent CRM palette (scan-friendly, not neon). */
export function pipelineStatusBadgeClass(status: string | null | undefined): string {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "new" || s === "new_applicant") return "bg-sky-50 text-sky-950 ring-sky-200/70";
  if (s === "attempted_contact") return "bg-amber-50 text-amber-950 ring-amber-200/70";
  if (s === "spoke") return "bg-purple-50 text-purple-950 ring-purple-200/70";
  if (s === "intake_in_progress") return "bg-orange-50 text-orange-950 ring-orange-200/70";
  if (s === "waiting_on_documents") return "bg-indigo-50 text-indigo-950 ring-indigo-200/70";
  if (s === "verify_insurance") return "bg-teal-50 text-teal-950 ring-teal-200/70";
  if (s === "waiting_on_referral") return "bg-yellow-50 text-yellow-950 ring-yellow-200/70";
  if (s === "ready_to_convert") return "bg-emerald-50 text-emerald-950 ring-emerald-200/70";
  if (s === "converted") return "bg-emerald-50 text-emerald-900 ring-emerald-200/70";
  if (s === "dead_lead") return "bg-rose-50 text-rose-900 ring-rose-200/70";
  return "bg-slate-100 text-slate-700 ring-slate-200/70";
}

export type FollowUpUrgency = "overdue" | "today" | "future" | "none";

export function followUpUrgency(followUpIso: string | null | undefined, todayIso: string): FollowUpUrgency {
  const d = typeof followUpIso === "string" ? followUpIso.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "none";
  if (d < todayIso) return "overdue";
  if (d === todayIso) return "today";
  return "future";
}

/**
 * Subtle left-edge accent for pipeline scanning (premium, not loud).
 * Priority: dead → overdue FU → today FU → qualified/ready → new → default.
 */
export function leadRowCardClass(row: CrmLeadRow, fu: FollowUpUrgency): string {
  const st = (row.status ?? "").trim().toLowerCase();
  const lo = (row.last_outcome ?? "").trim().toLowerCase();
  if (st === "dead_lead") {
    return "border-l-[3px] border-l-slate-400/70 bg-slate-50/35";
  }
  if (fu === "overdue") {
    return "border-l-[3px] border-l-rose-500 bg-rose-50/20";
  }
  if (fu === "today") {
    return "border-l-[3px] border-l-amber-400 bg-amber-50/15";
  }
  if (st === "ready_to_convert" || st === "converted") {
    return "border-l-[3px] border-l-emerald-400/80 bg-emerald-50/12";
  }
  // Real contact outcome (saved on attempt) — can be ahead of pipeline `status` still "new"
  if (lo === "spoke" || lo === "spoke_scheduled") {
    return "border-l-[3px] border-l-purple-400/80 bg-purple-50/12";
  }
  if (st === "new" || st === "new_applicant") {
    return "border-l-[3px] border-l-sky-400/90 bg-sky-50/15";
  }
  if (st === "verify_insurance") {
    return "border-l-[3px] border-l-teal-400/80 bg-teal-50/12";
  }
  if (st === "spoke") {
    return "border-l-[3px] border-l-purple-400/80 bg-purple-50/12";
  }
  if (fu === "future") {
    return "border-l-[3px] border-l-slate-200 bg-white";
  }
  return "border-l-[3px] border-l-slate-200 bg-white";
}

/** @deprecated Prefer leadRowCardClass — kept for any external imports */
export function followUpUrgencyRowClass(u: FollowUpUrgency): string {
  switch (u) {
    case "overdue":
      return "border-l-[3px] border-l-rose-500 bg-rose-50/20";
    case "today":
      return "border-l-[3px] border-l-amber-400 bg-amber-50/15";
    case "future":
      return "border-l-[3px] border-l-slate-200 bg-white";
    default:
      return "border-l-[3px] border-l-slate-200 bg-white";
  }
}

export function lastContactHumanLine(
  lastContactAt: string | null | undefined,
  lastOutcome: string | null | undefined,
  todayIso: string
): { line: string; tone: "good" | "warn" | "bad" | "muted" } {
  if (!lastContactAt || typeof lastContactAt !== "string" || !lastContactAt.trim()) {
    return { line: "Never contacted", tone: "muted" };
  }
  const lastDay = lastContactAt.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) {
    return { line: formatLeadLastContactSummary(lastContactAt, lastOutcome), tone: "muted" };
  }
  const outcomeLbl = formatLeadContactOutcomeLabel(lastOutcome);
  const tLast = new Date(`${lastDay}T12:00:00Z`).getTime();
  const tToday = new Date(`${todayIso}T12:00:00Z`).getTime();
  const diffDays = Math.round((tToday - tLast) / 86400000);

  if (diffDays === 0) {
    const short = outcomeLbl && outcomeLbl !== "—" ? outcomeLbl : "Contact";
    return { line: `${short} today`, tone: "good" };
  }
  if (diffDays === 1) {
    return { line: `Yesterday · ${outcomeLbl}`, tone: "warn" };
  }
  if (diffDays >= 2 && diffDays <= 7) {
    return { line: `${diffDays} days ago · ${outcomeLbl}`, tone: "warn" };
  }
  if (diffDays > 7) {
    return { line: `${diffDays} days ago · ${outcomeLbl}`, tone: "bad" };
  }
  return { line: formatLeadLastContactSummary(lastContactAt, lastOutcome), tone: "muted" };
}

export function lastContactToneClass(tone: "good" | "warn" | "bad" | "muted"): string {
  switch (tone) {
    case "good":
      return "text-emerald-800";
    case "warn":
      return "text-amber-800";
    case "bad":
      return "text-rose-800";
    default:
      return "text-slate-500";
  }
}

export function formatStatusPillLabel(status: string | null | undefined): string {
  return formatLeadPipelineStatusLabel(status);
}
