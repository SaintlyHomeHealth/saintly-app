export type RecruitingEmailTemplateId =
  | "rn_follow_up"
  | "pt_follow_up"
  | "pta_follow_up"
  | "lpn_follow_up"
  | "interview_scheduling"
  | "missing_documents";

export type RecruitingEmailTemplateVariableKey =
  | "first_name"
  | "full_name"
  | "role"
  | "visit_rate"
  | "soc_rate"
  | "pay_summary"
  | "phone"
  | "email";

export type RecruitingEmailTemplateDefinition = {
  id: RecruitingEmailTemplateId;
  label: string;
  subject: string;
  body: string;
};

const ROLE_FOLLOW_UP_BODY = `Hi {{first_name}},

Thank you for your interest in {{role}} visit opportunities with Saintly Home Health.

We are currently offering {{pay_summary}}.

If you are still interested, please reply to this email with a good time for a quick call so we can discuss your availability, experience, and next steps.

Best regards,
Saintly Home Health Recruiting`;

export const RECRUITING_EMAIL_TEMPLATES: RecruitingEmailTemplateDefinition[] = [
  {
    id: "rn_follow_up",
    label: "RN follow-up (starting at $60/visit, up to $80, $110 SOC)",
    subject: "RN visit opportunities with Saintly Home Health",
    body: ROLE_FOLLOW_UP_BODY.replace("{{role}}", "RN"),
  },
  {
    id: "pt_follow_up",
    label: "PT follow-up ($80/visit, $110 SOC)",
    subject: "PT visit opportunities with Saintly Home Health",
    body: ROLE_FOLLOW_UP_BODY.replace("{{role}}", "PT"),
  },
  {
    id: "pta_follow_up",
    label: "PTA follow-up ($60/visit)",
    subject: "PTA visit opportunities with Saintly Home Health",
    body: ROLE_FOLLOW_UP_BODY.replace("{{role}}", "PTA"),
  },
  {
    id: "lpn_follow_up",
    label: "LPN follow-up ($60/visit)",
    subject: "LPN visit opportunities with Saintly Home Health",
    body: ROLE_FOLLOW_UP_BODY.replace("{{role}}", "LPN"),
  },
  {
    id: "interview_scheduling",
    label: "Interview / call scheduling",
    subject: "Saintly Home Health — quick call",
    body: `Hi {{first_name}},

Thank you again for applying for our {{role}} opportunity with Saintly Home Health.

We would like to schedule a brief phone call to learn more about your experience and availability.

Please reply with a good time for a quick call, or call us at {{phone}} if you prefer.

We look forward to speaking with you.

Best regards,
Saintly Home Health Recruiting`,
  },
  {
    id: "missing_documents",
    label: "Missing documents",
    subject: "Saintly Home Health — missing documents",
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
