"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { FacilityContactFormValues } from "@/app/admin/facilities/_components/FacilityContactModal";
import { FacilityAiCaptureModal } from "@/app/admin/facilities/_components/FacilityAiCaptureModal";
import { FacilityNewReferralButton } from "@/app/admin/facilities/_components/FacilityNewReferralButton";
import { ShowReferralQrButton } from "@/app/admin/facilities/_components/ShowReferralQrButton";
import { FacilityPhotoNoteButton } from "@/app/admin/facilities/_components/FacilityPhotoNoteButton";
import { FacilityContactModal } from "@/app/admin/facilities/_components/FacilityContactModal";
import { FacilityQuickLogModal } from "@/app/admin/facilities/_components/FacilityQuickLogModal";
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
  is_best_contact?: boolean;
  is_gatekeeper?: boolean;
  is_referral_contact?: boolean;
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

type StaffOption = { user_id: string; label: string };
type ContactOption = { id: string; name: string };

type FacilityDetailInteractiveProps = {
  /** Renders between the action bar and Contacts (e.g. Overview from a server component). */
  children: ReactNode;
  facilityId: string;
  facilityName: string;
  mapsUrl: string | null;
  mainPhone: string | null;
  contacts: ContactRow[];
  activityAtDefaultIso: string;
  openQuickLogOnMount?: boolean;
  openAdvancedOnMount?: boolean;
  staffOptions?: StaffOption[];
  contactOptions?: ContactOption[];
  defaultRepId?: string | null;
};

export function FacilityDetailInteractive({
  children,
  facilityId,
  facilityName,
  mapsUrl,
  mainPhone,
  contacts,
  activityAtDefaultIso,
  openQuickLogOnMount,
  openAdvancedOnMount,
  staffOptions = [],
  contactOptions = [],
  defaultRepId,
}: FacilityDetailInteractiveProps) {
  const router = useRouter();
  const [quickLogOpen, setQuickLogOpen] = useState(Boolean(openQuickLogOnMount));
  const [aiCaptureOpen, setAiCaptureOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(Boolean(openAdvancedOnMount));
  const [contactOpen, setContactOpen] = useState(false);
  const [contactInitial, setContactInitial] = useState<FacilityContactFormValues | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  async function toggleContactRole(
    contactId: string,
    role: "is_best_contact" | "is_decision_maker" | "is_gatekeeper" | "is_referral_contact",
    value: boolean
  ) {
    await fetch(`/api/facilities/${facilityId}/contacts/${contactId}/roles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, [role]: value }),
    });
    router.refresh();
  }

  function contactBadges(c: ContactRow) {
    const badges: { label: string; cls: string }[] = [];
    if (c.is_best_contact) badges.push({ label: "Best contact", cls: "bg-violet-50 text-violet-900 ring-violet-200" });
    if (c.is_decision_maker) badges.push({ label: "Decision maker", cls: "bg-emerald-50 text-emerald-900 ring-emerald-200" });
    if (c.is_gatekeeper) badges.push({ label: "Gatekeeper", cls: "bg-amber-50 text-amber-900 ring-amber-200" });
    if (c.is_referral_contact) badges.push({ label: "Referral contact", cls: "bg-sky-50 text-sky-900 ring-sky-200" });
    return badges;
  }

  return (
    <div className="space-y-8">
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}
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
        <button type="button" className={btnPrimary} onClick={() => setQuickLogOpen(true)}>
          Quick Log
        </button>
        <FacilityNewReferralButton
          facilityId={facilityId}
          facilityName={facilityName}
          contacts={contactOptions.length > 0 ? contactOptions : contacts.map((c) => ({ id: c.id, name: contactDisplayName(c) }))}
          staffOptions={staffOptions}
          defaultRepId={defaultRepId}
          className={`${btnGhost} !flex-none border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`}
        >
          New Referral
        </FacilityNewReferralButton>
        <ShowReferralQrButton
          facilityId={facilityId}
          facilityName={facilityName}
          salesRepId={defaultRepId}
          className={btnGhost}
        />
        <button type="button" className={btnGhost} onClick={() => setAiCaptureOpen(true)}>
          AI Capture
        </button>
        <FacilityPhotoNoteButton
          facilityId={facilityId}
          facilityName={facilityName}
          sourceContext="facility_detail"
          className={btnGhost}
          onSaved={() => {
            setToast("Photo saved.");
            window.setTimeout(() => setToast(null), 3000);
            router.refresh();
          }}
        />
        <button type="button" className={btnGhost} onClick={() => setVisitOpen(true)}>
          Advanced Log
        </button>
        <Link href={`/admin/facilities/${facilityId}/edit`} className={btnGhost}>
          Edit facility
        </Link>
        <Link href="/admin/facilities/outreach" className={btnGhost}>
          Today&apos;s Outreach
        </Link>
        <Link href="/admin/facilities/follow-ups" className={btnGhost}>
          Follow-Ups
        </Link>
        <Link href="/admin/facilities/analytics" className={btnGhost}>
          Outreach Analytics
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
                      <div className="mt-1 flex flex-wrap gap-1">
                        {contactBadges(c).map((b) => (
                          <span
                            key={b.label}
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${b.cls}`}
                          >
                            {b.label}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(["is_best_contact", "is_decision_maker", "is_gatekeeper", "is_referral_contact"] as const).map(
                          (role) => {
                            const active = Boolean(c[role]);
                            const labels = {
                              is_best_contact: "Best",
                              is_decision_maker: "DM",
                              is_gatekeeper: "Gate",
                              is_referral_contact: "Referral",
                            };
                            return (
                              <button
                                key={role}
                                type="button"
                                onClick={() => void toggleContactRole(c.id, role, !active)}
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  active ? "bg-violet-600 text-white" : "border border-slate-200 text-slate-600"
                                }`}
                              >
                                {labels[role]}
                              </button>
                            );
                          }
                        )}
                      </div>
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

      <FacilityAiCaptureModal
        open={aiCaptureOpen}
        facilityId={facilityId}
        facilityName={facilityName}
        sourceContext="facility_detail"
        onClose={() => setAiCaptureOpen(false)}
        onSaved={() => {
          router.refresh();
        }}
        onSavedMessage={(msg) => {
          setToast(msg);
          window.setTimeout(() => setToast(null), 3000);
          router.refresh();
        }}
      />

      <FacilityQuickLogModal
        facilityId={facilityId}
        facilityName={facilityName}
        open={quickLogOpen}
        contacts={contactOptions.length > 0 ? contactOptions : contacts.map((c) => ({ id: c.id, name: contactDisplayName(c) }))}
        staffOptions={staffOptions}
        defaultRepId={defaultRepId}
        onClose={() => setQuickLogOpen(false)}
        onSaved={() => {
          setToast("Activity saved.");
          window.setTimeout(() => setToast(null), 3000);
          router.refresh();
        }}
        onSavedMessage={(msg) => {
          setToast(msg);
          window.setTimeout(() => setToast(null), 3000);
          router.refresh();
        }}
        onAdvancedLog={() => {
          setQuickLogOpen(false);
          setVisitOpen(true);
        }}
      />

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
