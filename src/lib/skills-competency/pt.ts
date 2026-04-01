import type { CompetencyDiscipline } from "./types";
import { RN_SCALE } from "./types";

export const ptDiscipline: CompetencyDiscipline = {
  id: "pt",
  label: "PT",
  formTitle: "Core Competency Skills Checklist – Physical Therapist",
  scaleOptions: RN_SCALE,
  employeeLabel: "PT Name",
  evaluatorLabel: "Competency Assessed By",
  items: [
    { id: "history_prior_level", label: "History: Prior Level of Function" },
    { id: "rom_assessment", label: "ROM Assessment" },
    { id: "gait_assessment_training", label: "Gait Assessment & Training" },
    { id: "safety_precautions", label: "Safety Precaution Assessment" },
    { id: "pain_assessment", label: "Pain Assessment" },
    { id: "equipment_in_home", label: "Equipment in Home" },
    { id: "body_mechanics", label: "Proper Use of Body Mechanics" },
    { id: "muscle_strength", label: "Muscle Strength Testing" },
    { id: "bed_mobility", label: "Bed Mobility Skill" },
    { id: "transfer_skill", label: "Transfer Skill" },
    { id: "balance", label: "Balance" },
    { id: "home_program", label: "Home Program Teaching" },
    { id: "adl_assessment", label: "ADL Assessment" },
    { id: "energy_conservation", label: "Energy Conservation Techniques" },
    { id: "universal_precautions", label: "Universal Precautions" },
  ],
};