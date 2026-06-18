"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { parseAppDateTimeInputToUtcIso } from "@/lib/datetime/app-timezone";
import {
  formatRecruitingListContactLine,
  formatRecruitingListFollowUpLine,
  type RecruitingLeadListEngagementSummary,
} from "@/lib/recruiting/recruiting-lead-list-engagement";
import { phoenixEndOfTodayIso } from "@/lib/recruiting/phoenix-time";

import {
  recruitingListQuickAction,
  type RecruitingQuickActionKind,
} from "@/app/admin/recruiting/actions";
import {
  RecruitingQuickTextModal,
  recruitingQuickTextDisabledReason,
  type RecruitingQuickTextTarget,
} from "@/app/admin/recruiting/_components/RecruitingQuickTextModal";
import {
  facebookRecruitingLeadStatusPillClass,
} from "@/app/admin/recruiting/recruiting-leads-status-styles";
import {
  recruitingInterestPillClass,
  recruitingStatusPillClass,
} from "@/app/admin/recruiting/recruiting-status-styles";

type QuickActionDef = {
  id: string;
  label: string;
  kind: RecruitingQuickActionKind;
  tone?: "primary" | "rose" | "ghost";
};

const PRIMARY_ACTIONS: QuickActionDef[] = [
  { id: "spoke", label: "Spoke", kind: "spoke", tone: "primary" },
  { id: "voicemail", label: "Left VM", kind: "voicemail" },
  { id: "no_response", label: "No response", kind: "no_response" },
  { id: "text", label: "Text sent", kind: "text" },
  { id: "email", label: "Email sent", kind: "email" },
  { id: "interested", label: "Interested", kind: "interested", tone: "primary" },
];

const SECONDARY_ACTIONS: QuickActionDef[] = [
  { id: "not_interested", label: "Not interested", kind: "not_interested", tone: "rose" },
  { id: "follow_up_later", label: "Follow up later", kind: "follow_up_later" },
];

const actionBtnBase =
  "inline-flex h-7 items-center justify-center rounded-full border px-2.5 text-[11px] font-semibold transition disabled:opacity-50";

function actionBtnClass(tone: QuickActionDef["tone"]): string {
  if (tone === "primary") {
    return `${actionBtnBase} border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100`;
  }
  if (tone === "rose") {
    return `${actionBtnBase} border-rose-200 bg-white text-rose-800 hover:bg-rose-50`;
  }
  return `${actionBtnBase} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
}

type Props = {
  leadId: string;
  candidateId: string | null;
  engagement: RecruitingLeadListEngagementSummary;
  textTarget: Omit<RecruitingQuickTextTarget, "candidateId" | "leadId">;
};

export function RecruitingLeadListEngagement({
  leadId,
  candidateId,
  engagement: initial,
  textTarget,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [followUpWhen, setFollowUpWhen] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [engagement, setEngagement] = useState(initial);

  useEffect(() => {
    setEngagement(initial);
  }, [initial]);

  const dueSoon = Boolean(
    engagement.nextFollowUpAt && engagement.nextFollowUpAt <= phoenixEndOfTodayIso()
  );
  const statusPillClass = engagement.usesCandidateEngagement
    ? recruitingStatusPillClass(engagement.status)
    : facebookRecruitingLeadStatusPillClass(engagement.status);

  const textDisabledReason = recruitingQuickTextDisabledReason({
    phone: textTarget.phone,
    smsOptOut: textTarget.smsOptOut,
  });

  function patchEngagementAfterTextSend() {
    patchEngagementAfterAction("text");
  }

  function patchEngagementAfterAction(kind: RecruitingQuickActionKind) {
    const nowIso = new Date().toISOString();
    setEngagement((prev) => {
      const next = { ...prev };
      const countsAsAttempt =
        kind === "call" ||
        kind === "voicemail" ||
        kind === "text" ||
        kind === "email" ||
        kind === "no_answer" ||
        kind === "spoke" ||
        kind === "no_response";

      if (countsAsAttempt) {
        next.attemptsCount = prev.attemptsCount + 1;
      }

      if (kind !== "follow_up_set" && kind !== "note") {
        next.lastContactAt = nowIso;
      } else if (kind === "note") {
        next.lastContactAt = nowIso;
      }

      if (kind === "call" || kind === "voicemail" || kind === "no_answer" || kind === "spoke") {
        next.lastCallAt = nowIso;
      }
      if (kind === "text") next.lastTextAt = nowIso;
      if (kind === "email") next.lastEmailAt = nowIso;

      switch (kind) {
        case "spoke":
          next.status = "Spoke";
          break;
        case "voicemail":
        case "email":
        case "text":
          if (next.status === "New" || next.status === "Not Contacted" || next.status === "Contacted") {
            next.status = engagement.usesCandidateEngagement ? "Attempted Contact" : "Contacted";
          }
          break;
        case "interested":
          next.status = "Interested";
          break;
        case "not_interested":
          next.status = "Not Interested";
          break;
        case "follow_up_later":
          next.status = "Follow Up Later";
          break;
        case "no_response":
          next.status = "No Response";
          break;
        default:
          break;
      }

      return next;
    });
  }

  function runQuick(kind: RecruitingQuickActionKind, extra?: { body?: string; nextFollowUpAt?: string }) {
    setBanner(null);
    setBusyKind(kind);
    startTransition(async () => {
      const res = await recruitingListQuickAction({
        leadId,
        candidateId,
        kind,
        body: extra?.body ?? null,
        nextFollowUpAt: extra?.nextFollowUpAt ?? null,
      });
      setBusyKind(null);
      if (!res.ok) {
        setBanner(res.message);
        return;
      }
      patchEngagementAfterAction(kind);
      if (extra?.nextFollowUpAt) {
        setEngagement((prev) => ({ ...prev, nextFollowUpAt: extra.nextFollowUpAt! }));
      }
      setNoteOpen(false);
      setFollowUpOpen(false);
      setMoreOpen(false);
      router.refresh();
    });
  }

  function renderSendTextButton(className?: string) {
    if (textDisabledReason) {
      return (
        <span
          key="send-text"
          title={textDisabledReason}
          className={`${actionBtnClass("ghost")} cursor-not-allowed opacity-50 ${className ?? ""}`}
        >
          {textDisabledReason}
        </span>
      );
    }
    return (
      <button
        key="send-text"
        type="button"
        disabled={pending}
        onClick={() => setTextOpen(true)}
        className={`${actionBtnClass("primary")} ${className ?? ""}`}
      >
        Send text
      </button>
    );
  }

  function renderActionButton(action: QuickActionDef) {
    return (
      <button
        key={action.id}
        type="button"
        disabled={pending}
        onClick={() => runQuick(action.kind)}
        className={`${actionBtnClass(action.tone)} ${busyKind === action.kind ? "opacity-60" : ""}`}
      >
        {busyKind === action.kind ? "…" : action.label}
      </button>
    );
  }

  return (
    <>
      <div className="border-t border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-sky-50/30 px-4 py-2.5">
        {banner ? (
          <p className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-900">
            {banner}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-600">
          <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 font-semibold text-slate-800 ring-1 ring-slate-200/80">
            Attempts: {engagement.attemptsCount}
          </span>
          <span>
            <span className="font-medium text-slate-500">Last:</span>{" "}
            {formatRecruitingListContactLine(engagement.lastContactAt)}
          </span>
          <span>
            <span className="font-medium text-slate-500">Next:</span>{" "}
            <span className={dueSoon ? "font-semibold text-amber-800" : ""}>
              {formatRecruitingListFollowUpLine(engagement.nextFollowUpAt)}
            </span>
          </span>
          <span className={statusPillClass}>{engagement.status}</span>
          {engagement.interestLevel ? (
            <span className={recruitingInterestPillClass(engagement.interestLevel)}>
              {engagement.interestLevel.replace(/_/g, " ")}
            </span>
          ) : null}
        </div>

        <div className="mt-2 hidden flex-wrap items-center gap-1.5 sm:flex">
          {renderSendTextButton()}
          {PRIMARY_ACTIONS.map(renderActionButton)}
          {SECONDARY_ACTIONS.map(renderActionButton)}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setFollowUpWhen("");
              setFollowUpNote("");
              setFollowUpOpen(true);
            }}
            className={actionBtnClass("ghost")}
          >
            Set follow-up
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setNoteBody("");
              setNoteOpen(true);
            }}
            className={actionBtnClass("ghost")}
          >
            Add note
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:hidden">
          {renderSendTextButton()}
          {PRIMARY_ACTIONS.slice(0, 3).map(renderActionButton)}
          <div className="relative">
            <button
              type="button"
              disabled={pending}
              onClick={() => setMoreOpen((v) => !v)}
              className={actionBtnClass("ghost")}
            >
              More
            </button>
            {moreOpen ? (
              <div className="absolute bottom-full right-0 z-20 mb-1 flex min-w-[10rem] flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                {PRIMARY_ACTIONS.slice(3).map(renderActionButton)}
                {SECONDARY_ACTIONS.map(renderActionButton)}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setFollowUpWhen("");
                    setFollowUpNote("");
                    setFollowUpOpen(true);
                    setMoreOpen(false);
                  }}
                  className={actionBtnClass("ghost")}
                >
                  Set follow-up
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setNoteBody("");
                    setNoteOpen(true);
                    setMoreOpen(false);
                  }}
                  className={actionBtnClass("ghost")}
                >
                  Add note
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {noteOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[20px] border border-slate-200 bg-white p-4 shadow-2xl">
            <h4 className="text-sm font-semibold text-slate-900">Add note</h4>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={4}
              className={`${crmFilterInputCls} mt-2 w-full text-sm`}
              placeholder="Quick note for the timeline…"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                onClick={() => setNoteOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${crmPrimaryCtaCls} !px-3 !py-1.5 !text-xs`}
                disabled={pending || !noteBody.trim()}
                onClick={() => runQuick("note", { body: noteBody.trim() })}
              >
                Save note
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {followUpOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[20px] border border-slate-200 bg-white p-4 shadow-2xl">
            <h4 className="text-sm font-semibold text-slate-900">Set follow-up</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { label: "Today", offset: 0 },
                { label: "Tomorrow", offset: 1 },
                { label: "3 days", offset: 3 },
                { label: "1 week", offset: 7 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const iso = followUpPresetFromOffset(preset.offset);
                    runQuick("follow_up_set", { nextFollowUpAt: iso });
                  }}
                  className={actionBtnClass("ghost")}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Custom date &amp; time
              <input
                type="datetime-local"
                value={followUpWhen}
                onChange={(e) => setFollowUpWhen(e.target.value)}
                className={`${crmFilterInputCls} mt-1 w-full text-sm`}
              />
            </label>
            <textarea
              value={followUpNote}
              onChange={(e) => setFollowUpNote(e.target.value)}
              rows={2}
              placeholder="Optional note…"
              className={`${crmFilterInputCls} mt-2 w-full text-sm`}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                onClick={() => setFollowUpOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${crmPrimaryCtaCls} !px-3 !py-1.5 !text-xs`}
                disabled={pending || !followUpWhen.trim()}
                onClick={() => {
                  const iso = parseAppDateTimeInputToUtcIso(followUpWhen.trim());
                  if (!iso) {
                    setBanner("Pick a valid date and time.");
                    return;
                  }
                  runQuick("follow_up_set", {
                    nextFollowUpAt: iso,
                    body: followUpNote.trim() || undefined,
                  });
                }}
              >
                Save
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
                ...textTarget,
                candidateId: candidateId ?? "",
                leadId,
              }
            : null
        }
        onClose={() => setTextOpen(false)}
        onSent={() => {
          patchEngagementAfterTextSend();
          router.refresh();
        }}
      />
    </>
  );
}

function followUpPresetFromOffset(dayOffset: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value ?? 1970);
  const m = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const d = Number(parts.find((p) => p.type === "day")?.value ?? 1);
  const dt = new Date(Date.UTC(y, m - 1, d + dayOffset, 19, 0, 0));
  return dt.toISOString();
}
