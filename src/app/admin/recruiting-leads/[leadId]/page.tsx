import { redirect } from "next/navigation";

export default async function AdminRecruitingLeadLegacyDetailRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { leadId } = await params;
  const sp = await searchParams;
  const u = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string" && value.trim()) {
      u.set(key, value);
    } else if (Array.isArray(value)) {
      const first = value[0];
      if (typeof first === "string" && first.trim()) u.set(key, first);
    }
  }
  const qs = u.toString();
  const base = `/admin/recruiting/leads/${encodeURIComponent(leadId.trim())}`;
  redirect(qs ? `${base}?${qs}` : base);
}
