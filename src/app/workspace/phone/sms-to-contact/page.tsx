import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureSmsConversationForContact } from "@/lib/workspace-phone/ensure-sms-thread-for-contact";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function one(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
}

export default async function WorkspaceSmsToContactPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }

  const sp = searchParams ? await searchParams : {};
  const contactId = one(sp, "contactId").trim();
  const leadId = one(sp, "leadId").trim();

  if (!contactId || !UUID_RE.test(contactId)) {
    redirect("/workspace/phone/inbox");
  }

  const res = await ensureSmsConversationForContact(contactId);
  if (!res.ok) {
    const q = new URLSearchParams();
    q.set("smsErr", res.error);
    if (leadId && UUID_RE.test(leadId)) {
      q.set("leadId", leadId);
    }
    redirect(`/workspace/phone/inbox?${q.toString()}`);
  }

  if (res.created) {
    revalidatePath("/workspace/phone/inbox");
    revalidatePath(`/workspace/phone/inbox/${res.conversationId}`);
  }

  /** Desktop inbox uses split view on `/workspace/phone/inbox?thread=…` (see `inbox/page.tsx`). */
  const dest = new URLSearchParams();
  dest.set("thread", res.conversationId);
  if (leadId && UUID_RE.test(leadId)) {
    dest.set("leadId", leadId);
  }
  redirect(`/workspace/phone/inbox?${dest.toString()}`);
}
