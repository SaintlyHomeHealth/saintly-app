"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import AddEmployeeInviteButton from "@/app/admin/employees/add-employee-invite-button";
import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import {
  RECRUITING_DISCIPLINE_OPTIONS,
  RECRUITING_INTEREST_LEVEL_OPTIONS,
  RECRUITING_PREFERRED_CONTACT_OPTIONS,
  RECRUITING_SOURCE_OPTIONS,
  RECRUITING_STATUS_LEGACY_OPTIONS,
  RECRUITING_STATUS_OPTIONS,
  RECRUITING_TEXT_TEMPLATES,
  resolveRecruitingTextTemplateBody,
} from "@/lib/recruiting/recruiting-options";
import {
  buildRecruitingTextVariables,
  renderRecruitingTextTemplate,
} from "@/lib/recruiting/render-recruiting-text-template";
import { isPhoenixSameCalendarDay, phoenixEndOfTodayIso } from "@/lib/recruiting/phoenix-time";
import {
  formatAppDateTime,
  isoInstantToDatetimeLocalInput,
  parseAppDateTimeInputToUtcIso,
} from "@/lib/datetime/app-timezone";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { buildRecruitingTimelineEntries } from "@/lib/recruiting/recruiting-timeline";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";

import { RecruitingLeadSendEmailModal } from "@/app/admin/recruiting/_components/RecruitingLeadSendEmailModal";
import {
  RecruitingQuickTextModal,
  recruitingQuickTextDisabledReason,
} from "@/app/admin/recruiting/_components/RecruitingQuickTextModal";
import type { RecruitingLeadActivityRow } from "@/app/admin/recruiting/_components/RecruitingLeadActivityTimeline";
import { RecruitingTimelinePanel } from "@/components/recruiting/RecruitingTimelinePanel";
import { recruitingQuickAction, type RecruitingQuickActionKind, updateRecruitingCandidate } from "../actions";
import { recruitingInterestPillClass, recruitingStatusPillClass } from "../recruiting-status-styles";
import { RecruitingResumeCard } from "./RecruitingResumeCard";

type CandidateRow = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  coverage_area: string | null;
  discipline: string | null;
  source: string | null;
  status: string | null;
  assigned_to: string | null;
  indeed_url: string | null;
  resume_url: string | null;
  resume_file_name: string | null;
  resume_storage_path: string | null;
  resume_uploaded_at: string | null;
  resume_extraction_method?: string | null;
  resume_parse_warnings?: string | null;
  resume_parse_notes?: string | null;
  resume_extracted_clean_text?: string | null;
  notes: string | null;
  last_call_at: string | null;
  last_text_at: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  interest_level: string | null;
  last_response_at: string | null;
  sms_opt_out: boolean | null;
  sms_opt_out_at: string | null;
  preferred_contact_method: string | null;
  follow_up_bucket: string | null;
  specialties: string | null;
  recruiting_tags: string | null;
  recruiting_lead_id: string | null;
};

type ActivityRow = {
  id: string;
  activity_type: string;
  outcome: string | null;
  body: string | null;
  created_at: string;
  created_by: string | null;
};

type StaffOpt = {
  user_id: string;
  email: string | null;
  role: string;
  full_name: string | null;
};

const btnPrimary =
  "inline-flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-3.5 py-2 text-center text-xs font-semibold text-white shadow-sm shadow-sky-200/60 transition hover:-translate-y-px hover:shadow-md sm:text-sm";
const btnGhost =
  "inline-flex min-h-[2.5rem] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white/90 px-3.5 py-2 text-center text-xs font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/60 sm:text-sm";
const btnDisabled =
  "inline-flex min-h-[2.5rem] cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-center text-xs font-semibold text-slate-400 sm:text-sm";

const quickPrimary =
  "inline-flex min-h-[2.35rem] flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-2.5 py-2 text-center text-[11px] font-semibold text-white shadow-sm shadow-sky-200/50 transition hover:-translate-y-px hover:shadow-md sm:text-xs";
const quickGhost =
  "inline-flex min-h-[2.35rem] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-center text-[11px] font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50 sm:text-xs";
const quickRose =
  "inline-flex min-h-[2.35rem] flex-1 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-center text-[11px] font-semibold text-rose-900 shadow-sm transition hover:bg-rose-100 sm:text-xs";

const sectionCardCls =
  "overflow-hidden rounded-[24px] border border-slate-200/90 bg-white shadow-sm shadow-slate-200/40";
const sectionHeaderCls =
  "border-b border-slate-100 bg-gradient-to-r from-sky-50/70 to-cyan-50/40 px-5 py-3.5 sm:px-6";
const fieldLabelCls =
  "flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600";

function disciplineBadgeClass(discipline: string): string {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide";
  const d = discipline.trim().toUpperCase();
  if (d === "RN") return `${base} border-sky-200 bg-sky-50 text-sky-900`;
  if (d === "LPN" || d === "LVN") return `${base} border-indigo-200 bg-indigo-50 text-indigo-900`;
  if (d === "PT") return `${base} border-cyan-200 bg-cyan-50 text-cyan-900`;
  if (d === "PTA") return `${base} border-teal-200 bg-teal-50 text-teal-900`;
  if (d === "OT" || d === "COTA") return `${base} border-violet-200 bg-violet-50 text-violet-900`;
  if (d === "ST" || d === "SLP") return `${base} border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900`;
  if (d === "HHA" || d === "CNA") return `${base} border-emerald-200 bg-emerald-50 text-emerald-900`;
  return `${base} border-slate-200 bg-slate-100 text-slate-700`;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function splitRecruitingName(
  fullName: string,
  firstName: string | null,
  lastName: string | null
): { firstName: string; lastName: string } {
  const first = firstName?.trim() ?? "";
  const last = lastName?.trim() ?? "";
  if (first || last) {
    return { firstName: first, lastName: last };
  }
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] ?? "", lastName: "" };
  }
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  return isoInstantToDatetimeLocalInput(iso ?? undefined);
}

function fromDatetimeLocalValue(raw: string): string | null {
  return parseAppDateTimeInputToUtcIso(raw.trim());
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatAppDateTime(iso, "—", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function candidateTextContext(candidate: CandidateRow) {
  return {
    full_name: candidate.full_name,
    first_name: candidate.first_name,
    phone: candidate.phone,
    city: candidate.city,
    coverage_area: candidate.coverage_area,
    discipline: candidate.discipline,
    smsOptOut: candidate.sms_opt_out,
  };
}

type RecruitingCandidateDetailClientProps = {
  candidate: CandidateRow;
  activities: ActivityRow[];
  staffOptions: StaffOpt[];
  noAnswerCount: number;
  listBackHref: string;
  viewerUserId: string;
  actorLabels: Record<string, string>;
  /** Opens workspace keypad in a new tab; null when the recruit has no dialable phone. */
  keypadCallHref: string | null;
  recruitingLeadActivities: RecruitingLeadActivityRow[];
  emailConfigured: boolean;
};

export function RecruitingCandidateDetailClient({
  candidate: initial,
  activities,
  staffOptions,
  noAnswerCount,
  listBackHref,
  viewerUserId,
  actorLabels,
  keypadCallHref,
  recruitingLeadActivities,
  emailConfigured,
}: RecruitingCandidateDetailClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<string | null>(null);

  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [followUpWhen, setFollowUpWhen] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [freeNote, setFreeNote] = useState("");

  const dueToday = Boolean(initial.next_follow_up_at && isPhoenixSameCalendarDay(initial.next_follow_up_at));
  const dueBucket = Boolean(initial.next_follow_up_at && initial.next_follow_up_at <= phoenixEndOfTodayIso());
  const inviteName = splitRecruitingName(initial.full_name, initial.first_name, initial.last_name);
  const returnTo = searchParams?.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  const timelineEntries = useMemo(() => buildRecruitingTimelineEntries(activities), [activities]);

  const hasEmail = Boolean(initial.email?.trim());
  const hasLeadLink = Boolean(initial.recruiting_lead_id);
  const canSendEmail = hasEmail && hasLeadLink && emailConfigured;
  const textDisabledReason = recruitingQuickTextDisabledReason({
    phone: initial.phone,
    smsOptOut: initial.sms_opt_out,
  });
  const emailDisabledReason = !hasLeadLink
    ? "Not yet linked to a recruiting lead — save the profile or upload a resume to enable email."
    : !hasEmail
      ? "Add an email address on this candidate to send a template email."
      : !emailConfigured
        ? "Email is not configured on the server."
        : "";

  const locationLine = [initial.city, initial.state].filter((v) => v?.trim()).join(", ");
  const heroSubline = [initial.discipline?.trim(), locationLine, initial.coverage_area?.trim()]
    .filter(Boolean)
    .join("  ·  ");

  const disciplineExtra =
    initial.discipline &&
    !(RECRUITING_DISCIPLINE_OPTIONS as readonly string[]).includes(initial.discipline as (typeof RECRUITING_DISCIPLINE_OPTIONS)[number])
      ? initial.discipline
      : null;
  const statusExtra =
    initial.status &&
    !(RECRUITING_STATUS_OPTIONS as readonly string[]).includes(initial.status as (typeof RECRUITING_STATUS_OPTIONS)[number]) &&
    !(RECRUITING_STATUS_LEGACY_OPTIONS as readonly string[]).includes(
      initial.status as (typeof RECRUITING_STATUS_LEGACY_OPTIONS)[number]
    )
      ? initial.status
      : null;
  const sourceExtra =
    initial.source &&
    !(RECRUITING_SOURCE_OPTIONS as readonly string[]).includes(initial.source as (typeof RECRUITING_SOURCE_OPTIONS)[number])
      ? initial.source
      : null;

  const interestExtra =
    initial.interest_level &&
    !(RECRUITING_INTEREST_LEVEL_OPTIONS as readonly string[]).includes(
      initial.interest_level as (typeof RECRUITING_INTEREST_LEVEL_OPTIONS)[number]
    )
      ? initial.interest_level
      : null;

  const preferredExtra =
    initial.preferred_contact_method &&
    !(RECRUITING_PREFERRED_CONTACT_OPTIONS as readonly string[]).includes(
      initial.preferred_contact_method as (typeof RECRUITING_PREFERRED_CONTACT_OPTIONS)[number]
    )
      ? initial.preferred_contact_method
      : null;

  function runQuick(kind: RecruitingQuickActionKind, extra?: { body?: string | null; nextFollowUpAt?: string | null }) {
    setBanner(null);
    startTransition(async () => {
      const res = await recruitingQuickAction({
        candidateId: initial.id,
        kind,
        body: extra?.body ?? null,
        nextFollowUpAt: extra?.nextFollowUpAt ?? null,
      });
      if (!res.ok) {
        setBanner(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {banner ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          {banner}
        </div>
      ) : null}

      {/* Premium hero */}
      <section className="overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-md shadow-slate-200/30 ring-1 ring-sky-100/50">
        <div className="bg-gradient-to-br from-sky-50/95 via-white to-cyan-50/50 px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-600 to-cyan-500 text-xl font-bold text-white shadow-sm shadow-sky-200/60 sm:flex">
                {initialsFromName(initial.full_name)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.7rem]">
                    {initial.full_name}
                  </h1>
                  {initial.discipline?.trim() ? (
                    <span className={disciplineBadgeClass(initial.discipline)}>{initial.discipline}</span>
                  ) : null}
                  <span className={recruitingStatusPillClass(initial.status ?? "")}>{initial.status ?? "—"}</span>
                  {initial.interest_level?.trim() ? (
                    <span className={recruitingInterestPillClass(initial.interest_level)}>
                      {initial.interest_level.replace(/_/g, " ")}
                    </span>
                  ) : null}
                  {dueBucket ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
                      {dueToday ? "Follow-up due today" : "Follow-up due"}
                    </span>
                  ) : null}
                  {noAnswerCount >= 2 ? (
                    <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-900 ring-1 ring-rose-200">
                      No response ({noAnswerCount})
                    </span>
                  ) : null}
                </div>
                {heroSubline ? (
                  <p className="mt-1.5 text-sm font-medium text-slate-600">{heroSubline}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  {initial.phone?.trim() ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-semibold text-slate-500">Phone</span>
                      <span className="font-semibold text-slate-800">{formatPhoneForDisplay(initial.phone)}</span>
                    </span>
                  ) : null}
                  {initial.email?.trim() ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span className="font-semibold text-slate-500">Email</span>
                      <span className="truncate font-semibold text-slate-800">{initial.email}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              {canSendEmail ? (
                <button type="button" className={btnPrimary} onClick={() => setEmailOpen(true)}>
                  Send Email
                </button>
              ) : (
                <span className={btnDisabled} title={emailDisabledReason}>
                  Send Email
                </span>
              )}
              {keypadCallHref ? (
                <a href={keypadCallHref} target="_blank" rel="noopener noreferrer" className={btnGhost}>
                  Call
                </a>
              ) : (
                <span className={btnDisabled} title="Add a phone number to call from the workspace keypad.">
                  Call
                </span>
              )}
              {textDisabledReason ? (
                <span className={btnDisabled} title={textDisabledReason}>
                  {textDisabledReason === "No phone on file" ? "Send text" : textDisabledReason}
                </span>
              ) : (
                <button type="button" className={btnPrimary} onClick={() => setTextOpen(true)}>
                  Send text
                </button>
              )}
              <AddEmployeeInviteButton
                triggerLabel="Onboard as employee"
                triggerClassName={btnGhost}
                initialValues={{
                  firstName: inviteName.firstName,
                  lastName: inviteName.lastName,
                  email: initial.email,
                  phone: initial.phone,
                  role: initial.discipline,
                }}
                recruitingCandidateId={initial.id}
                returnTo={returnTo}
                title="Invite new hire"
                description="Review the recruit details, fill any missing required contact fields, and send the onboarding invite."
              />
              <Link href={listBackHref} className={btnGhost}>
                Back to recruiting
              </Link>
            </div>
          </div>
        </div>

        {/* At-a-glance strip */}
        <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 border-t border-slate-100 sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          <GlanceCell label="Last call" value={formatWhen(initial.last_call_at)} />
          <GlanceCell label="Last text" value={formatWhen(initial.last_text_at)} />
          <GlanceCell label="Last contact" value={formatWhen(initial.last_contact_at)} />
          <GlanceCell
            label="Next follow-up"
            value={formatWhen(initial.next_follow_up_at)}
            accent={dueBucket}
          />
          <GlanceCell label="Source" value={initial.source?.trim() || "—"} />
          <GlanceCell
            label="Resume"
            value={
              initial.resume_storage_path?.trim() ? (
                <a
                  href={`/api/recruiting/resume/${encodeURIComponent(initial.id)}?mode=view`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-sky-800 hover:underline"
                >
                  View file
                </a>
              ) : (
                "—"
              )
            }
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-6">
          <RecruitingTimelinePanel
            candidateId={initial.id}
            entries={timelineEntries}
            actorLabels={actorLabels}
            viewerUserId={viewerUserId}
          />

          {/* Quick actions */}
          <div className={sectionCardCls}>
            <div className={sectionHeaderCls}>
              <h3 className="text-sm font-semibold text-slate-900">Quick actions</h3>
              <p className="mt-0.5 text-xs text-slate-500">Log outcomes in one tap — the timeline stays permanent.</p>
            </div>
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button type="button" className={quickGhost} disabled={pending} onClick={() => runQuick("call")}>
                  Log call
                </button>
                {textDisabledReason ? (
                  <span className={`${quickGhost} cursor-not-allowed opacity-50`} title={textDisabledReason}>
                    {textDisabledReason}
                  </span>
                ) : (
                  <button type="button" className={quickPrimary} disabled={pending} onClick={() => setTextOpen(true)}>
                    Send text
                  </button>
                )}
                <button type="button" className={quickGhost} disabled={pending} onClick={() => runQuick("text")}>
                  Text sent
                </button>
                <button type="button" className={quickGhost} disabled={pending} onClick={() => runQuick("no_answer")}>
                  No answer
                </button>
                <button type="button" className={quickGhost} disabled={pending} onClick={() => runQuick("voicemail")}>
                  Left voicemail
                </button>
                <button type="button" className={quickGhost} disabled={pending} onClick={() => runQuick("spoke")}>
                  Spoke
                </button>
                <button type="button" className={quickGhost} disabled={pending} onClick={() => runQuick("no_response")}>
                  No response
                </button>
                <button type="button" className={quickPrimary} disabled={pending} onClick={() => runQuick("interested")}>
                  Interested
                </button>
                <button type="button" className={quickGhost} disabled={pending} onClick={() => runQuick("maybe_later")}>
                  Maybe later
                </button>
                <button
                  type="button"
                  className={quickGhost}
                  disabled={pending}
                  onClick={() => runQuick("follow_up_later")}
                >
                  Follow up later
                </button>
                <button type="button" className={quickRose} disabled={pending} onClick={() => runQuick("not_interested")}>
                  Not interested
                </button>
                <button
                  type="button"
                  className={quickGhost}
                  disabled={pending}
                  onClick={() => {
                    setFollowUpWhen(toDatetimeLocalValue(initial.next_follow_up_at));
                    setFollowUpNote("");
                    setFollowUpOpen(true);
                  }}
                >
                  Set follow-up
                </button>
                <button
                  type="button"
                  className={quickGhost}
                  disabled={pending}
                  onClick={() => {
                    setFreeNote("");
                    setNoteOpen(true);
                  }}
                >
                  Add note
                </button>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Text templates</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {RECRUITING_TEXT_TEMPLATES.map((tpl) => {
                    const previewBody = renderRecruitingTextTemplate(
                      resolveRecruitingTextTemplateBody(tpl.id, initial.discipline),
                      buildRecruitingTextVariables(candidateTextContext(initial))
                    );
                    if (textDisabledReason) {
                      return (
                        <span
                          key={tpl.id}
                          title={textDisabledReason}
                          className="inline-flex cursor-not-allowed items-center rounded-full border border-dashed border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-400"
                        >
                          {tpl.label}
                        </span>
                      );
                    }
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setTextOpen(true)}
                        className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
                        title={previewBody.slice(0, 120)}
                      >
                        {tpl.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Email & lead activity */}
          <div className={sectionCardCls}>
            <div className={`${sectionHeaderCls} flex flex-wrap items-center justify-between gap-2`}>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Email &amp; lead activity</h3>
                <p className="mt-0.5 text-xs text-slate-500">Sent template emails and lead events appear here.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canSendEmail ? (
                  <button
                    type="button"
                    onClick={() => setEmailOpen(true)}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-sky-200 bg-white px-3 text-xs font-semibold text-sky-900 shadow-sm transition hover:bg-sky-50"
                  >
                    Send template email
                  </button>
                ) : null}
                {hasLeadLink ? (
                  <Link
                    href={`/admin/recruiting/leads/${initial.recruiting_lead_id}`}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Open recruiting lead
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="p-4 sm:p-5">
              {!hasLeadLink ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-600">
                  Not linked to a unified recruiting lead yet. Save the profile or upload a resume to connect this
                  applicant to the recruiting pipeline.
                </p>
              ) : recruitingLeadActivities.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-600">
                  No email activity yet. Use Send Email above to start the conversation.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recruitingLeadActivities.map((row) => (
                    <LeadActivityItem key={row.id} row={row} />
                  ))}
                </ul>
              )}
            </div>
          </div>

          <RecruitingResumeCard
            candidateId={initial.id}
            resumeFileName={initial.resume_file_name ?? null}
            resumeStoragePath={initial.resume_storage_path ?? null}
            resumeUploadedAt={initial.resume_uploaded_at ?? null}
            resumeExtractionMethod={initial.resume_extraction_method ?? null}
            resumeParseWarnings={initial.resume_parse_warnings ?? null}
            resumeParseNotes={initial.resume_parse_notes ?? null}
            resumeExtractedCleanText={initial.resume_extracted_clean_text ?? null}
            candidate={{
              full_name: initial.full_name,
              first_name: initial.first_name,
              last_name: initial.last_name,
              phone: initial.phone,
              email: initial.email,
              city: initial.city,
              state: initial.state,
              discipline: initial.discipline,
              notes: initial.notes,
            }}
          />

          {/* Profile editor */}
          <form
            key={`${initial.updated_at ?? ""}-${initial.id}`}
            action={updateRecruitingCandidate}
            className={sectionCardCls}
          >
            <input type="hidden" name="id" value={initial.id} />
            <div className={`${sectionHeaderCls} flex flex-wrap items-center justify-between gap-3`}>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Profile</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Update structured fields — activity timestamps roll up from quick actions.
                </p>
              </div>
              <button type="submit" className={crmPrimaryCtaCls}>
                Save changes
              </button>
            </div>

            <div className="space-y-6 p-5 sm:p-6">
              <FieldGroup title="Personal info">
                <label className={`${fieldLabelCls} sm:col-span-2`}>
                  Full name *
                  <input name="full_name" required defaultValue={initial.full_name} className={crmFilterInputCls} />
                </label>
                <label className={fieldLabelCls}>
                  First name
                  <input name="first_name" defaultValue={initial.first_name ?? ""} className={crmFilterInputCls} />
                </label>
                <label className={fieldLabelCls}>
                  Last name
                  <input name="last_name" defaultValue={initial.last_name ?? ""} className={crmFilterInputCls} />
                </label>
                <label className={fieldLabelCls}>
                  Phone
                  <input name="phone" defaultValue={initial.phone ?? ""} className={crmFilterInputCls} />
                </label>
                <label className={fieldLabelCls}>
                  Email
                  <input name="email" type="email" defaultValue={initial.email ?? ""} className={crmFilterInputCls} />
                </label>
                <label className={fieldLabelCls}>
                  City
                  <input name="city" defaultValue={initial.city ?? ""} className={crmFilterInputCls} />
                </label>
                <label className={fieldLabelCls}>
                  State
                  <input name="state" defaultValue={initial.state ?? ""} className={crmFilterInputCls} />
                </label>
                <label className={fieldLabelCls}>
                  ZIP
                  <input name="zip" defaultValue={initial.zip ?? ""} className={crmFilterInputCls} />
                </label>
                <label className={`${fieldLabelCls} sm:col-span-2`}>
                  Coverage area
                  <input name="coverage_area" defaultValue={initial.coverage_area ?? ""} className={crmFilterInputCls} />
                </label>
              </FieldGroup>

              <FieldGroup title="Recruiting info">
                <label className={fieldLabelCls}>
                  Assigned to
                  <select name="assigned_to" defaultValue={initial.assigned_to ?? ""} className={crmFilterInputCls}>
                    <option value="">Unassigned</option>
                    {staffOptions.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {staffPrimaryLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={fieldLabelCls}>
                  Discipline
                  <select name="discipline" defaultValue={initial.discipline ?? ""} className={crmFilterInputCls}>
                    <option value="">—</option>
                    {disciplineExtra ? <option value={disciplineExtra}>{disciplineExtra} (custom)</option> : null}
                    {RECRUITING_DISCIPLINE_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={fieldLabelCls}>
                  Source
                  <select name="source" defaultValue={initial.source ?? "Indeed"} className={crmFilterInputCls}>
                    {sourceExtra ? <option value={sourceExtra}>{sourceExtra} (custom)</option> : null}
                    {RECRUITING_SOURCE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={fieldLabelCls}>
                  Status
                  <select name="status" defaultValue={initial.status ?? "New"} className={crmFilterInputCls}>
                    {statusExtra ? <option value={statusExtra}>{statusExtra} (custom)</option> : null}
                    {RECRUITING_STATUS_LEGACY_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s} (legacy)
                      </option>
                    ))}
                    {RECRUITING_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={fieldLabelCls}>
                  Interest level
                  <select name="interest_level" defaultValue={initial.interest_level ?? ""} className={crmFilterInputCls}>
                    <option value="">—</option>
                    {interestExtra ? <option value={interestExtra}>{interestExtra} (custom)</option> : null}
                    {RECRUITING_INTEREST_LEVEL_OPTIONS.map((x) => (
                      <option key={x} value={x}>
                        {x.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={fieldLabelCls}>
                  Preferred contact
                  <select
                    name="preferred_contact_method"
                    defaultValue={initial.preferred_contact_method ?? ""}
                    className={crmFilterInputCls}
                  >
                    <option value="">—</option>
                    {preferredExtra ? <option value={preferredExtra}>{preferredExtra} (custom)</option> : null}
                    {RECRUITING_PREFERRED_CONTACT_OPTIONS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${fieldLabelCls} sm:col-span-2`}>
                  Specialties
                  <input name="specialties" defaultValue={initial.specialties ?? ""} className={crmFilterInputCls} />
                </label>
                <label className={`${fieldLabelCls} sm:col-span-2`}>
                  Tags / campaigns
                  <input name="recruiting_tags" defaultValue={initial.recruiting_tags ?? ""} className={crmFilterInputCls} />
                </label>
              </FieldGroup>

              <FieldGroup title="Follow-up tracking">
                <label className={`${fieldLabelCls} sm:col-span-2`}>
                  Nurture bucket
                  <input name="follow_up_bucket" defaultValue={initial.follow_up_bucket ?? ""} className={crmFilterInputCls} />
                </label>
                <label className={fieldLabelCls}>
                  Last response
                  <input
                    name="last_response_at"
                    type="datetime-local"
                    defaultValue={toDatetimeLocalValue(initial.last_response_at)}
                    className={crmFilterInputCls}
                  />
                </label>
                <label className={fieldLabelCls}>
                  Next follow-up (override)
                  <input
                    name="next_follow_up_at"
                    type="datetime-local"
                    defaultValue={toDatetimeLocalValue(initial.next_follow_up_at)}
                    className={crmFilterInputCls}
                  />
                </label>
                <label className={fieldLabelCls}>
                  Last call (override)
                  <input
                    name="last_call_at"
                    type="datetime-local"
                    defaultValue={toDatetimeLocalValue(initial.last_call_at)}
                    className={crmFilterInputCls}
                  />
                </label>
                <label className={fieldLabelCls}>
                  Last text (override)
                  <input
                    name="last_text_at"
                    type="datetime-local"
                    defaultValue={toDatetimeLocalValue(initial.last_text_at)}
                    className={crmFilterInputCls}
                  />
                </label>
                <label className={fieldLabelCls}>
                  Last contact (override)
                  <input
                    name="last_contact_at"
                    type="datetime-local"
                    defaultValue={toDatetimeLocalValue(initial.last_contact_at)}
                    className={crmFilterInputCls}
                  />
                </label>
                <label className={`${fieldLabelCls} normal-case sm:col-span-2`}>
                  <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    <input
                      type="checkbox"
                      name="sms_opt_out"
                      value="on"
                      defaultChecked={Boolean(initial.sms_opt_out)}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600"
                    />
                    SMS opt-out (do not send recruiting texts)
                  </span>
                  {initial.sms_opt_out_at ? (
                    <span className="mt-1 text-[10px] font-normal normal-case text-slate-500">
                      Recorded {formatWhen(initial.sms_opt_out_at)}
                    </span>
                  ) : null}
                </label>
              </FieldGroup>

              <FieldGroup title="Resume / source links">
                <label className={`${fieldLabelCls} sm:col-span-2`}>
                  Indeed URL
                  <input name="indeed_url" type="url" defaultValue={initial.indeed_url ?? ""} className={crmFilterInputCls} />
                </label>
                <label className={`${fieldLabelCls} sm:col-span-2`}>
                  Resume URL
                  <input name="resume_url" type="url" defaultValue={initial.resume_url ?? ""} className={crmFilterInputCls} />
                </label>
              </FieldGroup>

              <FieldGroup title="Notes">
                <label className={`${fieldLabelCls} sm:col-span-2`}>
                  Notes
                  <textarea
                    name="notes"
                    rows={4}
                    defaultValue={initial.notes ?? ""}
                    className={`${crmFilterInputCls} min-h-[6rem]`}
                  />
                </label>
              </FieldGroup>

              <div className="flex justify-end border-t border-slate-100 pt-5">
                <button type="submit" className={crmPrimaryCtaCls}>
                  Save changes
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-24">
          <div className={sectionCardCls}>
            <div className={sectionHeaderCls}>
              <h3 className="text-sm font-semibold text-slate-900">At a glance</h3>
              <p className="mt-0.5 text-xs text-slate-500">Key recruiting context for this candidate.</p>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <SummaryRow label="Discipline" value={initial.discipline?.trim() || "—"} />
              <SummaryRow
                label="City / coverage"
                value={[initial.city, initial.coverage_area].filter(Boolean).join(" · ") || "—"}
              />
              <SummaryRow label="Status" value={initial.status?.trim() || "—"} />
              <SummaryRow
                label="Interest"
                value={initial.interest_level?.trim() ? initial.interest_level.replace(/_/g, " ") : "—"}
              />
              <SummaryRow label="Preferred contact" value={initial.preferred_contact_method?.trim() || "—"} />
              <SummaryRow label="Source" value={initial.source?.trim() || "—"} />
            </div>
            {initial.follow_up_bucket?.trim() || initial.specialties?.trim() || initial.recruiting_tags?.trim() ? (
              <div className="space-y-1.5 border-t border-slate-100 px-5 py-4 text-xs text-slate-600">
                {initial.follow_up_bucket?.trim() ? (
                  <p>
                    <span className="font-semibold text-slate-700">Bucket: </span>
                    {initial.follow_up_bucket}
                  </p>
                ) : null}
                {initial.specialties?.trim() ? (
                  <p>
                    <span className="font-semibold text-slate-700">Specialties: </span>
                    {initial.specialties}
                  </p>
                ) : null}
                {initial.recruiting_tags?.trim() ? (
                  <p>
                    <span className="font-semibold text-slate-700">Tags: </span>
                    {initial.recruiting_tags}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className={sectionCardCls}>
            <div className={sectionHeaderCls}>
              <h3 className="text-sm font-semibold text-slate-900">Contact roll-up</h3>
              <p className="mt-0.5 text-xs text-slate-500">Same timestamps as quick actions and profile.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 p-5 text-[11px] text-slate-600">
              <div>
                <span className="font-medium text-slate-500">Last call</span>
                <div className="mt-0.5 text-sm font-semibold text-slate-800">{formatWhen(initial.last_call_at)}</div>
              </div>
              <div>
                <span className="font-medium text-slate-500">Last text</span>
                <div className="mt-0.5 text-sm font-semibold text-slate-800">{formatWhen(initial.last_text_at)}</div>
              </div>
              <div>
                <span className="font-medium text-slate-500">Last contact (any)</span>
                <div className="mt-0.5 text-sm font-semibold text-slate-800">{formatWhen(initial.last_contact_at)}</div>
              </div>
              <div>
                <span className="font-medium text-slate-500">Next follow-up</span>
                <div className={`mt-0.5 text-sm font-semibold ${dueBucket ? "text-amber-700" : "text-slate-800"}`}>
                  {formatWhen(initial.next_follow_up_at)}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {emailOpen && initial.recruiting_lead_id ? (
        <RecruitingLeadSendEmailModal
          leadId={initial.recruiting_lead_id}
          lead={{
            full_name: initial.full_name,
            phone: initial.phone,
            email: initial.email,
            license_status: initial.discipline,
            lead_type: null,
            form_name: null,
          }}
          recipientEmail={initial.email}
          emailConfigured={emailConfigured}
          onClose={() => setEmailOpen(false)}
          onSent={() => router.refresh()}
        />
      ) : null}

      {followUpOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-[24px] border border-slate-200 bg-white p-5 shadow-2xl">
            <h4 className="text-base font-semibold text-slate-900">Set follow-up</h4>
            <p className="mt-1 text-xs text-slate-500">Pick a time and optional context — we log it on the timeline.</p>
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              When
              <input
                type="datetime-local"
                value={followUpWhen}
                onChange={(e) => setFollowUpWhen(e.target.value)}
                className={`${crmFilterInputCls} mt-1 w-full`}
              />
            </label>
            <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Note (optional)
              <textarea
                value={followUpNote}
                onChange={(e) => setFollowUpNote(e.target.value)}
                rows={3}
                className={`${crmFilterInputCls} mt-1 w-full`}
              />
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
                onClick={() => setFollowUpOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={crmPrimaryCtaCls}
                disabled={pending}
                onClick={() => {
                  const iso = fromDatetimeLocalValue(followUpWhen);
                  if (!iso) {
                    setBanner("Pick a valid date and time.");
                    return;
                  }
                  startTransition(async () => {
                    const res = await recruitingQuickAction({
                      candidateId: initial.id,
                      kind: "follow_up_set",
                      body: followUpNote.trim() ? followUpNote.trim() : null,
                      nextFollowUpAt: iso,
                    });
                    if (!res.ok) {
                      setBanner(res.message);
                      return;
                    }
                    setFollowUpOpen(false);
                    router.refresh();
                  });
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {noteOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-[24px] border border-slate-200 bg-white p-5 shadow-2xl">
            <h4 className="text-base font-semibold text-slate-900">Add note</h4>
            <textarea
              value={freeNote}
              onChange={(e) => setFreeNote(e.target.value)}
              rows={5}
              className={`${crmFilterInputCls} mt-3 w-full`}
              placeholder="Quick context for the team…"
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
                onClick={() => setNoteOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={crmPrimaryCtaCls}
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const res = await recruitingQuickAction({
                      candidateId: initial.id,
                      kind: "note",
                      body: freeNote,
                    });
                    if (!res.ok) {
                      setBanner(res.message);
                      return;
                    }
                    setNoteOpen(false);
                    router.refresh();
                  });
                }}
              >
                Save note
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <RecruitingQuickTextModal
        open={textOpen}
        target={
          textOpen
            ? {
                ...candidateTextContext(initial),
                candidateId: initial.id,
                leadId: initial.recruiting_lead_id,
              }
            : null
        }
        onClose={() => setTextOpen(false)}
        onSent={() => router.refresh()}
      />
    </div>
  );
}

function GlanceCell({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${accent ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold capitalize text-slate-900">{value}</div>
    </div>
  );
}

function leadActivityLabel(eventType: string): string {
  switch (eventType) {
    case "outbound_email":
      return "Email sent";
    case "outbound_email_failed":
      return "Email failed";
    case "admin_sms_alert":
      return "Admin SMS alert";
    default:
      return eventType.replace(/_/g, " ");
  }
}

function leadActivityAccent(eventType: string): string {
  if (eventType === "outbound_email") return "bg-sky-50 text-sky-800 ring-sky-200/70";
  if (eventType === "outbound_email_failed") return "bg-rose-50 text-rose-800 ring-rose-200/70";
  if (eventType === "admin_sms_alert") return "bg-amber-50 text-amber-800 ring-amber-200/70";
  return "bg-slate-50 text-slate-700 ring-slate-200/70";
}

function LeadActivityItem({ row }: { row: RecruitingLeadActivityRow }) {
  const meta = row.metadata ?? {};
  const subject = typeof meta.subject === "string" ? meta.subject : null;
  const recipient = typeof meta.recipient === "string" ? meta.recipient : null;
  const deliveryStatus = typeof meta.delivery_status === "string" ? meta.delivery_status : null;
  const alertStatus = typeof meta.status === "string" ? meta.status : null;
  const bodyText = typeof meta.body === "string" ? meta.body : null;
  const error = typeof meta.error === "string" ? meta.error : null;

  return (
    <li className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${leadActivityAccent(
            row.event_type
          )}`}
        >
          {leadActivityLabel(row.event_type)}
        </span>
        <span className="text-xs text-slate-500">{formatWhen(row.created_at)}</span>
      </div>
      {row.created_by_name ? <p className="mt-1.5 text-xs text-slate-500">By {row.created_by_name}</p> : null}
      {recipient ? <p className="mt-1.5 text-xs text-slate-700">To: {recipient}</p> : null}
      {subject ? <p className="mt-1 text-xs font-medium text-slate-800">Subject: {subject}</p> : null}
      {deliveryStatus ? (
        <p className="mt-1 text-xs text-slate-600">Status: {deliveryStatus}</p>
      ) : alertStatus ? (
        <p className="mt-1 text-xs text-slate-600">Status: {alertStatus}</p>
      ) : null}
      {bodyText ? (
        <pre className="mt-2.5 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700">
          {bodyText}
        </pre>
      ) : row.body ? (
        <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-700">{row.body}</p>
      ) : null}
      {error ? <p className="mt-1.5 text-xs text-rose-700">{error}</p> : null}
    </li>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-4 sm:p-5">
      <legend className="px-2 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-800">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
