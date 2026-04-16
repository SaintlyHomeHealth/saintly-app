"use client";

import { startTransition, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const DEBOUNCE_MS = 450;
/** Fallback if Realtime misses or is delayed; only while tab is visible. */
const POLL_MS = 5000;

/**
 * Scoped to the workspace inbox page: refreshes server components so the rail (order, preview,
 * unread) stays in sync. Active thread still merges new rows via WorkspaceSmsThreadView realtime.
 */
export function WorkspaceInboxLiveClient() {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      startTransition(() => {
        router.refresh();
      });
    }, DEBOUNCE_MS);
  }, [router]);

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
      void supabase.removeChannel(channel);
    };
  }, [scheduleRefresh]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      startTransition(() => {
        router.refresh();
      });
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [router]);

  return null;
}
