import { redirect } from "next/navigation";

import { EmailMarketingTabNav } from "@/app/admin/email-marketing/_components/EmailMarketingTabNav";
import { EmailMarketingWorkspace } from "@/app/admin/email-marketing/_components/EmailMarketingWorkspace";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { supabaseAdmin } from "@/lib/admin";
import { getEmailMarketingSender, isEmailMarketingConfigured } from "@/lib/email-marketing/email-from";
import { parseEmailMarketingTab } from "@/lib/email-marketing/email-marketing-tabs";
import { isGmailInboxConnected } from "@/lib/email-marketing/gmail/client";
import { isGoogleOAuthConfigured } from "@/lib/email-marketing/gmail/constants";
import { canViewAllEmailMarketingHistory, canViewPrivateBusinessEmail } from "@/lib/email-marketing/permissions";
import { requireEmailMarketingStaff } from "@/lib/email-marketing/require-email-marketing-staff";
import type {
  EmailAttachmentRow,
  EmailMailboxRow,
  EmailMarketingFlyerRow,
  EmailMarketingTemplateRow,
  EmailMessageRow,
  EmailSenderProfileRow,
  EmailThreadRow,
} from "@/lib/email-marketing/types";
import { isAdminOrHigher } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

function missingInboxSchema(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return (
    (msg.includes("email_threads") ||
      msg.includes("email_messages") ||
      msg.includes("email_mailboxes") ||
      msg.includes("has_inbound")) &&
    (msg.includes("does not exist") || msg.includes("schema cache"))
  );
}

function missingEmailMarketingSchema(error: { message?: string } | null): boolean {
  const msg = (error?.message ?? "").toLowerCase();
  return msg.includes("email_marketing") && (msg.includes("does not exist") || msg.includes("schema cache"));
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminEmailMarketingPage({ searchParams }: { searchParams?: SearchParams }) {
  const gate = await requireEmailMarketingStaff();
  if (!gate.ok) redirect("/admin");

  const staff = gate.staff;
  const canViewAll = canViewAllEmailMarketingHistory(staff);
  const sender = getEmailMarketingSender();
  const rawSp = (await searchParams) ?? {};
  const tabRaw = rawSp.tab;
  const tabParam =
    typeof tabRaw === "string" ? tabRaw : Array.isArray(tabRaw) ? tabRaw[0] : undefined;
  const activeTab = parseEmailMarketingTab(tabParam);
  const isAdmin = isAdminOrHigher(staff);
  if (activeTab === "settings" && !isAdmin) {
    redirect("/admin/email-marketing?tab=inbox");
  }
  const errorRaw = rawSp.error;
  const connectError =
    typeof errorRaw === "string" ? decodeURIComponent(errorRaw) : Array.isArray(errorRaw) ? decodeURIComponent(errorRaw[0] ?? "") : null;
  const connectSuccess = rawSp.connected === "1";

  const [templatesRes, profilesRes, flyersRes, historyRes, staffRes, mailboxRes] = await Promise.all([
    supabaseAdmin.from("email_marketing_templates").select("*").order("name", { ascending: true }),
    supabaseAdmin.from("email_sender_profiles").select("*").order("display_name", { ascending: true }),
    supabaseAdmin.from("email_marketing_flyers").select("*").order("created_at", { ascending: false }),
    (() => {
      let q = supabaseAdmin
        .from("email_marketing_messages")
        .select(
          "*, email_marketing_templates(name), email_sender_profiles(display_name), email_marketing_flyers(title, file_url)"
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (!canViewAll) q = q.eq("sent_by_user_id", staff.user_id);
      return q;
    })(),
    supabaseAdmin.from("staff_profiles").select("user_id, full_name, email").not("user_id", "is", null).eq("is_active", true),
    supabaseAdmin.from("email_mailboxes").select("*").maybeSingle(),
  ]);

  const mailbox = (mailboxRes.data as EmailMailboxRow | null) ?? null;
  let threadsQuery = supabaseAdmin
    .from("email_threads")
    .select("*")
    .eq("has_inbound", true)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (mailbox?.id) threadsQuery = threadsQuery.eq("mailbox_id", mailbox.id);
  const threadsRes = await threadsQuery;

  const threadIds = (threadsRes.data ?? []).map((t) => t.id as string);
  const messagesRes =
    threadIds.length > 0
      ? await supabaseAdmin
          .from("email_messages")
          .select("*, email_attachments(*)")
          .in("thread_id", threadIds)
          .order("gmail_internal_date", { ascending: true, nullsFirst: false })
      : { data: [], error: null };

  const schemaMissing =
    missingEmailMarketingSchema(templatesRes.error) ||
    missingInboxSchema(threadsRes.error) ||
    missingInboxSchema(mailboxRes.error);

  const staffLabels: Record<string, string> = {};
  const staffOptions: Array<{ userId: string; label: string }> = [];
  for (const row of staffRes.data ?? []) {
    const uid = typeof row.user_id === "string" ? row.user_id : "";
    if (!uid) continue;
    const name = (row.full_name ?? "").trim();
    const email = (row.email ?? "").trim();
    const label = name || email || `${uid.slice(0, 8)}…`;
    staffLabels[uid] = label;
    staffOptions.push({ userId: uid, label });
  }

  const messagesByThread: Record<string, (EmailMessageRow & { email_attachments?: EmailAttachmentRow[] })[]> = {};
  for (const msg of messagesRes.data ?? []) {
    const tid = msg.thread_id as string | null;
    if (!tid) continue;
    if (!messagesByThread[tid]) messagesByThread[tid] = [];
    messagesByThread[tid]!.push(msg as EmailMessageRow & { email_attachments?: EmailAttachmentRow[] });
  }

  const sentCount = (historyRes.data ?? []).filter((r) => r.status === "sent").length;
  const draftCount = (historyRes.data ?? []).filter((r) => r.status === "draft").length;
  const unreadThreads = (threadsRes.data ?? []).filter((t) => {
    const msgs = messagesByThread[t.id as string] ?? [];
    return msgs.some((m) => m.direction === "inbound" && !m.read_at);
  }).length;

  const gmailConnected = await isGmailInboxConnected();

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Admin CRM"
        title="Email & Marketing"
        description="Shared admin@saintlyhomehealth.com inbox, branded outreach composer, templates, flyers, and sent history — without Gmail passwords or access to info@."
        footer={
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Inbox threads", threadsRes.data?.length ?? 0],
              ["Unread threads", unreadThreads],
              ["Active templates", (templatesRes.data ?? []).filter((t) => t.is_active).length],
              ["Flyers", (flyersRes.data ?? []).filter((f) => f.is_active).length],
              ["Sent / drafts", `${sentCount} / ${draftCount}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        }
      />

      {schemaMissing ? (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Email migrations are not fully applied. Apply{" "}
          <code className="text-xs">20260624120000_email_marketing.sql</code>,{" "}
          <code className="text-xs">20260625120000_email_marketing_shared_inbox.sql</code>, and{" "}
          <code className="text-xs">20260626120000_email_threads_inbox_metadata.sql</code>.
        </section>
      ) : null}

      <EmailMarketingTabNav activeTab={activeTab} isAdmin={isAdmin} />

      <EmailMarketingWorkspace
        templates={(templatesRes.data ?? []) as EmailMarketingTemplateRow[]}
        senderProfiles={(profilesRes.data ?? []) as EmailSenderProfileRow[]}
        flyers={(flyersRes.data ?? []) as EmailMarketingFlyerRow[]}
        history={historyRes.data ?? []}
        threads={(threadsRes.data ?? []) as EmailThreadRow[]}
        messagesByThread={messagesByThread}
        mailbox={(mailboxRes.data as EmailMailboxRow | null) ?? null}
        gmailConnected={gmailConnected}
        oauthConfigured={isGoogleOAuthConfigured()}
        emailConfigured={isEmailMarketingConfigured() || gmailConnected}
        fromEmail={sender.fromEmail}
        replyToEmail={sender.replyToEmail}
        canViewAllHistory={canViewAll}
        canViewPrivateEmail={canViewPrivateBusinessEmail(staff)}
        isAdmin={isAdmin}
        staffLabels={staffLabels}
        staffOptions={staffOptions}
        currentUserId={staff.user_id}
        activeTab={activeTab}
        connectError={connectError}
        connectSuccess={connectSuccess}
      />
    </div>
  );
}
