import type { CompetencyDiscipline } from "./types";
import { RN_SCALE } from "./types";

export const mswAssistantDiscipline: CompetencyDiscipline = {
  id: "msw_assistant",
  label: "MSW Assistant",
  formTitle: "Core Competency Skills Checklist – Social Work Assistant",
  scaleOptions: RN_SCALE,
  employeeLabel: "Social Work Assistant Name",
  evaluatorLabel: "Evaluator / Peer Professional",
  items: [
    { id: "emotional_status", label: "Emotional Status Documentation" },
    { id: "mental_status", label: "Mental Status Documentation" },
    { id: "social_status", label: "Social Status Documentation" },
    { id: "financial_status", label: "Financial Status Documentation" },
    { id: "environmental_status", label: "Environmental Status Documentation" },
    { id: "support_system", label: "Support System Status" },
    { id: "problems_reported", label: "Problems / Impediment Reported to MSW" },
    { id: "problem_solving", label: "Problem Solving Techniques" },
    { id: "counseling", label: "Counseling Techniques" },
    { id: "community_resources", label: "Assistance Reinforced re: Community Resources" },
    { id: "follows_plan", label: "Follows the MSW Plan" },
    { id: "overall_interventions", label: "Overall Interventions" },
  ],
};