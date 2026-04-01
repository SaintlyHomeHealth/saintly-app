import type { CompetencyDiscipline } from "./types";
import { RN_SCALE } from "./types";

export const otDiscipline: CompetencyDiscipline = {
  id: "ot",
  label: "OT",
  formTitle: "Core Competency Skills Checklist – Occupational Therapist",
  scaleOptions: RN_SCALE,
  employeeLabel: "OT Name",
  evaluatorLabel: "Evaluator / Peer Professional",
  items: [
    { id: "independent_assessment", label: "Independent Assessment" },
    { id: "history_prior_level", label: "History: Prior Level of Function" },
    { id: "adl_technique", label: "ADL Technique" },
    { id: "bathroom_skills", label: "Bathroom Skill Assessment" },
    { id: "home_safety", label: "Home Safety Instruction" },
    { id: "equipment_needs", label: "Equipment Needs" },
    { id: "cognitive_training", label: "Cognitive Training" },
    { id: "coordination_training", label: "Coordination Training" },
    { id: "muscle_stretching", label: "Muscle Stretching" },
    { id: "joint_rom", label: "Joint ROM" },
    { id: "balance_training", label: "Balance Training" },
    { id: "pain_assessment", label: "Pain Assessment" },
    { id: "energy_conservation", label: "Energy Conservation Technique" },
    { id: "home_exercise_program", label: "Home Exercise Program" },
    { id: "transfer_technique", label: "Transfer Technique" },
  ],
};