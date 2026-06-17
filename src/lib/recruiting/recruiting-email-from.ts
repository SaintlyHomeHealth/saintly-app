import "server-only";

const DEFAULT_FROM_NAME = "Saintly Home Health Recruiting";
const DEFAULT_FROM_EMAIL = "info@saintlyhomehealth.com";

export type RecruitingEmailSender = {
  from: string;
  replyTo: string;
  name: string;
  email: string;
};

export function getRecruitingEmailSender(): RecruitingEmailSender {
  const name = (process.env.RECRUITING_FROM_NAME ?? "").trim() || DEFAULT_FROM_NAME;
  const email = (process.env.RECRUITING_FROM_EMAIL ?? "").trim() || DEFAULT_FROM_EMAIL;
  const replyTo = (process.env.RECRUITING_REPLY_TO ?? "").trim() || email;
  return {
    from: `${name} <${email}>`,
    replyTo: replyTo.includes("@") ? replyTo : email,
    name,
    email: email.includes("@") ? email : DEFAULT_FROM_EMAIL,
  };
}

export function isRecruitingEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}
