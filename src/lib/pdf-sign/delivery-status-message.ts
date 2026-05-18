/**
 * User-facing copy for PDF Sign send / resend outcomes (no PHI).
 */
export function pdfSignDeliveryStatusMessage(input: {
  emailAttempted: boolean;
  emailSent: boolean;
  hasPhone: boolean;
  smsSent: boolean;
  smsFailed: boolean;
}): string | null {
  if (!input.emailAttempted || !input.emailSent) return null;

  if (!input.hasPhone) {
    return "Packet sent and email sent. No phone number was provided for text message.";
  }
  if (input.smsSent) {
    return "Packet sent. Email and text message sent to recipient.";
  }
  if (input.smsFailed) {
    return "Packet sent and email sent, but text message failed.";
  }
  return null;
}

export function pdfSignResendDeliveryStatusMessage(input: {
  emailSent: boolean;
  hasPhone: boolean;
  smsSent: boolean;
  smsFailed: boolean;
}): string | null {
  if (input.emailSent && input.hasPhone && input.smsSent) {
    return "Signing link resent by email and text message.";
  }
  if (input.emailSent && input.hasPhone && input.smsFailed) {
    return "Email sent, but text message failed.";
  }
  if (input.emailSent && !input.hasPhone) {
    return "Signing link resent by email. No phone number on file for text message.";
  }
  if (!input.emailSent && input.smsSent) {
    return "Signing link sent by text message.";
  }
  return null;
}
