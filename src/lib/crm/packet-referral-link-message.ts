/** Client-safe helpers for injecting packet referral links into email/fax text. */

export function referralLinkEmailBlock(referralUrl: string): string {
  return `\n\nYou can submit referrals securely here:\n${referralUrl.trim()}`;
}

export function referralLinkFaxBlock(referralUrl: string): string {
  return `\n\nSubmit referrals securely:\n${referralUrl.trim()}`;
}

export function messageIncludesReferralLink(text: string, referralUrl: string): boolean {
  const url = referralUrl.trim();
  if (!url) return false;
  return text.includes(url);
}

export function appendReferralLinkToEmailMessage(message: string, referralUrl: string): string {
  const url = referralUrl.trim();
  if (!url || messageIncludesReferralLink(message, url)) return message;
  return `${message.trimEnd()}${referralLinkEmailBlock(url)}`;
}

export function appendReferralLinkToFaxCover(coverSheet: string, referralUrl: string): string {
  const url = referralUrl.trim();
  if (!url || messageIncludesReferralLink(coverSheet, url)) return coverSheet;
  return `${coverSheet.trimEnd()}${referralLinkFaxBlock(url)}`;
}

export function removeReferralLinkFromText(text: string, referralUrl: string): string {
  const url = referralUrl.trim();
  if (!url) return text;
  return text
    .replace(referralLinkEmailBlock(url), "")
    .replace(referralLinkFaxBlock(url), "")
    .replace(`\n\nYou can submit referrals securely here:\n${url}`, "")
    .replace(`\n\nSubmit referrals securely:\n${url}`, "")
    .trimEnd();
}
