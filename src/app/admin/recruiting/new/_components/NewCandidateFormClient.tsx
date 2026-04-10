"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import {
  RECRUITING_DISCIPLINE_OPTIONS,
  RECRUITING_SOURCE_OPTIONS,
} from "@/lib/recruiting/recruiting-options";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";

import { createRecruitingCandidate } from "../../actions";
import { RecruitingDuplicateModal } from "../../_components/RecruitingDuplicateModal";
import type { RecruitingDuplicateRow } from "@/lib/recruiting/recruiting-duplicates";

type StaffOpt = {
  user_id: string;
  email: string | null;
  role: string;
  full_name: string | null;
};

type NewCandidateFormClientProps = {
  staffOptions: StaffOpt[];
};

export function NewCandidateFormClient({ staffOptions }: NewCandidateFormClientProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [dupes, setDupes] = useState<RecruitingDuplicateRow[] | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  function runCreate(fd: FormData) {
    startTransition(async () => {
      setBanner(null);
      const res = await createRecruitingCandidate(fd);
      if (res.ok) {
        setDupes(null);
        router.push(`/admin/recruiting/${res.candidateId}`);
        return;
      }
      if (res.reason === "duplicates") {
        setDupes(res.duplicates);
        return;
      }
      if (res.reason === "missing_name") {
        setBanner("Full name is required.");
        return;
      }
      setBanner("Could not save. Try again.");
    });
  }

  return (
    <>
      {banner ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
          {banner}
        </div>
      ) : null}

      <form
        ref={formRef}
        className="space-y-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          runCreate(new FormData(e.currentTarget));
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Full name *
            <input name="full_name" required className={crmFilterInputCls} placeholder="Jane Doe" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Assigned to
            <select name="assigned_to" className={crmFilterInputCls} defaultValue="">
              <option value="">Unassigned</option>
              {staffOptions.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {staffPrimaryLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            First name
            <input name="first_name" className={crmFilterInputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Last name
            <input name="last_name" className={crmFilterInputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Phone
            <input name="phone" type="tel" className={crmFilterInputCls} placeholder="602…" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Email
            <input name="email" type="email" className={crmFilterInputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            City
            <input name="city" className={crmFilterInputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            State
            <input name="state" className={crmFilterInputCls} placeholder="AZ" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            ZIP
            <input name="zip" className={crmFilterInputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Coverage area
            <input name="coverage_area" className={crmFilterInputCls} placeholder="West Valley, Scottsdale…" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Discipline
            <select name="discipline" className={crmFilterInputCls} defaultValue="">
              <option value="">—</option>
              {RECRUITING_DISCIPLINE_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Source
            <select name="source" className={crmFilterInputCls} defaultValue="Indeed">
              {RECRUITING_SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Indeed URL
            <input name="indeed_url" type="url" className={crmFilterInputCls} placeholder="https://…" />
          </label>
          <label className="sm:col-span-2 flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Notes
            <textarea name="notes" rows={3} className={`${crmFilterInputCls} min-h-[5rem]`} />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={pending} className={crmPrimaryCtaCls}>
            {pending ? "Saving…" : "Create candidate"}
          </button>
          <Link
            href="/admin/recruiting"
            className="inline-flex items-center justify-center rounded-[20px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>

      <RecruitingDuplicateModal
        open={Boolean(dupes?.length)}
        duplicates={dupes ?? []}
        pending={pending}
        onOpenCandidate={(id) => {
          setDupes(null);
          router.push(`/admin/recruiting/${id}`);
        }}
        onContinueAnyway={() => {
          if (!formRef.current) return;
          const fd = new FormData(formRef.current);
          fd.set("force_duplicate", "1");
          setDupes(null);
          runCreate(fd);
        }}
        onCancel={() => {
          setDupes(null);
        }}
      />
    </>
  );
}
