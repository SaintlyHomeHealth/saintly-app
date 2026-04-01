export type SkillsCompetencyItem = {
    id: string;
    category: string;
    label: string;
    description?: string;
  };
  
  export const SKILLS_COMPETENCY_ITEMS: SkillsCompetencyItem[] = [
    {
      id: "hand_hygiene",
      category: "Infection Control",
      label: "Performs hand hygiene correctly",
      description: "Uses proper handwashing or sanitizer technique before and after care.",
    },
    {
      id: "ppe_usage",
      category: "Infection Control",
      label: "Uses PPE appropriately",
      description: "Selects and dons/doffs PPE based on patient need and precautions.",
    },
    {
      id: "vital_signs",
      category: "Clinical Skills",
      label: "Obtains and records vital signs accurately",
      description: "Temperature, pulse, respirations, blood pressure, oxygen saturation when applicable.",
    },
    {
      id: "medication_awareness",
      category: "Clinical Skills",
      label: "Demonstrates medication awareness",
      description: "Understands med safety, basic side effects, and reporting expectations.",
    },
    {
      id: "patient_identification",
      category: "Patient Safety",
      label: "Verifies correct patient before care",
      description: "Uses proper patient identification process before treatment or task.",
    },
    {
      id: "fall_precautions",
      category: "Patient Safety",
      label: "Implements fall precautions appropriately",
      description: "Recognizes fall risk and uses safe transfer / mobility precautions.",
    },
    {
      id: "documentation_accuracy",
      category: "Documentation",
      label: "Documents accurately and timely",
      description: "Charting is complete, legible, and consistent with observed care.",
    },
    {
      id: "policy_compliance",
      category: "Documentation",
      label: "Follows agency policies and procedures",
      description: "Understands and follows Saintly standards and protocols.",
    },
    {
      id: "professionalism",
      category: "Professionalism",
      label: "Demonstrates professionalism",
      description: "Appearance, communication, timeliness, and conduct are appropriate.",
    },
    {
      id: "patient_communication",
      category: "Professionalism",
      label: "Communicates effectively with patient/family",
      description: "Clear, respectful, calm, and appropriate communication.",
    },
    {
      id: "emergency_response",
      category: "Emergency Preparedness",
      label: "Understands emergency response expectations",
      description: "Knows when and how to escalate urgent clinical or safety concerns.",
    },
    {
      id: "care_plan_followthrough",
      category: "Care Delivery",
      label: "Follows plan of care appropriately",
      description: "Provides care in line with ordered services and documented needs.",
    },
  ];
  
  export type SkillsCompetencyScoreValue = 0 | 1 | 2 | 3;
  
  export const SKILLS_COMPETENCY_SCORE_OPTIONS: {
    value: SkillsCompetencyScoreValue;
    label: string;
    shortLabel: string;
  }[] = [
    { value: 0, label: "Not Demonstrated", shortLabel: "0" },
    { value: 1, label: "Needs Improvement", shortLabel: "1" },
    { value: 2, label: "Competent", shortLabel: "2" },
    { value: 3, label: "Exceeds Standard", shortLabel: "3" },
  ];
  
  export function getSkillsCompetencyDefaultData() {
    return {
      employeeName: "",
      employeeDiscipline: "",
      evaluatorName: "",
      evaluationDate: new Date().toISOString().slice(0, 10),
      reviewPeriod: "",
      location: "",
      overallComments: "",
      actionPlan: "",
      recommendedOutcome: "competent",
      items: SKILLS_COMPETENCY_ITEMS.map((item) => ({
        itemId: item.id,
        score: 2 as SkillsCompetencyScoreValue,
        comments: "",
      })),
    };
  }
  
  export function getSkillsCompetencyScoreSummary(formData: any) {
    const items = Array.isArray(formData?.items) ? formData.items : [];
    const totalPossible = items.length * 3;
  
    if (!items.length || totalPossible === 0) {
      return {
        percent: 0,
        label: "No Score",
      };
    }
  
    const totalEarned = items.reduce((sum: number, item: any) => {
      const score = Number(item?.score ?? 0);
      return sum + (Number.isFinite(score) ? score : 0);
    }, 0);
  
    const percent = Number(((totalEarned / totalPossible) * 100).toFixed(2));
  
    let label = "Needs Review";
    if (percent >= 90) label = "Exceeds Standard";
    else if (percent >= 75) label = "Competent";
    else if (percent >= 60) label = "Needs Improvement";
    else label = "Not Demonstrated";
  
    return { percent, label };
  }