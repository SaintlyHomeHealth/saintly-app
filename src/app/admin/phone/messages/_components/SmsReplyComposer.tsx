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
}: Props) {
  const [body, setBody] = useState(
    () => initialSuggestion ?? (typeof initialDraft === "string" ? initialDraft.trim() : "")
  );
  const shownRecordedRef = useRef(false);

  useEffect(() => {
    if (!initialSuggestion || !suggestionForMessageId) return;
    if (shownRecordedRef.current) return;
    shownRecordedRef.current = true;
    void recordSmsSuggestionShown(conversationId, suggestionForMessageId);
  }, [conversationId, initialSuggestion, suggestionForMessageId]);

  return (
    <form id="sms-reply" action={sendConversationSms} className="border-t border-slate-200 bg-white p-3">
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
    </form>
  );
}
