import type { Metadata } from "next";

import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";

export const metadata: Metadata = {
  title: "Payment · Saintly Home Health",
  robots: { index: false, follow: false },
};

export default async function PrivatePayThankYouPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const statusRaw = typeof sp.status === "string" ? sp.status : Array.isArray(sp.status) ? sp.status[0] : "";
  const invoiceRaw = typeof sp.invoice === "string" ? sp.invoice : Array.isArray(sp.invoice) ? sp.invoice[0] : "";
  const cancelled = statusRaw === "cancelled";
  const invoiceNumber = (invoiceRaw ?? "").trim();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
          {PRIVATE_PAY_BUSINESS.legalName}
        </p>
        {cancelled ? (
          <>
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">Payment cancelled</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              No charge was made. If you&apos;d like to complete your payment, please reopen the payment link or
              contact our office.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-2xl font-semibold text-slate-900">Thank you!</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Your payment has been received. A receipt will be available from our office.
            </p>
          </>
        )}
        {invoiceNumber ? (
          <p className="mt-4 text-xs text-slate-500">
            Reference: <span className="font-medium text-slate-700">{invoiceNumber}</span>
          </p>
        ) : null}
        <div className="mt-6 border-t border-slate-100 pt-6 text-xs text-slate-500">
          <p>{PRIVATE_PAY_BUSINESS.phoneDisplay}</p>
          <p className="mt-1">{PRIVATE_PAY_BUSINESS.email}</p>
        </div>
      </div>
    </main>
  );
}
