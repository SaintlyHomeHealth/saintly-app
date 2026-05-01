import Link from "next/link";

export default async function AdminPdfSignHomePage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Saintly PDF Sign</h1>
        <p className="mt-2 text-sm text-slate-600">
          Tokenized signing for W-9, independent contractor agreements, custom PDFs, and I-9 Section&nbsp;1
          (employer Section&nbsp;2 is completed by an admin).
        </p>
        <ul className="mt-6 flex flex-col gap-3 text-sm font-medium text-indigo-700">
          <li>
            <Link className="underline-offset-2 hover:underline" href="/admin/signatures/templates">
              Templates — upload IRS W-9 / I-9 / IC PDFs and map fields
            </Link>
          </li>
          <li>
            <Link className="underline-offset-2 hover:underline" href="/admin/signatures/packets">
              Packets — track sent and completed packets
            </Link>
          </li>
          <li>
            <Link className="underline-offset-2 hover:underline" href="/admin/signatures/i9">
              I-9 cases — admin Section&nbsp;2 and restricted downloads
            </Link>
          </li>
        </ul>
      </div>
    </main>
  );
}
