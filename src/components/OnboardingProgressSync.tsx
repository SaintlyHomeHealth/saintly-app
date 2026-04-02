"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { syncOnboardingProgressForApplicant } from "@/lib/onboarding/sync-progress";
import { supabase } from "@/lib/supabase/client";

type Props = {
  /** True on welcome step: counts as starting the portal session. */
  sessionStarted?: boolean;
};

/**
 * Keeps `onboarding_status` progress columns in sync with saved artifacts (non-blocking).
 */
export default function OnboardingProgressSync({ sessionStarted = false }: Props) {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const id = window.localStorage.getItem("applicantId") || "";
      if (!id || cancelled) return;
      void syncOnboardingProgressForApplicant(supabase, id, { sessionStarted });
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pathname, sessionStarted]);

  return null;
}
