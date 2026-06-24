import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { CRM_SHARED_MAILBOX_EMAIL } from "@/lib/email-marketing/gmail/constants";
import { refreshGmailAccessToken } from "@/lib/email-marketing/gmail/oauth";
import type { EmailMailboxRow } from "@/lib/email-marketing/types";

export async function getSharedMailbox(): Promise<EmailMailboxRow | null> {
  const target =
    process.env.GOOGLE_GMAIL_CONNECTED_EMAIL?.trim().toLowerCase() || CRM_SHARED_MAILBOX_EMAIL;
  const { data } = await supabaseAdmin
    .from("email_mailboxes")
    .select("*")
    .eq("email_address", target)
    .maybeSingle();
  return (data as EmailMailboxRow | null) ?? null;
}

export function resolveMailboxRefreshToken(mailbox: EmailMailboxRow | null): string | null {
  const envToken = process.env.GOOGLE_GMAIL_REFRESH_TOKEN?.trim();
  if (envToken) return envToken;
  const dbToken = mailbox?.oauth_refresh_token?.trim();
  return dbToken || null;
}

export async function getGmailAccessToken(): Promise<{ accessToken: string; mailbox: EmailMailboxRow }> {
  const mailbox = await getSharedMailbox();
  if (!mailbox) throw new Error("Shared mailbox record not found. Apply inbox migration.");
  const refreshToken = resolveMailboxRefreshToken(mailbox);
  if (!refreshToken) {
    throw new Error("Gmail is not connected. An admin must connect admin@saintlyhomehealth.com.");
  }
  const token = await refreshGmailAccessToken(refreshToken);
  if (!token.access_token) throw new Error("Failed to refresh Gmail access token.");
  return { accessToken: token.access_token, mailbox };
}

export async function gmailApiFetch<T>(
  path: string,
  init?: RequestInit & { accessToken?: string }
): Promise<T> {
  const accessToken = init?.accessToken ?? (await getGmailAccessToken()).accessToken;
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/${path.replace(/^\//, "")}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body.slice(0, 700) || `Gmail API ${path} failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function isGmailInboxConfigured(): boolean {
  const provider = (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  if (provider !== "gmail") return false;
  const envToken = process.env.GOOGLE_GMAIL_REFRESH_TOKEN?.trim();
  if (envToken) return true;
  return false;
}

export async function isGmailInboxConnected(): Promise<boolean> {
  if (process.env.GOOGLE_GMAIL_REFRESH_TOKEN?.trim()) return true;
  const mailbox = await getSharedMailbox();
  return Boolean(mailbox?.oauth_refresh_token?.trim() && mailbox.status === "active");
}
