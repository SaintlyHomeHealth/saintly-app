"use client";

import { startTransition, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/** Batch rapid postgres events before scheduling RSC work. */
const DEBOUNCE_MS = 550;
/**
 * Cap full `router.refresh()` churn: the client subscribes to ALL org `messages` rows, so busy SMS
 * traffic can otherwise schedule back-to-back RSC reloads. Trailing refresh preserves eventual consistency.
 */
const MIN_REFRESH_GAP_MS = 2800;

/**
 * Scoped to the workspace inbox page: refreshes server components so the rail (order, preview,
 * unread) stays in sync. Active thread still merges new rows via WorkspaceSmsThreadView realtime.
 */
export function WorkspaceInboxLiveClient() {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trailingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRefreshAtRef = useRef(0);

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
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel("workspace_inbox_rail")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => scheduleRefresh()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        () => scheduleRefresh()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        () => scheduleRefresh()
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (trailingRef.current) clearTimeout(trailingRef.current);
      void supabase.removeChannel(channel);
    };
  }, [scheduleRefresh]);

  return null;
}
