import { CANONICAL_CRM_ORIGIN, getAppBaseUrl, normalizeCrmAppOrigin } from "@/lib/app-url";
import { SAINTLY_COMPANY } from "@/lib/email-marketing/company-info";
import type { EmailMarketingFlyerRow, EmailSenderProfileRow } from "@/lib/email-marketing/types";

export const EMAIL_MARKETING_LOGO_PATH = "/images/saintly-logo-email.png";

export type ResolvedSenderProfile = {
  displayName: string;
  title: string;
  phone: string;
  fax: string;
  email: string;
  signature: string;
};

export function resolveEmailMarketingLogoUrl(): string {
  const base =
    getAppBaseUrl() ||
    normalizeCrmAppOrigin(
      process.env.APP_BASE_URL?.trim() ||
        process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
        CANONICAL_CRM_ORIGIN
    );
  return `${base}${EMAIL_MARKETING_LOGO_PATH}`;
}

export function resolveSenderProfile(
  profile: EmailSenderProfileRow | null | undefined,
  custom?: {
    name?: string;
    title?: string;
    phone?: string;
    email?: string;
    signature?: string;
  }
): ResolvedSenderProfile {
  if (profile?.is_custom) {
    return {
      displayName: custom?.name?.trim() || "Saintly Home Health",
      title: custom?.title?.trim() || "",
      phone: custom?.phone?.trim() || SAINTLY_COMPANY.phone,
      fax: SAINTLY_COMPANY.fax,
      email: custom?.email?.trim() || SAINTLY_COMPANY.crmSendEmail,
      signature: custom?.signature?.trim() || "",
    };
  }
  return {
    displayName: profile?.display_name?.trim() || "Saintly Home Health",
    title: profile?.title?.trim() || "",
    phone: profile?.phone?.trim() || SAINTLY_COMPANY.phone,
    fax: profile?.fax?.trim() || SAINTLY_COMPANY.fax,
    email: profile?.email?.trim() || SAINTLY_COMPANY.crmSendEmail,
    signature: profile?.signature?.trim() || "",
  };
}

export function applyTemplateVariables(
  text: string,
  vars: { recipient_name?: string; organization_name?: string }
): string {
  const name = vars.recipient_name?.trim() || "there";
  const org = vars.organization_name?.trim() || "your organization";
  return text
    .replaceAll("{{recipient_name}}", name)
    .replaceAll("{{organization_name}}", org);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function plainTextToHtml(text: string): string {
  return escapeHtml(text.trim()).replace(/\n/g, "<br />");
}

export type LetterheadBuildInput = {
  body: string;
  sender: ResolvedSenderProfile;
  showPrivateBusinessEmail?: boolean;
  flyer?: Pick<EmailMarketingFlyerRow, "title" | "file_url"> | null;
  attachFlyer?: boolean;
};

export function buildLetterheadHtml(input: LetterheadBuildInput): string {
  const logoUrl = resolveEmailMarketingLogoUrl();
  const businessEmail = input.showPrivateBusinessEmail
    ? SAINTLY_COMPANY.publicEmail
    : SAINTLY_COMPANY.crmSendEmail;
  const bodyHtml = plainTextToHtml(input.body);
  const sender = input.sender;

  const flyerBlock =
    input.flyer && (input.attachFlyer || input.flyer.file_url)
      ? `<div style="margin-top:18px;padding:14px 16px;border:1px solid #bae6fd;border-radius:12px;background:#f0f9ff;">
          <div style="font-size:12px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:0.06em;">Attached flyer</div>
          <div style="margin-top:6px;font-size:14px;color:#0f172a;">${escapeHtml(input.flyer.title)}</div>
          <div style="margin-top:8px;"><a href="${escapeHtml(input.flyer.file_url)}" style="color:#0284c7;font-weight:600;text-decoration:none;">View / download flyer</a></div>
        </div>`
      : "";

  const signatureLines = [
    sender.displayName,
    sender.title,
    SAINTLY_COMPANY.legalName,
    sender.phone ? `Phone: ${sender.phone}` : "",
    sender.fax ? `Fax: ${sender.fax}` : "",
    sender.email ? `Email: ${sender.email}` : "",
    SAINTLY_COMPANY.website,
    sender.signature,
    SAINTLY_COMPANY.tagline,
  ]
    .filter(Boolean)
    .map((line) => escapeHtml(line))
    .join("<br />");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f8fafc;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:24px 12px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" width="640" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.06);">
          <tr>
            <td style="padding:24px 28px;background:linear-gradient(135deg,#f0f9ff 0%,#ffffff 55%,#ecfeff 100%);border-bottom:3px solid #0284c7;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${logoUrl}" alt="Saintly Home Health LLC" width="150" style="display:block;width:150px;max-width:150px;height:auto;border:0;" />
                  </td>
                  <td align="right" style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#334155;">
                    <div style="font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(SAINTLY_COMPANY.legalName)}</div>
                    <div>${escapeHtml(SAINTLY_COMPANY.addressLine1)}</div>
                    <div>${escapeHtml(SAINTLY_COMPANY.cityStateZip)}</div>
                    <div>Phone: ${escapeHtml(SAINTLY_COMPANY.phone)}</div>
                    <div>Fax: ${escapeHtml(SAINTLY_COMPANY.fax)}</div>
                    <div>Email: ${escapeHtml(businessEmail)}</div>
                    <div>${escapeHtml(SAINTLY_COMPANY.website)}</div>
                  </td>
                </tr>
              </table>
              <div style="margin-top:14px;padding-top:12px;border-top:1px solid #dbeafe;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.55;color:#475569;">
                NPI: ${escapeHtml(SAINTLY_COMPANY.npi)} · Medicare PTAN/CCN: ${escapeHtml(SAINTLY_COMPANY.medicarePtan)} · AZDHS: ${escapeHtml(SAINTLY_COMPANY.azdhsLicense)} · AHCCCS: ${escapeHtml(SAINTLY_COMPANY.ahcccsId)}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#1e293b;">
              ${bodyHtml}
              ${flyerBlock}
              <div style="margin-top:24px;padding-top:18px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.55;color:#334155;">
                ${signatureLines}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildLetterheadText(input: LetterheadBuildInput): string {
  const businessEmail = input.showPrivateBusinessEmail
    ? SAINTLY_COMPANY.publicEmail
    : SAINTLY_COMPANY.crmSendEmail;
  const sender = input.sender;
  const flyerBlock =
    input.flyer && input.attachFlyer
      ? `\n\nAttached flyer: ${input.flyer.title}\n${input.flyer.file_url}`
      : input.flyer
        ? `\n\nFlyer link: ${input.flyer.title}\n${input.flyer.file_url}`
        : "";

  const signature = [
    "",
    sender.displayName,
    sender.title,
    SAINTLY_COMPANY.legalName,
    sender.phone ? `Phone: ${sender.phone}` : "",
    sender.fax ? `Fax: ${sender.fax}` : "",
    sender.email ? `Email: ${sender.email}` : "",
    SAINTLY_COMPANY.website,
    sender.signature,
    SAINTLY_COMPANY.tagline,
  ]
    .filter(Boolean)
    .join("\n");

  const header = [
    SAINTLY_COMPANY.legalName,
    SAINTLY_COMPANY.addressLine1,
    SAINTLY_COMPANY.cityStateZip,
    `Phone: ${SAINTLY_COMPANY.phone}`,
    `Fax: ${SAINTLY_COMPANY.fax}`,
    `Email: ${businessEmail}`,
    SAINTLY_COMPANY.website,
    "",
  ].join("\n");

  return `${header}${input.body.trim()}${flyerBlock}${signature}`;
}

export const EMAIL_MARKETING_HIPAA_WARNING =
  "Do not include patient names, Medicare numbers, diagnoses, or protected health information in regular marketing emails unless using an approved HIPAA-compliant secure email process.";
