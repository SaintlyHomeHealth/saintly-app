"use client";

import Link from "next/link";
import { useMemo } from "react";

import {
  formatCrmOutcomeLabel,
  formatCrmTypeLabel,
  isNeedsFollowUpClassification,
  isSpamClassification,
  readCrmMetadata,
} from "../_lib/crm-metadata";
import {
  formatConfidenceCategoryLabel,
  formatUrgencyLabel,
  formatVoiceAiCallerCategoryLabel,
  formatVoiceAiRouteTargetLabel,
  readVoiceAiMetadata,
  urgencyBadgeClass,
} from "../_lib/voice-ai-metadata";
import { RecentCallsLive } from "../recent-calls-live";
import type {
  ContactPipelineState,
  PhoneCallRow,
  PhoneCallTaskSnippet,
  PhoneNotificationRow,
} from "../recent-calls-live";

type PhoneThreadViewProps = {
  calls: PhoneCallRow[];
  /** When set, thread shows only this call; when null, shows full list (Dialpad-style “all”). */
  selectedCallId?: string | null;
  notifByCallId: Record<string, PhoneNotificationRow[]>;
  contactPipelineByContactId: Record<string, ContactPipelineState>;
  taskCountByCallId: Record<string, number>;
  taskSnippetsByCallId: Record<string, PhoneCallTaskSnippet[]>;
  allowUnassign: boolean;
  callVisibility: "full" | "nurse";
  currentUserId: string;
  assignableStaff: { user_id: string; label: string }[];
  maxVisible: number;
  fullCallsHref: string;
  errorMessage?: string | null;
};

export function PhoneThreadView({
  calls,
  selectedCallId = null,
  notifByCallId,
  contactPipelineByContactId,
  taskCountByCallId,
  taskSnippetsByCallId,
  allowUnassign,
  callVisibility,
  currentUserId,
  assignableStaff,
  maxVisible,
  fullCallsHref,
  errorMessage,
}: PhoneThreadViewProps) {
  const threadCalls = useMemo(() => {
    if (!selectedCallId) return calls;
    const filtered = calls.filter((c) => c.id === selectedCallId);
    return filtered.length > 0 ? filtered : calls;
  }, [calls, selectedCallId]);

  const focusCall = useMemo(() => {
    if (!selectedCallId) return null;
    return calls.find((c) => c.id === selectedCallId) ?? threadCalls[0] ?? null;
  }, [calls, selectedCallId, threadCalls]);

  const focusCrm = useMemo(() => (focusCall ? readCrmMetadata(focusCall) : null), [focusCall]);
  const focusTypeLabel = focusCrm ? formatCrmTypeLabel(focusCrm.type) : null;
  const focusOutcomeLabel = focusCrm ? formatCrmOutcomeLabel(focusCrm.outcome) : null;
  const focusTags = focusCrm?.tags.trim() ?? "";
  const focusSpam = focusCall ? isSpamClassification(focusCall) : false;
  const focusFollowUp = focusCall ? isNeedsFollowUpClassification(focusCall) : false;
  const focusVoice = useMemo(() => (focusCall ? readVoiceAiMetadata(focusCall) : null), [focusCall]);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-900">Thread</h2>

      {focusCall && focusCrm ? (
        <div
          className={`rounded-xl border p-3 shadow-sm ${
            focusSpam
              ? "border-slate-400 bg-gradient-to-br from-slate-50 to-slate-100/90 ring-1 ring-slate-300/50"
              : focusFollowUp
                ? "border-amber-200 bg-amber-50/50 ring-1 ring-amber-200/60"
                : "border-slate-200 bg-gradient-to-b from-white to-slate-50/80"
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Saved CRM
            </span>
            {focusSpam ? (
              <span className="inline-flex rounded-md border border-slate-400/70 bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-800">
                Spam
              </span>
            ) : null}
            {focusFollowUp && !focusSpam ? (
              <span className="inline-flex rounded-md border border-amber-300 bg-amber-100/90 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
                Needs follow-up
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {focusTypeLabel ? (
              <span className="inline-flex rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-900">
                {focusTypeLabel}
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">No type saved</span>
            )}
            {focusOutcomeLabel ? (
              <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                {focusOutcomeLabel}
              </span>
            ) : (
              <span className="text-[11px] text-slate-500">No outcome saved</span>
            )}
          </div>
          {focusTags ? (
            <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-slate-700">
              <span className="font-semibold text-slate-600">Tags: </span>
              {focusTags}
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">No tags saved</p>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2 text-[11px] text-slate-600">
          Select a conversation to see saved CRM type, outcome, and tags.
        </p>
      )}

      {focusCall && focusVoice ? (
        <div className="min-w-0 rounded-xl border border-indigo-100 bg-gradient-to-b from-indigo-50/50 to-white p-3 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="min-w-0 text-[11px] font-semibold text-indigo-950">AI snapshot (this call)</span>
            {focusVoice.source === "live_receptionist" ? (
              <span className="shrink-0 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900">
                Live call (AI)
              </span>
            ) : focusVoice.source === "background" ? (
              <span className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                After call (auto)
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
            <span className="inline-flex min-h-[1.5rem] min-w-0 max-w-full items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-800">
              <span className="shrink-0 font-semibold text-slate-500">Who called · </span>
              <span className="min-w-0 break-words pl-0.5">
                {focusVoice.caller_category
                  ? formatVoiceAiCallerCategoryLabel(focusVoice.caller_category)
                  : "Not detected"}
              </span>
            </span>
            <span
              className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold capitalize ${urgencyBadgeClass(focusVoice.urgency)}`}
            >
              Urgency: {formatUrgencyLabel(focusVoice.urgency)}
            </span>
            <span className="inline-flex min-h-[1.5rem] min-w-0 max-w-full items-center rounded-md border border-emerald-200/80 bg-emerald-50/90 px-2 py-0.5 text-[10px] text-emerald-950">
              <span className="shrink-0 font-semibold text-emerald-800/90">Routing · </span>
              <span className="min-w-0 break-words pl-0.5">
                {focusVoice.route_target ? formatVoiceAiRouteTargetLabel(focusVoice.route_target) : "Not set"}
              </span>
            </span>
            <span
              className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                focusVoice.callback_needed
                  ? "border-sky-200 bg-sky-50 text-sky-950"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              Callback needed: {focusVoice.callback_needed ? "Yes" : "No"}
            </span>
          </div>

          {focusVoice.short_summary ? (
            <p className="mt-2 line-clamp-5 break-words text-[11px] font-medium leading-snug text-slate-900">
              {focusVoice.short_summary}
            </p>
          ) : (
            <p className="mt-2 text-[10px] italic text-slate-500">No summary text for this call.</p>
          )}

          {focusVoice.confidence_summary || focusVoice.confidence_category ? (
            <div className="mt-2 min-w-0 rounded-md border border-slate-100 bg-slate-50/90 px-2 py-1.5">
              <p className="text-[10px] font-semibold text-slate-600">Model confidence</p>
              <div className="mt-0.5 flex min-w-0 flex-wrap items-start gap-1.5">
                <span className="shrink-0 rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-medium text-slate-700">
                  {formatConfidenceCategoryLabel(focusVoice.confidence_category)}
                </span>
                {focusVoice.confidence_summary ? (
                  <span className="min-w-0 flex-1 break-words text-[10px] leading-snug text-slate-700">
                    {focusVoice.confidence_summary}
                  </span>
                ) : (
                  <span className="text-[10px] italic text-slate-500">No detail from model.</span>
                )}
              </div>
            </div>
          ) : null}

          {focusVoice.live_transcript_excerpt || focusVoice.closing_message ? (
            <div className="mt-1.5 min-w-0 rounded-md border border-dashed border-indigo-100 bg-indigo-50/30 px-2 py-1.5">
              {focusVoice.live_transcript_excerpt ? (
                <p className="line-clamp-6 break-words text-[10px] leading-snug text-slate-700">
                  <span className="font-semibold text-slate-600">What they said · </span>
                  {focusVoice.live_transcript_excerpt}
                </p>
              ) : null}
              {focusVoice.closing_message ? (
                <p
                  className={`line-clamp-4 break-words text-[10px] leading-snug text-slate-700 ${
                    focusVoice.live_transcript_excerpt ? "mt-1.5" : ""
                  }`}
                >
                  <span className="font-semibold text-slate-600">What callers heard (sign-off) · </span>
                  {focusVoice.closing_message}
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="mt-2 text-[10px] text-slate-400">
            AI-only on this call record — not saved CRM. Update classification in the drawer if needed.
          </p>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load phone_calls: {errorMessage}
        </div>
      ) : (
        <RecentCallsLive
          initialCalls={threadCalls}
          initialNotifByCallId={notifByCallId}
          initialContactPipeline={contactPipelineByContactId}
          taskCountByCallId={taskCountByCallId}
          taskSnippetsByCallId={taskSnippetsByCallId}
          allowUnassign={allowUnassign}
          callVisibility={callVisibility}
          currentUserId={currentUserId}
          assignableStaff={assignableStaff}
          maxVisible={maxVisible}
        />
      )}

      <div className="px-1 pb-1">
        <Link
          href={fullCallsHref}
          className="text-[12px] font-semibold text-sky-800 underline underline-offset-2 hover:underline"
        >
          View full call log
        </Link>
      </div>
    </div>
  );
}
