"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { SmsTextFromBar } from "@/app/workspace/phone/inbox/_components/SmsTextFromBar";

import { recordSmsSuggestionShown, sendConversationSms, type SendConversationSmsResult } from "../actions";

type Props = {
  conversationId: string;
  initialSuggestion: string | null;
  /** Inbound message id the suggestion was generated for (telemetry only). */
  suggestionForMessageId: string | null;
  /** Deep-link draft (e.g. `?draft=`); ignored when `initialSuggestion` is set. */
  initialDraft?: string | null;
  /** Thread-locked outbound line (workspace inbox). */
  smsPreferredFromE164?: string | null;
  /** Backup line in `smsPreferredFromE164` is only default-selected when this is true. */
  smsPreferredFromExplicit?: boolean;
  /** Reserved for display; default outbound uses primary. */
  smsInboundToE164?: string | null;
  /** When true, server action redirects back to workspace phone inbox with send status. */
  workspaceThread?: boolean;
  /** Desktop 3-pane split: redirect to `/workspace/phone/inbox?thread=…` instead of `/workspace/phone/inbox/[id]`. */
  workspaceInboxSplit?: boolean;
  /** iMessage-style: autofocus, pinned bar styling, client submit with optimistic parent hook. */
  messagingUX?: boolean;
  /** Called with trimmed body immediately before server send (workspace messaging UX). */
  onOutboundOptimistic?: (body: string) => void;
  /** Desktop split only: after successful in-place send (no redirect). */
  onInPlaceSendComplete?: () => void;
  /** Desktop split only: remove last optimistic bubble if send failed. */
  onRemoveLastOptimistic?: () => void;
  /** Desktop split only: show send error inline. */
  onInPlaceSendError?: (message: string) => void;
};

function initialComposerBody(initialSuggestion: string | null, initialDraft: string | null | undefined): string {
  return initialSuggestion ?? (typeof initialDraft === "string" ? initialDraft.trim() : "");
}

/**
 * Controlled reply box so AI suggestions pre-fill without overwriting after the user types.
 */
export function SmsReplyComposer({
  conversationId,
  initialSuggestion,
  suggestionForMessageId,
  initialDraft,
  smsPreferredFromE164,
  smsPreferredFromExplicit,
  smsInboundToE164,
  workspaceThread,
  workspaceInboxSplit,
  messagingUX,
  onOutboundOptimistic,
  onInPlaceSendComplete,
  onRemoveLastOptimistic,
  onInPlaceSendError,
}: Props) {
  const router = useRouter();
  const [body, setBody] = useState(() => initialComposerBody(initialSuggestion, initialDraft));
  const seedKey = `${conversationId}:${suggestionForMessageId ?? ""}:${initialSuggestion ?? ""}:${initialDraft ?? ""}`;
  const lastSeedKeyRef = useRef(seedKey);
  const userEditedRef = useRef(false);
  const shownRecordedForRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendInFlightRef = useRef(false);
  const [sendInFlight, setSendInFlight] = useState(false);

  useEffect(() => {
    if (lastSeedKeyRef.current === seedKey) return;
    lastSeedKeyRef.current = seedKey;
    if (userEditedRef.current) return;
    setBody(initialComposerBody(initialSuggestion, initialDraft));
  }, [initialDraft, initialSuggestion, seedKey]);

  useEffect(() => {
    if (!initialSuggestion || !suggestionForMessageId) return;
    if (shownRecordedForRef.current === suggestionForMessageId) return;
    shownRecordedForRef.current = suggestionForMessageId;
    void recordSmsSuggestionShown(conversationId, suggestionForMessageId);
  }, [conversationId, initialSuggestion, suggestionForMessageId]);

  useEffect(() => {
    if (!messagingUX) return;
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 120);
    return () => window.clearTimeout(t);
  }, [messagingUX, conversationId]);

  useLayoutEffect(() => {
    if (!messagingUX) return;
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [body, messagingUX]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setSendInFlight(true);
    onOutboundOptimistic?.(trimmed);
    const fd = new FormData(e.currentTarget);
    try {
      const result: SendConversationSmsResult = await sendConversationSms(fd);
      if (result.ok) {
        userEditedRef.current = false;
        setBody("");
        window.setTimeout(() => inputRef.current?.focus(), 0);
        if (onInPlaceSendComplete) {
          onInPlaceSendComplete();
        } else {
          router.refresh();
        }
      } else {
        onRemoveLastOptimistic?.();
        userEditedRef.current = true;
        setBody(trimmed);
        if (onInPlaceSendError) {
          onInPlaceSendError(result.error);
        } else {
          console.error(result.error);
        }
      }
    } finally {
      sendInFlightRef.current = false;
      setSendInFlight(false);
    }
  };

  const formClass =
    messagingUX && workspaceThread
      ? "space-y-1 px-1.5 pb-1 pt-0.5 sm:space-y-1.5 sm:px-3 sm:pb-2 sm:pt-2"
      : messagingUX
        ? "border-t border-sky-100/80 bg-white/98 px-3 py-2.5 pb-[max(0.6rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_24px_-8px_rgba(30,58,138,0.08)] backdrop-blur-sm"
        : "border-t border-slate-200 bg-white p-3";

  return (
    <form
      id="sms-reply"
      onSubmit={handleSubmit}
      className={formClass}
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      {workspaceThread ? (
        <input
          type="hidden"
          name="returnTo"
          value={workspaceInboxSplit ? "workspace_inbox" : "workspace"}
        />
      ) : null}
      {workspaceThread && messagingUX && onOutboundOptimistic ? (
        <input type="hidden" name="smsInPlace" value="1" />
      ) : null}
      <label className="sr-only" htmlFor="sms-body">
        Message
      </label>
      {initialSuggestion ? (
        <p className="text-[10px] text-slate-500 sm:mb-0 sm:text-[11px]">
          AI suggestion — edit before sending.
        </p>
      ) : null}

      {workspaceThread && messagingUX ? (
        <SmsTextFromBar
          className="shadow-none"
          lockScopeKey={conversationId}
          preferredFromE164={smsPreferredFromE164}
          preferredFromExplicit={smsPreferredFromExplicit}
          inboundToE164={smsInboundToE164}
        />
      ) : null}

      {messagingUX ? (
        <div
          className={
            workspaceThread
              ? "flex items-end gap-1.5 rounded-2xl border border-slate-200/50 bg-white p-1 pl-1.5 sm:gap-2 sm:rounded-[1.35rem] sm:border-slate-200/60 sm:p-1.5 sm:pl-2 sm:shadow-sm"
              : "flex items-end gap-2"
          }
        >
          <textarea
            ref={inputRef}
            id="sms-body"
            name="body"
            required
            rows={1}
            maxLength={1600}
            value={body}
            onChange={(e) => {
              userEditedRef.current = true;
              setBody(e.target.value);
            }}
            placeholder="Text message"
            className={
              workspaceThread
                ? "min-h-[2.35rem] max-h-[9rem] flex-1 resize-none rounded-[1.1rem] border-0 bg-slate-100/60 px-2.5 py-2 text-[16px] leading-snug text-slate-900 placeholder:text-slate-400 outline-none transition focus:bg-white focus:ring-2 focus:ring-sky-300/40 sm:min-h-[2.75rem] sm:rounded-[1.2rem] sm:px-3.5 sm:py-2.5 sm:leading-relaxed"
                : "min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-slate-200/90 bg-slate-50/90 px-3.5 py-2.5 text-[15px] leading-snug text-slate-900 shadow-inner shadow-slate-200/40 outline-none ring-sky-300/30 transition focus:border-sky-300/80 focus:bg-white focus:ring-2"
            }
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, workspaceThread ? 144 : 120)}px`;
            }}
          />
          <button
            type="submit"
            className={
              workspaceThread
                ? "mb-px shrink-0 rounded-full bg-gradient-to-b from-sky-500 to-blue-800 px-3.5 py-2 text-xs font-bold tracking-wide text-white shadow-sm ring-1 ring-white/20 transition hover:brightness-[1.04] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35 sm:mb-0.5 sm:px-5 sm:py-2.5 sm:text-sm"
                : "shrink-0 rounded-full bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-900/25 transition hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
            }
            disabled={!body.trim() || sendInFlight}
          >
            Send
          </button>
        </div>
      ) : (
        <>
          <textarea
            id="sms-body"
            name="body"
            required
            rows={3}
            maxLength={1600}
            value={body}
            onChange={(e) => {
              userEditedRef.current = true;
              setBody(e.target.value);
            }}
            placeholder="Type a message…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              disabled={!body.trim() || sendInFlight}
            >
              Send
            </button>
          </div>
        </>
      )}
    </form>
  );
}
