import type { SupabaseClient } from "@supabase/supabase-js";

import { EmploymentClassification } from "@/lib/employee-contracts";
import { getTaxFormTypeForClassification } from "@/lib/employee-tax-forms";
import {
  buildOnboardingPortalStatus,
  ONBOARDING_PORTAL_FORMS_SELECT,
} from "@/lib/onboarding/portal-documents-status";
import { calculateTrainingCompletionSummary } from "@/lib/onboarding/training-status";

import {
  applyStartedFloor,
  deriveOnboardingProgress,
  type OnboardingFlowStatus,
} from "./derive-progress";

function mergeFlowStatus(
  prev: OnboardingFlowStatus,
  derived: OnboardingFlowStatus
): OnboardingFlowStatus {
  const rank: Record<OnboardingFlowStatus, number> = {
    not_started: 0,
    started: 1,
    in_progress: 2,
    completed: 3,
  };
  if (prev === "completed" || derived === "completed") return "completed";
  return rank[derived] > rank[prev] ? derived : prev;
}

/** Exported for admin diagnostics and unified onboarding state (core pipeline: application → documents → contracts/tax → training). */
export async function getCoreOnboardingPipelineInputs(
  supabase: SupabaseClient,
  applicantId: string
) {
  return loadProgressInputs(supabase, applicantId);
}

async function loadProgressInputs(supabase: SupabaseClient, applicantId: string) {
  const { data: employeeContractData } = await supabase
    .from("employee_contracts")
    .select("employment_classification")
    .eq("applicant_id", applicantId)
    .eq("is_current", true)
    .maybeSingle<{ employment_classification: EmploymentClassification }>();

  const requiredTaxFormType = getTaxFormTypeForClassification(
    employeeContractData?.employment_classification || null
  );

  let taxQuery = supabase
    .from("employee_tax_forms")
    .select("form_status, employee_signed_name, employee_signed_at, form_type")
    .eq("applicant_id", applicantId)
    .eq("is_current", true);

  if (requiredTaxFormType) {
    taxQuery = taxQuery.eq("form_type", requiredTaxFormType);
  }

  const [
    { data: filesData },
    { data: documentsData },
    { data: onboardingStatusRow },
    { data: onboardingContractsRow },
    { data: taxRow },
    { data: trainingModulesData },
    { data: trainingAttemptData },
    { data: trainingCompletionData },
  ] = await Promise.all([
    supabase.from("applicant_files").select("id").eq("applicant_id", applicantId),
    supabase.from("documents").select("id, document_type").eq("applicant_id", applicantId),
    supabase
      .from("onboarding_status")
      .select("application_completed")
      .eq("applicant_id", applicantId)
      .maybeSingle<{ application_completed?: boolean | null }>(),
    supabase
      .from("onboarding_contracts")
      .select(ONBOARDING_PORTAL_FORMS_SELECT)
      .eq("applicant_id", applicantId)
      .maybeSingle(),
    taxQuery.maybeSingle(),
    supabase
      .from("training_modules")
      .select("id, key, pass_score")
      .order("sort_order", { ascending: true }),
    supabase
      .from("employee_training_attempts")
      .select("module_id, score, passed")
      .eq("applicant_id", applicantId),
    supabase
      .from("employee_training_completions")
      .select("module_id, score, passed")
      .eq("applicant_id", applicantId),
  ]);

  const uploadedTypes = new Set(
    (documentsData || []).map((d) => String(d.document_type || "").toLowerCase().trim())
  );

  const isApplicationComplete = onboardingStatusRow?.application_completed === true;

  const portalStatus = buildOnboardingPortalStatus({
    documentKeys: uploadedTypes,
    onboardingForms: onboardingContractsRow,
    hasLegacyApplicantFileFallback: (filesData?.length || 0) > 0,
    resumeUrl: null,
  });

  const taxOk =
    !requiredTaxFormType ||
    Boolean(
      taxRow &&
        (taxRow.form_status === "completed" ||
          (String(taxRow.employee_signed_name || "").trim() && taxRow.employee_signed_at))
    );

  const isContractsComplete = Boolean(onboardingContractsRow?.completed && taxOk);

  const trainingSummary = calculateTrainingCompletionSummary({
    modules: (trainingModulesData || []) as Array<{
      id: string;
      key?: string | null;
      pass_score?: number | null;
    }>,
    attempts: (trainingAttemptData || []) as Array<{
      module_id: string;
      score?: number | null;
      passed?: boolean | null;
    }>,
    completions: (trainingCompletionData || []) as Array<{
      module_id: string;
      score?: number | null;
      passed?: boolean | null;
    }>,
  });

  return {
    applicationCompleted: isApplicationComplete,
    documentsComplete: portalStatus.documentsStepComplete,
    contractsAndTaxComplete: isContractsComplete,
    trainingComplete: trainingSummary.isComplete,
  };
}

/**
 * Reconciles onboarding_status progress columns from current artifacts (idempotent).
 * Does not modify invite columns.
 */
export async function syncOnboardingProgressForApplicant(
  supabase: SupabaseClient,
  applicantId: string,
  options?: { sessionStarted?: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!applicantId) {
    return { ok: false, error: "Missing applicant id" };
  }

  try {
    const [{ data: existing }, inputs] = await Promise.all([
      supabase
        .from("onboarding_status")
        .select(
          "application_completed, current_step, onboarding_started_at, onboarding_progress_percent, onboarding_flow_status, onboarding_completed_at"
        )
        .eq("applicant_id", applicantId)
        .maybeSingle<{
          application_completed?: boolean | null;
          current_step?: number | null;
          onboarding_started_at?: string | null;
          onboarding_progress_percent?: number | null;
          onboarding_flow_status?: string | null;
          onboarding_completed_at?: string | null;
        }>(),
      loadProgressInputs(supabase, applicantId),
    ]);

    let snap = deriveOnboardingProgress(inputs);
    snap = applyStartedFloor(snap, Boolean(options?.sessionStarted));

    const now = new Date().toISOString();

    const prevFlow = (existing?.onboarding_flow_status || "not_started") as OnboardingFlowStatus;
    const nextFlow = mergeFlowStatus(prevFlow, snap.flowStatus);

    const mergedPercent = Math.max(
      snap.percent,
      typeof existing?.onboarding_progress_percent === "number"
        ? existing.onboarding_progress_percent
        : 0
    );

    const startedAt =
      existing?.onboarding_started_at ||
      (mergedPercent > 0 || options?.sessionStarted ? now : null);

    const completedAt =
      snap.overallComplete
        ? existing?.onboarding_completed_at || now
        : existing?.onboarding_completed_at || null;

    const applicationCompleted =
      Boolean(existing?.application_completed) || inputs.applicationCompleted;

    const priorStep = typeof existing?.current_step === "number" ? existing.current_step : 0;
    const currentStep = Math.max(priorStep, applicationCompleted ? 3 : priorStep > 0 ? priorStep : 1);

    const progressPatch = {
      application_completed: applicationCompleted,
      current_step: currentStep,
      onboarding_progress_percent: mergedPercent,
      onboarding_flow_status: nextFlow,
      onboarding_started_at: startedAt,
      onboarding_completed_at: completedAt,
      onboarding_last_activity_at: now,
    };

    if (existing) {
      const { error } = await supabase
        .from("onboarding_status")
        .update(progressPatch)
        .eq("applicant_id", applicantId);
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true };
    }

    const { error: insertError } = await supabase.from("onboarding_status").insert({
      applicant_id: applicantId,
      ...progressPatch,
    });
    if (insertError) {
      return { ok: false, error: insertError.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
