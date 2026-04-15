import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspacePhonePageHeader } from "../../_components/WorkspacePhonePageHeader";
import { NewWorkspaceSmsComposeClient } from "../_components/NewWorkspaceSmsComposeClient";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function one(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
}

function safeDecodeParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function bannerForErr(code: string): string | null {
  switch (code) {
    case "sms_empty":
      return "Add a message before sending.";
    case "sms_bad_phone":
      return "Enter a valid phone number (US / E.164).";
    case "sms_contact_no_phone":
      return "That contact does not have a primary phone on file.";
    case "sms_recruit_no_phone":
      return "That recruit does not have a phone number.";
    case "sms_contact_missing":
      return "Contact not found. Try again or pick from search.";
    case "sms_contact_create":
      return "Could not create a CRM contact for this number. Try again.";
    case "sms_thread":
      return "Could not prepare the SMS conversation (before Twilio send).";
    case "sms_resolve":
      return "Could not resolve recipient. Check the number and try again.";
    default:
      return code ? "Could not send SMS." : null;
  }
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkspaceInboxNewSmsPage({ searchParams }: PageProps) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const sp = (await searchParams) ?? {};
  const errRaw = one(sp, "err").trim();
  const smsErrRaw = one(sp, "smsErr").trim();
  const threadErrRaw = one(sp, "threadErr").trim();
  const recruitArg = one(sp, "recruitingCandidateId").trim();

  let initialRecruitingCandidateId: string | null = null;
  let initialPhone: string | null = null;
  let initialNameHint: string | null = null;

  const threadErrDecoded = threadErrRaw ? safeDecodeParam(threadErrRaw) : null;

  const resolveErrorBanner = (): string | null => {
    if (errRaw === "sms_thread") {
      return threadErrDecoded
        ? `Could not prepare the SMS conversation (before Twilio): ${threadErrDecoded}`
        : "Could not prepare the SMS conversation. See server logs for ensureSmsConversationForPhone.";
    }
    return errRaw ? bannerForErr(errRaw) : null;
  };

  if (recruitArg && UUID_RE.test(recruitArg)) {
    initialRecruitingCandidateId = recruitArg;
    const { data: cand } = await supabaseAdmin
      .from("recruiting_candidates")
      .select("id, phone, full_name")
      .eq("id", recruitArg)
      .maybeSingle();
    if (cand?.id) {
      initialPhone = typeof cand.phone === "string" ? cand.phone : null;
      initialNameHint = typeof cand.full_name === "string" ? cand.full_name : null;
    }
  }

  return (
    <div className="ws-phone-page-shell flex flex-1 flex-col px-4 pb-28 pt-5 sm:px-5 sm:pb-32">
      <WorkspacePhonePageHeader
        title="New message"
        subtitle="Send an outbound SMS — opens in your inbox thread after it sends."
        actions={
          <Link
            href="/workspace/phone/inbox"
            className="inline-flex rounded-full border border-sky-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-phone-ink hover:bg-phone-ice"
          >
            Inbox
          </Link>
        }
      />

      <div className="mx-auto w-full max-w-lg">
        <NewWorkspaceSmsComposeClient
          initialRecruitingCandidateId={initialRecruitingCandidateId}
          initialPhone={initialPhone}
          initialNameHint={initialNameHint}
          errorBanner={resolveErrorBanner()}
          twilioError={
            smsErrRaw
              ? (() => {
                  try {
                    return decodeURIComponent(smsErrRaw);
                  } catch {
                    return smsErrRaw;
                  }
                })()
              : null
          }
        />
      </div>
    </div>
  );
}
