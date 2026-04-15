import { SmsConversationDetail } from "@/app/admin/phone/messages/_components/SmsConversationDetail";

type PageProps = {
  params: Promise<{ conversationId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function WorkspaceSmsConversationPage(props: PageProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SmsConversationDetail
        {...props}
        inboxHref="/workspace/phone/inbox"
        accessDeniedHref="/admin/phone"
        workspaceShell
      />
    </div>
  );
}
