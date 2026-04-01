import type { CompetencyDiscipline } from "../skills-competency/types";

export const ptaPerformanceEvaluation: CompetencyDiscipline = {
  id: "pta",
  label: "Physical Therapy Assistant",
  formTitle: "Annual Performance Evaluation – Physical Therapy Assistant",
  scaleOptions: [
    { value: "1", label: "Excellent" },
    { value: "2", label: "Very Good" },
    { value: "3", label: "Average" },
    { value: "4", label: "Below Average" },
    { value: "5", label: "Poor" },
  ],
  employeeLabel: "PTA Name",
  evaluatorLabel: "Evaluator Name",
  items: [
    {
      id: "delegated_services",
      label:
        "Provides client services delegated by the Registered Physical Therapist",
    },
    {
      id: "care_plan_assist",
      label:
        "Assists in evaluation, development, and periodic re-evaluation of rehabilitative plan of care",
    },
    {
      id: "clinical_notes",
      label:
        "Participates in preparation of clinical and daily progress notes and summary reports",
    },
    {
      id: "therapeutic_exercises",
      label:
        "Performs strengthening and therapeutic exercises and assists with self-help devices",
    },
    {
      id: "family_instruction",
      label:
        "Instructs client and family together with the PT",
    },
    {
      id: "drug_reaction_reporting",
      label:
        "Identifies and reports ineffective drug therapy, adverse reactions, and contraindications",
    },
    {
      id: "patient_observation",
      label:
        "Observes and records findings and reports client reactions and condition changes",
    },
    {
      id: "team_instruction",
      label:
        "Instructs health team personnel and family in phases of physical therapy",
    },
    {
      id: "progress_notes",
      label:
        "Writes and submits daily progress notes and summary reports within required timeframe",
    },
    {
      id: "meetings",
      label:
        "Attends rehab staff meetings, QAPI, case conferences, and required meetings",
    },
    {
      id: "discharge",
      label:
        "Participates in discharge planning and assists with PT discharge summary",
    },
    {
      id: "scheduling",
      label:
        "Confirms weekly scheduling with Supervisor / Clinical Manager",
    },
    {
      id: "self_development",
      label:
        "Demonstrates ongoing professional development and education",
    },
    {
      id: "supervision",
      label:
        "Receives required monthly supervision by the physical therapist",
    },
    {
      id: "other_duties",
      label:
        "Performs additional duties deemed appropriate by the PT",
    },
  ],
};