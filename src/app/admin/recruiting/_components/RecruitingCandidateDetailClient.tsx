"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import {
  RECRUITING_DISCIPLINE_OPTIONS,
  RECRUITING_INTEREST_LEVEL_OPTIONS,
  RECRUITING_PREFERRED_CONTACT_OPTIONS,
  RECRUITING_SOURCE_OPTIONS,
  RECRUITING_STATUS_LEGACY_OPTIONS,
  RECRUITING_STATUS_OPTIONS,
  RECRUITING_TEXT_TEMPLATES,
} from "@/lib/recruiting/recruiting-options";
import { isPhoenixSameCalendarDay, phoenixEndOfTodayIso } from "@/lib/recruiting/phoenix-time";
import { buildRecruitingTimelineEntries } from "@/lib/recruiting/recruiting-timeline";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";

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
  "inline-flex min-h-[2.35rem] flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-2.5 py-2 text-center text-[11px] font-semibold text-white shadow-sm shadow-sky-200/50 transition hover:-translate-y-px hover:shadow-md sm:text-xs";
const btnGhost =
  "inline-flex min-h-[2.35rem] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-center text-[11px] font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50 sm:text-xs";
const btnRose =
  "inline-flex min-h-[2.35rem] flex-1 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-center text-[11px] font-semibold text-rose-900 shadow-sm transition hover:bg-rose-100 sm:text-xs";

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function fromDatetimeLocalValue(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function telHref(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : null;
}

function smsHref(phone: string | null | undefined, body: string): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  return `sms:${digits}?body=${encodeURIComponent(body)}`;
}

type RecruitingCandidateDetailClientProps = {
  candidate: CandidateRow;
  activities: ActivityRow[];
  staffOptions: StaffOpt[];
  noAnswerCount: number;
  listBackHref: string;
  viewerUserId: string;
  actorLabels: Record<string, string>;
};

export function RecruitingCandidateDetailClient({
  candidate: initial,
  activities,
  staffOptions,
  noAnswerCount,
  listBackHref,
  viewerUserId,
  actorLabels,
}: RecruitingCandidateDetailClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<string | null>(null);

  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [followUpWhen, setFollowUpWhen] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [freeNote, setFreeNote] = useState("");

  const dueToday = Boolean(initial.next_follow_up_at && isPhoenixSameCalendarDay(initial.next_follow_up_at));
  const dueBucket = Boolean(initial.next_follow_up_at && initial.next_follow_up_at <= phoenixEndOfTodayIso());

  const timelineEntries = useMemo(() => buildRecruitingTimelineEntries(activities), [activities]);

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
      <div>
        <Link
          href={listBackHref}
          className="inline-flex items-center gap-1 text-sm font-semibold text-sky-800 hover:text-sky-950 hover:underline"
        >
          ← Back to recruiting
        </Link>
      </div>

      {banner ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          {banner}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">{initial.full_name}</h2>
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
              <p className="mt-1 text-sm text-slate-600">
                {[initial.discipline, initial.city, initial.coverage_area].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {telHref(initial.phone) ? (
                <a href={telHref(initial.phone)!} className={btnPrimary}>
                  Call
                </a>
              ) : (
                <span className={`${btnPrimary} cursor-not-allowed opacity-50`}>Call</span>
              )}
              {initial.phone?.trim() && smsHref(initial.phone, RECRUITING_TEXT_TEMPLATES[0]!.body) ? (
                <a href={smsHref(initial.phone, RECRUITING_TEXT_TEMPLATES[0]!.body)!} className={btnGhost}>
                  Text
                </a>
              ) : (
                <span className={`${btnGhost} cursor-not-allowed opacity-50`}>Text</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/40 to-white p-4 shadow-sm sm:p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">At a glance</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Discipline</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">{initial.discipline?.trim() || "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">City / coverage</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">
                  {[initial.city, initial.coverage_area].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Interest</div>
                <div className="mt-0.5">
                  {initial.interest_level?.trim() ? (
                    <span className={recruitingInterestPillClass(initial.interest_level)}>
                      {initial.interest_level.replace(/_/g, " ")}
                    </span>
                  ) : (
                    <span className="text-sm font-semibold text-slate-400">—</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Last contact</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">{formatWhen(initial.last_contact_at)}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Next follow-up</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">{formatWhen(initial.next_follow_up_at)}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Resume</div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">
                  {initial.resume_storage_path?.trim() ? (
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
                  )}
                </div>
              </div>
            </div>
            {initial.follow_up_bucket?.trim() || initial.specialties?.trim() || initial.recruiting_tags?.trim() ? (
              <div className="mt-4 border-t border-sky-100/80 pt-3 text-xs text-slate-600">
                {initial.follow_up_bucket?.trim() ? (
                  <p>
                    <span className="font-semibold text-slate-700">Bucket: </span>
                    {initial.follow_up_bucket}
                  </p>
                ) : null}
                {initial.specialties?.trim() ? (
                  <p className={initial.follow_up_bucket?.trim() ? "mt-1" : ""}>
                    <span className="font-semibold text-slate-700">Specialties: </span>
                    {initial.specialties}
                  </p>
                ) : null}
                {initial.recruiting_tags?.trim() ? (
                  <p className={initial.specialties?.trim() || initial.follow_up_bucket?.trim() ? "mt-1" : ""}>
                    <span className="font-semibold text-slate-700">Tags: </span>
                    {initial.recruiting_tags}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <RecruitingTimelinePanel
            candidateId={initial.id}
            entries={timelineEntries}
            actorLabels={actorLabels}
            viewerUserId={viewerUserId}
          />

          <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-4 shadow-sm sm:p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Text templates</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {RECRUITING_TEXT_TEMPLATES.map((tpl) =>
                initial.phone?.trim() && smsHref(initial.phone, tpl.body) ? (
                  <a
                    key={tpl.id}
                    href={smsHref(initial.phone, tpl.body)!}
                    className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
                  >
                    {tpl.label}
                  </a>
                ) : (
                  <span
                    key={tpl.id}
                    className="inline-flex cursor-not-allowed items-center rounded-full border border-dashed border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-400"
                  >
                    {tpl.label}
                  </span>
                )
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6">
            <h3 className="text-sm font-semibold text-slate-900">Quick actions</h3>
            <p className="mt-1 text-xs text-slate-500">Log outcomes in one tap — timeline stays permanent.</p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button type="button" className={btnGhost} disabled={pending} onClick={() => runQuick("call")}>
                Log call
              </button>
              <button type="button" className={btnGhost} disabled={pending} onClick={() => runQuick("text")}>
                Text sent
              </button>
              <button type="button" className={btnGhost} disabled={pending} onClick={() => runQuick("no_answer")}>
                No answer
              </button>
              <button type="button" className={btnGhost} disabled={pending} onClick={() => runQuick("voicemail")}>
                Left voicemail
              </button>
              <button type="button" className={btnGhost} disabled={pending} onClick={() => runQuick("spoke")}>
                Spoke
              </button>
              <button type="button" className={btnGhost} disabled={pending} onClick={() => runQuick("no_response")}>
                No response
              </button>
              <button type="button" className={btnPrimary} disabled={pending} onClick={() => runQuick("interested")}>
                Interested
              </button>
              <button type="button" className={btnGhost} disabled={pending} onClick={() => runQuick("maybe_later")}>
                Maybe later
              </button>
              <button type="button" className={btnGhost} disabled={pending} onClick={() => runQuick("follow_up_later")}>
                Follow up later
              </button>
              <button type="button" className={btnRose} disabled={pending} onClick={() => runQuick("not_interested")}>
                Not interested
              </button>
              <button
                type="button"
                className={btnGhost}
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
                className={btnGhost}
                disabled={pending}
                onClick={() => {
                  setFreeNote("");
                  setNoteOpen(true);
                }}
              >
                Add note
              </button>
            </div>
          </div>

          <RecruitingResumeCard
            candidateId={initial.id}
            resumeFileName={initial.resume_file_name ?? null}
            resumeStoragePath={initial.resume_storage_path ?? null}
            resumeUploadedAt={initial.resume_uploaded_at ?? null}
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

          <form
            key={`${initial.updated_at ?? ""}-${initial.id}`}
            action={updateRecruitingCandidate}
            className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
          >
            <input type="hidden" name="id" value={initial.id} />
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Profile</h3>
                <p className="mt-1 text-xs text-slate-500">Update structured fields — activity timestamps roll up from quick actions.</p>
              </div>
              <button type="submit" className={crmPrimaryCtaCls}>
                Save changes
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Full name *
                <input name="full_name" required defaultValue={initial.full_name} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
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
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                First name
                <input name="first_name" defaultValue={initial.first_name ?? ""} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Last name
                <input name="last_name" defaultValue={initial.last_name ?? ""} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Phone
                <input name="phone" defaultValue={initial.phone ?? ""} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Email
                <input name="email" type="email" defaultValue={initial.email ?? ""} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                City
                <input name="city" defaultValue={initial.city ?? ""} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                State
                <input name="state" defaultValue={initial.state ?? ""} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                ZIP
                <input name="zip" defaultValue={initial.zip ?? ""} className={crmFilterInputCls} />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Coverage area
                <input name="coverage_area" defaultValue={initial.coverage_area ?? ""} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Discipline
                <select name="discipline" defaultValue={initial.discipline ?? ""} className={crmFilterInputCls}>
                  <option value="">—</option>
                  {disciplineExtra ? (
                    <option value={disciplineExtra}>{disciplineExtra} (custom)</option>
                  ) : null}
                  {RECRUITING_DISCIPLINE_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Source
                <select name="source" defaultValue={initial.source ?? "Indeed"} className={crmFilterInputCls}>
                  {sourceExtra ? (
                    <option value={sourceExtra}>{sourceExtra} (custom)</option>
                  ) : null}
                  {RECRUITING_SOURCE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Status
                <select name="status" defaultValue={initial.status ?? "New"} className={crmFilterInputCls}>
                  {statusExtra ? (
                    <option value={statusExtra}>{statusExtra} (custom)</option>
                  ) : null}
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
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Interest level
                <select name="interest_level" defaultValue={initial.interest_level ?? ""} className={crmFilterInputCls}>
                  <option value="">—</option>
                  {interestExtra ? (
                    <option value={interestExtra}>{interestExtra} (custom)</option>
                  ) : null}
                  {RECRUITING_INTEREST_LEVEL_OPTIONS.map((x) => (
                    <option key={x} value={x}>
                      {x.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Preferred contact
                <select
                  name="preferred_contact_method"
                  defaultValue={initial.preferred_contact_method ?? ""}
                  className={crmFilterInputCls}
                >
                  <option value="">—</option>
                  {preferredExtra ? (
                    <option value={preferredExtra}>{preferredExtra} (custom)</option>
                  ) : null}
                  {RECRUITING_PREFERRED_CONTACT_OPTIONS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Specialties
                <input name="specialties" defaultValue={initial.specialties ?? ""} className={crmFilterInputCls} />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Tags / campaigns
                <input name="recruiting_tags" defaultValue={initial.recruiting_tags ?? ""} className={crmFilterInputCls} />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Nurture bucket
                <input name="follow_up_bucket" defaultValue={initial.follow_up_bucket ?? ""} className={crmFilterInputCls} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Last response
                <input
                  name="last_response_at"
                  type="datetime-local"
                  defaultValue={toDatetimeLocalValue(initial.last_response_at)}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 sm:col-span-2">
                <span className="flex items-center gap-2">
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
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Indeed URL
                <input name="indeed_url" type="url" defaultValue={initial.indeed_url ?? ""} className={crmFilterInputCls} />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Resume URL
                <input name="resume_url" type="url" defaultValue={initial.resume_url ?? ""} className={crmFilterInputCls} />
              </label>
              <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Notes
                <textarea name="notes" rows={4} defaultValue={initial.notes ?? ""} className={`${crmFilterInputCls} min-h-[6rem]`} />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Last call (override)
                <input
                  name="last_call_at"
                  type="datetime-local"
                  defaultValue={toDatetimeLocalValue(initial.last_call_at)}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Last text (override)
                <input
                  name="last_text_at"
                  type="datetime-local"
                  defaultValue={toDatetimeLocalValue(initial.last_text_at)}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Last contact (override)
                <input
                  name="last_contact_at"
                  type="datetime-local"
                  defaultValue={toDatetimeLocalValue(initial.last_contact_at)}
                  className={crmFilterInputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Next follow-up (override)
                <input
                  name="next_follow_up_at"
                  type="datetime-local"
                  defaultValue={toDatetimeLocalValue(initial.next_follow_up_at)}
                  className={crmFilterInputCls}
                />
              </label>
            </div>
          </form>
        </div>

        <aside className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:min-h-[320px] lg:overflow-hidden">
          <div className="flex h-full max-h-[calc(100dvh-7rem)] min-h-0 flex-col rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-gradient-to-r from-sky-50/80 to-cyan-50/50 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Contact roll-up</h3>
              <p className="mt-1 text-xs text-slate-500">Same timestamps as quick actions and profile</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <div>
                  <span className="font-medium text-slate-500">Last call</span>
                  <div className="font-semibold text-slate-800">{formatWhen(initial.last_call_at)}</div>
                </div>
                <div>
                  <span className="font-medium text-slate-500">Last text</span>
                  <div className="font-semibold text-slate-800">{formatWhen(initial.last_text_at)}</div>
                </div>
                <div className="col-span-2">
                  <span className="font-medium text-slate-500">Last contact (any)</span>
                  <div className="font-semibold text-slate-800">{formatWhen(initial.last_contact_at)}</div>
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 px-4 py-3" />
          </div>
        </aside>
      </div>

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
    </div>
  );
}
