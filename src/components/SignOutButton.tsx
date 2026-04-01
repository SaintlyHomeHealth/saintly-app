"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const defaultClassName =
  "rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export type SignOutButtonProps = {
  /** Merges with defaults; omit to use the unauthorized-page styling. */
  className?: string;
  /** Button label (default matches legacy unauthorized copy). */
  label?: string;
};

/**
 * Single sign-out control: `createBrowserSupabaseClient` → `auth.signOut()` → `/login`.
 * Used by unauthorized, workspace shell, and admin surfaces.
 */
export function SignOutButton({ className, label = "Sign out" }: SignOutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const merged = className && className.trim() !== "" ? className.trim() : defaultClassName;

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={loading}
      className={merged}
    >
      {loading ? "Signing out…" : label}
    </button>
  );
}
