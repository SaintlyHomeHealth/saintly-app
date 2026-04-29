"use client";

import { useMemo, useState } from "react";

import { submitAddEmployeeInviteAction } from "@/app/admin/employees/actions";

type InvitePrefill = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
};

type Props = {
  segment?: string;
  q?: string;
  sort?: string;
  dir?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  initialValues?: InvitePrefill;
  recruitingCandidateId?: string;
  returnTo?: string;
  title?: string;
  description?: string;
};

const defaultTriggerClassName =
  "inline-flex shrink-0 items-center justify-center rounded-[20px] border border-indigo-600 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700";

type InviteChannel = "sms" | "email" | "both";

function inputClass(hasError: boolean): string {
  return [
    "rounded-xl px-3 py-2 text-sm text-slate-900 shadow-sm",
    hasError ? "border border-rose-300 bg-rose-50/60" : "border border-slate-200",
  ].join(" ");
}

export default function AddEmployeeInviteButton({
  segment = "all",
  q = "",
  sort = "updated",
  dir = "desc",
  triggerLabel = "Add Employee",
  triggerClassName = defaultTriggerClassName,
  initialValues,
  recruitingCandidateId,
  returnTo,
  title = "Invite new hire",
  description = "Creates or updates the applicant by email or phone, then sends the onboarding link.",
}: Props) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState(initialValues?.firstName?.trim() ?? "");
  const [lastName, setLastName] = useState(initialValues?.lastName?.trim() ?? "");
  const [email, setEmail] = useState(initialValues?.email?.trim() ?? "");
  const [phone, setPhone] = useState(initialValues?.phone?.trim() ?? "");
  const [role, setRole] = useState(initialValues?.role?.trim() ?? "");
  const [channel, setChannel] = useState<InviteChannel>("both");

  const needsEmail = channel === "email" || channel === "both";
  const needsPhone = channel === "sms" || channel === "both";
  const emailMissing = needsEmail && email.trim().length === 0;
  const phoneMissing = needsPhone && phone.trim().length === 0;

  const missingMessage = useMemo(() => {
    if (!emailMissing && !phoneMissing) return null;
    if (emailMissing && phoneMissing) return "Email and mobile phone are required for Both.";
    if (emailMissing) return "Email is required for email invites.";
    return "Mobile phone is required for text invites.";
  }, [emailMissing, phoneMissing]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
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
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{description}</p>

            <form action={submitAddEmployeeInviteAction} className="mt-5 space-y-4">
              {segment !== "all" ? <input type="hidden" name="segment" value={segment} /> : null}
              {q ? <input type="hidden" name="q" value={q} /> : null}
              <input type="hidden" name="sort" value={sort} />
              <input type="hidden" name="dir" value={dir} />
              {recruitingCandidateId ? (
                <input type="hidden" name="recruitingCandidateId" value={recruitingCandidateId} />
              ) : null}
              {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  First name
                  <input
                    name="firstName"
                    required
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className={inputClass(firstName.trim().length === 0)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                  Last name
                  <input
                    name="lastName"
                    required
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className={inputClass(lastName.trim().length === 0)}
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Email
                <input
                  name="email"
                  type="email"
                  required={needsEmail}
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={emailMissing}
                  className={inputClass(emailMissing)}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Mobile phone (for text)
                <input
                  name="phone"
                  type="tel"
                  required={needsPhone}
                  autoComplete="tel"
                  placeholder="e.g. 6025550100"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  aria-invalid={phoneMissing}
                  className={inputClass(phoneMissing)}
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Discipline / role
                <input
                  name="role"
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  placeholder="e.g. RN"
                  className={inputClass(false)}
                />
              </label>

              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-slate-600">Send method</legend>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="channel"
                    value="sms"
                    checked={channel === "sms"}
                    onChange={() => setChannel("sms")}
                    className="h-4 w-4"
                  />
                  Text only
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="channel"
                    value="email"
                    checked={channel === "email"}
                    onChange={() => setChannel("email")}
                    className="h-4 w-4"
                  />
                  Email only
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="radio"
                    name="channel"
                    value="both"
                    checked={channel === "both"}
                    onChange={() => setChannel("both")}
                    className="h-4 w-4"
                  />
                  Both
                </label>
              </fieldset>

              {missingMessage ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  {missingMessage}
                </p>
              ) : null}

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
