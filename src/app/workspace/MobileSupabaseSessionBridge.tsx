"use client";

import { useEffect } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/**
 * Supplies the Supabase user JWT to the Saintly iOS/Android shell so native code can call
 * `GET /api/softphone/token` with `Authorization: Bearer` (no reliance on WebView cookie jar in RN fetch).
 * Mounted in root layout so login + admin routes (not only `/workspace/*`) can populate SecureStore.
 * Does not affect SMS or generic push flows.
 *
 * Important: we do not post `access_token: null` on every "no session" paint — that would clear RN
 * SecureStore during hydration or on `/login` before Supabase restores the session. We only clear
 * native storage on explicit `SIGNED_OUT`.
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
        console.warn("[SAINTLY-NATIVE-AUTH] webview_bridge_post_session", {
          hasToken: Boolean(access_token),
        });
        bridge.postMessage(JSON.stringify({ type: "saintly-supabase-access-token", access_token }));
      } catch {
        // ignore
      }
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        post(session.access_token);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        post(null);
        return;
      }
      if (session?.access_token) {
        post(session.access_token);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
