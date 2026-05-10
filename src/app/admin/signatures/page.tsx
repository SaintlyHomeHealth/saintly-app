import Link from "next/link";

const shell = "min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50/40";

export default function AdminPdfSignHomePage() {
  return (
    <div className={shell}>
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <header className="text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-800/80">Admin</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Saintly PDF Sign
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 sm:mx-0">
            Send contracts, W-9s, and onboarding forms for secure electronic signature.
          </p>
        </header>

        {/* Workflow strip */}
        <ol className="mt-10 grid gap-3 sm:grid-cols-3">
          {[
            { n: "1", title: "Prepare template", body: "Upload a PDF and place fields." },
            { n: "2", title: "Send packet", body: "Pick who signs and send the link." },
            { n: "3", title: "Track completion", body: "See status and download signed PDFs." },
          ].map((s) => (
            <li
              key={s.n}
              className="flex gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-4 shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-900">
                {s.n}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                <p className="mt-0.5 text-xs text-slate-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Primary actions */}
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-4">
          <Link
            href="/admin/signatures/templates"
            className="inline-flex items-center justify-center rounded-2xl border-2 border-amber-400/90 bg-gradient-to-r from-amber-400 to-amber-500 px-8 py-3.5 text-center text-sm font-semibold text-amber-950 shadow-md shadow-amber-500/20 transition hover:from-amber-500 hover:to-amber-600 hover:shadow-lg"
          >
            Manage templates
          </Link>
          <Link
            href="/admin/signatures/send"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-8 py-3.5 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/80"
          >
            Send packet
          </Link>
          <Link
            href="/admin/signatures/packets"
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-8 py-3.5 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/80"
          >
            View packets
          </Link>
        </div>

        {/* Advanced: I-9 */}
        <section className="mt-14 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-5 py-4 text-sm text-slate-600">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Advanced</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-slate-800">I-9 workspace</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Section 2 review, case files, and restricted downloads.
              </p>
            </div>
            <Link
              href="/admin/signatures/i9"
              className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              Open I-9
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
