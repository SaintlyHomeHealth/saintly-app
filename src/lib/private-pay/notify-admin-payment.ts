import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { formatCentsUsd } from "@/lib/private-pay/format";
import { sendPrivatePayResendEmail } from "@/lib/private-pay/email-from";
import { resolveBillingNotifyUserIds } from "@/lib/private-pay/resolve-billing-notify-user-ids";
import { sendFcmDataAndNotificationToUserIds } from "@/lib/push/send-fcm-to-user-ids";
import { sendSms } from "@/lib/twilio/send-sms";

const LOG = "[private-pay-admin-notify]";

export type PrivatePayInvoicePaidNotifyInput = {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  amountCents: number;
  stripePaymentIntentId?: string | null;
};

export function privatePayInvoicePaidNotificationHref(invoiceId: string): string {
  return `/admin/private-pay/invoices/${invoiceId}`;
}

export function privatePayInvoicePaidDedupeKey(
  invoiceId: string,
  stripePaymentIntentId?: string | null
): string {
  const pi = (stripePaymentIntentId ?? "").trim() || "manual";
  return `private_pay_invoice_paid:${invoiceId}:${pi}`;
}

export function buildPrivatePayInvoicePaidNotificationBody(input: {
  invoiceNumber: string;
  customerName: string;
  amountCents: number;
}): string {
  const amount = formatCentsUsd(input.amountCents);
  const name = (input.customerName ?? "").trim() || "Customer";
  return `Private Pay invoice ${input.invoiceNumber} was paid by ${name} for ${amount}.`;
}

function privatePayAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "";
  return raw.replace(/\/$/, "");
}

function resolveAdminEmailRecipients(): string[] {
  const raw = process.env.PRIVATE_PAY_ADMIN_EMAIL?.trim();
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes("@"));
}

function resolveAdminAlertPhone(): string | null {
  const raw = process.env.PRIVATE_PAY_ADMIN_ALERT_PHONE?.trim();
  return raw || null;
}

async function createInAppAdminNotifications(
  userIds: string[],
  title: string,
  body: string,
  href: string,
  dedupeKey: string
): Promise<number> {
  if (userIds.length === 0) return 0;

  const rows = userIds.map((userId) => ({
    user_id: userId,
    title,
    body,
    type: "private_pay_invoice_paid",
    href,
    dedupe_key: dedupeKey,
  }));

  const { data, error } = await supabaseAdmin
    .from("admin_notifications")
    .insert(rows, { ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.warn(LOG, "admin_notification_insert_failed", { error: error.message });
    return 0;
  }

  return (data ?? []).length;
}

/**
 * Notify billing staff when a private-pay invoice is paid (Stripe checkout or saved-card charge).
 * Best-effort — failures are logged but do not block payment recording.
 */
export async function notifyPrivatePayInvoicePaid(input: PrivatePayInvoicePaidNotifyInput): Promise<void> {
  const title = "Private Pay invoice paid";
  const body = buildPrivatePayInvoicePaidNotificationBody({
    invoiceNumber: input.invoiceNumber,
    customerName: input.customerName,
    amountCents: input.amountCents,
  });
  const href = privatePayInvoicePaidNotificationHref(input.invoiceId);
  const dedupeKey = privatePayInvoicePaidDedupeKey(input.invoiceId, input.stripePaymentIntentId);

  const userIds = await resolveBillingNotifyUserIds(supabaseAdmin);
  await createInAppAdminNotifications(userIds, title, body, href, dedupeKey);

  if (userIds.length > 0 && process.env.SAINTLY_PUSH_PRIVATE_PAY_PAID_DISABLED !== "1") {
    const base = privatePayAppBaseUrl();
    const absoluteHref = base ? `${base}${href}` : href;
    await sendFcmDataAndNotificationToUserIds(supabaseAdmin, userIds, {
      title,
      body,
      data: {
        type: "private_pay_invoice_paid",
        href,
        invoice_id: input.invoiceId,
        url: absoluteHref,
      },
    }).catch((e) => {
      console.warn(LOG, "push_failed", { error: e instanceof Error ? e.message : String(e) });
    });
  }

  const adminEmails = resolveAdminEmailRecipients();
  for (const to of adminEmails) {
    const result = await sendPrivatePayResendEmail({
      to,
      subject: title,
      html: `<p>${body}</p><p><a href="${privatePayAppBaseUrl()}${href}">View invoice</a></p>`,
      text: `${body}\n\nView invoice: ${privatePayAppBaseUrl()}${href}`,
    });
    if (!result.ok) {
      console.warn(LOG, "email_failed", { to, error: result.error });
    }
  }

  const alertPhone = resolveAdminAlertPhone();
  if (alertPhone) {
    const sms = await sendSms({ to: alertPhone, body });
    if (!sms.ok) {
      console.warn(LOG, "sms_failed", { error: sms.error });
    }
  } else {
    console.log(LOG, "sms_skipped", { reason: "PRIVATE_PAY_ADMIN_ALERT_PHONE_not_configured" });
  }

  console.log(LOG, "sent", {
    invoice_id: input.invoiceId,
    in_app_recipients: userIds.length,
    email_recipients: adminEmails.length,
    sms: Boolean(alertPhone),
  });
}
