"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { SmsReplyComposer } from "@/app/admin/phone/messages/_components/SmsReplyComposer";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";

export type ThreadMessage = {
  id: string;
  created_at: string | null;
  direction: string;
  body: string | null;
};

type Props = {
  conversationId: string;
  initialMessages: ThreadMessage[];
  initialSuggestion: string | null;
  suggestionForMessageId: string | null;
  composerInitialDraft: string | null;
  /** CRM / details — rendered between the scroll area and the composer. */
  belowMessagesSlot?: ReactNode;
};

export function WorkspaceSmsThreadView({
  conversationId,
  initialMessages,
  initialSuggestion,
  suggestionForMessageId,
  composerInitialDraft,
  belowMessagesSlot,
}: Props) {
  const [optimistic, setOptimistic] = useState<ThreadMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const merged = [...initialMessages, ...optimistic];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [merged.length, optimistic.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [conversationId]);

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
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
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

      {belowMessagesSlot}

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
  );
}
