"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { recordSmsSuggestionShown, sendConversationSms, type SendConversationSmsResult } from "../actions";

type Props = {
  conversationId: string;
  initialSuggestion: string | null;
  /** Inbound message id the suggestion was generated for (telemetry only). */
  suggestionForMessageId: string | null;
  /** Deep-link draft (e.g. `?draft=`); ignored when `initialSuggestion` is set. */
  initialDraft?: string | null;
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

/**
 * Controlled reply box so AI suggestions pre-fill without overwriting after the user types.
 * Parent should change `key` when the latest inbound message id changes so a new suggestion can load.
 */
export function SmsReplyComposer({
  conversationId,
  initialSuggestion,
  suggestionForMessageId,
  initialDraft,
  workspaceThread,
  workspaceInboxSplit,
  messagingUX,
  onOutboundOptimistic,
  onInPlaceSendComplete,
  onRemoveLastOptimistic,
  onInPlaceSendError,
}: Props) {
  const [body, setBody] = useState(
    () => initialSuggestion ?? (typeof initialDraft === "string" ? initialDraft.trim() : "")
  );
  const shownRecordedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!initialSuggestion || !suggestionForMessageId) return;
    if (shownRecordedRef.current) return;
    shownRecordedRef.current = true;
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
    if (!messagingUX || !onOutboundOptimistic) return;
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    onOutboundOptimistic(trimmed);
    const fd = new FormData(e.currentTarget);
    const result: void | SendConversationSmsResult = await sendConversationSms(fd);
    if (!workspaceInboxSplit) return;
    if (result == null || typeof result !== "object" || !("ok" in result)) return;
    if (result.ok) {
      setBody("");
      window.setTimeout(() => inputRef.current?.focus(), 0);
      onInPlaceSendComplete?.();
    } else {
      onRemoveLastOptimistic?.();
      setBody(trimmed);
      onInPlaceSendError?.(result.error);
    }
  };

  const formClass =
    messagingUX && workspaceThread
      ? "px-3 pb-2 pt-2.5 sm:px-4"
      : messagingUX
        ? "border-t border-sky-100/80 bg-white/98 px-3 py-2.5 pb-[max(0.6rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_24px_-8px_rgba(30,58,138,0.08)] backdrop-blur-sm"
        : "border-t border-slate-200 bg-white p-3";

  return (
    <form
      id="sms-reply"
      action={messagingUX && onOutboundOptimistic ? undefined : sendConversationSms}
      onSubmit={messagingUX && onOutboundOptimistic ? handleSubmit : undefined}
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
      {workspaceInboxSplit && messagingUX && onOutboundOptimistic ? (
        <input type="hidden" name="smsInPlace" value="1" />
      ) : null}
      <label className="sr-only" htmlFor="sms-body">
        Message
      </label>
      {initialSuggestion ? (
        <p className="mb-1.5 text-[11px] text-slate-500">
          AI suggestion based on conversation — edit before sending.
        </p>
      ) : null}

      {messagingUX ? (
        <div
          className={
            workspaceThread
              ? "flex items-end gap-2.5 rounded-[1.45rem] border border-slate-200/75 bg-white p-2 pl-2.5 shadow-[0_4px_20px_-6px_rgba(30,58,138,0.18),inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-sky-100/45 backdrop-blur-sm"
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
            onChange={(e) => setBody(e.target.value)}
            placeholder="Text message"
            className={
              workspaceThread
                ? "min-h-[3rem] max-h-[9rem] flex-1 resize-none rounded-[1.15rem] border-0 bg-sky-50/50 px-4 py-3 text-[16px] leading-relaxed text-slate-900 placeholder:text-slate-400 outline-none transition focus:bg-white focus:ring-2 focus:ring-sky-300/55"
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
                ? "mb-0.5 shrink-0 rounded-full bg-gradient-to-b from-sky-500 to-blue-800 px-6 py-3 text-sm font-bold tracking-wide text-white shadow-lg shadow-sky-900/25 ring-1 ring-white/30 transition hover:brightness-[1.04] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35"
                : "shrink-0 rounded-full bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-900/25 transition hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
            }
            disabled={!body.trim()}
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
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type a message…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Send
            </button>
          </div>
        </>
      )}
    </form>
  );
}
