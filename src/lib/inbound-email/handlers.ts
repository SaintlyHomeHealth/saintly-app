import "server-only";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { canonicalAliasEmail } from "@/lib/inbound-email/constants";
import { LEAD_ACTIVITY_EVENT } from "@/lib/crm/lead-activity-types";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { handleNewLeadCreated } from "@/lib/crm/post-create-lead-workflow";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { findRecruitingDuplicateCandidates } from "@/lib/recruiting/recruiting-duplicates";
import {
  normalizeRecruitingEmail,
  normalizeRecruitingPhoneForStorage,
  recruitingNameCityKey,
} from "@/lib/recruiting/recruiting-contact-normalize";

import {
  findActiveLeadIdForContact,
  findContactIdByEmail,
  findContactIdByPhoneDigits,
  isUniqueViolation,
} from "./crm-email-helpers";
import {
  extractDisplayNameFromFromHeader,
  extractPhoneNumbersFromText,
  maybeExtractSimplePersonNameFromSubjectOrBody,
  resumeLikeAttachmentPresent,
} from "./extract";
import type { InboundEmailChannelKey } from "./types";
import type { InboundEmailNormalized } from "./types";

export type InboundEmailHandlerResult = {
  relatedLeadId: string | null;
  relatedCandidateId: string | null;
  parsedEntities: Record<string, unknown>;
  reviewState: string | null;
};

function excerpt(text: string | undefined, max = 2000): string {
  const t = String(text ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function derivePersonName(
  normalized: InboundEmailNormalized,
  extractedName: string | null
): { first_name: string; last_name: string; full_name: string } {
  const { name: hdrName } = extractDisplayNameFromFromHeader(
    normalized.fromName ? `${normalized.fromName} <${normalized.fromEmail}>` : normalized.fromEmail
  );
  const fullFromExtracted = extractedName?.trim();
  const full = fullFromExtracted || hdrName || "";
  if (full) {
    const parts = full.split(/\s+/).filter(Boolean);
    const first_name = parts[0] ?? "Unknown";
    const last_name = parts.slice(1).join(" ") || "—";
    return { first_name, last_name, full_name: full };
  }
  const local = normalizeRecruitingEmail(normalized.fromEmail)?.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "Email";
  const lp = local.split(/\s+/).filter(Boolean);
  return {
    first_name: lp[0] ?? "Email",
    last_name: lp.slice(1).join(" ") || "Sender",
    full_name: local,
  };
}

function normalizeStoredPhoneFromE164(e164: string): string | null {
  const d = normalizePhone(e164);
  if (!d) return null;
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  return null;
}

async function insertLeadInboundActivity(input: {
  leadId: string;
  channel: InboundEmailChannelKey;
  normalized: InboundEmailNormalized;
  bodyLines: string[];
}): Promise<void> {
  const { error } = await supabaseAdmin.from("lead_activities").insert({
    lead_id: input.leadId,
    event_type: LEAD_ACTIVITY_EVENT.inbound_email,
    body: input.bodyLines.filter(Boolean).join("\n"),
    metadata: {
      channel_key: input.channel,
      provider: input.normalized.provider,
      message_id: input.normalized.messageId ?? null,
      subject: input.normalized.subject ?? null,
    },
    created_by_user_id: null,
    deletable: false,
  });
  if (error) {
    console.warn("[inbound-email] lead_activities insert:", error.message);
  }
}

async function upsertCrmLeadFromEmail(input: {
  channel: InboundEmailChannelKey;
  leadSource: "email_referral" | "email_inquiry";
  normalized: InboundEmailNormalized;
  logPrefix: string;
}): Promise<{ relatedLeadId: string | null; parsedEntities: Record<string, unknown>; reviewState: string | null }> {
  const { channel, leadSource, normalized, logPrefix } = input;
  const textBlob = [normalized.subject, normalized.textBody].filter(Boolean).join("\n");
  const phonesE164 = extractPhoneNumbersFromText(textBlob);
  const primaryE164 = phonesE164[0] ?? null;
  const primaryStored = primaryE164 ? normalizeStoredPhoneFromE164(primaryE164) : null;
  const extractedName = maybeExtractSimplePersonNameFromSubjectOrBody(normalized.subject, normalized.textBody);
  const nameParts = derivePersonName(normalized, extractedName);
  const msgId = normalized.messageId?.trim() || null;

  const parsedEntities: Record<string, unknown> = {
    phones_e164: phonesE164,
    extracted_name: extractedName,
    primary_e164: primaryE164,
  };

  const sparse = !primaryStored && !extractedName;
  const reviewState = sparse ? "needs_review" : null;

  if (msgId) {
    const { data: existingLead } = await leadRowsActiveOnly(
      supabaseAdmin.from("leads").select("id").eq("source", leadSource).eq("external_source_id", msgId)
    ).maybeSingle();
    if (existingLead?.id) {
      const leadId = String(existingLead.id);
      console.log(`${logPrefix} idempotent lead hit (external_source_id)`, { leadId });
      await insertLeadInboundActivity({
        leadId,
        channel,
        normalized,
        bodyLines: [
          `Inbound ${channel} email (duplicate Message-Id; activity only).`,
          normalized.subject ? `Subject: ${normalized.subject}` : "",
          excerpt(normalized.textBody) ? `Excerpt: ${excerpt(normalized.textBody)}` : "",
        ],
      });
      revalidatePath("/admin/crm/leads");
      revalidatePath(`/admin/crm/leads/${leadId}`);
      return { relatedLeadId: leadId, parsedEntities, reviewState };
    }
  }

  let contactId =
    (await findContactIdByEmail(supabaseAdmin, normalized.fromEmail)) ??
    (primaryStored ? await findContactIdByPhoneDigits(supabaseAdmin, primaryStored) : null);

  if (!contactId) {
    const contactNotes = [
      `Created from inbound ${channel} email (${normalized.provider}, ${normalized.receivedAt}).`,
      normalized.subject ? `Subject: ${normalized.subject}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 8000);

    const { data: cRow, error: cErr } = await supabaseAdmin
      .from("contacts")
      .insert({
        first_name: nameParts.first_name,
        last_name: nameParts.last_name,
        full_name: nameParts.full_name,
        primary_phone: primaryStored,
        email: normalizeRecruitingEmail(normalized.fromEmail),
        notes: contactNotes,
      })
      .select("id")
      .single();

    if (cErr || !cRow?.id) {
      console.warn(`${logPrefix} contact insert failed`, cErr?.message);
      return { relatedLeadId: null, parsedEntities, reviewState };
    }
    contactId = String(cRow.id);
  } else {
    const patch: Record<string, unknown> = {};
    if (primaryStored) {
      const { data: c0 } = await supabaseAdmin
        .from("contacts")
        .select("primary_phone, email")
        .eq("id", contactId)
        .maybeSingle();
      if (c0 && !(c0 as { primary_phone?: string }).primary_phone?.trim()) {
        patch.primary_phone = primaryStored;
      }
    }
    const em = normalizeRecruitingEmail(normalized.fromEmail);
    if (em) {
      const { data: c0 } = await supabaseAdmin.from("contacts").select("email").eq("id", contactId).maybeSingle();
      if (c0 && !(c0 as { email?: string }).email?.trim()) {
        patch.email = em;
      }
    }
    if (Object.keys(patch).length) {
      const { error: uErr } = await supabaseAdmin.from("contacts").update(patch).eq("id", contactId);
      if (uErr) console.warn(`${logPrefix} contact patch`, uErr.message);
    }
  }

  let leadId = await findActiveLeadIdForContact(supabaseAdmin, contactId);

  const externalMeta = {
    ingestion_channel: "inbound_email" as const,
    channel_key: channel,
    provider: normalized.provider,
    message_id: msgId,
    received_at: normalized.receivedAt,
    subject: normalized.subject ?? null,
    text_excerpt: excerpt(normalized.textBody, 4000),
  };

  const leadNotesLines = [
    `Inbound ${channel} email (${normalized.provider}).`,
    normalized.subject ? `Subject: ${normalized.subject}` : "",
    excerpt(normalized.textBody) ? `Body excerpt:\n${excerpt(normalized.textBody, 4000)}` : "",
  ];

  if (leadId) {
    const { data: prev } = await leadRowsActiveOnly(
      supabaseAdmin.from("leads").select("notes, intake_status").eq("id", leadId)
    ).maybeSingle();
    const prevNotes = typeof prev?.notes === "string" ? prev.notes.trim() : "";
    const bump = leadNotesLines.join("\n").trim();
    const mergedNotes = prevNotes ? `${prevNotes}\n\n---\n${bump}`.slice(0, 8000) : bump;
    const intakePatch =
      reviewState === "needs_review" && !(prev as { intake_status?: string })?.intake_status?.trim()
        ? { intake_status: "needs_review" }
        : {};

    const { error: luErr } = await supabaseAdmin
      .from("leads")
      .update({
        notes: mergedNotes,
        updated_at: new Date().toISOString(),
        ...intakePatch,
      })
      .eq("id", leadId);
    if (luErr) console.warn(`${logPrefix} lead notes update`, luErr.message);

    await insertLeadInboundActivity({
      leadId,
      channel,
      normalized,
      bodyLines: [
        `Inbound ${channel} email received (existing active lead).`,
        normalized.subject ? `Subject: ${normalized.subject}` : "",
        excerpt(normalized.textBody) ? `Excerpt: ${excerpt(normalized.textBody)}` : "",
      ],
    });
    revalidatePath("/admin/crm/leads");
    revalidatePath(`/admin/crm/leads/${leadId}`);
    return { relatedLeadId: leadId, parsedEntities, reviewState };
  }

  const { data: newLead, error: lErr } = await supabaseAdmin
    .from("leads")
    .insert({
      contact_id: contactId,
      source: leadSource,
      status: "new",
      external_source_id: msgId,
      external_source_metadata: externalMeta,
      notes: leadNotesLines.join("\n").slice(0, 8000),
      intake_status: reviewState === "needs_review" ? "needs_review" : null,
    })
    .select("id")
    .single();

  if (lErr || !newLead?.id) {
    if (isUniqueViolation(lErr) && msgId) {
      const { data: ex2 } = await leadRowsActiveOnly(
        supabaseAdmin.from("leads").select("id").eq("source", leadSource).eq("external_source_id", msgId)
      ).maybeSingle();
      if (ex2?.id) {
        const lid = String(ex2.id);
        await insertLeadInboundActivity({
          leadId: lid,
          channel,
          normalized,
          bodyLines: [`Inbound ${channel} email (race dedupe).`, normalized.subject ? `Subject: ${normalized.subject}` : ""],
        });
        revalidatePath(`/admin/crm/leads/${lid}`);
        return { relatedLeadId: lid, parsedEntities, reviewState };
      }
    }
    console.warn(`${logPrefix} lead insert failed`, lErr?.message);
    return { relatedLeadId: null, parsedEntities, reviewState };
  }

  leadId = String(newLead.id);
  await insertLeadInboundActivity({
    leadId,
    channel,
    normalized,
    bodyLines: [
      `Inbound ${channel} email received (new CRM lead).`,
      normalized.subject ? `Subject: ${normalized.subject}` : "",
      excerpt(normalized.textBody) ? `Excerpt: ${excerpt(normalized.textBody)}` : "",
    ],
  });

  await handleNewLeadCreated(supabaseAdmin, {
    leadId,
    contactId,
    intakeChannel: leadSource,
  });
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  return { relatedLeadId: leadId, parsedEntities, reviewState };
}

export async function handleInboundReferralEmail(
  normalized: InboundEmailNormalized
): Promise<InboundEmailHandlerResult> {
  const logP = "[inbound-email][referrals]";
  const r = await upsertCrmLeadFromEmail({
    channel: "referrals",
    leadSource: "email_referral",
    normalized,
    logPrefix: logP,
  });
  return {
    relatedLeadId: r.relatedLeadId,
    relatedCandidateId: null,
    parsedEntities: r.parsedEntities,
    reviewState: r.reviewState,
  };
}

export async function handleInboundCareEmail(normalized: InboundEmailNormalized): Promise<InboundEmailHandlerResult> {
  const logP = "[inbound-email][care]";
  const r = await upsertCrmLeadFromEmail({
    channel: "care",
    leadSource: "email_inquiry",
    normalized,
    logPrefix: logP,
  });
  return {
    relatedLeadId: r.relatedLeadId,
    relatedCandidateId: null,
    parsedEntities: r.parsedEntities,
    reviewState: r.reviewState,
  };
}

export async function handleInboundJoinEmail(normalized: InboundEmailNormalized): Promise<InboundEmailHandlerResult> {
  const logP = "[inbound-email][join]";
  const textBlob = [normalized.subject, normalized.textBody].filter(Boolean).join("\n");
  const phonesE164 = extractPhoneNumbersFromText(textBlob);
  const primaryE164 = phonesE164[0] ?? null;
  const phoneStorage = primaryE164 ? normalizeRecruitingPhoneForStorage(primaryE164) : null;
  const extractedName = maybeExtractSimplePersonNameFromSubjectOrBody(normalized.subject, normalized.textBody);
  const nameParts = derivePersonName(normalized, extractedName);
  const email = normalizeRecruitingEmail(normalized.fromEmail);
  const hasResumeMeta = resumeLikeAttachmentPresent(normalized.attachments);

  const parsedEntities: Record<string, unknown> = {
    phones_e164: phonesE164,
    extracted_name: extractedName,
    resume_attachment_hint: hasResumeMeta,
    /** Binary fetch / parse intentionally not done in webhook path. */
    resume_parse: "deferred",
  };

  const duplicates = await findRecruitingDuplicateCandidates(supabaseAdmin, {
    email: normalized.fromEmail,
    phone: phoneStorage,
    fullName: nameParts.full_name,
    city: null,
  });

  let candidateId: string | null = duplicates[0]?.id ?? null;

  if (!candidateId) {
    const norm = {
      normalized_email: normalizeRecruitingEmail(email),
      normalized_phone: normalizeRecruitingPhoneForStorage(phoneStorage),
      name_city_key: recruitingNameCityKey(nameParts.full_name, null),
    };
    const { data: ins, error } = await supabaseAdmin
      .from("recruiting_candidates")
      .insert({
        full_name: nameParts.full_name,
        first_name: nameParts.first_name,
        last_name: nameParts.last_name,
        phone: phoneStorage,
        email: email,
        source: "Other",
        status: "New",
        notes: [
          `Inbound ${canonicalAliasEmail("join")} email (${normalized.provider}).`,
          normalized.subject ? `Subject: ${normalized.subject}` : "",
          hasResumeMeta ? "Attachment metadata suggests a resume — file not fetched in webhook (see raw_payload)." : "",
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 8000),
        recruiting_tags: "join_email",
        ...norm,
      })
      .select("id")
      .single();

    if (error || !ins?.id) {
      console.warn(`${logP} candidate insert`, error?.message);
      return { relatedLeadId: null, relatedCandidateId: null, parsedEntities, reviewState: null };
    }
    candidateId = String(ins.id);
  } else {
    const { data: prev } = await supabaseAdmin
      .from("recruiting_candidates")
      .select("notes, last_contact_at")
      .eq("id", candidateId)
      .maybeSingle();
    const prevNotes = typeof prev?.notes === "string" ? prev.notes.trim() : "";
    const bump = [
      `Another inbound join@ email (${normalized.provider}).`,
      normalized.subject ? `Subject: ${normalized.subject}` : "",
      excerpt(normalized.textBody) ? excerpt(normalized.textBody, 1500) : "",
    ]
      .filter(Boolean)
      .join("\n");
    const merged = prevNotes ? `${prevNotes}\n\n---\n${bump}`.slice(0, 8000) : bump;
    const { error: uErr } = await supabaseAdmin
      .from("recruiting_candidates")
      .update({
        notes: merged,
        last_contact_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);
    if (uErr) console.warn(`${logP} candidate update`, uErr.message);
  }

  const { error: actErr } = await supabaseAdmin.from("recruiting_candidate_activities").insert({
    candidate_id: candidateId,
    activity_type: "inbound_email",
    outcome: null,
    body: [
      `Inbound join email from ${normalized.fromEmail}.`,
      normalized.subject ? `Subject: ${normalized.subject}` : "",
      hasResumeMeta ? "Resume-like attachment metadata present (not auto-ingested)." : "",
    ]
      .filter(Boolean)
      .join("\n"),
    created_by: null,
  });
  if (actErr) console.warn(`${logP} activity insert`, actErr.message);

  revalidatePath("/admin/recruiting");
  revalidatePath(`/admin/recruiting/${candidateId}`);
  return {
    relatedLeadId: null,
    relatedCandidateId: candidateId,
    parsedEntities,
    reviewState: null,
  };
}

export async function handleInboundBillingEmail(
  normalized: InboundEmailNormalized
): Promise<InboundEmailHandlerResult> {
  console.log("[inbound-email][billing] stored via inbound_communications only");
  return {
    relatedLeadId: null,
    relatedCandidateId: null,
    parsedEntities: {
      billing_channel: true,
      has_text: Boolean(normalized.textBody?.trim()),
      has_html: Boolean(normalized.htmlBody?.trim()),
    },
    reviewState: null,
  };
}
