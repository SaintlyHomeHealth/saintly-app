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