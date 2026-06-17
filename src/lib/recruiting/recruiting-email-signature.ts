import { CANONICAL_CRM_ORIGIN, getAppBaseUrl, normalizeCrmAppOrigin } from "@/lib/app-url";
import { plainTextToHtml } from "@/lib/recruiting/render-recruiting-email-template";

/** Public path for the recruiting email logo (served from `public/`). */
export const RECRUITING_EMAIL_LOGO_PATH = "/images/saintly-logo-email.png";

/**
 * Absolute HTTPS URL for the Saintly logo in recruiting emails.
 * Uses public env vars only — safe for client preview.
 */
export function resolveRecruitingEmailLogoUrl(): string {
  const base = resolveRecruitingEmailAppBaseUrl();
  return `${base}${RECRUITING_EMAIL_LOGO_PATH}`;
}

export function resolveRecruitingEmailAppBaseUrl(): string {
  const fromAppUrl = getAppBaseUrl();
  if (fromAppUrl) return fromAppUrl;
  const raw =
    process.env.APP_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    CANONICAL_CRM_ORIGIN;
  return normalizeCrmAppOrigin(raw.replace(/\/$/, ""));
}

export function getRecruitingEmailTextSignature(): string {
  return [
    "Paul Vonasek",
    "Vice President",
    "Saintly Home Health LLC",
    "",
    "Office: (480) 360-0008",
    "Mobile: (916) 796-3306",
    "Fax: (480) 393-4119",
    "Email: info@saintlyhomehealth.com",
    "Website: www.saintlyhomehealth.com",
    "Tempe, Arizona",
    "",
    "CHAP Accredited | Medicare Certified | AHCCCS Provider",
    "Care That Goes Above.",
  ].join("\n");
}

export function getRecruitingEmailHtmlSignature(): string {
  const logoUrl = resolveRecruitingEmailLogoUrl();
  return `
<table cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#1e293b;">
  <tr>
    <td style="padding-top:16px;border-top:1px solid #e2e8f0;">
      <img
        src="${logoUrl}"
        alt="Saintly Home Health LLC"
        width="160"
        style="display:block;width:160px;max-width:160px;height:auto;border:0;outline:none;text-decoration:none;margin-bottom:12px;"
      />
      <div style="font-size:14px;font-weight:700;color:#0f172a;">Paul Vonasek</div>
      <div style="margin-top:2px;color:#334155;">Vice President</div>
      <div style="margin-top:2px;color:#334155;">Saintly Home Health LLC</div>
      <div style="margin-top:10px;color:#334155;">
        Office: (480) 360-0008<br />
        Mobile: (916) 796-3306<br />
        Fax: (480) 393-4119<br />
        Email: <a href="mailto:info@saintlyhomehealth.com" style="color:#0369a1;text-decoration:none;">info@saintlyhomehealth.com</a><br />
        Website: <a href="https://www.saintlyhomehealth.com" style="color:#0369a1;text-decoration:none;">www.saintlyhomehealth.com</a><br />
        Tempe, Arizona
      </div>
      <div style="margin-top:10px;color:#475569;font-size:12px;">
        CHAP Accredited | Medicare Certified | AHCCCS Provider
      </div>
      <div style="margin-top:4px;color:#475569;font-size:12px;font-style:italic;">
        Care That Goes Above.
      </div>
    </td>
  </tr>
</table>`;
}

/** Detect an existing Paul / Saintly signature near the end of the body. */
export function recruitingEmailBodyIncludesSignature(body: string): boolean {
  const tail = body.slice(-1400).toLowerCase();
  return tail.includes("paul vonasek") || tail.includes("saintly home health llc");
}

export function appendRecruitingEmailTextSignature(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return getRecruitingEmailTextSignature();
  }
  if (recruitingEmailBodyIncludesSignature(trimmed)) {
    return trimmed;
  }
  return `${trimmed}\n\n${getRecruitingEmailTextSignature()}`;
}

export function buildRecruitingEmailHtml(bodyText: string): string {
  const trimmed = bodyText.trim();
  const hasSignature = recruitingEmailBodyIncludesSignature(trimmed);
  const bodyHtml = plainTextToHtml(trimmed);
  const sigHtml = hasSignature ? "" : getRecruitingEmailHtmlSignature();
  return `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.45;color:#1e293b;">${bodyHtml}${sigHtml}</div>`;
}

export function prepareRecruitingEmailPayload(bodyText: string): { text: string; html: string } {
  const trimmed = bodyText.trim();
  const text = appendRecruitingEmailTextSignature(trimmed);
  const html = buildRecruitingEmailHtml(trimmed);
  return { text, html };
}
