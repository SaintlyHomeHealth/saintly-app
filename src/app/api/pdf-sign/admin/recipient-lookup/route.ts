import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

const TYPES = new Set(["employee", "recruit", "lead", "facility_contact"]);

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const type = (url.searchParams.get("type") || "").trim();
  const q = (url.searchParams.get("q") || "").trim();
  if (!TYPES.has(type)) return NextResponse.json({ error: "Invalid recipient type." }, { status: 400 });
  if (q.length < 2) return NextResponse.json({ results: [] });

  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;

  if (type === "employee" || type === "recruit") {
    // Both share the `applicants` table. We optionally filter by status to narrow recruits/employees.
    let query = supabaseAdmin
      .from("applicants")
      .select("id, first_name, last_name, email, phone, status")
      .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
      .limit(15);
    if (type === "employee") query = query.eq("status", "active");
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      results: (data || []).map((r) => ({
        id: r.id,
        name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.email || "Unnamed",
        email: r.email || null,
        phone: r.phone || null,
        meta: r.status || null,
      })),
    });
  }

  if (type === "lead") {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select(
        "id, contact:contacts!inner(first_name, last_name, full_name, email, primary_phone)"
      )
      .or(
        `first_name.ilike.${like},last_name.ilike.${like},full_name.ilike.${like},email.ilike.${like}`,
        { referencedTable: "contacts" }
      )
      .limit(15);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      results: (data || []).map((r) => {
        const rawContact = (r as unknown as {
          contact:
            | {
                first_name: string | null;
                last_name: string | null;
                full_name: string | null;
                email: string | null;
                primary_phone: string | null;
              }
            | Array<{
                first_name: string | null;
                last_name: string | null;
                full_name: string | null;
                email: string | null;
                primary_phone: string | null;
              }>;
        }).contact;
        const c = Array.isArray(rawContact) ? rawContact[0] : rawContact;
        const name =
          c?.full_name?.trim() || `${c?.first_name || ""} ${c?.last_name || ""}`.trim();
        return {
          id: r.id,
          name: name || c?.email || "Unnamed lead",
          email: c?.email || null,
          phone: c?.primary_phone || null,
          meta: "lead",
        };
      }),
    });
  }

  if (type === "facility_contact") {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, full_name, email, primary_phone, contact_type")
      .or(
        `first_name.ilike.${like},last_name.ilike.${like},full_name.ilike.${like},email.ilike.${like}`
      )
      .limit(15);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      results: (data || []).map((r) => ({
        id: r.id,
        name:
          r.full_name?.trim() ||
          `${r.first_name || ""} ${r.last_name || ""}`.trim() ||
          r.email ||
          "Unnamed contact",
        email: r.email || null,
        phone: r.primary_phone || null,
        meta: r.contact_type || null,
      })),
    });
  }

  return NextResponse.json({ results: [] });
}
