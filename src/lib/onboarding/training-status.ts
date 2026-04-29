export const REQUIRED_TRAINING_MODULE_KEYS = [
  "bloodborne-pathogens",
  "infection-control",
  "patient-rights",
  "hipaa",
  "emergency-preparedness",
  "fraud-waste-abuse",
] as const;

export type RequiredTrainingModuleKey = (typeof REQUIRED_TRAINING_MODULE_KEYS)[number];

export const DEFAULT_TRAINING_PASS_SCORE = 80;

export type TrainingStatusModule = {
  id: string;
  key?: string | null;
  pass_score?: number | null;
};

export type TrainingStatusAttempt = {
  module_id: string;
  score?: number | null;
  passed?: boolean | null;
};

export type TrainingStatusCompletion = {
  module_id: string;
  score?: number | null;
  passed?: boolean | null;
};

export type TrainingCompletionSummary = {
  requiredModuleCount: number;
  configuredRequiredModuleCount: number;
  passedModuleCount: number;
  isComplete: boolean;
  hasAnyProgress: boolean;
  completedModuleIds: Set<string>;
  missingRequiredModuleKeys: RequiredTrainingModuleKey[];
};

export function isRequiredTrainingModuleKey(
  value: string | null | undefined
): value is RequiredTrainingModuleKey {
  return REQUIRED_TRAINING_MODULE_KEYS.includes(value as RequiredTrainingModuleKey);
}

function isPassingRecord(
  record: TrainingStatusAttempt | TrainingStatusCompletion,
  passScore: number
) {
  return record.passed === true && typeof record.score === "number" && record.score >= passScore;
}

export function calculateTrainingCompletionSummary(input: {
  modules: TrainingStatusModule[];
  attempts?: TrainingStatusAttempt[];
  completions?: TrainingStatusCompletion[];
}): TrainingCompletionSummary {
  const attempts = input.attempts ?? [];
  const completions = input.completions ?? [];
  const requiredModules = input.modules.filter((module) =>
    isRequiredTrainingModuleKey(module.key)
  );
  const requiredModuleById = new Map(requiredModules.map((module) => [module.id, module]));
  const passedModuleIds = new Set<string>();

  for (const record of [...completions, ...attempts]) {
    const moduleRow = requiredModuleById.get(record.module_id);
    if (!moduleRow) continue;
    const passScore = moduleRow.pass_score ?? DEFAULT_TRAINING_PASS_SCORE;
    if (isPassingRecord(record, passScore)) {
      passedModuleIds.add(moduleRow.id);
    }
  }

  const completedModuleKeys = new Set<RequiredTrainingModuleKey>();
  for (const moduleRow of requiredModules) {
    if (passedModuleIds.has(moduleRow.id) && isRequiredTrainingModuleKey(moduleRow.key)) {
      completedModuleKeys.add(moduleRow.key);
    }
  }

  const configuredRequiredModuleCount = requiredModules.length;
  const requiredModuleCount = REQUIRED_TRAINING_MODULE_KEYS.length;
  const passedModuleCount = passedModuleIds.size;
  const isComplete =
    configuredRequiredModuleCount === requiredModuleCount &&
    passedModuleCount === requiredModuleCount;

  return {
    requiredModuleCount,
    configuredRequiredModuleCount,
    passedModuleCount,
    isComplete,
    hasAnyProgress: attempts.length > 0 || completions.length > 0,
    completedModuleIds: passedModuleIds,
    missingRequiredModuleKeys: REQUIRED_TRAINING_MODULE_KEYS.filter(
      (moduleKey) => !completedModuleKeys.has(moduleKey)
    ),
  };
}
