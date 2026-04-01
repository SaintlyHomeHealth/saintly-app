import type { CompetencyDiscipline } from "../skills-competency/types";

export const rnPerformanceEvaluation: CompetencyDiscipline = {
  id: "rn",
  label: "Registered Nurse",
  formTitle: "Annual Performance Evaluation – Registered Nurse",
  scaleOptions: [
    { value: "1", label: "Excellent" },
    { value: "2", label: "Very Good" },
    { value: "3", label: "Average" },
    { value: "4", label: "Below Average" },
    { value: "5", label: "Poor" },
  ],
  employeeLabel: "RN Name",
  evaluatorLabel: "Evaluator Name",
  items: [
    {
      id: "care_coordination",
      label:
        "Coordinates total patient care including assessment, monitoring, prevention, and teaching",
    },
    {
      id: "service_effectiveness",
      label:
        "Evaluates effectiveness of nursing services to patient and family",
    },
    {
      id: "oasis",
      label:
        "Performs OASIS for admission, transfer, recertification, ROC, and discharge",
    },
    {
      id: "record_review",
      label:
        "Prepares and presents patient records for review when indicated",
    },
    {
      id: "physician_collaboration",
      label:
        "Consults with physician and updates plan of care appropriately",
    },
    {
      id: "service_coordination",
      label:
        "Coordinates patient services across disciplines",
    },
    {
      id: "visit_tracking",
      label:
        "Submits daily tally of patient visits",
    },
    {
      id: "case_conferences",
      label:
        "Participates in case conferences and discusses patient care issues",
    },
    {
      id: "team_involvement",
      label:
        "Engages appropriate members of the healthcare team",
    },
    {
      id: "continuity_of_care",
      label:
        "Collaborates with external agencies to ensure continuity of care",
    },
    {
      id: "staff_development",
      label:
        "Participates in staff development and training",
    },

    // PROFESSIONAL DEVELOPMENT
    {
      id: "skill_improvement",
      label:
        "Maintains and improves nursing skills through education and training",
    },
    {
      id: "care_plan_updates",
      label:
        "Updates plan of treatment and processes physician orders",
    },
    {
      id: "documentation",
      label:
        "Completes clinical documentation within required timeframes",
    },
    {
      id: "discharge_planning",
      label:
        "Participates in discharge planning",
    },
    {
      id: "drug_knowledge",
      label:
        "Maintains knowledge of current drug therapies",
    },
    {
      id: "regulatory_compliance",
      label:
        "Complies with Medicare, Medicaid, and accreditation requirements",
    },
    {
      id: "coverage",
      label:
        "Provides coverage for other nurses when needed",
    },

    // ADMISSION PROCESS
    {
      id: "patient_assessment",
      label:
        "Conducts comprehensive patient assessments including OASIS",
    },
    {
      id: "medical_history",
      label:
        "Obtains and evaluates patient medical history",
    },
    {
      id: "physical_exam",
      label:
        "Performs full physical assessment including vitals and mental status",
    },
    {
      id: "teaching_needs",
      label:
        "Evaluates teaching needs of patient and family",
    },
    {
      id: "home_environment",
      label:
        "Assesses home environment and support system",
    },
    {
      id: "aide_need",
      label:
        "Determines need and frequency for Home Health Aide services",
    },
    {
      id: "service_explanation",
      label:
        "Explains services to patient and family",
    },
    {
      id: "care_plan_development",
      label:
        "Develops and implements nursing care plan",
    },

    // SKILLED CARE
    {
      id: "skilled_nursing",
      label:
        "Provides skilled nursing care and treatments as ordered",
    },
    {
      id: "preventative_care",
      label:
        "Implements preventative and rehabilitative nursing procedures",
    },
    {
      id: "monitoring",
      label:
        "Monitors patient condition and reports changes",
    },
    {
      id: "patient_teaching",
      label:
        "Educates and supports patient and caregivers",
    },

    // HHA SUPERVISION
    {
      id: "hha_supervision",
      label:
        "Supervises and evaluates Home Health Aide performance",
    },
    {
      id: "hha_evaluations",
      label:
        "Completes written evaluations of Home Health Aides",
    },
    {
      id: "hha_conferences",
      label:
        "Participates in conferences regarding aide performance",
    },

    // DOCUMENTATION / OVERSIGHT
    {
      id: "charting",
      label:
        "Maintains accurate charting and updates care plans",
    },
    {
      id: "care_evaluation",
      label:
        "Evaluates patient progress and outcomes",
    },

    // TEAM COLLABORATION
    {
      id: "physician_consult",
      label:
        "Consults physician regarding treatment changes",
    },
    {
      id: "team_coordination",
      label:
        "Coordinates involvement of interdisciplinary team",
    },
    {
      id: "aide_referrals",
      label:
        "Obtains and submits referrals for aide services",
    },

    // SUPERVISION / LEADERSHIP
    {
      id: "lpn_supervision",
      label:
        "Supervises LPNs as required",
    },
    {
      id: "education_participation",
      label:
        "Participates in education and mentoring of student nurses",
    },
    {
      id: "program_participation",
      label:
        "Participates in planning and evaluation of nursing services",
    },
  ],
};