import { redirect } from "next/navigation";

import { supabaseAdmin } from "@/lib/admin";
import { isValidE164 } from "@/lib/softphone/phone-number";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Finds an SMS thread by E.164 or creates a minimal row so admin can compose from the employee directory
 * without an existing conversation.
 */
export default async function AdminNewSmsFromPhonePage({ searchParams }: PageProps) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const sp = (await searchParams) ?? {};
  const raw = typeof sp.to === "string" ? sp.to.trim() : "";
  if (!raw || !isValidE164(raw)) {
    redirect("/admin/phone/messages");
  }

  const { data: existing, error: findErr } = await supabaseAdmin
    .from("conversations")
    .select("id")
    .eq("channel", "sms")
    .eq("main_phone_e164", raw)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    console.warn("[admin/phone/messages/new] find:", findErr.message);
  }

  if (existing?.id && typeof existing.id === "string") {
    redirect(`/admin/phone/messages/${existing.id}`);
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("conversations")
    .insert({
      channel: "sms",
      main_phone_e164: raw,
      metadata: { provisioned_from: "admin_employee_directory" },
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    console.warn("[admin/phone/messages/new] insert:", insErr?.message);
    redirect("/admin/phone/messages?error=new_thread");
  }

  redirect(`/admin/phone/messages/${inserted.id}`);
}
