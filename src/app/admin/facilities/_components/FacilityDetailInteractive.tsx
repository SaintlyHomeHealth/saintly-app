"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useState } from "react";

import type { FacilityContactFormValues } from "@/app/admin/facilities/_components/FacilityContactModal";
import { FacilityContactModal } from "@/app/admin/facilities/_components/FacilityContactModal";
import { FacilityVisitModal } from "@/app/admin/facilities/_components/FacilityVisitModal";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

type ContactRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  department: string | null;
  direct_phone: string | null;
  mobile_phone: string | null;
  fax: string | null;
  email: string | null;
  preferred_contact_method: string | null;
  best_time_to_reach: string | null;
  is_decision_maker: boolean;
  influence_level: string | null;
  notes: string | null;
};

const btnPrimary =
  "inline-flex min-h-[2.5rem] flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm shadow-sky-200/50 transition hover:-translate-y-px hover:shadow-md sm:text-sm";
const btnGhost =
  "inline-flex min-h-[2.5rem] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/50 sm:text-sm";

function contactDisplayName(c: Pick<ContactRow, "full_name" | "first_name" | "last_name">): string {
  const fn = (c.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return parts || "Contact";
}

function toFormValues(c: ContactRow): FacilityContactFormValues {
  return {
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    full_name: c.full_name,
    title: c.title,
    department: c.department,
    direct_phone: c.direct_phone,
    mobile_phone: c.mobile_phone,
    fax: c.fax,
    email: c.email,
    preferred_contact_method: c.preferred_contact_method,
    best_time_to_reach: c.best_time_to_reach,
    is_decision_maker: c.is_decision_maker,
    influence_level: c.influence_level,
    notes: c.notes,
  };
}

type FacilityDetailInteractiveProps = {
  /** Renders between the action bar and Contacts (e.g. Overview from a server component). */
  children: ReactNode;
  facilityId: string;
  mapsUrl: string | null;
  mainPhone: string | null;
  contacts: ContactRow[];
  activityAtDefaultIso: string;
  openVisitOnMount?: boolean;
};

export function FacilityDetailInteractive({
  children,
  facilityId,
  mapsUrl,
  mainPhone,
  contacts,
  activityAtDefaultIso,
  openVisitOnMount,
}: FacilityDetailInteractiveProps) {
  const [visitOpen, setVisitOpen] = useState(Boolean(openVisitOnMount));
  const [contactOpen, setContactOpen] = useState(false);
  const [contactInitial, setContactInitial] = useState<FacilityContactFormValues | null>(null);

  const telHref = (() => {
    const raw = (mainPhone ?? "").trim();
    if (!raw) return null;
    const digits = raw.replace(/[^\d+]/g, "");
    return digits ? `tel:${digits}` : null;
  })();

  const visitContacts = contacts.map((c) => ({
    id: c.id,
    full_name: c.full_name,
    first_name: c.first_name,
    last_name: c.last_name,
  }));

  function openAddContact() {
    setContactInitial(null);
    setContactOpen(true);
  }

  function openEditContact(c: ContactRow) {
    setContactInitial(toFormValues(c));
    setContactOpen(true);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        {mapsUrl ? (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className={btnPrimary}>
            Get directions
          </a>
        ) : (
          <span className={`${btnPrimary} cursor-not-allowed opacity-50`} title="Add an address first">
            Get directions
          </span>
        )}
        {telHref ? (
          <a href={telHref} className={btnGhost}>
            Call main line
          </a>
        ) : (
          <span className={`${btnGhost} cursor-not-allowed opacity-50`}>Call main line</span>
        )}
        <button type="button" className={btnGhost} onClick={openAddContact}>
          Add contact
        </button>
        <button type="button" className={btnGhost} onClick={() => setVisitOpen(true)}>
          Add visit
        </button>
        <Link href={`/admin/facilities/${facilityId}/edit`} className={btnGhost}>
          Edit facility
        </Link>
      </div>

      {children}

      <section className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Contacts</h2>
            <p className="mt-1 text-sm text-slate-500">Decision makers, case managers, and office staff.</p>
          </div>
          <button
            type="button"
            onClick={openAddContact}
            className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
          >
            + Add contact
          </button>
        </div>

        {contacts.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-white/80 px-4 py-8 text-center text-sm text-slate-600">
            No contacts yet. Add a decision maker or intake coordinator so visit logs stay tied to real people.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-100">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50/90 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Title / dept</th>
                  <th className="px-4 py-3">Phones</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {contacts.map((c) => (
                  <tr key={c.id} className="bg-white/80">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{contactDisplayName(c)}</div>
                      {c.is_decision_maker ? (
                        <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 ring-1 ring-emerald-200/70">
                          Decision maker
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {[c.title, c.department].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>{c.direct_phone ? formatPhoneForDisplay(c.direct_phone) : "—"}</div>
                      {c.mobile_phone ? (
                        <div className="text-slate-500">M: {formatPhoneForDisplay(c.mobile_phone)}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{c.email?.trim() || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEditContact(c)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-900 hover:border-sky-300"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <FacilityVisitModal
        facilityId={facilityId}
        contacts={visitContacts}
        activityAtDefaultIso={activityAtDefaultIso}
        open={visitOpen}
        onClose={() => setVisitOpen(false)}
      />

      <FacilityContactModal
        facilityId={facilityId}
        initial={contactInitial}
        open={contactOpen}
        onClose={() => {
          setContactOpen(false);
          setContactInitial(null);
        }}
      />
    </div>
  );
}
