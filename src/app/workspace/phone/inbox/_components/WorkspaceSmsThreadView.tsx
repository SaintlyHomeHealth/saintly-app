"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { SmsReplyComposer } from "@/app/admin/phone/messages/_components/SmsReplyComposer";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";

export type ThreadMessage = {
  id: string;
  created_at: string | null;
  direction: string;
  body: string | null;
};

const INITIAL_WINDOW = 8;
const WINDOW_STEP = 8;

type Props = {
  conversationId: string;
  initialMessages: ThreadMessage[];
  initialSuggestion: string | null;
  suggestionForMessageId: string | null;
  composerInitialDraft: string | null;
  /** CRM / details — rendered below the reply bar (secondary). */
  belowComposerSlot?: ReactNode;
};

export function WorkspaceSmsThreadView({
  conversationId,
  initialMessages,
  initialSuggestion,
  suggestionForMessageId,
  composerInitialDraft,
  belowComposerSlot,
}: Props) {
  const [optimistic, setOptimistic] = useState<ThreadMessage[]>([]);
  const [windowStart, setWindowStart] = useState(() =>
    Math.max(0, initialMessages.length - INITIAL_WINDOW)
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadEarlierPreserveRef = useRef<{ prevHeight: number } | null>(null);

  const visibleBase = initialMessages.slice(windowStart);
  const merged = [...visibleBase, ...optimistic];

  const canLoadEarlier = windowStart > 0;

  const loadEarlier = () => {
    const el = scrollRef.current;
    if (el) {
      loadEarlierPreserveRef.current = { prevHeight: el.scrollHeight };
    }
    setWindowStart((w) => Math.max(0, w - WINDOW_STEP));
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const preserve = loadEarlierPreserveRef.current;
    if (!el || !preserve) return;
    const diff = el.scrollHeight - preserve.prevHeight;
    el.scrollTop += diff;
    loadEarlierPreserveRef.current = null;
  }, [windowStart]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    });
    return () => cancelAnimationFrame(id);
  }, [conversationId, initialMessages.length]);

  useEffect(() => {
    if (optimistic.length === 0) return;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [optimistic.length]);

  const handleOptimistic = (body: string) => {
    const id = `optimistic-${Date.now()}`;
    setOptimistic((prev) => [
      ...prev,
      {
        id,
        created_at: new Date().toISOString(),
        direction: "outbound",
        body,
      },
    ]);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {canLoadEarlier ? (
          <div className="flex justify-center pb-1 pt-0">
            <button
              type="button"
              onClick={loadEarlier}
              className="rounded-full border border-sky-200/90 bg-white px-4 py-2 text-xs font-semibold text-blue-900 shadow-sm transition hover:bg-sky-50 active:scale-[0.99]"
            >
              Load earlier messages
            </button>
          </div>
        ) : null}

        {merged.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No messages yet. Say hello below.</p>
        ) : (
          merged.map((m) => {
            const inbound = String(m.direction).toLowerCase() === "inbound";
            const isPending = m.id.startsWith("optimistic-");
            return (
              <div key={m.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[min(85%,28rem)] rounded-[1.15rem] px-3.5 py-2.5 text-[15px] leading-snug shadow-sm ${
                    inbound
                      ? "rounded-bl-md border border-slate-200/90 bg-slate-100 text-slate-900"
                      : "rounded-br-md bg-gradient-to-br from-blue-950 via-blue-800 to-sky-600 text-white shadow-blue-900/15"
                  } ${isPending ? "opacity-85" : ""}`}
                >
                  <p className="whitespace-pre-wrap break-words">{String(m.body ?? "")}</p>
                  <p
                    className={`mt-1.5 text-[10px] tabular-nums ${
                      inbound ? "text-slate-500" : "text-sky-100/90"
                    }`}
                  >
                    {formatAdminPhoneWhen(typeof m.created_at === "string" ? m.created_at : null)}
                    {isPending ? " · Sending…" : ""}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} className="h-px w-full shrink-0" aria-hidden />
      </div>

      <div className="sticky bottom-0 z-30 shrink-0 bg-white/95 shadow-[0_-6px_24px_-8px_rgba(15,23,42,0.08)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90">
        <SmsReplyComposer
          key={`${conversationId}:${suggestionForMessageId ?? ""}:${composerInitialDraft ?? ""}`}
          conversationId={conversationId}
          initialSuggestion={initialSuggestion}
          suggestionForMessageId={suggestionForMessageId}
          initialDraft={composerInitialDraft}
          workspaceThread
          messagingUX
          onOutboundOptimistic={handleOptimistic}
        />
      </div>

      {belowComposerSlot ? <div className="shrink-0 border-t border-slate-100/80 bg-slate-50/30">{belowComposerSlot}</div> : null}
    </div>
  );
}
