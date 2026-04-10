import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { NewFromResumeClient } from "./_components/NewFromResumeClient";

function mapError(raw: string | undefined): string | null {
  if (!raw) return null;
  switch (raw) {
    case "missing_name":
      return "Full name is required.";
    case "missing_file":
      return "Resume file is missing — go back and choose a file.";
    case "file_too_large":
      return "File is too large (max 10 MB).";
    case "bad_type":
      return "Only PDF, DOC, or DOCX files are allowed.";
    case "save_failed":
      return "Could not save the candidate.";
    case "upload_failed":
      return "Resume upload failed — try again.";
    default:
      return "Something went wrong.";
  }
}

export default async function NewFromResumePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const errRaw = typeof sp.error === "string" ? sp.error : Array.isArray(sp.error) ? sp.error[0] : "";
  const err = mapError(errRaw.trim());

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Talent pipeline"
        title="New candidate from resume"
        description="Upload first, review parsed fields, then create a lightweight recruiting record with the resume stored securely."
        actions={
          <Link href="/admin/recruiting" className={crmPrimaryCtaCls}>
            Back to list
          </Link>
        }
      />

      <NewFromResumeClient initialError={err} />
    </div>
  );
}
