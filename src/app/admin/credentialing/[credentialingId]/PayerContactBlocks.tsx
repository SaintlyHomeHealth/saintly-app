import Link from "next/link";

import { CopyTextButton } from "@/components/credentialing/CopyTextButton";
import {
  payerCredentialEmailLabelDisplay,
  type PayerCredentialingRecordEmail,
} from "@/lib/crm/payer-credentialing-contact";
import { formatCredentialingDateTime } from "@/lib/crm/credentialing-datetime";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

function telHref(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "#";
  return `tel:${digits}`;
}

function mailHref(email: string): string {
  return `mailto:${encodeURIComponent(email.trim())}`;
}

type PhoneLine = { label: string; value: string; raw: string };

export function PayerContactQuickStrip({
  payerName,
  contactName,
  portalUrl,
  portalUsernameHint,
  mainPhone,
  directPhone,
  fax,
  emails,
  lastSnapshot,
}: {
  payerName: string;
  contactName: string;
  portalUrl: string;
  portalUsernameHint: string;
  mainPhone: string;
  directPhone: string;
  fax: string;
  emails: { email: string; label: string | null; is_primary: boolean }[];
  lastSnapshot: { summary: string; when: string } | null;
}) {
  const phoneLines: PhoneLine[] = [];
  if (mainPhone.trim())
    phoneLines.push({ label: "Main", value: formatPhoneForDisplay(mainPhone), raw: mainPhone });
  if (directPhone.trim())
    phoneLines.push({ label: "Direct", value: formatPhoneForDisplay(directPhone), raw: directPhone });
  if (fax.trim()) phoneLines.push({ label: "Fax", value: formatPhoneForDisplay(fax), raw: fax });

  const sortedEmails = [...emails].sort((a, b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1));

  return (
    <section className="rounded-[24px] border border-slate-200/90 bg-white px-4 py-4 shadow-sm ring-1 ring-slate-100 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pick up here</p>
          <p className="text-sm font-semibold text-slate-900">{payerName}</p>
          <p className="text-sm text-slate-800">
            <span className="text-slate-500">Primary contact: </span>
            {contactName.trim() ? contactName : "—"}
          </p>
          {phoneLines.length > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {phoneLines.map((p) => (
                <div key={p.label} className="flex min-w-0 items-center gap-1.5 text-sm">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{p.label}</span>
                  <a href={telHref(p.raw)} className="font-medium text-sky-900 underline-offset-2 hover:underline">
                    {p.value}
                  </a>
                  <CopyTextButton text={p.raw.replace(/\D/g, "")} label="Copy" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No phone numbers on file yet.</p>
          )}
          {sortedEmails.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {sortedEmails.map((e) => (
                <li key={e.email} className="flex flex-wrap items-center gap-2 text-sm">
                  {e.is_primary ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                      Primary
                    </span>
                  ) : null}
                  {e.label ? (
                    <span className="text-[11px] font-semibold text-violet-800">
                      {payerCredentialEmailLabelDisplay(e.label)}
                    </span>
                  ) : null}
                  <a
                    href={mailHref(e.email)}
                    className="min-w-0 break-all font-medium text-sky-900 underline-offset-2 hover:underline"
                  >
                    {e.email.trim()}
                  </a>
                  <CopyTextButton text={e.email.trim()} label="Copy" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No emails on file yet.</p>
          )}
          {portalUrl.trim() ? (
            <p className="text-sm">
              <span className="text-slate-500">Portal: </span>
              <a href={portalUrl.trim()} target="_blank" rel="noreferrer" className="font-semibold text-sky-800 hover:underline">
                Open portal ↗
              </a>
              {portalUsernameHint.trim() ? (
                <span className="ml-2 text-xs text-slate-600">({portalUsernameHint.trim()})</span>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-slate-50/80 p-3 text-xs text-slate-700 lg:shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Last activity</p>
          {lastSnapshot ? (
            <>
              <p className="mt-1 line-clamp-3 font-medium text-slate-900">{lastSnapshot.summary}</p>
              <p className="mt-1 tabular-nums text-slate-500">{lastSnapshot.when}</p>
            </>
          ) : (
            <p className="mt-1 text-slate-500">No timeline entries yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function PayerWorkingContactCard({
  contactName,
  title,
  department,
  mainPhone,
  directPhone,
  fax,
  preferred,
  status,
  website,
  contactNotes,
  lastContactedAt,
  portalUrl,
  displayEmails,
}: {
  contactName: string;
  title: string;
  department: string;
  mainPhone: string;
  directPhone: string;
  fax: string;
  preferred: string;
  status: string;
  website: string;
  contactNotes: string;
  lastContactedAt: string;
  portalUrl: string;
  displayEmails: PayerCredentialingRecordEmail[];
}) {
  const prefLabel =
    preferred === "phone" ? "Phone" : preferred === "email" ? "Email" : preferred === "fax" ? "Fax" : "—";
  const statusBad =
    status === "inactive" ? "border-slate-300 bg-slate-100 text-slate-700" : "border-emerald-200 bg-emerald-50 text-emerald-900";

  const sortedDisplay = [...displayEmails].sort((a, b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1));

  return (
    <section
      id="payer-working-contact"
      className="scroll-mt-28 rounded-[28px] border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60 sm:p-6"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Primary payer contact</h2>
          <p className="mt-1 text-xs text-slate-500">
            Day-to-day contact for this payer. Edit extended fields under{" "}
            <Link href="#credentialing-edit-details" className="font-semibold text-sky-800 hover:underline">
              Edit Details
            </Link>
            .
          </p>
        </div>
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusBad}`}>
          {status === "inactive" ? "Inactive" : "Active"}
        </span>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Name & role</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{contactName.trim() || "—"}</p>
            <p className="mt-0.5 text-sm text-slate-700">
              {[title.trim(), department.trim()].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Phones & fax</p>
            <dl className="mt-2 space-y-2 text-sm">
              <div className="flex flex-wrap items-start gap-2">
                <dt className="w-16 shrink-0 text-slate-500">Main</dt>
                <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {mainPhone.trim() ? (
                    <>
                      <a href={telHref(mainPhone)} className="font-medium text-sky-900 hover:underline">
                        {formatPhoneForDisplay(mainPhone)}
                      </a>
                      <CopyTextButton text={mainPhone.replace(/\D/g, "")} label="Copy" />
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <dt className="w-16 shrink-0 text-slate-500">Direct</dt>
                <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {directPhone.trim() ? (
                    <>
                      <a href={telHref(directPhone)} className="font-medium text-sky-900 hover:underline">
                        {formatPhoneForDisplay(directPhone)}
                      </a>
                      <CopyTextButton text={directPhone.replace(/\D/g, "")} label="Copy" />
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <dt className="w-16 shrink-0 text-slate-500">Fax</dt>
                <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {fax.trim() ? (
                    <>
                      <a href={telHref(fax)} className="font-medium text-sky-900 hover:underline">
                        {formatPhoneForDisplay(fax)}
                      </a>
                      <CopyTextButton text={fax.replace(/\D/g, "")} label="Copy" />
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Emails</p>
            <ul className="mt-2 space-y-2">
              {sortedDisplay.length === 0 ? (
                <li className="text-sm text-slate-500">—</li>
              ) : (
                sortedDisplay.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-white/90 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      {e.is_primary ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                          Primary
                        </span>
                      ) : null}
                      {e.label ? (
                        <span className="text-[11px] font-semibold text-violet-900">
                          {payerCredentialEmailLabelDisplay(e.label)}
                        </span>
                      ) : null}
                      <a href={mailHref(e.email)} className="break-all font-medium text-sky-900 hover:underline">
                        {e.email}
                      </a>
                    </div>
                    <CopyTextButton text={e.email.trim()} label="Copy email" />
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cadence</p>
            <p className="mt-1 text-slate-800">
              <span className="text-slate-500">Preferred: </span>
              {prefLabel}
            </p>
            <p className="mt-1 text-slate-800">
              <span className="text-slate-500">Last contacted: </span>
              {lastContactedAt ? formatCredentialingDateTime(lastContactedAt) : "—"}
            </p>
          </div>
          {(website.trim() || portalUrl.trim()) && (
            <div className="rounded-2xl border border-slate-100 bg-white p-3 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Links</p>
              {website.trim() ? (
                <p className="mt-1">
                  <span className="text-slate-500">Website: </span>
                  <a href={website.trim()} target="_blank" rel="noreferrer" className="break-all font-semibold text-sky-800 hover:underline">
                    {website.trim()}
                  </a>
                </p>
              ) : null}
              {portalUrl.trim() ? (
                <p className="mt-1">
                  <span className="text-slate-500">Enrollment portal: </span>
                  <a href={portalUrl.trim()} target="_blank" rel="noreferrer" className="break-all font-semibold text-sky-800 hover:underline">
                    Open ↗
                  </a>
                </p>
              ) : null}
            </div>
          )}
          {contactNotes.trim() ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-3 text-sm text-slate-800">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/80">Contact notes</p>
              <p className="mt-1 whitespace-pre-wrap">{contactNotes.trim()}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
