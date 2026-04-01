import type { CompetencyDiscipline } from "./types";
import { RN_SCALE } from "./types";

export const otaDiscipline: CompetencyDiscipline = {
  id: "ota",
  label: "OTA",
  formTitle: "Core Competency Skills Checklist – Occupational Therapy Assistant / Aide",
  scaleOptions: RN_SCALE,
  employeeLabel: "OTA / Aide Name",
  evaluatorLabel: "Supervising OT / Evaluator",
  items: [
    { id: "adl_technique", label: "ADL Technique" },
    { id: "bathroom_skills", label: "Bathroom Skill Instruction" },
    { id: "home_safety", label: "Home Safety Instruction" },
    { id: "equipment_needs", label: "Equipment Needs" },
    { id: "cognitive_training", label: "Cognitive Training" },
    { id: "coordination_training", label: "Coordination Training" },
    { id: "muscle_stretching", label: "Muscle Stretching" },
    { id: "joint_rom", label: "Joint ROM" },
    { id: "balance_training", label: "Balance Training" },
    { id: "pain_assessment", label: "Pain Assessment" },
    { id: "energy_conservation", label: "Energy Conservation Technique" },
    { id: "home_exercise_program", label: "Home Exercise Program Instruction" },
    { id: "transfer_technique", label: "Transfer Technique" },
  ],
};