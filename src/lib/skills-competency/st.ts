import type { CompetencyDiscipline } from "./types";
import { RN_SCALE } from "./types";

export const stDiscipline: CompetencyDiscipline = {
  id: "st",
  label: "ST",
  formTitle: "Core Competency Skills Checklist – Speech Therapist",
  scaleOptions: RN_SCALE,
  employeeLabel: "Speech Therapist Name",
  evaluatorLabel: "Evaluator / Peer Professional",
  items: [
    { id: "speech_intelligibility", label: "Speech Intelligibility Assessment" },
    { id: "history_prior_speech", label: "History: Prior Level of Speech" },
    { id: "visual_reading", label: "Visual / Reading Comprehension" },
    { id: "auditory_comprehension", label: "Auditory Comprehension" },
    { id: "articulation", label: "Articulation" },
    { id: "voice_phonation", label: "Voice (Phonation)" },
    { id: "verbal_expression", label: "Verbal Expression" },
    { id: "memory", label: "Memory" },
    { id: "language_fluency", label: "Language / Fluency" },
    { id: "cognitive_retraining", label: "Cognitive Retraining" },
    { id: "reasoning", label: "Reasoning" },
    { id: "oral_muscle", label: "Oral Muscle Stretching" },
    { id: "breathing_patterns", label: "Breathing Patterns" },
    { id: "swallowing", label: "Swallowing Assessment" },
    { id: "non_verbal", label: "Non-verbal Communication" },
    { id: "home_program", label: "Home Exercise Program" },
  ],
};