"use client";

import { memo, startTransition, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

import { routePerfClientMark, routePerfEnabled, routePerfRenderCount } from "@/lib/perf/route-perf";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/** Batch rapid postgres events before scheduling RSC work. */
const DEBOUNCE_MS = 550;
/**
 * Cap full `router.refresh()` churn on scoped inbox realtime; trailing refresh preserves eventual consistency.
 */
const MIN_REFRESH_GAP_MS = 2800;

/**
 * Scoped to the workspace inbox page: refreshes server components so the rail (order, preview,
 * unread) stays in sync. Active thread still merges new rows via WorkspaceSmsThreadView realtime.
 */
function WorkspaceInboxLiveClientInner({
  conversationIds,
  selectedConversationId,
}: {
  conversationIds: string[];
  selectedConversationId?: string | null;
}) {
  routePerfRenderCount("WorkspaceInboxLiveClient");
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trailingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAtRef = useRef(0);
  const conversationIdsKey = conversationIds.join("|");
  const scopedIds = useMemo(
    () => [...new Set([...conversationIdsKey.split("|"), selectedConversationId].filter((id): id is string => Boolean(id)))],
    [conversationIdsKey, selectedConversationId]
  );
  const realtimeFilter = useMemo(
    () => (scopedIds.length > 0 ? `conversation_id=in.(${scopedIds.join(",")})` : null),
    [scopedIds]
  );
  const conversationFilter = useMemo(
    () => (scopedIds.length > 0 ? `id=in.(${scopedIds.join(",")})` : null),
    [scopedIds]
  );

  useEffect(() => {
    if (!routePerfEnabled()) return;
    const t0 = performance.now();
    requestAnimationFrame(() => {
      routePerfClientMark("workspace_inbox:live_client_to_raf", t0);
    });
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (trailingRef.current) {
      clearTimeout(trailingRef.current);
      trailingRef.current = null;
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      const fire = () => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") {
          return;
        }
        lastRefreshAtRef.current = Date.now();
        startTransition(() => {
          router.refresh();
        });
      };
      const now = Date.now();
      const elapsed = now - lastRefreshAtRef.current;
      if (lastRefreshAtRef.current === 0 || elapsed >= MIN_REFRESH_GAP_MS) {
        fire();
      } else {
        trailingRef.current = setTimeout(() => {
          trailingRef.current = null;
          if (typeof document !== "undefined" && document.visibilityState !== "visible") {
            return;
          }
          fire();
        }, MIN_REFRESH_GAP_MS - elapsed);
      }
    }, DEBOUNCE_MS);
  }, [router]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [scheduleRefresh]);

  useEffect(() => {
    if (!realtimeFilter && !conversationFilter) {
      return;
    }
    const supabase = createBrowserSupabaseClient();
    let channel = supabase.channel("workspace_inbox_rail_scoped");
    if (realtimeFilter) {
      channel = channel
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: realtimeFilter },
          () => scheduleRefresh()
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages", filter: realtimeFilter },
          () => scheduleRefresh()
        );
    }
    if (conversationFilter) {
      channel = channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: conversationFilter },
        () => scheduleRefresh()
      );
    }
    channel = channel.subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (trailingRef.current) clearTimeout(trailingRef.current);
      void supabase.removeChannel(channel);
    };
  }, [conversationFilter, realtimeFilter, scheduleRefresh]);

  return null;
}

export const WorkspaceInboxLiveClient = memo(WorkspaceInboxLiveClientInner);
