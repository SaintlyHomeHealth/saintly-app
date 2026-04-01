import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

type DenyReason = "no_staff_profile" | "inactive" | "role_not_allowed";

export const metadata: Metadata = {
  title: "Access denied | Saintly Admin",
  description: "This account is not authorized for the admin portal",
};

function messageForReason(reason: DenyReason | string | undefined): {
  title: string;
  body: string;
} {
  switch (reason) {
    case "inactive":
      return {
        title: "Staff account inactive",
        body: "Your staff profile exists but is marked inactive. Ask an administrator to reactivate your account in Staff Access.",
      };
    case "role_not_allowed":
      return {
        title: "Role not permitted",
        body: "Your account has a staff role that is not allowed for this portal. Contact your administrator.",
      };
    case "no_staff_profile":
    default:
      return {
        title: "No staff profile",
        body: "You are signed in, but there is no active staff profile linked to this login. Ask an administrator to add or repair your account in Staff Access.",
      };
  }
}

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const raw = sp.reason;
  const reason =
    typeof raw === "string" && raw.length > 0 ? (raw as DenyReason) : undefined;
  const { title, body } = messageForReason(reason);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-16">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
        {reason ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950">
            Deny reason: <span className="font-mono">{reason}</span>
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to site
          </Link>
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
