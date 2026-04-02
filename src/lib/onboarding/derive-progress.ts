/**
 * Coarse onboarding % aligned with employee onboarding steps (application → docs → contracts+tax → training → all complete).
 */

export type OnboardingFlowStatus = "not_started" | "started" | "in_progress" | "completed";

export type OnboardingProgressSnapshot = {
  percent: number;
  flowStatus: OnboardingFlowStatus;
  overallComplete: boolean;
};

export function deriveOnboardingProgress(input: {
  applicationCompleted: boolean;
  documentsComplete: boolean;
  contractsAndTaxComplete: boolean;
  trainingComplete: boolean;
}): OnboardingProgressSnapshot {
  const { applicationCompleted, documentsComplete, contractsAndTaxComplete, trainingComplete } =
    input;

  const overallComplete =
    applicationCompleted && documentsComplete && contractsAndTaxComplete && trainingComplete;

  if (overallComplete) {
    return { percent: 100, flowStatus: "completed", overallComplete: true };
  }
  if (trainingComplete) {
    return { percent: 85, flowStatus: "in_progress", overallComplete: false };
  }
  if (contractsAndTaxComplete) {
    return { percent: 62, flowStatus: "in_progress", overallComplete: false };
  }
  if (documentsComplete) {
    return { percent: 38, flowStatus: "in_progress", overallComplete: false };
  }
  if (applicationCompleted) {
    return { percent: 24, flowStatus: "in_progress", overallComplete: false };
  }
  return { percent: 0, flowStatus: "not_started", overallComplete: false };
}

/** After welcome / session start, bump from 0% to a minimal “started” value. */
export function applyStartedFloor(
  snapshot: OnboardingProgressSnapshot,
  hasSessionStarted: boolean
): OnboardingProgressSnapshot {
  if (!hasSessionStarted) return snapshot;
  if (snapshot.percent >= 15) return snapshot;
  if (snapshot.flowStatus === "completed") return snapshot;
  return {
    ...snapshot,
    percent: Math.max(snapshot.percent, 15),
    flowStatus: snapshot.flowStatus === "not_started" ? "started" : snapshot.flowStatus,
  };
}
