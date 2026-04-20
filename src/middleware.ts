import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

function safeInternalPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/admin";
  }
  return next;
}

export type StaffDenyReason = "no_staff_profile" | "inactive" | "role_not_allowed";

type StaffGateResult =
  | {
      ok: true;
      role: string;
      isActive: boolean;
      admin_shell_access: boolean;
      require_password_change: boolean;
    }
  | { ok: false; reason: StaffDenyReason };

function authDebug(label: string, payload: Record<string, unknown>) {
  if (process.env.DEBUG_AUTH_FLOW === "1" || process.env.NODE_ENV === "development") {
    console.log(`[middleware][auth] ${label}`, payload);
  }
}

function shouldLogAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/phone") || pathname.startsWith("/admin/staff");
}

async function resolveStaffGate(
  supabase: SupabaseClient,
  userId: string
): Promise<StaffGateResult> {
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id, is_active, role, admin_shell_access, require_password_change")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[middleware] staff_profiles query:", error.message);
    return { ok: false, reason: "no_staff_profile" };
  }

  if (!data?.id) {
    return { ok: false, reason: "no_staff_profile" };
  }

  if (data.is_active === false) {
    return { ok: false, reason: "inactive" };
  }

  const role = typeof data.role === "string" ? data.role : "";
  const allowedRoles = new Set([
    "super_admin",
    "admin",
    "manager",
    "nurse",
    "don",
    "recruiter",
    "billing",
    "dispatch",
    "credentialing",
    "read_only",
  ]);
  if (!allowedRoles.has(role)) {
    return { ok: false, reason: "role_not_allowed" };
  }

  const admin_shell_access = data.admin_shell_access !== false;
  const require_password_change = data.require_password_change === true;

  return { ok: true, role, isActive: data.is_active !== false, admin_shell_access, require_password_change };
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (user) {
    const skipForcedPwd =
      pathname.startsWith("/login/forced-password-change") ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next");
    if (!skipForcedPwd) {
      const { data: pwdRow } = await supabase
        .from("staff_profiles")
        .select("require_password_change")
        .eq("user_id", user.id)
        .maybeSingle();
      if (pwdRow?.require_password_change === true) {
        const url = request.nextUrl.clone();
        url.pathname = "/login/forced-password-change";
        url.searchParams.set(
          "next",
          `${request.nextUrl.pathname}${request.nextUrl.search}`
        );
        return NextResponse.redirect(url);
      }
    }
  }

  if (pathname.startsWith("/admin") && !user) {
    if (shouldLogAdminPath(pathname)) {
      authDebug("admin:no_session", {
        pathname,
        decision: "deny",
        redirect: "/login",
      });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && user) {
    const gate = await resolveStaffGate(supabase, user.id);

    if (shouldLogAdminPath(pathname)) {
      authDebug("admin:session", {
        pathname,
        userId: user.id,
        email: user.email ?? null,
        staffRowFound: gate.ok,
        role: gate.ok ? gate.role : null,
        is_active: gate.ok ? gate.isActive : null,
        decision: gate.ok ? "allow" : "deny",
        denyReason: gate.ok ? null : gate.reason,
        redirectIfDenied: gate.ok ? null : `/unauthorized?reason=${gate.reason}`,
      });
    }

    if (!gate.ok) {
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      url.searchParams.set("reason", gate.reason);
      return NextResponse.redirect(url);
    }

    // Workspace-first roles cannot open /admin until Staff Access enables admin shell (default off for nurses).
    const role = gate.role.trim().toLowerCase();
    const workspaceFirst =
      role === "nurse" || role === "employee" || role === "staff";
    if (workspaceFirst && !gate.admin_shell_access) {
      const url = request.nextUrl.clone();
      url.pathname = "/workspace/phone/keypad";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Staff skip the login screen; non-staff stay here so they can sign out and use another account.
  if (pathname.startsWith("/login") && user) {
    const gate = await resolveStaffGate(supabase, user.id);
    authDebug("login:already_signed_in", {
      pathname,
      userId: user.id,
      email: user.email ?? null,
      staffRowFound: gate.ok,
      decision: gate.ok ? "redirect_to_next" : "stay_on_login",
    });
    if (gate.ok) {
      const nextParam = request.nextUrl.searchParams.get("next");
      if (nextParam) {
        const next = safeInternalPath(nextParam);
        return NextResponse.redirect(new URL(next, request.url));
      }
      if (gate.role === "nurse") {
        return NextResponse.redirect(new URL("/workspace/phone/keypad", request.url));
      }
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on all paths except static assets and images.
     * Needed so Supabase can refresh the auth session on navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
