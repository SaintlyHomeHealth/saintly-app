import { deriveOnboardingProgress } from "./derive-progress";
import type { EmployeeDetailWorkAreaTab } from "@/lib/employee-requirements/employee-detail-work-areas";

/**
 * Single source of truth for onboarding + personnel-file gating in the admin UI.
 * Drives the employee detail “command center” and can be re-used by APIs.
 */

export type OnboardingStepCategory =
  | "profile"
  | "documents"
  | "payroll"
  | "training"
  | "compliance"
  | "gate";

export type OnboardingStepKey =
  | "pipeline_application"
  | "pipeline_documents"
  | "pipeline_contracts_tax"
  | "pipeline_training"
  | "system_sync"
  | "file_skills"
  | "file_performance"
  | "file_tb"
  | "file_oig"
  | "file_background"
  | "credential_bundle";

export type UnifiedStepStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "complete"
  | "invalid"
  | "needs_review";

export type OnboardingStepRecord = {
  key: OnboardingStepKey;
  label: string;
  category: OnboardingStepCategory;
  required: boolean;
  status: UnifiedStepStatus;
  displayStatus: string;
  countsTowardPipelineComplete: boolean;
  countsTowardSurveyComplete: boolean;
  blocking: boolean;
  lastUpdatedAt: string | null;
  failureReason: string | null;
  adminCoaching: string;
  whyBlocking: string | null;
  /** Employee onboarding app path with applicant query (seeds localStorage). */
  employeeViewHref: string | null;
  /** Admin page anchor or form link. */
  adminViewHref: string;
  /** Raw inputs for the debug table */
  raw: Record<string, string | boolean | null>;
};

export type AdminOnboardingOverallStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "ready_for_review"
  | "complete";

export type UnifiedOnboardingSnapshot = {
  overallStatus: AdminOnboardingOverallStatus;
  percentComplete: number;
  lastActivityAt: string | null;
  lastEmployeeActionLabel: string;
  adminActionRequired: boolean;
  corePipelineComplete: boolean;
  surveyPacketComplete: boolean;
  serverReportsComplete: boolean;
  hasSyncMismatch: boolean;
  steps: OnboardingStepRecord[];
  blockingSteps: OnboardingStepRecord[];
};

/** Safe default when derive throws (avoid white-screening admin employee detail). */
export function fallbackUnifiedOnboardingSnapshot(): UnifiedOnboardingSnapshot {
  return {
    overallStatus: "not_started",
    percentComplete: 0,
    lastActivityAt: null,
    lastEmployeeActionLabel: "Unavailable",
    adminActionRequired: true,
    corePipelineComplete: false,
    surveyPacketComplete: false,
    serverReportsComplete: false,
    hasSyncMismatch: false,
    steps: [],
    blockingSteps: [],
  };
}

const EMPLOYEE_BASE = (applicantId: string, path: string) =>
  `${path}?applicant=${encodeURIComponent(applicantId)}`;

function mapBoolToStatus(
  done: boolean,
  opts: { inProgress?: boolean; needsReview?: boolean; invalid?: boolean }
): { status: UnifiedStepStatus; display: string } {
  if (done) return { status: "complete", display: "Complete" };
  if (opts.invalid) return { status: "invalid", display: "Invalid" };
  if (opts.needsReview) return { status: "needs_review", display: "Needs review" };
  if (opts.inProgress) return { status: "in_progress", display: "In progress" };
  return { status: "not_started", display: "Missing" };
}

export type BuildUnifiedOnboardingStateInput = {
  applicantId: string;
  /** From onboarding_status row */
  onboardingStatus: {
    application_completed?: boolean | null;
    onboarding_progress_percent?: number | null;
    onboarding_flow_status?: string | null;
    onboarding_started_at?: string | null;
    onboarding_completed_at?: string | null;
    onboarding_last_activity_at?: string | null;
  } | null;
  /** Core gates (same meaning as sync-progress / deriveOnboardingProgress). */
  isApplicationComplete: boolean;
  isDocumentsComplete: boolean;
  isContractsComplete: boolean;
  isTaxFormSigned: boolean;
  isTrainingComplete: boolean;
  /** Heuristics for in-progress (uploads and/or required portal forms started). */
  hasSomeDocumentUpload: boolean;
  hasTrainingProgressButNotComplete: boolean;
  /** Onboarding contract wizard completed (without tax) */
  onboardingContractCompleted: boolean;
  /** Personnel / survey (existing page semantics). */
  isSkillsComplete: boolean;
  isPerformanceComplete: boolean;
  hasTbDocumentation: boolean;
  /** Compliance-cycle OIG complete (event). */
  isOigComplete: boolean;
  /**
   * When true, uploaded OIG proof (`oig` / `oig_check`) satisfies survey packet + action-required OIG step
   * even if the annual compliance event is not closed.
   */
  hasOigProofOnFile?: boolean;
  hasBackgroundCheck: boolean;
  hasCprCard: boolean;
  hasDriversLicense: boolean;
  hasFingerprintCard: boolean;
  requiresCpr: boolean;
  requiresDriversLicense: boolean;
  requiresFingerprintCard: boolean;
  /** Pre-formatted display names for missing required credentials. */
  missingCredentialDisplayNames: string[];
  skillsFormIsDraft: boolean;
  isSurveyReady: boolean;
  /**
   * Sales-facing roles: skip heavy clinical onboarding steps for progress derivation and step blocking
   * (see `getRequiredCredentialTypesForApplicant` / sales band in personnel-file requirements).
   */
  salesAgentLightCompliance?: boolean;
  /**
   * When true with salesAgentLightCompliance, progress % ignores incomplete onboarding documents.
   */
  treatPipelineDocumentsAsCompleteForProgress?: boolean;
  /**
   * When true with salesAgentLightCompliance, progress % ignores incomplete onboarding training.
   */
  treatPipelineTrainingAsCompleteForProgress?: boolean;
  /**
   * Deep links to real employee-detail work areas (`?tab=`), not hash-only URLs.
   * SINGLE SOURCE with `buildPersonnelFileAuditRows` + personnel requirements.
   */
  getAdminWorkAreaUrl: (tab: EmployeeDetailWorkAreaTab) => string;
  /** Direct link to admin Skills Competency form (short path under /skills-competency). */
  skillsCompetencyAdminHref: string;
  /** Direct link to admin Performance Evaluation form (short path under /performance-evaluation). */
  performanceEvaluationAdminHref: string;
};

export function buildUnifiedOnboardingState(
  input: BuildUnifiedOnboardingStateInput
): UnifiedOnboardingSnapshot {
  const {
    applicantId,
    onboardingStatus,
    isApplicationComplete,
    isDocumentsComplete,
    isContractsComplete,
    isTaxFormSigned,
    isTrainingComplete,
    hasSomeDocumentUpload,
    hasTrainingProgressButNotComplete,
    onboardingContractCompleted,
    isSkillsComplete,
    isPerformanceComplete,
    hasTbDocumentation,
    isOigComplete,
    hasOigProofOnFile = false,
    hasBackgroundCheck,
    hasCprCard,
    hasDriversLicense,
    hasFingerprintCard,
    requiresCpr,
    requiresDriversLicense,
    requiresFingerprintCard,
    missingCredentialDisplayNames,
    skillsFormIsDraft,
    isSurveyReady,
    salesAgentLightCompliance,
    treatPipelineDocumentsAsCompleteForProgress,
    treatPipelineTrainingAsCompleteForProgress,
    getAdminWorkAreaUrl,
    skillsCompetencyAdminHref,
    performanceEvaluationAdminHref,
  } = input;

  const salesLight = salesAgentLightCompliance === true;
  const documentsCompleteForProgress =
    treatPipelineDocumentsAsCompleteForProgress && salesLight ? true : isDocumentsComplete;
  const trainingCompleteForProgress =
    treatPipelineTrainingAsCompleteForProgress && salesLight ? true : isTrainingComplete;

  const coreInputs = {
    applicationCompleted: isApplicationComplete,
    documentsComplete: documentsCompleteForProgress,
    contractsAndTaxComplete: isContractsComplete,
    trainingComplete: trainingCompleteForProgress,
  };

  const derived = deriveOnboardingProgress(coreInputs);
  const percentFromDerivation = derived.percent;
  const storedPercent = onboardingStatus?.onboarding_progress_percent;
  const percentComplete = Math.max(
    typeof storedPercent === "number" ? storedPercent : 0,
    percentFromDerivation
  );

  const serverCompletedAt = onboardingStatus?.onboarding_completed_at;
  const serverReportsComplete = Boolean(serverCompletedAt) || percentComplete >= 100;
  const corePipelineComplete = derived.overallComplete;

  /** onboarding_status can lag artifacts or be stamped early — surface for admins. */
  const hasSyncMismatch =
    (corePipelineComplete && !serverCompletedAt) ||
    (!corePipelineComplete && Boolean(serverCompletedAt));

  const lastActivityAt = onboardingStatus?.onboarding_last_activity_at ?? null;
  const lastEmployeeActionLabel = lastActivityAt
    ? "Last portal activity (synced to onboarding status)"
    : onboardingStatus?.onboarding_started_at
      ? "Onboarding started (no recent activity recorded)"
      : "No recorded portal activity yet";

  const steps: OnboardingStepRecord[] = [];

  // --- Core pipeline
  {
    const m = mapBoolToStatus(isApplicationComplete, {});
    steps.push({
      key: "pipeline_application",
      label: "Application (portal)",
      category: "profile",
      required: true,
      status: m.status,
      displayStatus: m.display,
      countsTowardPipelineComplete: true,
      countsTowardSurveyComplete: true,
      blocking: !isApplicationComplete,
      lastUpdatedAt: null,
      failureReason: isApplicationComplete ? null : "application_completed is not true in onboarding_status",
      adminCoaching: "Have them open the application step, save, and finish all required fields; confirm “mark complete” on the application if your flow uses it.",
      whyBlocking: isApplicationComplete
        ? null
        : "The portal has not recorded a completed application (onboarding_status.application_completed).",
      employeeViewHref: EMPLOYEE_BASE(applicantId, "/onboarding-application"),
      adminViewHref: getAdminWorkAreaUrl("overview"),
      raw: { application_completed: isApplicationComplete },
    });
  }

  {
    const inProg = hasSomeDocumentUpload && !isDocumentsComplete;
    const m = mapBoolToStatus(isDocumentsComplete, { inProgress: inProg });
    steps.push({
      key: "pipeline_documents",
      label: "Required documents & portal forms",
      category: "documents",
      required: !salesLight,
      status: salesLight ? "complete" : m.status,
      displayStatus: salesLight ? "N/A" : m.display,
      countsTowardPipelineComplete: true,
      countsTowardSurveyComplete: !salesLight,
      blocking: !salesLight && !isDocumentsComplete,
      lastUpdatedAt: null,
      failureReason:
        salesLight || isDocumentsComplete
          ? null
          : inProg
            ? "Not all required document types are present in documents / applicant files."
            : "Required document uploads or portal forms are still incomplete.",
      adminCoaching:
        "Ask them to finish Step 3 completely. Resume, ID, SS card, CPR, TB, fingerprint, and every required portal form must all be completed.",
      whyBlocking:
        salesLight || isDocumentsComplete
          ? null
          : "The pipeline needs every required Step 3 upload plus each required portal form.",
      employeeViewHref: EMPLOYEE_BASE(applicantId, "/onboarding-documents"),
      adminViewHref: getAdminWorkAreaUrl("documents"),
      raw: { documentsComplete: isDocumentsComplete, hasSomeUpload: hasSomeDocumentUpload, salesLight },
    });
  }

  {
    const inProg = onboardingContractCompleted && !isTaxFormSigned;
    const contractsOk = isContractsComplete;
    const m = mapBoolToStatus(contractsOk, { inProgress: inProg, invalid: false });
    steps.push({
      key: "pipeline_contracts_tax",
      label: "Contracts & tax (payroll)",
      category: "payroll",
      required: true,
      status: m.status,
      displayStatus: inProg && !contractsOk ? "In progress" : m.display,
      countsTowardPipelineComplete: true,
      countsTowardSurveyComplete: true,
      blocking: !contractsOk,
      lastUpdatedAt: null,
      failureReason: contractsOk
        ? null
        : !onboardingContractCompleted
          ? "onboarding_contracts.completed is not true."
          : !isTaxFormSigned
            ? "Required tax form is not signed/complete for their classification."
            : "Contract/tax step incomplete.",
      adminCoaching:
        "Confirm they finished the contract wizard, then the correct W-4 / contractor form is signed; classification drives which tax form is required.",
      whyBlocking: !contractsOk
        ? "Needs onboarding_contracts.completed and a valid signed current tax form when required."
        : null,
      employeeViewHref: EMPLOYEE_BASE(applicantId, "/onboarding-contracts"),
      adminViewHref: getAdminWorkAreaUrl("payroll"),
      raw: {
        contractsComplete: isContractsComplete,
        taxSigned: isTaxFormSigned,
        contractWizard: onboardingContractCompleted,
      },
    });
  }

  {
    const m = mapBoolToStatus(isTrainingComplete, { inProgress: hasTrainingProgressButNotComplete });
    steps.push({
      key: "pipeline_training",
      label: "Onboarding training / quizzes",
      category: "training",
      required: !salesLight,
      status: salesLight ? "complete" : m.status,
      displayStatus: salesLight ? "N/A" : m.display,
      countsTowardPipelineComplete: true,
      countsTowardSurveyComplete: !salesLight,
      blocking: !salesLight && !isTrainingComplete,
      lastUpdatedAt: null,
      failureReason:
        salesLight || isTrainingComplete
          ? null
          : hasTrainingProgressButNotComplete
            ? "Training has started, but not all 6 required modules are passed at 80% or higher."
            : "No complete required training set is on file yet.",
      adminCoaching:
        "They must finish all 6 required onboarding modules and pass each one at 80% or higher.",
      whyBlocking:
        salesLight || isTrainingComplete
          ? null
          : "The training checklist is only complete when all 6 required modules are passed.",
      employeeViewHref: EMPLOYEE_BASE(applicantId, "/onboarding-training"),
      adminViewHref: getAdminWorkAreaUrl("training"),
      raw: { trainingComplete: isTrainingComplete, progressPartial: hasTrainingProgressButNotComplete, salesLight },
    });
  }

  {
    const ok = corePipelineComplete && !hasSyncMismatch;
    const needsReview = !ok && corePipelineComplete;
    steps.push({
      key: "system_sync",
      label: "System sync (progress vs. artifacts)",
      category: "gate",
      required: true,
      status: ok ? "complete" : needsReview ? "needs_review" : "not_started",
      displayStatus: ok ? "Complete" : needsReview ? "Needs review" : "Missing",
      countsTowardPipelineComplete: true,
      countsTowardSurveyComplete: false,
      blocking: !ok,
      lastUpdatedAt: lastActivityAt,
      failureReason: ok
        ? null
        : needsReview
          ? "onboarding_status row is out of date vs. derived onboarding requirements."
          : "Documents, portal forms, contracts, or training are still incomplete.",
      adminCoaching: needsReview
        ? "Click “Recompute onboarding status” to reconcile onboarding_status with documents, portal forms, contracts, and training."
        : "Finish the required documents, portal forms, contracts, and training first.",
      whyBlocking: !ok
        ? needsReview
          ? "The stored onboarding row disagrees with the completed onboarding checklist."
          : "Training, required documents, or required portal forms are still incomplete."
        : null,
      employeeViewHref: EMPLOYEE_BASE(applicantId, "/onboarding-welcome"),
      adminViewHref: getAdminWorkAreaUrl("overview"),
      raw: { coreComplete: corePipelineComplete, serverComplete: serverReportsComplete, mismatch: hasSyncMismatch },
    });
  }

  // --- Survey / file audit (tax is in pipeline_contracts_tax; OIG/annual TB are separate from onboarding TB)
  {
    const m = mapBoolToStatus(isSkillsComplete, { inProgress: skillsFormIsDraft });
    steps.push({
      key: "file_skills",
      label: "Skills competency (initial)",
      category: "compliance",
      required: !salesLight,
      status: salesLight ? "complete" : m.status,
      displayStatus: salesLight ? "N/A" : m.display,
      countsTowardPipelineComplete: false,
      countsTowardSurveyComplete: !salesLight,
      blocking: !salesLight && !isSkillsComplete,
      lastUpdatedAt: null,
      failureReason: salesLight || isSkillsComplete ? null : "Skills form not finalized for the active event.",
      adminCoaching: "Open Admin skills form, ensure event is the current one, complete or print when ready.",
      whyBlocking:
        salesLight || isSkillsComplete ? null : "Survey readiness requires skills competency for the active event.",
      employeeViewHref: null,
      adminViewHref: skillsCompetencyAdminHref,
      raw: { skillsOk: isSkillsComplete, draft: skillsFormIsDraft, salesLight },
    });
  }

  {
    const m = mapBoolToStatus(isPerformanceComplete, {});
    steps.push({
      key: "file_performance",
      label: "Performance evaluation (annual)",
      category: "compliance",
      required: false,
      status: salesLight ? "complete" : m.status,
      displayStatus: salesLight ? "N/A" : m.display,
      countsTowardPipelineComplete: false,
      countsTowardSurveyComplete: false,
      blocking: false,
      lastUpdatedAt: null,
      failureReason: null,
      adminCoaching:
        "Performance evaluation is tracked under Compliance & ongoing programs, not initial onboarding.",
      whyBlocking: null,
      employeeViewHref: null,
      adminViewHref: performanceEvaluationAdminHref,
      raw: { performanceOk: isPerformanceComplete, salesLight, initialOnboardingStep: false },
    });
  }

  {
    const m = mapBoolToStatus(hasTbDocumentation, {});
    steps.push({
      key: "file_tb",
      label: "TB documentation",
      category: "documents",
      required: !salesLight,
      status: salesLight ? "complete" : m.status,
      displayStatus: salesLight ? "N/A" : m.display,
      countsTowardPipelineComplete: false,
      countsTowardSurveyComplete: !salesLight,
      blocking: !salesLight && !hasTbDocumentation,
      lastUpdatedAt: null,
      failureReason: salesLight || hasTbDocumentation ? null : "No tb_test in uploads / annual statement.",
      adminCoaching: "Upload TB in onboarding documents or provide annual TB statement proof.",
      whyBlocking: salesLight || hasTbDocumentation ? null : "Survey checklist requires TB proof.",
      employeeViewHref: EMPLOYEE_BASE(applicantId, "/onboarding-documents"),
      adminViewHref: getAdminWorkAreaUrl("documents"),
      raw: { tbOk: hasTbDocumentation, salesLight },
    });
  }

  {
    const oigSurveySatisfied = isOigComplete || hasOigProofOnFile;
    const m = mapBoolToStatus(oigSurveySatisfied, {});
    steps.push({
      key: "file_oig",
      label: "OIG check",
      category: "compliance",
      required: !salesLight,
      status: salesLight ? "complete" : m.status,
      displayStatus: salesLight ? "N/A" : m.display,
      countsTowardPipelineComplete: false,
      countsTowardSurveyComplete: !salesLight,
      blocking: !salesLight && !oigSurveySatisfied,
      lastUpdatedAt: null,
      failureReason:
        salesLight || oigSurveySatisfied
          ? null
          : "OIG event not completed and no OIG proof file on record.",
      adminCoaching: "Run OIG workflow or attach proof; upload counts when configured.",
      whyBlocking:
        salesLight || oigSurveySatisfied ? null : "OIG is part of the survey safety checklist.",
      employeeViewHref: null,
      adminViewHref: getAdminWorkAreaUrl("compliance"),
      raw: {
        oigOk: oigSurveySatisfied,
        oigEventComplete: isOigComplete,
        hasOigProofOnFile,
        salesLight,
      },
    });
  }

  {
    const m = mapBoolToStatus(hasBackgroundCheck, {});
    steps.push({
      key: "file_background",
      label: "Background check document",
      category: "compliance",
      required: true,
      status: m.status,
      displayStatus: m.display,
      countsTowardPipelineComplete: false,
      countsTowardSurveyComplete: true,
      blocking: !hasBackgroundCheck,
      lastUpdatedAt: null,
      failureReason: hasBackgroundCheck ? null : "No background_check document in applicant_files.",
      adminCoaching: "Have them upload the background result PDF or add via admin file audit.",
      whyBlocking: !hasBackgroundCheck ? "Survey file audit lists background check as required." : null,
      employeeViewHref: EMPLOYEE_BASE(applicantId, "/onboarding-documents"),
      adminViewHref: getAdminWorkAreaUrl("documents"),
      raw: { bgOk: hasBackgroundCheck },
    });
  }

  {
    const credComplete =
      missingCredentialDisplayNames.length === 0 &&
      (!requiresCpr || hasCprCard) &&
      (!requiresDriversLicense || hasDriversLicense) &&
      (!requiresFingerprintCard || hasFingerprintCard);
    const m = mapBoolToStatus(credComplete, { needsReview: !credComplete });
    steps.push({
      key: "credential_bundle",
      label: "Required credentials (role-based)",
      category: "compliance",
      required: true,
      status: m.status,
      displayStatus: credComplete ? "Complete" : "Missing",
      countsTowardPipelineComplete: false,
      countsTowardSurveyComplete: true,
      blocking: !credComplete,
      lastUpdatedAt: null,
      failureReason: credComplete ? null : `Missing: ${missingCredentialDisplayNames.join(", ")}`,
      adminCoaching:
        "Compare role + employment class to required credentials; use uploads (CPR, FP card) or credential records as applicable.",
      whyBlocking: !credComplete
        ? "At least one required credential is missing, expired, or not satisfied by an upload where allowed."
        : null,
      employeeViewHref: EMPLOYEE_BASE(applicantId, "/onboarding-documents"),
      adminViewHref: getAdminWorkAreaUrl("credentials"),
      raw: { missing: missingCredentialDisplayNames.join(";") },
    });
  }

  const blockingSteps = steps.filter((s) => s.required && s.status !== "complete");

  let overallStatus: AdminOnboardingOverallStatus = "in_progress";
  if (isSurveyReady && serverReportsComplete && !hasSyncMismatch) {
    overallStatus = "complete";
  } else if (!onboardingStatus?.onboarding_started_at && !isApplicationComplete && percentComplete === 0) {
    overallStatus = "not_started";
  } else if (blockingSteps.length > 0) {
    const pipelineBlockers = blockingSteps.filter((s) =>
      ["pipeline_application", "pipeline_documents", "pipeline_contracts_tax", "pipeline_training"].includes(s.key)
    );
    if (pipelineBlockers.length > 0) {
      overallStatus = "blocked";
    } else if (blockingSteps.some((s) => s.status === "needs_review" || s.status === "invalid")) {
      overallStatus = "ready_for_review";
    } else {
      overallStatus = "blocked";
    }
  }

  const adminActionRequired = blockingSteps.some(
    (s) =>
      s.status === "needs_review" ||
      s.status === "invalid" ||
      (s.key === "system_sync" && s.blocking)
  );

  return {
    overallStatus,
    percentComplete,
    lastActivityAt,
    lastEmployeeActionLabel,
    adminActionRequired,
    corePipelineComplete,
    surveyPacketComplete: isSurveyReady,
    serverReportsComplete,
    hasSyncMismatch,
    steps,
    blockingSteps,
  };
}
