export type CompetencyScaleOption = {
    value: string;
    label: string;
  };
  
  export type CompetencyItem = {
    id: string;
    label: string;
  };
  
  export type CompetencyDiscipline = {
    id: string;
    label: string;
    formTitle: string;
    scaleOptions: CompetencyScaleOption[];
    employeeLabel: string;
    evaluatorLabel: string;
    items: CompetencyItem[];
  };
  
  export const RN_SCALE: CompetencyScaleOption[] = [
    { value: "E", label: "Excellent" },
    { value: "G", label: "Good" },
    { value: "F", label: "Fair" },
    { value: "P", label: "Poor" },
  ];
  
  export const SU_SCALE: CompetencyScaleOption[] = [
    { value: "S", label: "Satisfactory" },
    { value: "U", label: "Unsatisfactory" },
  ];
  
  export const skillsCompetencyDisciplines: CompetencyDiscipline[] = [
    {
      id: "rn",
      label: "RN",
      formTitle: "Skills Core Competency Checklist for Registered Nurse",
      scaleOptions: RN_SCALE,
      employeeLabel: "RN Name",
      evaluatorLabel: "Competency Assessed By",
      items: [
        { id: "temp", label: "System Assessments — Temperature" },
        { id: "pulse_radial_apical", label: "System Assessments — Pulse (Radial and Apical)" },
        { id: "respirations", label: "System Assessments — Respirations" },
        { id: "blood_pressure", label: "System Assessments — Blood Pressure" },
        { id: "pulse_oximetry", label: "System Assessments — Pulse Oximetry" },
        { id: "weight", label: "System Assessments — Weight" },
        { id: "respiratory", label: "System Assessments — Respiratory" },
        { id: "cardiovascular", label: "System Assessments — Cardiovascular" },
        { id: "digestive_gi", label: "System Assessments — Digestive / Gastrointestinal" },
        { id: "endocrine", label: "System Assessments — Endocrine" },
        { id: "nutrition", label: "System Assessments — Nutrition" },
        { id: "neuro_emotional", label: "System Assessments — Neurological / Emotional" },
        { id: "pain", label: "System Assessments — Pain" },
        { id: "musculoskeletal", label: "System Assessments — Musculoskeletal" },
        { id: "sensory", label: "System Assessments — Sensory" },
        { id: "functional_limitations", label: "System Assessments — Functional Limitations" },
        { id: "ent_eyes", label: "System Assessments — Ears / Nose / Throat / Eyes" },
        { id: "integumentary", label: "System Assessments — Integumentary" },
  
        { id: "teaching_disease_process", label: "Teaching — Disease Process" },
        { id: "teaching_diet_nutrition", label: "Teaching — Diet / Nutrition" },
        { id: "teaching_medication", label: "Teaching — Medication" },
        { id: "teaching_diabetic_management", label: "Teaching — Diabetic Management" },
  
        { id: "wound_sterile", label: "Wound Care — Sterile" },
        { id: "wound_nonsterile", label: "Wound Care — Non-sterile" },
        { id: "wound_vac", label: "Wound Care — Wound Vac" },
        { id: "wound_measuring", label: "Wound Care — Wound Measuring" },
  
        { id: "venipuncture_lab_draws", label: "Patient Care — Venipuncture / Lab Draws" },
        { id: "specimen_collection", label: "Patient Care — Specimen Collection" },
        { id: "catheter_care", label: "Patient Care — Catheter Care" },
        { id: "foley_insertion", label: "Patient Care — Foley Insertion" },
        { id: "replace_suprapubic", label: "Patient Care — Replace Suprapubic" },
        { id: "care_of_gtube", label: "Patient Care — Care of G-tube" },
        { id: "blood_glucometer_use", label: "Patient Care — Blood Glucometer Use" },
        { id: "care_of_jp_drain", label: "Patient Care — Care of JP Drain" },
        { id: "suture_removal", label: "Patient Care — Suture Removal" },
        { id: "staple_removal", label: "Patient Care — Staple Removal" },
        { id: "incentive_spirometry", label: "Patient Care — Incentive Spirometry" },
        { id: "colostomy_care", label: "Patient Care — Colostomy Care" },
        { id: "ileostomy_care", label: "Patient Care — Ileostomy Care" },
        { id: "ileal_conduit_care", label: "Patient Care — Ileal Conduit Care" },
        { id: "cast_care", label: "Patient Care — Cast Care" },
        { id: "use_of_splints", label: "Patient Care — Use of Splints" },
        { id: "safe_transfer_techniques", label: "Patient Care — Safe Transfer Techniques" },
  
        { id: "assistive_walker", label: "Assistive Devices — Walker" },
        { id: "assistive_cane", label: "Assistive Devices — Cane" },
        { id: "assistive_wheelchair", label: "Assistive Devices — Wheelchair" },
        { id: "assistive_crutches", label: "Assistive Devices — Crutches" },
  
        { id: "med_oral", label: "Medication Administration — Oral" },
        { id: "med_intramuscular", label: "Medication Administration — Intramuscular" },
        { id: "med_subcutaneous", label: "Medication Administration — Subcutaneous" },
        { id: "med_eye_drops", label: "Medication Administration — Eye Drops" },
        { id: "med_ear_drops", label: "Medication Administration — Ear Drops" },
        { id: "med_nose_drops", label: "Medication Administration — Nose Drops" },
        { id: "med_enteral_feedings", label: "Medication Administration — Enteral Feedings" },
        { id: "med_inhaled", label: "Medication Administration — Inhaled Medications" },
        { id: "oxygen_therapy", label: "Medication Administration — Oxygen Therapy" },
        { id: "nebulizer_therapy", label: "Medication Administration — Nebulizer Therapy" },
        { id: "iv_therapy", label: "Medication Administration — IV Therapy (if applicable)" },
  
        { id: "ic_universal_precautions", label: "Infection Control — Universal Precautions" },
        { id: "ic_hand_washing", label: "Infection Control — Hand Washing" },
        { id: "ic_bag_technique", label: "Infection Control — Bag Technique" },
        { id: "ic_glove_use", label: "Infection Control — Glove Use" },
        { id: "ic_biohazard_waste", label: "Infection Control — Biohazard Waste" },
        { id: "ic_sharps_disposal", label: "Infection Control — Sharps Disposal" },
        { id: "ic_specimen_transport", label: "Infection Control — Specimen Transport" },
  
        { id: "doc_admission_paperwork", label: "Documentation — Admission Paperwork" },
        { id: "doc_care_plan", label: "Documentation — Care Plan Development" },
        { id: "doc_visit_notes", label: "Documentation — Visit Notes" },
  
        { id: "supervision_lpn", label: "Supervisory Visits — LPN" },
        { id: "supervision_cna", label: "Supervisory Visits — CNA" },
        { id: "supervision_cmt", label: "Supervisory Visits — CMT" },
      ],
    },
  
    {
      id: "hha_cna",
      label: "HHA / CNA",
      formTitle: "Skills Competency Evaluation – Home Health Aide / CNA",
      scaleOptions: SU_SCALE,
      employeeLabel: "HHA / CNA Name",
      evaluatorLabel: "Competency Assessed By (RN)",
      items: [
        { id: "hha_temp", label: "Reads and records temperature" },
        { id: "hha_pulse", label: "Reads and records pulse" },
        { id: "hha_respirations", label: "Reads and records respirations" },
  
        { id: "hha_bed_bath", label: "Performs bed bath safely and appropriately" },
        { id: "hha_tub_shower_bath", label: "Performs shower or tub bath safely" },
        { id: "hha_sponge_bath", label: "Performs sponge bath as needed" },
        { id: "hha_hair_care", label: "Provides hair care (sink / tub / bed shampoo)" },
  
        { id: "hha_nail_care", label: "Provides nail care" },
        { id: "hha_skin_care", label: "Provides skin care; recognizes and reports changes" },
        { id: "hha_oral_hygiene", label: "Provides oral hygiene / denture care" },
        { id: "hha_pericare", label: "Performs perineal care properly" },
        { id: "hha_catheter_care", label: "Provides catheter care; empties catheter bag" },
  
        { id: "hha_transfer_technique", label: "Uses safe transfer techniques" },
        { id: "hha_ambulation", label: "Assists with ambulation safely" },
        { id: "hha_positioning", label: "Positions patient properly and safely" },
  
        { id: "hha_feeding_nutrition", label: "Assists with feeding; promotes nutrition and fluids" },
        { id: "hha_toileting", label: "Assists with toileting / incontinence care" },
  
        { id: "hha_communication", label: "Communication skills (reads, writes, verbally reports)" },
        { id: "hha_infection_program", label: "Follows infection control requirements" },
        { id: "hha_handwashing", label: "Uses proper hand washing technique" },
        { id: "hha_gloves", label: "Uses gloves and universal precautions properly" },
        { id: "hha_emergencies", label: "Recognizes emergencies and initiates emergency procedures" },
        { id: "hha_documentation", label: "Documents care and reports changes appropriately" },
      ],
    },
  
    {
      id: "pt",
      label: "PT",
      formTitle: "Core Competency Skills Checklist – Physical Therapist",
      scaleOptions: RN_SCALE,
      employeeLabel: "PT Name",
      evaluatorLabel: "Competency Assessed By",
      items: [],
    },
    {
      id: "pta",
      label: "PTA",
      formTitle: "Core Competency Skills Checklist – Physical Therapist Assistant / Aide",
      scaleOptions: RN_SCALE,
      employeeLabel: "PT Assistant / Aide Name",
      evaluatorLabel: "Supervising PT / Evaluator",
      items: [],
    },
    {
      id: "ot",
      label: "OT",
      formTitle: "Core Competency Skills Checklist – Occupational Therapist",
      scaleOptions: RN_SCALE,
      employeeLabel: "OT Name",
      evaluatorLabel: "Competency Assessed By",
      items: [],
    },
    {
      id: "ota",
      label: "OTA / Aide",
      formTitle: "Core Competency Skills Checklist – Occupational Therapist Assistant / Aide",
      scaleOptions: RN_SCALE,
      employeeLabel: "OT Assistant / Aide Name",
      evaluatorLabel: "Supervising OT / Evaluator",
      items: [],
    },
    {
      id: "st",
      label: "Speech",
      formTitle: "Core Competency Skills Checklist – Speech Therapist",
      scaleOptions: RN_SCALE,
      employeeLabel: "Speech Therapist Name",
      evaluatorLabel: "Competency Assessed By",
      items: [],
    },
    {
      id: "msw",
      label: "MSW",
      formTitle: "Core Competency Skills Checklist – Medical Social Worker",
      scaleOptions: RN_SCALE,
      employeeLabel: "MSW Name",
      evaluatorLabel: "Competency Assessed By",
      items: [],
    },
    {
      id: "msw_assistant",
      label: "MSW Assistant",
      formTitle: "Core Competency Skills Checklist – Social Work Assistant",
      scaleOptions: RN_SCALE,
      employeeLabel: "Social Work Assistant Name",
      evaluatorLabel: "Supervising MSW / Evaluator",
      items: [],
    },
  ];