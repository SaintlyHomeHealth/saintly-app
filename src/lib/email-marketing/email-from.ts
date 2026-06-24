import "server-only";

import { SAINTLY_COMPANY } from "@/lib/email-marketing/company-info";

export type EmailMarketingSender = {
  from: string;
  replyTo: string;
  fromEmail: string;
  replyToEmail: string;
  fromName: string;
};

export function getEmailMarketingSender(): EmailMarketingSender {
  const fromName = (process.env.EMAIL_FROM_NAME ?? "").trim() || "Saintly Home Health";
  const fromEmail =
    (process.env.EMAIL_FROM_ADDRESS ?? "").trim() || SAINTLY_COMPANY.crmSendEmail;
  const replyToEmail =
    (process.env.EMAIL_REPLY_TO ?? "").trim() || SAINTLY_COMPANY.crmSendEmail;

  return {
    from: `${fromName} <${fromEmail}>`,
    replyTo: replyToEmail.includes("@") ? replyToEmail : fromEmail,
    fromEmail,
    replyToEmail: replyToEmail.includes("@") ? replyToEmail : fromEmail,
    fromName,
  };
}

export function getEmailMarketingProvider(): string {
  return (process.env.EMAIL_PROVIDER ?? "gmail").trim().toLowerCase() || "gmail";
}

export function isEmailMarketingConfigured(): boolean {
  const provider = getEmailMarketingProvider();
  const sender = getEmailMarketingSender();
  if (!sender.fromEmail.includes("@")) return false;

  switch (provider) {
    case "gmail":
      return Boolean(
        process.env.GOOGLE_GMAIL_REFRESH_TOKEN?.trim() ||
          process.env.GOOGLE_CLIENT_ID?.trim()
      );
    case "resend":
      return Boolean(process.env.RESEND_API_KEY?.trim());
    case "sendgrid":
      return Boolean(process.env.SENDGRID_API_KEY?.trim());
    case "postmark":
      return Boolean(process.env.POSTMARK_API_KEY?.trim());
    case "smtp":
      return Boolean(
        process.env.SMTP_HOST?.trim() &&
          process.env.SMTP_USER?.trim() &&
          process.env.SMTP_PASS?.trim()
      );
    default:
      return false;
  }
}
