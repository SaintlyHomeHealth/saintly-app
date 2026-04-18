"use client";

import { useEffect } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/**
 * Supplies the Supabase user JWT to the Saintly iOS/Android shell so native code can call
 * `GET /api/softphone/token` with `Authorization: Bearer` (no reliance on WebView cookie jar in RN fetch).
 * Workspace-only; does not affect SMS or generic push flows.
 */
export function MobileSupabaseSessionBridge() {
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    const post = (access_token: string | null) => {
      if (typeof window === "undefined") return;
      const bridge = (
        window as unknown as { ReactNativeWebView?: { postMessage: (data: string) => void } }
      ).ReactNativeWebView;
      if (!bridge?.postMessage) return;
      try {
        bridge.postMessage(JSON.stringify({ type: "saintly-supabase-access-token", access_token }));
      } catch {
        // ignore
      }
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      post(session?.access_token ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      post(session?.access_token ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
