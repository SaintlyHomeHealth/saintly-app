"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { SmsReplyComposer } from "@/app/admin/phone/messages/_components/SmsReplyComposer";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export type ThreadMessage = {
  id: string;
  created_at: string | null;
  direction: string;
  body: string | null;
};

const INITIAL_WINDOW = 8;
const WINDOW_STEP = 8;

/** Fallback when realtime is slow or unavailable; safe overlap with focus + postgres listener. */
const POLL_INTERVAL_MS = 12_000;

/** If scroll is within this distance of the bottom, treat as “following” the thread (auto-scroll on new inbound). */
const NEAR_BOTTOM_THRESHOLD_PX = 88;

function parseRealtimeMessage(row: unknown): ThreadMessage | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = r.id;
  if (typeof id !== "string" || !id) return null;
  return {
    id,
    created_at: typeof r.created_at === "string" ? r.created_at : null,
    direction: typeof r.direction === "string" ? r.direction : "",
    body: typeof r.body === "string" ? r.body : null,
  };
}

function sortThreadMessages(rows: ThreadMessage[]): ThreadMessage[] {
  return [...rows].sort((a, b) =>
    String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
  );
}

function mergeThreadById(prev: ThreadMessage[], incoming: ThreadMessage[]): ThreadMessage[] {
  const byId = new Map<string, ThreadMessage>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return sortThreadMessages([...byId.values()]);
}

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
  const [serverMessages, setServerMessages] = useState<ThreadMessage[]>(() => initialMessages);
  const [optimistic, setOptimistic] = useState<ThreadMessage[]>([]);
  const [windowStart, setWindowStart] = useState(() =>
    Math.max(0, initialMessages.length - INITIAL_WINDOW)
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadEarlierPreserveRef = useRef<{ prevHeight: number } | null>(null);
  const nearBottomRef = useRef(true);

  const visibleBase = serverMessages.slice(windowStart);
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

  const updateNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = gap <= NEAR_BOTTOM_THRESHOLD_PX;
  }, []);

  const scrollToBottomIfFollowing = useCallback((behavior: ScrollBehavior) => {
    if (!nearBottomRef.current) return;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }, []);

  const applyIncomingRows = useCallback(
    (incoming: ThreadMessage[], opts: { scroll: "auto-if-following" | "never" }) => {
      setServerMessages((prev) => mergeThreadById(prev, incoming));
      setOptimistic((optPrev) =>
        optPrev.filter((m) => {
          if (!m.id.startsWith("optimistic-")) return true;
          return !incoming.some(
            (row) =>
              String(row.direction).toLowerCase() === "outbound" &&
              String(row.body ?? "").trim() === String(m.body ?? "").trim()
          );
        })
      );
      if (opts.scroll === "auto-if-following") {
        scrollToBottomIfFollowing("smooth");
      }
    },
    [scrollToBottomIfFollowing]
  );

  const fetchLatestMessages = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from("messages")
      .select("id, created_at, direction, body")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error || !data) return;
    const rows: ThreadMessage[] = data.map((row) => ({
      id: String(row.id),
      created_at: typeof row.created_at === "string" ? row.created_at : null,
      direction: typeof row.direction === "string" ? row.direction : "",
      body: typeof row.body === "string" ? row.body : null,
    }));
    applyIncomingRows(rows, { scroll: "auto-if-following" });
  }, [applyIncomingRows, conversationId]);

  useLayoutEffect(() => {
    nearBottomRef.current = true;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ block: "end" });
    });
  }, [conversationId]);

  useEffect(() => {
    if (optimistic.length === 0) return;
    nearBottomRef.current = true;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, [optimistic.length]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`workspace_sms_thread:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = parseRealtimeMessage(payload.new);
          if (!row || !row.id) return;
          applyIncomingRows([row], { scroll: "auto-if-following" });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applyIncomingRows, conversationId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchLatestMessages();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [fetchLatestMessages]);

  useEffect(() => {
    const onFocusOrVisible = () => {
      if (document.visibilityState !== "visible") return;
      void fetchLatestMessages();
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [fetchLatestMessages]);

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
        onScroll={updateNearBottom}
        className="relative min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain px-3 pb-2 pt-3 sm:px-4 sm:pb-3 sm:pt-4"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="mx-auto flex min-h-full w-full max-w-[40rem] flex-col rounded-[1.35rem] border border-slate-200/60 bg-white/92 shadow-[0_1px_0_rgba(255,255,255,0.98)_inset,0_16px_44px_-20px_rgba(15,23,42,0.12)] ring-1 ring-white/70 backdrop-blur-sm">
          {canLoadEarlier ? (
            <div className="flex justify-center px-2 pb-3 pt-3 sm:px-4">
              <button
                type="button"
                onClick={loadEarlier}
                className="rounded-full border border-sky-200/80 bg-white/90 px-4 py-2 text-xs font-semibold text-sky-900 shadow-sm shadow-sky-900/5 ring-1 ring-sky-100/60 transition hover:bg-sky-50/90 active:scale-[0.99]"
              >
                Load earlier messages
              </button>
            </div>
          ) : null}

          <div className="flex flex-1 flex-col justify-end gap-3 px-3.5 pb-3 pt-2 sm:px-6 sm:pb-5">
            {merged.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center sm:py-20">
                <p className="text-base font-medium text-slate-600">No messages yet</p>
                <p className="max-w-xs text-sm leading-relaxed text-slate-500">
                  Start the conversation below — your message appears here right away.
                </p>
              </div>
            ) : (
              merged.map((m) => {
                const inbound = String(m.direction).toLowerCase() === "inbound";
                const isPending = m.id.startsWith("optimistic-");
                const when = formatAdminPhoneWhen(typeof m.created_at === "string" ? m.created_at : null);
                return (
                  <div
                    key={m.id}
                    className={`flex w-full flex-col ${inbound ? "items-start" : "items-end"} gap-1`}
                  >
                    <div
                      className={`max-w-[min(92%,22rem)] rounded-[1.35rem] px-3.5 py-2.5 text-[15px] leading-relaxed tracking-[0.01em] ${
                        inbound
                          ? "rounded-bl-md border border-slate-200/90 bg-white text-slate-900 shadow-md shadow-slate-900/[0.08] ring-1 ring-slate-100/90"
                          : `rounded-br-md bg-gradient-to-br from-sky-500 via-sky-600 to-blue-800 text-white shadow-lg shadow-sky-900/20 ring-1 ring-white/20 ${
                              isPending ? "opacity-90" : ""
                            }`
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{String(m.body ?? "")}</p>
                    </div>
                    <p
                      className={`max-w-[min(92%,24rem)] px-1 text-[10px] font-medium tabular-nums tracking-wide ${
                        inbound ? "text-left text-slate-400" : "text-right text-slate-400"
                      }`}
                    >
                      {when}
                      {isPending ? " · Sending…" : ""}
                    </p>
                  </div>
                );
              })
            )}
          </div>
          <div ref={bottomRef} className="h-2 w-full shrink-0" aria-hidden />
        </div>
      </div>

      <div className="z-20 shrink-0 border-t border-sky-100/80 bg-gradient-to-t from-white via-white to-sky-50/50 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] shadow-[0_-10px_36px_-10px_rgba(30,58,138,0.14),0_-1px_0_rgba(255,255,255,0.9)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90">
        <div className="mx-auto w-full max-w-[40rem] px-3 pt-1 sm:px-4">
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
      </div>

      {belowComposerSlot ? (
        <div className="shrink-0 border-t border-sky-100/50 bg-gradient-to-b from-sky-50/50 to-slate-50/40">
          <div className="mx-auto w-full max-w-[40rem] px-3 pb-1 sm:px-4">{belowComposerSlot}</div>
        </div>
      ) : null}
    </div>
  );
}
