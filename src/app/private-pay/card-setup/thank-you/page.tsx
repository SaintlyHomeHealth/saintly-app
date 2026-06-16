import Link from "next/link";

export default async function CardSetupThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; session_id?: string }>;
}) {
  const params = await searchParams;
  const cancelled = params.status === "cancelled";

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      {cancelled ? (
        <>
          <h1 className="text-xl font-bold text-slate-900">Card setup cancelled</h1>
          <p className="mt-3 text-sm text-slate-600">No card was saved. You can try again when ready.</p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold text-slate-900">Card saved</h1>
          <p className="mt-3 text-sm text-slate-600">
            Your card has been securely saved with Stripe for approved private-pay invoices. You may close this page.
          </p>
        </>
      )}
      <p className="mt-8 text-sm">
        <Link href="/" className="font-semibold text-sky-800 hover:underline">Return to Saintly Home Health</Link>
      </p>
    </main>
  );
}
