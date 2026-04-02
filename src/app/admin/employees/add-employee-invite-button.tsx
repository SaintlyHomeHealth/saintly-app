"use client";

import { useState } from "react";

import { submitAddEmployeeInviteAction } from "@/app/admin/employees/actions";

type Props = {
  segment: string;
  q: string;
  sort: string;
  dir: string;
};

export default function AddEmployeeInviteButton({ segment, q, sort, dir }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center justify-center rounded-[20px] border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
      >
        Add Employee
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-employee-invite-title"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-6 shadow-xl">
            <h2
              id="add-employee-invite-title"
              className="text-lg font-bold tracking-tight text-slate-900"
            >
              Invite new hire
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Creates or updates the applicant by email, then sends the onboarding link.
            </p>

            <form action={submitAddEmployeeInviteAction} className="mt-5 space-y-4">
              {segment !== "all" ? <input type="hidden" name="segment" value={segment} /> : null}
              {q ? <input type="hidden" name="q" value={q} /> : null}
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="dir" value={dir} />

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  First name
                  <input
                    name="firstName"
                    required
                    autoComplete="given-name"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  Last name
                  <input
                    name="lastName"
                    required
                    autoComplete="family-name"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Mobile phone (for text)
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="e.g. 6025550100"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm"
                />
              </label>

              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-slate-600">Send method</legend>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input type="radio" name="channel" value="sms" className="h-4 w-4" />
                  Text only
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input type="radio" name="channel" value="email" className="h-4 w-4" />
                  Email only
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input type="radio" name="channel" value="both" defaultChecked className="h-4 w-4" />
                  Both
                </label>
              </fieldset>

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  Send invite
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
