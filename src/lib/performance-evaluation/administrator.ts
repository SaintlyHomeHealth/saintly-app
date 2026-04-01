import type { CompetencyDiscipline } from "../skills-competency/types";

export const administratorPerformanceEvaluation: CompetencyDiscipline = {
  id: "administrator",
  label: "Administrator",
  formTitle: "Annual Performance Evaluation – Administrator",
  scaleOptions: [
    { value: "1", label: "Excellent" },
    { value: "2", label: "Very Good" },
    { value: "3", label: "Average" },
    { value: "4", label: "Below Average" },
    { value: "5", label: "Poor" },
  ],
  employeeLabel: "Administrator Name",
  evaluatorLabel: "Evaluator Name",
  items: [
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
        "Manages fiscal planning, budgeting, and operations within established parameters",
    },
    {
      id: "policy_implementation",
      label:
        "Implements governing body directives and ensures policies are developed and followed",
    },
    {
      id: "communication_channels",
      label:
        "Maintains effective communication channels throughout the organization",
    },
    {
      id: "staff_development",
      label:
        "Ensures staff development including orientation, education, and evaluations",
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
        "Ensures staff qualifications and appropriate personnel assignments",
    },
    {
      id: "public_information_accuracy",
      label:
        "Ensures accuracy of public information materials",
    },
    {
      id: "alternate_administrator",
      label:
        "Appoints a qualified alternate administrator during absence",
    },
    {
      id: "industry_awareness",
      label:
        "Keeps governing body and staff informed of industry and community trends",
    },
    {
      id: "program_effectiveness",
      label:
        "Participates in review and evaluation of overall agency effectiveness",
    },

    // PROGRAM EVALUATION
    {
      id: "policy_evaluation",
      label:
        "Evaluates service policies and recommends improvements",
    },
    {
      id: "staff_performance_evaluation",
      label:
        "Evaluates staff performance and supports professional development",
    },
    {
      id: "utilization_review",
      label:
        "Implements utilization review activities",
    },
    {
      id: "corrective_actions",
      label:
        "Ensures timely corrective action plans are implemented",
    },

    // REGULATORY / COMPLIANCE
    {
      id: "regulation_knowledge",
      label:
        "Maintains knowledge of federal, state, and accreditation regulations",
    },
    {
      id: "staff_education_laws",
      label:
        "Ensures staff are educated on laws and regulations",
    },
    {
      id: "reporting_requirements",
      label:
        "Ensures required reports and records are completed and submitted",
    },
    {
      id: "org_chart",
      label:
        "Maintains current organizational chart with clear authority structure",
    },
    {
      id: "service_transparency",
      label:
        "Clearly identifies services and geographic coverage",
    },
    {
      id: "office_environment",
      label:
        "Maintains compliant and safe office environment",
    },
    {
      id: "education_programs",
      label:
        "Ensures staff orientation and ongoing education opportunities",
    },

    // COMMUNITY / PUBLIC RELATIONS
    {
      id: "agency_relationships",
      label:
        "Develops relationships with community and partner agencies",
    },
    {
      id: "professional_participation",
      label:
        "Participates in associations, meetings, and industry events",
    },
  ],
};