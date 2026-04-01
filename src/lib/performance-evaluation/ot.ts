import type { CompetencyDiscipline } from "../skills-competency/types";

export const otPerformanceEvaluation: CompetencyDiscipline = {
  id: "ot",
  label: "OT",
  formTitle: "Annual Performance Evaluation – Occupational Therapist",
  scaleOptions: [
    { value: "1", label: "Excellent" },
    { value: "2", label: "Very Good" },
    { value: "3", label: "Average" },
    { value: "4", label: "Below Average" },
    { value: "5", label: "Poor" },
  ],
  employeeLabel: "Employee Name",
  evaluatorLabel: "Evaluator Name",
  items: [
    {
      id: "physician_function_eval",
      label:
        "Assists physician in evaluating client's level of function using diagnostic and prognostic procedures",
    },
    {
      id: "initial_ongoing_assessment",
      label:
        "Conducts initial and ongoing comprehensive assessments, including OASIS when required",
    },
    {
      id: "home_family_evaluation",
      label:
        "Evaluates significant others and home situation to determine teaching and support needs",
    },
    {
      id: "physician_orders",
      label:
        "Ensures physician orders are appropriate and discusses necessary changes",
    },
    {
      id: "care_plan_development",
      label:
        "Assists in development and implementation of interdisciplinary care plan including OT",
    },
    {
      id: "therapeutic_self_care",
      label:
        "Guides and instructs client in therapeutic self-care and creative activities",
    },
    {
      id: "assistive_device_instruction",
      label:
        "Instructs client in care and use of wheelchairs, braces, splints, prosthetic and orthotic devices",
    },
    {
      id: "family_client_teaching",
      label:
        "Teaches, supervises, and counsels family and client in total OT program",
    },
    {
      id: "goal_setting_reevaluation",
      label:
        "Establishes goals and performs re-evaluations based on progress and potential",
    },
    {
      id: "outpatient_arrangements",
      label:
        "Makes arrangements for outpatient services when needed",
    },
    {
      id: "intervention_effectiveness",
      label:
        "Evaluates effectiveness of OT intervention and updates care plan as needed",
    },
    {
      id: "progress_notes",
      label:
        "Prepares clinical/progress notes on visit day and incorporates into chart within 72 hours",
    },
    {
      id: "physician_communication",
      label:
        "Communicates regularly with physician regarding client status and obtains orders as needed",
    },
    {
      id: "team_communication",
      label:
        "Communicates with team members and instructs them in OT techniques when appropriate",
    },
    {
      id: "hha_supervision",
      label:
        "Supervises Home Health Aide at required intervals for skilled and unskilled cases",
    },
    {
      id: "ota_supervision",
      label:
        "Supervises OT Assistant at required intervals for private duty and Medicare/Medicaid cases",
    },
    {
      id: "agency_participation",
      label:
        "Participates in agency activities, QAPI meetings, in-services, and case conferences",
    },
    {
      id: "visit_scheduling",
      label:
        "Confirms weekly scheduling of visits with Clinical Manager",
    },
    {
      id: "discharge_activities",
      label:
        "Participates in discharge activities and completes OT discharge summary",
    },
    {
      id: "self_development",
      label:
        "Demonstrates self-development through education, workshops, organizations, research, and reading",
    },
  ],
};