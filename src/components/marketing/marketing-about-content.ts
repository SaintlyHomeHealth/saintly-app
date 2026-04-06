/** Short marketing copy only — not full bios. */
export const ABOUT_WHO_WE_ARE = [
  "Saintly Home Health is a Medicare-certified agency based in Tempe, serving families across Greater Phoenix. We bring skilled nursing, wound care, and therapy into the home so you can heal where you feel most comfortable.",
  "Our team works closely with your physician—because home health only moves forward with clear orders, honest communication, and a plan that fits your life.",
  "Whether you’re recovering from a hospital stay, managing a complex wound, or rebuilding strength, we’re here to help with steady, respectful care.",
] as const;

export type LeadershipCard = {
  name: string;
  title: string;
  summary: string;
  /** Omit when not applicable (e.g. non-clinical leadership). */
  credentials?: string;
};

export const LEADERSHIP: LeadershipCard[] = [
  {
    name: "Dana Reano",
    title: "Clinical Director",
    summary:
      "Leads Saintly’s clinical quality and patient care standards with a background in critical care and home health nursing. Dana helps ensure patients receive safe, compassionate, high-level care at home.",
    credentials: "RN, BSN, CCRN",
  },
  {
    name: "Sandra Cooper",
    title: "Administrator",
    summary:
      "Oversees daily operations, coordination, and compliance across Saintly Home Health. Sandra brings deep home health leadership experience and helps keep care organized, timely, and patient-focused.",
    credentials: "RN",
  },
  {
    name: "Paul Vonasek",
    title: "Vice President",
    summary:
      "Supports Saintly’s operations, systems, growth, and overall agency development. Paul works closely with clinical leadership to help build a strong, dependable home health organization for patients and families.",
  },
];

export const CLINICAL_GROUPS = [
  {
    title: "Nursing",
    lines: [
      "Registered nurses and licensed practical/vocational nurses for assessments, teaching, injections, and wound oversight.",
      "Care plans stay connected to your doctor with timely updates.",
    ],
  },
  {
    title: "Therapy",
    lines: [
      "Physical, occupational, and speech therapists focused on mobility, daily living, and communication at home.",
      "Goals are practical: safer transfers, fewer falls, confidence for patients and caregivers.",
    ],
  },
  {
    title: "Aides",
    lines: [
      "Home health aides support bathing, dressing, and personal care under RN direction.",
      "Visits emphasize dignity, consistency, and clear communication with your care team.",
    ],
  },
  {
    title: "Support staff",
    lines: [
      "Intake, scheduling, and medical social work help navigate benefits, equipment, and next steps.",
      "You’re not bounced around—we coordinate so families know who to call.",
    ],
  },
] as const;

export const WHY_CHOOSE = [
  {
    title: "Medicare-certified",
    body: "We meet federal home health standards for quality, documentation, and patient rights.",
  },
  {
    title: "Experienced clinicians",
    body: "Field staff who know community resources and how to collaborate with local physicians.",
  },
  {
    title: "Coordinated with physicians",
    body: "We obtain orders, share progress, and flag changes early so your doctor stays in the loop.",
  },
  {
    title: "Fast start of care",
    body: "Many patients begin within 24–48 hours once eligibility and orders are in place.",
  },
  {
    title: "Compassionate approach",
    body: "Clear explanations, patient pacing, and respect for every person in the home.",
  },
] as const;
