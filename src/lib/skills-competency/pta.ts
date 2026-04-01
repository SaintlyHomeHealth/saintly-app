import type { CompetencyDiscipline } from "./types";
import { RN_SCALE } from "./types";

export const ptaDiscipline: CompetencyDiscipline = {
  id: "pta",
  label: "PTA",
  formTitle: "Core Competency Skills Checklist – Physical Therapist Assistant / Aide",
  scaleOptions: RN_SCALE,
  employeeLabel: "PT Assistant / Aide Name",
  evaluatorLabel: "Supervising PT / Evaluator",
  items: [
    { id: "rom_instruction", label: "ROM Instruction" },
    { id: "gait_training", label: "Gait Training" },
    { id: "safety_precautions", label: "Safety Precaution Instruction" },
    { id: "pain_assessment", label: "Pain Assessment" },
    { id: "equipment_in_home", label: "Equipment in Home" },
    { id: "body_mechanics", label: "Proper Use of Body Mechanics" },
    { id: "muscle_strength", label: "Muscle Strength Testing" },
    { id: "bed_mobility", label: "Bed Mobility Skill" },
    { id: "transfer_skill", label: "Transfer Skill" },
    { id: "balance", label: "Balance" },
    { id: "home_program", label: "Home Program Teaching" },
    { id: "adl_instruction", label: "ADL Instruction" },
    { id: "energy_conservation", label: "Energy Conservation Techniques" },
    { id: "universal_precautions", label: "Universal Precautions" },
  ],
};