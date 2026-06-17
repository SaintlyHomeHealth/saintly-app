export type RecruitingEmailTemplateId =
  | "lpn_follow_up"
  | "rn_follow_up"
  | "interview_scheduling"
  | "missing_documents";

export type RecruitingEmailTemplateVariableKey =
  | "first_name"
  | "full_name"
  | "role"
  | "phone"
  | "email"
  | "city"
  | "pay_rate"
  | "soc_rate";

export type RecruitingEmailTemplateDefinition = {
  id: RecruitingEmailTemplateId;
  label: string;
  subject: string;
  body: string;
};

export const RECRUITING_EMAIL_TEMPLATES: RecruitingEmailTemplateDefinition[] = [
  {
    id: "lpn_follow_up",
    label: "LPN follow-up ($60/visit)",
    subject: "LPN opportunities with Saintly Home Health",
    body: `Hi {{first_name}},

Thank you for your interest in LPN visit opportunities with Saintly Home Health.

We are currently offering {{pay_rate}} per visit for qualified LPNs in {{city}}.

If you are still interested, please reply to this email or call us at your convenience so we can discuss next steps.

Best regards,
Saintly Home Health Recruiting`,
  },
  {
    id: "rn_follow_up",
    label: "RN follow-up ($80/visit, $110 SOC)",
    subject: "RN opportunities with Saintly Home Health",
    body: `Hi {{first_name}},

Thank you for your interest in RN visit opportunities with Saintly Home Health.

We are currently offering {{pay_rate}} per visit and {{soc_rate}} for start-of-care visits for qualified RNs in {{city}}.

If you are still interested, please reply to this email or call us at your convenience so we can discuss next steps.

Best regards,
Saintly Home Health Recruiting`,
  },
  {
    id: "interview_scheduling",
    label: "Interview / call scheduling",
    subject: "Schedule a recruiting call — Saintly Home Health",
    body: `Hi {{first_name}},

Thank you again for applying for our {{role}} opportunity with Saintly Home Health.

We would like to schedule a brief phone call to learn more about your experience and availability.

Please reply with a few times that work for you this week, or call us at {{phone}} if you prefer.

We look forward to speaking with you.

Best regards,
Saintly Home Health Recruiting`,
  },
  {
    id: "missing_documents",
    label: "Missing documents",
    subject: "Documents needed — Saintly Home Health application",
    body: `Hi {{first_name}},

Thank you for your interest in joining Saintly Home Health as a {{role}}.

To continue reviewing your application, we still need a few items from you (for example: resume, license copy, or other credentialing documents).

Please reply to this email with the missing documents, or let us know if you have questions.

Best regards,
Saintly Home Health Recruiting`,
  },
];

export function getRecruitingEmailTemplateById(
  id: string
): RecruitingEmailTemplateDefinition | null {
  const key = id.trim() as RecruitingEmailTemplateId;
  return RECRUITING_EMAIL_TEMPLATES.find((t) => t.id === key) ?? null;
}

export function recruitingEmailTemplatesForClient(): Array<{
  id: RecruitingEmailTemplateId;
  label: string;
  subject: string;
  body: string;
}> {
  return RECRUITING_EMAIL_TEMPLATES.map(({ id, label, subject, body }) => ({
    id,
    label,
    subject,
    body,
  }));
}
