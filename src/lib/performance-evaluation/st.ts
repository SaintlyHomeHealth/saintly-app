import type { CompetencyDiscipline } from "../skills-competency/types";

export const stPerformanceEvaluation: CompetencyDiscipline = {
  id: "st",
  label: "Speech Pathologist / Audiologist",
  formTitle: "Annual Performance Evaluation – Speech Pathologist / Audiologist",
  scaleOptions: [
    { value: "1", label: "Excellent" },
    { value: "2", label: "Very Good" },
    { value: "3", label: "Average" },
    { value: "4", label: "Below Average" },
    { value: "5", label: "Poor" },
  ],
  employeeLabel: "Speech Therapist Name",
  evaluatorLabel: "Evaluator Name",
  items: [
    {
      id: "hearing_evaluation",
      label:
        "Evaluates level of functioning and hearing and recommends mechanisms to enhance hearing ability",
    },
    {
      id: "assessment",
      label:
        "Provides initial and ongoing comprehensive assessments including OASIS",
    },
    {
      id: "treatment_plan",
      label:
        "Establishes and revises Speech Therapy treatment plan with physician approval",
    },
    {
      id: "interdisciplinary_plan",
      label:
        "Assists in development and implementation of interdisciplinary care plan",
    },
    {
      id: "physician_orders",
      label:
        "Ensures physician orders are appropriate and discusses necessary changes",
    },
    {
      id: "team_communication",
      label:
        "Communicates with team members and instructs them in speech pathology techniques",
    },
    {
      id: "family_teaching",
      label:
        "Teaches, supervises, and counsels the family and client in the speech therapy program",
    },
    {
      id: "home_evaluation",
      label:
        "Evaluates client, family, and home situation to determine instruction and support needs",
    },
    {
      id: "outpatient_arrangements",
      label:
        "Makes arrangements for outpatient procedures that cannot be done in the home",
    },
    {
      id: "documentation",
      label:
        "Records evaluation data, treatments, and client response on a timely basis",
    },
    {
      id: "hha_supervision",
      label:
        "Supervises Home Health Aide at required intervals when Speech Therapy is the only discipline involved",
    },
    {
      id: "treatment_reporting",
      label:
        "Records and reports client reaction to treatment and condition changes to physician",
    },
    {
      id: "plan_revision",
      label:
        "Participates in revision of physician plan of treatment and obtains additional orders as needed",
    },
    {
      id: "physician_communication",
      label:
        "Communicates with physician at least every 30 days or whenever changes occur",
    },
    {
      id: "intervention_effectiveness",
      label:
        "Evaluates effectiveness of speech pathology intervention and updates care plan",
    },
    {
      id: "progress_notes",
      label:
        "Writes clinical/progress notes on visit date and incorporates into chart within 72 hours",
    },
    {
      id: "agency_participation",
      label:
        "Participates in QAPI, meetings, in-services, and case conferences",
    },
    {
      id: "self_development",
      label:
        "Demonstrates ongoing professional development and education",
    },
    {
      id: "scheduling",
      label:
        "Confirms weekly scheduling with Clinical Manager",
    },
    {
      id: "discharge",
      label:
        "Participates in discharge planning and completes Speech Therapy Discharge Summary",
    },
  ],
};