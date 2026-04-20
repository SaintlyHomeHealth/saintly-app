import { z } from "zod";

export const inboundAttachmentSchema = z.object({
  filename: z.string().optional(),
  contentType: z.string().optional(),
  size: z.number().optional(),
  url: z.string().optional(),
  contentId: z.string().optional(),
});

/** Manual / default JSON POST shape (also used after provider normalization). */
export const canonicalInboundEmailSchema = z.object({
  provider: z.string().optional(),
  messageId: z.string().optional(),
  fromEmail: z.string().min(1),
  fromName: z.string().optional(),
  toEmails: z.array(z.string()).min(1),
  ccEmails: z.array(z.string()).optional(),
  subject: z.string().optional(),
  textBody: z.string().optional(),
  htmlBody: z.string().optional(),
  receivedAt: z.string().optional(),
  attachments: z.array(inboundAttachmentSchema).optional(),
  raw: z.unknown().optional(),
});

export type CanonicalInboundEmailInput = z.infer<typeof canonicalInboundEmailSchema>;
