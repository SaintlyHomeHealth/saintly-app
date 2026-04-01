import type { CompetencyDiscipline } from "./types";
import { RN_SCALE } from "./types";

export const mswDiscipline: CompetencyDiscipline = {
  id: "msw",
  label: "MSW",
  formTitle: "Core Competency Skills Checklist – Medical Social Worker",
  scaleOptions: RN_SCALE,
  employeeLabel: "Medical Social Worker Name",
  evaluatorLabel: "Evaluator / Peer Professional",
  items: [
    { id: "emotional", label: "Emotional Assessment" },
    { id: "mental", label: "Mental Assessment" },
    { id: "social", label: "Social Assessment" },
    { id: "financial", label: "Financial Assessment" },
    { id: "environmental", label: "Environmental Assessment" },
    { id: "support_system", label: "Support System" },
    { id: "problems_impediment", label: "Problems / Impediment to Effective Treatment / Care" },
    { id: "problem_solving", label: "Problem Solving Techniques" },
    { id: "depression_assessment", label: "Assessment of Depression" },
    { id: "counseling", label: "Counseling Technique" },
    { id: "community_resources", label: "Assistance Given re: Community Resources" },
    { id: "follow_up_plan", label: "Follow Up Plan" },
    { id: "visit_projection", label: "Appropriate Number of Visits Projected" },
    { id: "overall_interventions", label: "Overall Interventions" },
  ],
};