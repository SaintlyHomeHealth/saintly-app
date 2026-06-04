/** Structured Compliance Program copy — shared by the public website page and credentialing PDF. */

export const COMPLIANCE_PROGRAM_SOURCE_URL = "https://www.saintlyhomehealth.com/compliance-program";

export const COMPLIANCE_PROGRAM_EFFECTIVE_DATE = "April 18, 2026";

export type ComplianceProgramBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export const COMPLIANCE_PROGRAM_BLOCKS: ComplianceProgramBlock[] = [
  {
    type: "p",
    text: "Saintly Home Health LLC is committed to conducting business in full compliance with applicable federal, state, and local laws, regulations, and program requirements. This Compliance Program describes how the agency detects, prevents, and responds to illegal or unethical conduct and supports a culture of integrity across clinical, operational, and administrative functions.",
  },
  {
    type: "p",
    text: "This page summarizes Saintly’s corporate compliance framework for patients, referral partners, payers, and workforce members. It is intended for transparency and payer credentialing purposes and does not replace internal policy manuals, contracts, or notices of privacy practices.",
  },
  { type: "h2", text: "Purpose" },
  {
    type: "p",
    text: "The purpose of the Compliance Program is to promote lawful, ethical, and high-quality home health operations; reduce the risk of fraud, waste, and abuse; protect patient rights and protected health information; and support timely correction when issues are identified.",
  },
  { type: "h2", text: "Scope" },
  {
    type: "p",
    text: "The Compliance Program applies to Saintly Home Health LLC and to all employees, contractors, agents, volunteers, and other representatives who perform services on the agency’s behalf, including clinical field staff, administrative personnel, and leadership.",
  },
  { type: "h2", text: "Program Elements" },
  {
    type: "p",
    text: "Saintly’s Compliance Program is designed around recognized health care compliance principles and includes, at minimum, the following elements:",
  },
  {
    type: "ul",
    items: [
      "Written policies, procedures, and standards of conduct",
      "Designation of a Compliance Officer and oversight structure",
      "Effective compliance training and education",
      "Open lines of communication for questions and reporting, with protection against retaliation",
      "Internal monitoring, auditing, and risk assessment",
      "Disciplinary standards for noncompliance",
      "Prompt investigation and corrective action when issues are detected",
    ],
  },
  { type: "h2", text: "Compliance Officer and Oversight" },
  {
    type: "p",
    text: "The Administrator serves as the agency Compliance Officer, with executive support from clinical and operational leadership. The Compliance Officer is responsible for coordinating compliance activities, reviewing reported concerns, recommending corrective action, and reporting material issues to senior leadership.",
  },
  {
    type: "p",
    text: "A Compliance Committee provides oversight at least annually and as needed to review compliance trends, regulatory alerts, reported concerns, training effectiveness, and recommended policy updates.",
  },
  { type: "h3", text: "Current leadership contacts" },
  {
    type: "ul",
    items: [
      "Administrator / Compliance Officer: Sandra Cooper, RN",
      "Clinical Director: Dana Reano, RN, BSN, CCRN",
      "Vice President: Paul Vonasek",
    ],
  },
  { type: "h2", text: "Standards of Conduct" },
  {
    type: "p",
    text: "Saintly expects all workforce members to act with honesty, integrity, and professionalism. Core standards include:",
  },
  {
    type: "ul",
    items: [
      "Obey all applicable laws, regulations, and agency policies",
      "Provide care consistent with physician orders and the plan of care",
      "Maintain confidentiality of patient and agency information",
      "Use agency resources only for authorized purposes",
      "Avoid conflicts of interest and improper inducements",
      "Report suspected abuse, neglect, fraud, waste, abuse, or compliance concerns promptly",
      "Cooperate with audits, investigations, and quality review activities",
    ],
  },
  { type: "h2", text: "Fraud, Waste, and Abuse" },
  {
    type: "p",
    text: "Saintly maintains zero tolerance for fraud, waste, and abuse in any federal, state, or commercial health care program. Workforce members must comply with applicable anti-fraud laws and regulations, including requirements related to false claims, improper billing, kickbacks, and self-referral restrictions.",
  },
  {
    type: "p",
    text: "Suspected fraud, waste, or abuse must be reported promptly through supervisory channels or directly to the Compliance Officer. Reports may also be made to appropriate government authorities, including the U.S. Department of Health and Human Services Office of Inspector General (OIG), where appropriate.",
  },
  { type: "h2", text: "HIPAA, Privacy, and Security" },
  {
    type: "p",
    text: "Saintly handles protected health information in accordance with HIPAA, applicable state privacy laws, and internal privacy and security policies. Administrative, technical, and operational safeguards are used to protect information handled during home health services and related communications.",
  },
  {
    type: "p",
    text: "Workforce members receive training on privacy, confidentiality, and appropriate use of systems and communications tools. Saintly does not claim independent third-party HIPAA certification; compliance depends on how systems are configured, used, and supervised in practice.",
  },
  { type: "h2", text: "Exclusion Screening and Workforce Integrity" },
  {
    type: "p",
    text: "Saintly screens employees, contractors, and applicable vendors against federal and state exclusion and sanction lists, including OIG and SAM screening where required, before engagement and on an ongoing basis as required by policy.",
  },
  {
    type: "p",
    text: "Individuals excluded from participation in federal health care programs or otherwise disqualified under applicable law will not be permitted to provide services on behalf of the agency.",
  },
  { type: "h2", text: "Billing, Documentation, and Claims Integrity" },
  {
    type: "p",
    text: "Claims and billing activities must be supported by accurate, timely, and complete clinical and administrative documentation. Services must be ordered, medically necessary, and provided in accordance with applicable coverage rules, payer contracts, and program requirements.",
  },
  {
    type: "p",
    text: "Coding, billing, and reimbursement questions that are unclear must be escalated to supervisory staff or the Compliance Officer rather than resolved through guesswork.",
  },
  { type: "h2", text: "Quality, Patient Rights, and Clinical Compliance" },
  {
    type: "p",
    text: "Clinical care is delivered under physician direction and in accordance with home health conditions of participation, licensure requirements, and agency patient care policies. Quality Assessment and Performance Improvement (QAPI) activities support safe care, patient rights, infection control, medication management, and care plan compliance.",
  },
  { type: "h2", text: "Training and Education" },
  {
    type: "p",
    text: "All workforce members receive compliance-related orientation at hire and ongoing education at least annually or more frequently when required by law, regulation, or identified risk. Training topics include privacy and security, fraud waste and abuse, standards of conduct, documentation expectations, and reporting obligations.",
  },
  {
    type: "p",
    text: "Supervisors are responsible for ensuring that staff under their direction complete required training and acknowledge applicable policies.",
  },
  { type: "h2", text: "Reporting and Non-Retaliation" },
  {
    type: "p",
    text: "Saintly encourages good-faith reporting of suspected noncompliance, policy violations, or unethical conduct. Workforce members may report concerns to their supervisor, the Compliance Officer, or executive leadership.",
  },
  {
    type: "p",
    text: "The agency prohibits retaliation against any person who reports a concern in good faith or participates in an investigation, audit, or compliance review.",
  },
  { type: "h2", text: "Monitoring, Auditing, and Corrective Action" },
  {
    type: "p",
    text: "The Compliance Officer and leadership team use audits, record review, complaint tracking, training completion monitoring, and other internal controls to evaluate program effectiveness. Detected issues are investigated promptly and addressed through corrective action, additional training, policy revision, discipline, or referral to appropriate authorities when warranted.",
  },
  { type: "h2", text: "Disciplinary Action" },
  {
    type: "p",
    text: "Violations of law, regulation, payer requirements, or agency policy may result in corrective counseling, additional monitoring, suspension, termination, contract termination, or referral to licensing boards or law enforcement, depending on severity and applicable policy.",
  },
  { type: "h2", text: "Record Retention" },
  {
    type: "p",
    text: "Saintly retains records related to patient care, billing, compliance, personnel, and contracts in accordance with applicable legal, regulatory, and payer requirements, including extended retention periods where required for Medicare, Medicaid, or contractual obligations.",
  },
  { type: "h2", text: "Related Policies" },
  {
    type: "p",
    text: "The Compliance Program works together with Saintly’s other published policies and internal manuals, including administrative, patient care, financial, personnel, and QAPI policies. Public policy summaries are available at:",
  },
  {
    type: "ul",
    items: [
      "Privacy Policy: https://www.saintlyhomehealth.com/privacy",
      "Security & HIPAA Practices: https://www.saintlyhomehealth.com/security",
      "Terms of Service: https://www.saintlyhomehealth.com/terms",
    ],
  },
  { type: "h2", text: "Questions and Contact" },
  {
    type: "p",
    text: "For compliance, privacy, or credentialing questions, contact Saintly Home Health LLC using the information on this page or the agency’s main intake line.",
  },
];

export const COMPLIANCE_PROGRAM_COVER_FIELDS = {
  title: "Saintly Home Health LLC Compliance Program Materials",
  companyName: "Saintly Home Health LLC",
  address: "64 East Broadway Rd, Suite 200-235, Tempe, AZ 85282",
  phone: "480-360-0008",
  fax: "480-393-4119",
  email: "info@saintlyhomehealth.com",
  website: "www.saintlyhomehealth.com",
  npi: "1548037294",
  ein: "93-4659140",
  medicarePtan: "037839",
  ahcccsProviderId: "224210",
} as const;
