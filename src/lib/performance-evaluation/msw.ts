import type { CompetencyDiscipline } from "../skills-competency/types";

export const mswPerformanceEvaluation: CompetencyDiscipline = {
  id: "msw",
  label: "Medical Social Worker",
  formTitle: "Annual Performance Evaluation – Medical Social Worker",
  scaleOptions: [
    { value: "1", label: "Excellent" },
    { value: "2", label: "Very Good" },
    { value: "3", label: "Average" },
    { value: "4", label: "Below Average" },
    { value: "5", label: "Poor" },
  ],
  employeeLabel: "MSW Name",
  evaluatorLabel: "Evaluator Name",
  items: [
    {
      id: "admission_eval",
      label:
        "Performs initial psychosocial evaluation during admission process",
    },
    {
      id: "care_plan",
      label:
        "Assists in development and implementation of interdisciplinary care plan",
    },
    {
      id: "observes_reports",
      label:
        "Observes, records, and reports changes in emotional and social factors",
    },
    {
      id: "physician_consult",
      label:
        "Consults physician regarding changes to plan of care",
    },
    {
      id: "documentation",
      label:
        "Maintains and submits accurate clinical records including evaluations and notes",
    },
    {
      id: "intervention_effectiveness",
      label:
        "Evaluates effectiveness of social work interventions",
    },
    {
      id: "scheduling",
      label:
        "Coordinates and confirms weekly visit scheduling",
    },
    {
      id: "agency_participation",
      label:
        "Participates in agency activities, QAPI, and in-services",
    },
    {
      id: "assistant_supervision",
      label:
        "Supervises social work assistant monthly",
    },
    {
      id: "discharge_planning",
      label:
        "Participates in discharge planning",
    },
    {
      id: "self_development",
      label:
        "Demonstrates professional growth through education and training",
    },

    // SKILLED SERVICES
    {
      id: "coping_assessment",
      label:
        "Assesses client's ability to cope with social and health problems",
    },
    {
      id: "team_consultant",
      label:
        "Acts as consultant to healthcare team regarding psychosocial factors",
    },
    {
      id: "resource_utilization",
      label:
        "Helps client utilize family and community resources",
    },
    {
      id: "casework",
      label:
        "Provides rehabilitative and supportive casework",
    },
    {
      id: "family_support",
      label:
        "Assists clients and families in coping with personal and environmental challenges",
    },
  ],
};