import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminListCard } from "@/components/admin/design-system";
import { PrivatePayInvoicePaymentPanel } from "@/components/crm/private-pay/PrivatePayInvoicePaymentPanel";
import { contactDirectoryDisplayName } from "@/lib/crm/contact-directory";
import { listPaymentMethodsForContact } from "@/lib/private-pay/customers";
import {
  getInvoiceWithItems,
  getPendingPaymentReportForInvoice,
} from "@/lib/private-pay/data";
import { formatCentsUsd, serviceTypeLabel } from "@/lib/private-pay/format";
import { getStaffProfile, isCrmLeadsRowPolicyRole } from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function PrivatePayInvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isCrmLeadsRowPolicyRole(staff)) {
    redirect("/admin");
  }

  const { invoiceId } = await params;
  const invoice = await getInvoiceWithItems(invoiceId);
  if (!invoice) notFound();

  const [pendingReport, paymentMethods] = await Promise.all([
    getPendingPaymentReportForInvoice(invoiceId),
    invoice.contact_id ? listPaymentMethodsForContact(invoice.contact_id) : Promise.resolve([]),
  ]);

  let customer_name = (invoice.billing_name ?? "").trim() || "—";
  let customer_detail: string | null = null;
  let profile_href: string | null = null;
  let contactHasPhone = Boolean((invoice.billing_phone ?? "").trim());

  if (invoice.contact_id) {
    const { data: contact } = await supabaseAdmin
      .from("contacts")
      .select("id, full_name, first_name, last_name, organization_name, contact_type, phone, mobile_phone")
      .eq("id", invoice.contact_id)
      .maybeSingle();
    if (contact) {
      customer_name = customer_name === "—" ? contactDirectoryDisplayName(contact) : customer_name;
      customer_detail =
        (contact.contact_type ?? "").trim() === "private_pay" ? "Private Pay" : "Contact";
      profile_href = `/admin/crm/contacts/${invoice.contact_id}`;
      contactHasPhone =
        contactHasPhone ||
        Boolean((contact.phone ?? "").trim()) ||
        Boolean((contact.mobile_phone ?? "").trim());
    }
  } else if (invoice.patient_id) {
    customer_detail = "Patient";
    profile_href = `/admin/crm/patients/${invoice.patient_id}`;
  } else if (invoice.lead_id) {
    customer_detail = "Lead";
    profile_href = `/admin/crm/leads/${invoice.lead_id}`;
  }

  const has_card_on_file = paymentMethods.length > 0;
  let payment_badge: "unpaid" | "paid" | "failed" | "card_on_file" | "processing" = "unpaid";
  if (invoice.status === "paid") payment_badge = "paid";
  else if (invoice.payments.some((p) => p.status === "pending" && p.payment_method === "card")) {
    payment_badge = "processing";
  } else if (invoice.payments.some((p) => p.status === "failed" && p.payment_method === "card")) {
    payment_badge = "failed";
  } else if (has_card_on_file && (invoice.status === "draft" || invoice.status === "sent")) {
    payment_badge = "card_on_file";
  }

  const listRow = {
    ...invoice,
    customer_name,
    customer_detail,
    profile_href,
    pending_payment_report: pendingReport,
    has_card_on_file,
    payment_badge,
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AdminPageHeader
        eyebrow="Private Pay"
        title={invoice.invoice_number}
        description={
          <>
            <Link href="/admin/private-pay" className="font-semibold text-sky-800 hover:underline">
              Back to invoice list
            </Link>
            {profile_href ? (
              <>
                <span className="mx-2 text-slate-300">·</span>
                <Link href={profile_href} className="font-semibold text-sky-800 hover:underline">
                  {customer_name}
                </Link>
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminListCard hover={false}>
          <h2 className="text-sm font-bold text-slate-900">Line items</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {invoice.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4 py-2 text-sm">
                <span className="text-slate-800">
                  {(item.description ?? "").trim() || serviceTypeLabel(item.service_type)}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatCentsUsd(item.line_total_cents)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatCentsUsd(invoice.total_cents)}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`/api/private-pay/invoices/${invoice.id}/pdf`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Invoice PDF
            </a>
            {invoice.status === "paid" ? (
              <a
                href={`/api/private-pay/invoices/${invoice.id}/receipt`}
                className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"
              >
                Receipt PDF
              </a>
            ) : null}
          </div>
        </AdminListCard>

        <PrivatePayInvoicePaymentPanel
          invoice={listRow}
          paymentMethods={paymentMethods}
          pendingReport={pendingReport}
          profileHref={profile_href}
          contactId={invoice.contact_id}
          contactHasPhone={contactHasPhone}
        />
      </div>
    </div>
  );
}
