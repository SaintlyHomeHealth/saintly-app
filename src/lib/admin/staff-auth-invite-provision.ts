import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { findAuthUserIdByEmail } from "@/lib/admin/staff-auth-link";

/** Temporary: trace staff invite (no Supabase Auth email); remove when stable. */
export function logStaffAuthInvite(event: string, extra: Record<string, unknown>): void {
  console.info(
    JSON.stringify({
      source: "staff_auth_invite",
      event,
      t: new Date().toISOString(),
      ...extra,
    })
  );
}

export type StaffAuthProvisionResult =
  | { ok: true; userId: string; actionLink: string; supabaseMethod: "generateLink_invite" | "generateLink_magiclink" }
  | { ok: false; error: string; detail?: string };

const userMeta = (fullName: string) => ({ full_name: fullName });

/**
 * Provisions a Supabase auth user and returns a sign-in/invite link without sending any Supabase
 * Auth email. Use the returned `actionLink` in our own (e.g. Resend) message.
 * — invite: creates invited user; magiclink: fallback when a user with this email already exists.
 */
export async function provisionStaffAuthInviteForEmail(input: {
  email: string;
  metaName: string;
  redirectTo: string;
}): Promise<StaffAuthProvisionResult> {
  const { email, metaName, redirectTo } = input;
  const data = userMeta(metaName);

  const inviteGl = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo, data },
  });

  if (
    !inviteGl.error &&
    inviteGl.data?.properties?.action_link &&
    inviteGl.data.user?.id
  ) {
    return {
      ok: true,
      userId: inviteGl.data.user.id,
      actionLink: inviteGl.data.properties.action_link,
      supabaseMethod: "generateLink_invite",
    };
  }

  const existingId = await findAuthUserIdByEmail(email);
  if (!existingId) {
    return {
      ok: false,
      error: "auth_provision_failed",
      detail: inviteGl.error?.message,
    };
  }

  const magicGl = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo, data },
  });

  if (!magicGl.error && magicGl.data?.properties?.action_link && magicGl.data.user?.id) {
    return {
      ok: true,
      userId: magicGl.data.user.id,
      actionLink: magicGl.data.properties.action_link,
      supabaseMethod: "generateLink_magiclink",
    };
  }

  return {
    ok: false,
    error: "auth_provision_failed",
    detail: magicGl.error?.message || inviteGl.error?.message,
  };
}

/**
 * Existing staff user: issue a new magic link (same `redirectTo` and PKCE callback as invite flow).
 */
export async function generateStaffResendSignInLink(input: {
  email: string;
  metaName: string;
  redirectTo: string;
}): Promise<StaffAuthProvisionResult> {
  const { email, metaName, redirectTo } = input;
  const gl = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo, data: userMeta(metaName) },
  });
  if (!gl.error && gl.data?.properties?.action_link && gl.data.user?.id) {
    return {
      ok: true,
      userId: gl.data.user.id,
      actionLink: gl.data.properties.action_link,
      supabaseMethod: "generateLink_magiclink",
    };
  }
  return { ok: false, error: "auth_provision_failed", detail: gl.error?.message };
}
