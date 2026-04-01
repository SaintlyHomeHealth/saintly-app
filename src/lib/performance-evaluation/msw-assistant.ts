import type { CompetencyDiscipline } from "../skills-competency/types";

export const mswAssistantPerformanceEvaluation: CompetencyDiscipline = {
  id: "msw_assistant",
  label: "MSW Assistant",
  formTitle: "Annual Performance Evaluation – Medical Social Work Assistant",
  scaleOptions: [
    { value: "1", label: "Excellent" },
    { value: "2", label: "Very Good" },
    { value: "3", label: "Average" },
    { value: "4", label: "Below Average" },
    { value: "5", label: "Poor" },
  ],
  employeeLabel: "MSW Assistant Name",
  evaluatorLabel: "Evaluator Name",
  items: [
    {
      id: "supportive_casework",
      label:
        "Provides supportive casework with MSW for patients and families",
    },
    {
      id: "psychosocial_assessment",
      label:
        "Assesses social and emotional factors affecting patient health",
    },
    {
      id: "emotional_support",
      label:
        "Provides information regarding emotional and secondary effects of illness",
    },
    {
      id: "community_resources",
      label:
        "Assists patients in accessing community resources and placement services",
    },
    {
      id: "team_collaboration",
      label:
        "Collaborates with physician and healthcare team on psychosocial care planning",
    },
    {
      id: "documentation",
      label:
        "Completes clinical/progress notes same day and enters within 72 hours",
    },
    {
      id: "care_plan_participation",
      label:
        "Participates in development and revision of plan of care",
    },
    {
      id: "meetings",
      label:
        "Attends case conferences, in-services, and quality improvement activities",
    },
    {
      id: "scheduling",
      label:
        "Confirms weekly scheduling of visits with Clinical Manager",
    },
  ],
};