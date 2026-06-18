"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { RecruitingLeadDeleteButton } from "./RecruitingLeadDeleteButton";
import { MoveRecruitingLeadToPatientLeadsButton } from "./MoveRecruitingLeadToPatientLeadsButton";
import { RecruitingLeadSendEmailModal } from "./RecruitingLeadSendEmailModal";

const primaryBtnCls =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-sky-600 bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700 whitespace-nowrap";

const secondaryBtnCls =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-sky-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 whitespace-nowrap";

const menuBtnCls =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50";

type Props = {
  leadId: string;
  leadName: string;
  email: string | null;
  phone?: string | null;
  licenseStatus?: string | null;
  leadType?: string | null;
  formName?: string | null;
  detailHref: string;
  emailConfigured: boolean;
};

export function RecruitingLeadActionsMenu({
  leadId,
  leadName,
  email,
  phone,
  licenseStatus,
  leadType,
  formName,
  detailHref,
  emailConfigured,
}: Props) {
  const router = useRouter();
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Link href={detailHref} className={primaryBtnCls}>
          Open
        </Link>
        <button type="button" onClick={() => setEmailModalOpen(true)} className={secondaryBtnCls}>
          Send email
        </button>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            className={menuBtnCls}
            aria-label="More actions"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm0 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm0 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
            </svg>
          </button>
          {menuOpen ? (
            <div
              className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-200/60"
              role="menu"
            >
              <MoveRecruitingLeadToPatientLeadsButton
                leadId={leadId}
                leadName={leadName}
                variant="menu"
                onMoved={() => {
                  setMenuOpen(false);
                  setToast("Moved to Patient Leads.");
                  router.refresh();
                }}
              />
              <RecruitingLeadDeleteButton
                leadId={leadId}
                leadName={leadName}
                variant="menu"
                onDeleted={() => {
                  setMenuOpen(false);
                  setToast("Recruiting lead deleted.");
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
      {toast ? (
        <p className="mt-1 text-[11px] font-medium text-emerald-700" role="status">
          {toast}
        </p>
      ) : null}
      {emailModalOpen ? (
        <RecruitingLeadSendEmailModal
          leadId={leadId}
          lead={{
            full_name: leadName,
            phone,
            email,
            license_status: licenseStatus,
            lead_type: leadType,
            form_name: formName,
          }}
          recipientEmail={email}
          emailConfigured={emailConfigured}
          onClose={() => setEmailModalOpen(false)}
          onSent={() => {
            setToast("Email sent.");
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
