/** Canonical shape after provider normalization (used by channel handlers). */

export type InboundEmailChannelKey = "referrals" | "care" | "join" | "billing";

export type InboundEmailAttachmentMeta = {
  filename?: string;
  contentType?: string;
  size?: number;
  url?: string;
  contentId?: string;
};

export type InboundEmailNormalized = {
  provider: string;
  messageId?: string;
  fromEmail: string;
  fromName?: string;
  toEmails: string[];
  ccEmails?: string[];
  subject?: string;
  textBody?: string;
  htmlBody?: string;
  receivedAt: string;
  attachments?: InboundEmailAttachmentMeta[];
  raw?: unknown;
};
