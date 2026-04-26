"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  VoicemailThreadMessageRow,
  type VoicemailThreadDetail,
} from "@/app/workspace/phone/inbox/_components/VoicemailThreadMessageRow";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { extractSmsProviderStatusRaw, formatSmsOutboundDeliveryLabel } from "@/lib/phone/sms-delivery-ui";
import {
  mergeThreadById,
  WORKSPACE_SMS_THREAD_INITIAL_MESSAGE_LIMIT,
  type WorkspaceSmsThreadMessage,
} from "@/lib/phone/workspace-sms-thread-messages";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const SmsReplyComposer = dynamic(
  () => import("@/app/admin/phone/messages/_components/SmsReplyComposer").then((m) => m.SmsReplyComposer),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-14 w-full max-w-full animate-pulse rounded-xl border border-slate-200/80 bg-slate-100/80"
        aria-hidden
      />
    ),
  }
);

export type ThreadMessage = WorkspaceSmsThreadMessage;

const INITIAL_WINDOW = 8;
const WINDOW_STEP = 8;

/** Fallback when realtime is slow or unavailable (realtime + visibility debounce are primary). */
const POLL_INTERVAL_MS = 50_000;

const VISIBILITY_REFETCH_DEBOUNCE_MS = 450;

/** If scroll is within this distance of the bottom, treat as “following” the thread (auto-scroll on new inbound). */
const NEAR_BOTTOM_THRESHOLD_PX = 88;

type MessageRowish = { metadata?: unknown; direction?: unknown; status?: unknown };

function parseRealtimeMessage(row: unknown): ThreadMessage | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = r.id;
  if (typeof id !== "string" || !id) return null;
  const phoneCallIdRaw = r.phone_call_id;
  const phone_call_id =
    phoneCallIdRaw != null && String(phoneCallIdRaw).trim() !== "" ? String(phoneCallIdRaw).trim() : null;
  const mt = r.message_type;
  const message_type = typeof mt === "string" && mt.trim() ? mt.trim() : "sms";
  const direction = typeof r.direction === "string" ? r.direction : "";
  const raw =
    String(direction).toLowerCase() === "outbound"
      ? extractSmsProviderStatusRaw(r as MessageRowish)
      : null;
  return {
    id,
    created_at: typeof r.created_at === "string" ? r.created_at : null,
    direction,
    body: typeof r.body === "string" ? r.body : null,
    message_type,
    phone_call_id,
    outbound_status_raw: raw,
  };
}

/** Align optimistic bubble text with persisted outbound (trim + strip zero-width chars). */
function normalizeBodyForMatch(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/\u200b/g, "")
    .trim();
}

const ThreadMessageRow = memo(
  function ThreadMessageRow({ message: m }: { message: ThreadMessage }) {
    const inbound = String(m.direction).toLowerCase() === "inbound";
    const isPending = m.id.startsWith("optimistic-");
    const when = formatAdminPhoneWhen(typeof m.created_at === "string" ? m.created_at : null);
    const deliveryLabel = inbound
      ? null
      : formatSmsOutboundDeliveryLabel(m.outbound_status_raw ?? null, { isOptimistic: isPending });

    return (
      <div
        className={`flex w-full flex-col ${inbound ? "items-start" : "items-end"} gap-0.5 sm:gap-1`}
      >
        <div
          className={`max-w-[min(92%,22rem)] rounded-[1.05rem] text-[15px] leading-[1.42] tracking-[0.01em] sm:rounded-[1.25rem] ${
            inbound
              ? "rounded-bl-md border border-slate-200/70 bg-white px-3 pb-2 pt-2.5 text-slate-900 [overflow-wrap:anywhere] isolate sm:shadow-[0_1px_2px_rgba(15,23,42,0.05)] sm:px-4 sm:pb-2.5 sm:pt-3"
              : `rounded-br-md bg-gradient-to-br from-sky-500 via-sky-600 to-blue-800 px-3 py-1.5 text-white shadow-sm shadow-sky-900/12 ring-1 ring-white/15 sm:px-3.5 sm:py-2.5 sm:shadow-md ${
                  isPending ? "opacity-90" : ""
                }`
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{String(m.body ?? "")}</p>
        </div>
        <p
          className={`px-1 text-[10px] font-medium tabular-nums tracking-wide ${
            inbound ? "text-left text-slate-400" : "text-right text-slate-400"
          }`}
        >
          {when}
          {deliveryLabel ? ` · ${deliveryLabel}` : ""}
        </p>
      </div>
    );
  },
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.created_at === next.message.created_at &&
    prev.message.direction === next.message.direction &&
    prev.message.body === next.message.body &&
    (prev.message.message_type ?? null) === (next.message.message_type ?? null) &&
    (prev.message.phone_call_id ?? null) === (next.message.phone_call_id ?? null) &&
    (prev.message.outbound_status_raw ?? null) === (next.message.outbound_status_raw ?? null)
);

type Props = {
  conversationId: string;
  initialMessages: ThreadMessage[];
  /** Server-loaded transcript/duration for voicemail rows (keyed by phone_call_id). */
  voicemailDetailByCallId?: Record<string, VoicemailThreadDetail>;
  initialSuggestion: string | null;
  suggestionForMessageId: string | null;
  composerInitialDraft: string | null;
  /** Locked outbound line for this thread (server). */
  smsPreferredFromE164?: string | null;
  /** True when the backup long code in `smsPreferredFromE164` was set by an explicit Text-from pick. */
  smsPreferredFromExplicit?: boolean;
  /** Latest inbound Twilio `To` (display / diagnostics only; default send uses primary). */
  smsInboundToE164?: string | null;
  /** CRM / thread tools — above the message list so the composer stays bottom-pinned. */
  threadTopSlot?: ReactNode;
  /** Desktop inbox 3-pane: full-width thread column, no max-width card feel. */
  appDesktopSplit?: boolean;
  /** Embedded CRM threads should update themselves without refreshing the whole lead page. */
  refreshPageOnSend?: boolean;
};

export function WorkspaceSmsThreadView({
  conversationId,
  initialMessages,
  voicemailDetailByCallId = {},
  initialSuggestion,
  suggestionForMessageId,
  composerInitialDraft,
  smsPreferredFromE164,
  smsPreferredFromExplicit = false,
  smsInboundToE164,
  threadTopSlot,
  appDesktopSplit = false,
  refreshPageOnSend = true,
}: Props) {
  const router = useRouter();
  const [sendError, setSendError] = useState<string | null>(null);
  const [serverMessages, setServerMessages] = useState<ThreadMessage[]>(() => initialMessages);
  const [optimistic, setOptimistic] = useState<ThreadMessage[]>([]);
  const [windowStart, setWindowStart] = useState(() =>
    Math.max(0, initialMessages.length - INITIAL_WINDOW)
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadEarlierPreserveRef = useRef<{ prevHeight: number } | null>(null);
  const nearBottomRef = useRef(true);
  /** Reuse one browser client for thread fetch + realtime (avoids repeated client setup per poll). */
  const supabaseRef = useRef<ReturnType<typeof createBrowserSupabaseClient> | null>(null);
  const visibilityFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleBase = useMemo(() => serverMessages.slice(windowStart), [serverMessages, windowStart]);
  const merged = useMemo(() => [...visibleBase, ...optimistic], [visibleBase, optimistic]);

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
              normalizeBodyForMatch(row.body) === normalizeBodyForMatch(m.body)
          );
        })
      );
      if (opts.scroll === "auto-if-following") {
        scrollToBottomIfFollowing("auto");
      }
    },
    [scrollToBottomIfFollowing]
  );

  const fetchLatestMessages = useCallback(async (): Promise<boolean> => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return false;
    }
    if (!supabaseRef.current) supabaseRef.current = createBrowserSupabaseClient();
    const supabase = supabaseRef.current;
    const { data, error } = await supabase
      .from("messages")
      .select("id, created_at, direction, body, phone_call_id, message_type, metadata")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(WORKSPACE_SMS_THREAD_INITIAL_MESSAGE_LIMIT);
    if (error || !data) return false;
    const rows: ThreadMessage[] = [...data].reverse().map((row) => {
      const pid =
        (row as { phone_call_id?: unknown }).phone_call_id != null &&
        String((row as { phone_call_id?: unknown }).phone_call_id).trim() !== ""
          ? String((row as { phone_call_id?: unknown }).phone_call_id).trim()
          : null;
      const mtRaw = (row as { message_type?: unknown }).message_type;
      const message_type =
        typeof mtRaw === "string" && mtRaw.trim() ? mtRaw.trim() : "sms";
      const direction = typeof row.direction === "string" ? row.direction : "";
      const outbound_status_raw =
        String(direction).toLowerCase() === "outbound"
          ? extractSmsProviderStatusRaw(row as { metadata?: unknown; direction?: string })
          : null;
      return {
        id: String(row.id),
        created_at: typeof row.created_at === "string" ? row.created_at : null,
        direction,
        body: typeof row.body === "string" ? row.body : null,
        message_type,
        phone_call_id: pid,
        outbound_status_raw,
      };
    });
    applyIncomingRows(rows, { scroll: "auto-if-following" });
    return true;
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
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    });
  }, [optimistic.length]);

  useEffect(() => {
    if (!supabaseRef.current) supabaseRef.current = createBrowserSupabaseClient();
    const supabase = supabaseRef.current;
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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const raw = payload.new as Record<string, unknown> | null;
          const id = raw && typeof raw.id === "string" ? raw.id : "";
          if (!id) return;
          const del = raw?.deleted_at;
          if (del != null && String(del).trim() !== "") {
            setServerMessages((prev) => prev.filter((m) => m.id !== id));
            return;
          }
          const row = parseRealtimeMessage(payload.new);
          if (!row) return;
          applyIncomingRows([row], { scroll: "never" });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applyIncomingRows, conversationId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchLatestMessages();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [fetchLatestMessages]);

  useEffect(() => {
    const scheduleRefetch = () => {
      if (document.visibilityState !== "visible") return;
      if (visibilityFetchTimerRef.current) clearTimeout(visibilityFetchTimerRef.current);
      visibilityFetchTimerRef.current = setTimeout(() => {
        visibilityFetchTimerRef.current = null;
        void fetchLatestMessages();
      }, VISIBILITY_REFETCH_DEBOUNCE_MS);
    };
    window.addEventListener("focus", scheduleRefetch);
    document.addEventListener("visibilitychange", scheduleRefetch);
    return () => {
      window.removeEventListener("focus", scheduleRefetch);
      document.removeEventListener("visibilitychange", scheduleRefetch);
      if (visibilityFetchTimerRef.current) clearTimeout(visibilityFetchTimerRef.current);
    };
  }, [fetchLatestMessages]);

  const handleOptimistic = useCallback((body: string) => {
    const id = `optimistic-${Date.now()}`;
    setOptimistic((prev) => [
      ...prev,
      {
        id,
        created_at: new Date().toISOString(),
        direction: "outbound",
        body,
        message_type: "sms",
        phone_call_id: null,
        outbound_status_raw: null,
      },
    ]);
  }, []);

  const removeLastOptimistic = useCallback(() => {
    setOptimistic((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].id.startsWith("optimistic-")) {
          return [...prev.slice(0, i), ...prev.slice(i + 1)];
        }
      }
      return prev;
    });
  }, []);

  const handleInPlaceSendComplete = useCallback(async () => {
    setSendError(null);
    const ok = await fetchLatestMessages();
    if (ok) {
      setOptimistic((prev) => prev.filter((m) => !m.id.startsWith("optimistic-")));
    }
    if (refreshPageOnSend) {
      startTransition(() => {
        router.refresh();
      });
    }
  }, [router, fetchLatestMessages, refreshPageOnSend]);

  const handleInPlaceSendError = useCallback((msg: string) => {
    setSendError(msg);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {threadTopSlot ? (
        <div
          className={`shrink-0 border-b border-slate-200/60 bg-white px-2 py-1 sm:px-3 sm:py-1.5 ${
            appDesktopSplit ? "lg:border-slate-200 lg:px-3 lg:py-1.5" : ""
          }`}
        >
          <div className={`mx-auto w-full ${appDesktopSplit ? "max-w-none" : "max-w-[40rem]"}`}>
            {threadTopSlot}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={updateNearBottom}
        className="relative min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div
          className={`mx-auto flex w-full flex-col px-3 pb-0.5 pt-1.5 sm:px-4 sm:pb-3 sm:pt-3 ${
            merged.length === 0 ? "min-h-0" : "min-h-full"
          } ${
            appDesktopSplit ? "max-w-none px-3 pt-1 sm:px-3 sm:pb-2 sm:pt-2 lg:px-3 lg:pb-1 lg:pt-1" : "max-w-[40rem]"
          }`}
        >
          {canLoadEarlier ? (
            <div className="flex shrink-0 justify-center pb-3 pt-1">
              <button
                type="button"
                onClick={loadEarlier}
                className="rounded-full border border-sky-200/80 bg-white/90 px-4 py-2 text-xs font-semibold text-sky-900 shadow-sm shadow-sky-900/5 ring-1 ring-sky-100/60 transition hover:bg-sky-50/90 active:scale-[0.99]"
              >
                Load earlier messages
              </button>
            </div>
          ) : null}

          <div
            className={`flex flex-col gap-1 pb-0.5 sm:gap-2 sm:pb-1 ${
              merged.length === 0 ? "" : "min-h-0 flex-1 justify-end"
            }`}
          >
            {merged.length === 0 ? (
              <div className="flex flex-col items-center justify-start gap-1.5 px-2 pb-2 pt-2 text-center sm:pt-3">
                <p className="text-sm font-medium text-slate-600">No messages yet</p>
                <p className="max-w-xs text-xs leading-relaxed text-slate-500">
                  Type below — your message shows up here right away.
                </p>
              </div>
            ) : (
              merged.map((m) => {
                const isVm =
                  String(m.message_type ?? "sms") === "voicemail" &&
                  m.phone_call_id != null &&
                  String(m.phone_call_id).trim() !== "";
                if (isVm && m.phone_call_id) {
                  const detail = voicemailDetailByCallId[m.phone_call_id];
                  return (
                    <VoicemailThreadMessageRow
                      key={m.id}
                      conversationId={conversationId}
                      messageId={m.id}
                      phoneCallId={m.phone_call_id}
                      createdAt={m.created_at}
                      body={m.body}
                      detail={detail}
                      appDesktopSplit={appDesktopSplit}
                    />
                  );
                }
                return <ThreadMessageRow key={m.id} message={m} />;
              })
            )}
            <div ref={bottomRef} className="h-px w-full shrink-0" aria-hidden />
          </div>
        </div>
      </div>

      <div
        className={`z-20 shrink-0 border-t border-slate-200/80 bg-white pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-0.5 backdrop-blur-md supports-[backdrop-filter]:bg-white/95 ${
          appDesktopSplit
            ? "border-slate-200 shadow-none lg:pt-1 lg:pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
            : ""
        }`}
      >
        <div
          className={`mx-auto w-full px-2.5 sm:px-4 ${appDesktopSplit ? "max-w-none lg:px-3" : "max-w-[40rem]"}`}
        >
          {sendError ? (
            <div
              role="alert"
              className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950"
            >
              {sendError}
            </div>
          ) : null}
          <SmsReplyComposer
            key={`${conversationId}:${suggestionForMessageId ?? "none"}`}
            conversationId={conversationId}
            initialSuggestion={initialSuggestion}
            suggestionForMessageId={suggestionForMessageId}
            initialDraft={composerInitialDraft}
            smsPreferredFromE164={smsPreferredFromE164}
            smsPreferredFromExplicit={smsPreferredFromExplicit}
            smsInboundToE164={smsInboundToE164}
            workspaceThread
            workspaceInboxSplit={appDesktopSplit}
            messagingUX
            onOutboundOptimistic={handleOptimistic}
            onInPlaceSendComplete={handleInPlaceSendComplete}
            onRemoveLastOptimistic={removeLastOptimistic}
            onInPlaceSendError={handleInPlaceSendError}
          />
        </div>
      </div>
    </div>
  );
}
