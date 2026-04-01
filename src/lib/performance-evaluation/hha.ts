import type { CompetencyDiscipline } from "../skills-competency/types";

export const hhaPerformanceEvaluation: CompetencyDiscipline = {
  id: "hha",
  label: "HHA / CNA",
  formTitle: "Annual Performance Evaluation – Home Health Aide",
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
    { id: "plan_of_care", label: "Follows the plan of care and provides safe, competent care" },
    { id: "hygiene", label: "Maintains personal hygiene and safe environment" },
    { id: "nutrition", label: "Prepares nutritious meals and assists with shopping when instructed" },
    { id: "ambulation", label: "Assists with ambulation and treatments as ordered" },
    { id: "therapy", label: "Assists therapy personnel with rehabilitative processes" },
    { id: "independence", label: "Encourages patient independence" },
    { id: "mental_alertness", label: "Promotes mental alertness through activities" },
    { id: "emotional_support", label: "Provides emotional and psychological support" },
    { id: "reporting", label: "Reports changes in patient condition" },
    { id: "housekeeping", label: "Performs housekeeping for safe environment" },
    { id: "documentation", label: "Completes visit reports timely" },
    { id: "scheduling", label: "Coordinates and confirms scheduling" },
    { id: "inservices", label: "Attends required in-services" },
    { id: "meetings", label: "Participates in agency meetings" },
  ],
};