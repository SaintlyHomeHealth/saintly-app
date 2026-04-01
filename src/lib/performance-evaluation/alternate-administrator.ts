import type { CompetencyDiscipline } from "../skills-competency/types";

export const alternateAdministratorPerformanceEvaluation: CompetencyDiscipline = {
  id: "alternate_admin",
  label: "Alternate Administrator",
  formTitle: "Annual Performance Evaluation – Alternate Administrator",
  scaleOptions: [
    { value: "1", label: "Excellent" },
    { value: "2", label: "Very Good" },
    { value: "3", label: "Average" },
    { value: "4", label: "Below Average" },
    { value: "5", label: "Poor" },
  ],
  employeeLabel: "Alternate Administrator Name",
  evaluatorLabel: "Evaluator Name",
  items: [
    {
      id: "admin_coverage",
      label:
        "Organizes and directs agency operations in the absence of the Administrator",
    },
    {
      id: "operations_management",
      label:
        "Plans, organizes, directs, and evaluates operations to ensure adequate care and services",
    },
    {
      id: "regulatory_compliance",
      label:
        "Complies with applicable laws and regulations",
    },
    {
      id: "financial_management",
      label:
        "Participates in fiscal planning, budgeting, and operational management",
    },
    {
      id: "policy_implementation",
      label:
        "Implements governing body directives and agency policies",
    },
    {
      id: "staffing",
      label:
        "Recruits, employs, and retains qualified personnel to maintain staffing levels",
    },
    {
      id: "communication_channels",
      label:
        "Maintains effective communication throughout the organization",
    },
    {
      id: "staff_development",
      label:
        "Supports staff development including orientation, education, and evaluations",
    },
    {
      id: "performance_improvement",
      label:
        "Directs and monitors performance improvement (QAPI) activities",
    },
    {
      id: "clinical_supervision",
      label:
        "Ensures clinical services are under physician or RN supervision",
    },
    {
      id: "staff_supervision",
      label:
        "Ensures proper staff supervision during all operating hours",
    },
    {
      id: "personnel_qualification",
      label:
        "Ensures staff qualifications and proper assignment of personnel",
    },
    {
      id: "public_information_accuracy",
      label:
        "Ensures accuracy of public information materials",
    },
    {
      id: "industry_awareness",
      label:
        "Keeps leadership informed of community and industry trends",
    },
    {
      id: "program_effectiveness",
      label:
        "Participates in evaluation of overall agency effectiveness",
    },
  ],
};