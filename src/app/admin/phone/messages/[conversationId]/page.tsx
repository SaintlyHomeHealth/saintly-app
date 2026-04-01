import { SmsConversationDetail } from "../_components/SmsConversationDetail";

type PageProps = {
  params: Promise<{ conversationId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function AdminSmsConversationPage(props: PageProps) {
  return (
    <SmsConversationDetail
      {...props}
      inboxHref="/admin/phone/messages"
      accessDeniedHref="/admin/phone"
    />
  );
}
