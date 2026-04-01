import type { CompetencyDiscipline } from "../skills-competency/types";

export const otaPerformanceEvaluation: CompetencyDiscipline = {
  id: "ota",
  label: "OTA",
  formTitle: "Annual Performance Evaluation – Occupational Therapist Assistant",
  scaleOptions: [
    { value: "1", label: "Excellent" },
    { value: "2", label: "Very Good" },
    { value: "3", label: "Average" },
    { value: "4", label: "Below Average" },
    { value: "5", label: "Poor" },
  ],
  employeeLabel: "OTA Name",
  evaluatorLabel: "Evaluator Name",
  items: [
    {
      id: "delegated_care",
      label:
        "Provides client care services delegated by Occupational Therapist",
    },
    {
      id: "care_plan_assist",
      label:
        "Assists in evaluation and development of rehabilitative plan of care",
    },
    {
      id: "documentation",
      label:
        "Prepares clinical and daily progress notes reviewed by OT within 72 hours",
    },
    {
      id: "family_instruction",
      label:
        "Instructs client and family alongside OT",
    },
    {
      id: "therapeutic_activities",
      label:
        "Guides client in therapeutic self-care and activities to improve independence",
    },
    {
      id: "medication_observation",
      label:
        "Identifies and reports adverse drug reactions or contraindications",
    },
    {
      id: "patient_monitoring",
      label:
        "Observes and reports client condition and response to treatment",
    },
    {
      id: "visit_reporting",
      label:
        "Reports findings to OT and physician after home visits",
    },
    {
      id: "team_instruction",
      label:
        "Instructs aides, staff, and family on therapy techniques",
    },
    {
      id: "progress_notes",
      label:
        "Writes and submits daily progress notes and summary reports",
    },
    {
      id: "meetings",
      label:
        "Attends staff meetings, QAPI, in-services, and case conferences",
    },
    {
      id: "discharge",
      label:
        "Participates in discharge planning and assists OT with discharge summary",
    },
    {
      id: "scheduling",
      label:
        "Confirms weekly scheduling with Clinical Manager",
    },
    {
      id: "self_development",
      label:
        "Demonstrates ongoing professional development and education",
    },
    {
      id: "supervision",
      label:
        "Receives required monthly supervision from Occupational Therapist",
    },
    {
      id: "other_duties",
      label:
        "Performs additional duties as assigned by OT",
    },
  ],
};