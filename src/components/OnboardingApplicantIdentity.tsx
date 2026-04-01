"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type ApplicantIdentityRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export default function OnboardingApplicantIdentity() {
  const [applicantId, setApplicantId] = useState("");
  const [applicant, setApplicant] = useState<ApplicantIdentityRow | null>(null);

  useEffect(() => {
    const storedApplicantId = window.localStorage.getItem("applicantId") || "";
    setApplicantId(storedApplicantId);
  }, []);

  useEffect(() => {
    if (!applicantId) return;

    let isActive = true;

    supabase
      .from("applicants")
      .select("id, first_name, last_name, email")
      .eq("id", applicantId)
      .maybeSingle<ApplicantIdentityRow>()
      .then(({ data }) => {
        if (!isActive) return;
        setApplicant(data || null);
      });

    return () => {
      isActive = false;
    };
  }, [applicantId]);

  const identityLabel = useMemo(() => {
    const fullName = [applicant?.first_name, applicant?.last_name]
      .filter((value) => Boolean(value?.trim()))
      .join(" ")
      .trim();

    if (fullName) return fullName;
    if (applicant?.email?.trim()) return applicant.email.trim();
    if (applicantId) return applicantId;
    return "";
  }, [applicant, applicantId]);

  if (!identityLabel) return null;

  return (
    <div className="mb-4 flex justify-center">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Onboarding Applicant
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-900">{identityLabel}</div>
      </div>
    </div>
  );
}
