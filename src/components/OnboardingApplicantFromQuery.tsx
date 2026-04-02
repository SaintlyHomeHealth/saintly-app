"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

const LOCAL_STORAGE_KEY = "applicantId";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Deep-link: /onboarding-welcome?applicant=<uuid> seeds the same localStorage key used across onboarding pages.
 */
export default function OnboardingApplicantFromQuery() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const raw =
      searchParams.get("applicant") ||
      searchParams.get("applicantId") ||
      searchParams.get("a") ||
      "";
    const id = raw.trim();
    if (!id || !UUID_RE.test(id)) return;
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, id);
    } catch {
      /* ignore quota / private mode */
    }
  }, [searchParams]);

  return null;
}
