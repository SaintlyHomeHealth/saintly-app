"use client";

import { useEffect, useRef, useState } from "react";

import { recordSmsSuggestionShown, sendConversationSms } from "../actions";

type Props = {
  conversationId: string;
  initialSuggestion: string | null;
  /** Inbound message id the suggestion was generated for (telemetry only). */
  suggestionForMessageId: string | null;
  /** Deep-link draft (e.g. `?draft=`); ignored when `initialSuggestion` is set. */
  initialDraft?: string | null;
  /** When true, server action redirects back to `/workspace/phone/inbox/...` with send status. */
  workspaceThread?: boolean;
  /** iMessage-style: autofocus, pinned bar styling, client submit with optimistic parent hook. */
  messagingUX?: boolean;
  /** Called with trimmed body immediately before server send (workspace messaging UX). */
  onOutboundOptimistic?: (body: string) => void;
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
  messagingUX,
  onOutboundOptimistic,
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    if (!messagingUX || !onOutboundOptimistic) return;
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    onOutboundOptimistic(trimmed);
    const fd = new FormData(e.currentTarget);
    await sendConversationSms(fd);
  };

  const formClass = messagingUX
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
      {workspaceThread ? <input type="hidden" name="returnTo" value="workspace" /> : null}
      <label className="sr-only" htmlFor="sms-body">
        Message
      </label>
      {initialSuggestion ? (
        <p className="mb-1.5 text-[11px] text-slate-500">
          AI suggestion based on conversation — edit before sending.
        </p>
      ) : null}

      {messagingUX ? (
        <div className="flex items-end gap-2">
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
            className="min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-slate-200/90 bg-slate-50/90 px-3.5 py-2.5 text-[15px] leading-snug text-slate-900 shadow-inner shadow-slate-200/40 outline-none ring-sky-300/30 transition focus:border-sky-300/80 focus:bg-white focus:ring-2"
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-gradient-to-r from-blue-950 via-blue-700 to-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-900/25 transition hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
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
