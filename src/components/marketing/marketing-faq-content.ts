export type FaqItem = { q: string; a: string };

export type FaqCategory = {
  id: string;
  title: string;
  items: FaqItem[];
};

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      {
        q: "How do I get started with home health?",
        a: "Call our intake line. We’ll ask a few questions about your health, recent hospital or clinic visits, and your doctor. If home health looks appropriate, we work with your physician to obtain the orders needed to begin.",
      },
      {
        q: "How quickly can care begin?",
        a: "Often within 24–48 hours after we confirm eligibility and have valid orders. Timing depends on your situation and how quickly your doctor sends orders.",
      },
      {
        q: "Can a family member call on behalf of a patient?",
        a: "Yes. Many families reach out first. We’ll still need the patient’s consent and, for Medicare, a physician’s order to provide skilled care.",
      },
      {
        q: "Do I need a doctor’s order?",
        a: "Yes—for Medicare-covered skilled home health, a physician must order care and stay involved in your plan. We help coordinate that process.",
      },
    ],
  },
  {
    id: "medicare-coverage",
    title: "Medicare & coverage",
    items: [
      {
        q: "Does Medicare cover home health?",
        a: "If you meet Medicare’s rules for home health, approved services are often covered at 100%—no copay for covered visits. Coverage depends on being homebound, needing skilled care, and having a qualifying plan of care from your doctor.",
      },
      {
        q: "What other insurance plans are you working on?",
        a: "We’re actively contracting with Medicare Advantage plans, AHCCCS (Medicaid), and Veterans programs. Ask us about your specific plan—we’ll be honest about what we can accept today.",
      },
      {
        q: "Will you help verify eligibility?",
        a: "Yes. Our intake team reviews your situation and explains what Medicare or other coverage may allow before you commit to anything.",
      },
    ],
  },
  {
    id: "services-at-home",
    title: "Services at home",
    items: [
      {
        q: "What services do you provide at home?",
        a: "Skilled nursing, wound care, physical, occupational, and speech therapy, medication teaching, catheter and ostomy care, medical social work, and home health aide support when ordered as part of your plan.",
      },
      {
        q: "Do you provide wound care at home?",
        a: "Yes. Our nurses provide dressing changes, monitoring, and teaching for many wound types under physician orders.",
      },
      {
        q: "Do you offer physical therapy at home?",
        a: "Yes. Therapists work on mobility, strength, balance, and safety in your own environment.",
      },
      {
        q: "Do you help after a hospital stay?",
        a: "Yes. Many patients start home health after discharge to recover safely, avoid readmission, and follow their doctor’s plan.",
      },
    ],
  },
  {
    id: "referrals-physicians",
    title: "Referrals & physicians",
    items: [
      {
        q: "Can doctors, hospitals, or case managers send referrals?",
        a: "Absolutely. We welcome referrals from physicians, hospitals, SNFs, rehab, and community partners. Use phone, fax, or email—see our Referrals page for details.",
      },
      {
        q: "How do referral partners contact Saintly?",
        a: "Call intake, fax orders to our fax line, or email our team. We list current numbers on the Contact and Referrals pages.",
      },
      {
        q: "Do you coordinate with the patient’s physician?",
        a: "Yes. We obtain orders, share updates, and communicate changes so your doctor stays informed.",
      },
    ],
  },
  {
    id: "general",
    title: "General questions",
    items: [
      {
        q: "What areas do you serve?",
        a: "Greater Phoenix and surrounding counties—including Maricopa, Pinal, Gila, Yavapai, and Pima. Call if you’re unsure about your address.",
      },
      {
        q: "Is Saintly Medicare-certified?",
        a: "Yes. Saintly Home Health is a Medicare-certified home health agency based in Tempe, Arizona.",
      },
      {
        q: "How do I know if home health is the right fit?",
        a: "If you need skilled nursing or therapy at home, have trouble leaving home for care, or are recovering from illness or surgery, home health may help. When in doubt, call us—we’ll guide you.",
      },
    ],
  },
];
