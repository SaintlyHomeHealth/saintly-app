import type { CompetencyDiscipline } from "../skills-competency/types";

export const ptPerformanceEvaluation: CompetencyDiscipline = {
  id: "pt",
  label: "Physical Therapist",
  formTitle: "Annual Performance Evaluation – Physical Therapist",
  scaleOptions: [
    { value: "1", label: "Excellent" },
    { value: "2", label: "Very Good" },
    { value: "3", label: "Average" },
    { value: "4", label: "Below Average" },
    { value: "5", label: "Poor" },
  ],
  employeeLabel: "PT Name",
  evaluatorLabel: "Evaluator Name",
  items: [
    {
      id: "assessment",
      label:
        "Performs initial and ongoing comprehensive assessments including OASIS",
    },
    {
      id: "care_plan",
      label:
        "Establishes and revises treatment plan in consultation with physician",
    },
    {
      id: "interdisciplinary_plan",
      label:
        "Participates in development of interdisciplinary care plan",
    },
    {
      id: "diagnostic_testing",
      label:
        "Performs diagnostic and functional ability testing",
    },
    {
      id: "treatment",
      label:
        "Provides therapy to restore function and relieve pain using appropriate modalities",
    },
    {
      id: "staff_consultation",
      label:
        "Consults and educates staff regarding treatment plans",
    },
    {
      id: "family_teaching",
      label:
        "Educates and supports family and patient in therapy program",
    },
    {
      id: "equipment_training",
      label:
        "Instructs on use of assistive devices and equipment",
    },
    {
      id: "equipment_provision",
      label:
        "Provides necessary equipment for therapy plan",
    },
    {
      id: "outpatient_coordination",
      label:
        "Arranges outpatient services when needed",
    },
    {
      id: "documentation",
      label:
        "Completes timely documentation of evaluations, treatments, and responses",
    },
    {
      id: "pta_supervision",
      label:
        "Supervises Physical Therapy Assistants at least monthly",
    },
    {
      id: "hha_supervision",
      label:
        "Supervises Home Health Aide per required intervals",
    },
    {
      id: "physician_communication",
      label:
        "Communicates with physician regularly and obtains orders as needed",
    },
    {
      id: "team_communication",
      label:
        "Collaborates with interdisciplinary team and instructs staff as appropriate",
    },
    {
      id: "progress_notes",
      label:
        "Completes clinical/progress notes within required timeframe",
    },
    {
      id: "agency_participation",
      label:
        "Participates in meetings, QAPI, in-services, and case conferences",
    },
    {
      id: "scheduling",
      label:
        "Confirms weekly scheduling with Clinical Manager",
    },
    {
      id: "discharge",
      label:
        "Participates in discharge planning and completes discharge summary",
    },

    // ADMISSION SUPPORT
    {
      id: "medical_history",
      label:
        "Obtains and evaluates medical history relevant to therapy",
    },
    {
      id: "home_evaluation",
      label:
        "Evaluates home environment and support system",
    },
    {
      id: "physician_orders",
      label:
        "Ensures physician orders are appropriate and updated",
    },
  ],
};