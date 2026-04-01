import type { CompetencyDiscipline } from "../skills-competency/types";

export const pediatricRnPerformanceEvaluation: CompetencyDiscipline = {
  id: "pediatric_rn",
  label: "Pediatric RN",
  formTitle: "Annual Performance Evaluation – Pediatric Registered Nurse",
  scaleOptions: [
    { value: "1", label: "Excellent" },
    { value: "2", label: "Very Good" },
    { value: "3", label: "Average" },
    { value: "4", label: "Below Average" },
    { value: "5", label: "Poor" },
  ],
  employeeLabel: "Pediatric RN Name",
  evaluatorLabel: "Evaluator Name",
  items: [
    {
      id: "assessment",
      label:
        "Conducts initial and ongoing comprehensive pediatric assessments including OASIS",
    },
    {
      id: "care_plan",
      label:
        "Initiates and revises plan of care appropriately",
    },
    {
      id: "skilled_care",
      label:
        "Provides specialized pediatric skilled nursing care",
    },
    {
      id: "patient_education",
      label:
        "Educates patient and family on disease process and care techniques",
    },
    {
      id: "preventative_care",
      label:
        "Implements preventive and rehabilitative nursing procedures",
    },
    {
      id: "documentation",
      label:
        "Completes clinical and progress notes accurately",
    },
    {
      id: "coordination",
      label:
        "Coordinates services with interdisciplinary team and caregivers",
    },
    {
      id: "case_conference",
      label:
        "Analyzes charts and participates in case conferences",
    },
    {
      id: "physician_liaison",
      label:
        "Acts as liaison with physicians, hospitals, and specialty providers",
    },
    {
      id: "outcomes",
      label:
        "Evaluates effectiveness and outcomes of care",
    },
    {
      id: "lpn_supervision",
      label:
        "Supervises LVNs/LPNs every 30 days per Medicare requirements",
    },
    {
      id: "hha_supervision",
      label:
        "Supervises Home Health Aides every 14 days per Medicare requirements",
    },
    {
      id: "inservices",
      label:
        "Participates in required in-service education programs",
    },
  ],
};