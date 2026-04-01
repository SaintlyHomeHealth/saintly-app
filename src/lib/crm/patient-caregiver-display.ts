import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

/** Optional keys in `contacts.relationship_metadata` for home / family contacts (not validated in DB). */
const META_CAREGIVER_KEYS: { nameKey: string; phoneKey: string }[] = [
  { nameKey: "caregiver_name", phoneKey: "caregiver_phone" },
  { nameKey: "alternate_contact_name", phoneKey: "alternate_contact_phone" },
  { nameKey: "family_contact_name", phoneKey: "family_contact_phone" },
];

function readMetaString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== "object") return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export type CaregiverAlternateSummary = {
  /** Canonical caregiver / SMS-alternate line from `contacts.secondary_phone`. */
  secondaryLine: string | null;
  /** Extra lines from `relationship_metadata` name/phone pairs. */
  metadataLines: string[];
  /** True when there is nothing to show for home caregiver / alternate. */
  isEmpty: boolean;
};

/**
 * Builds display strings for the patient hub "Caregiver / alternate" block.
 * Source of truth for the phone used for caregiver SMS is `contacts.secondary_phone`.
 */
export function buildCaregiverAlternateSummary(opts: {
  secondaryPhone: string | null | undefined;
  relationshipMetadata: unknown;
}): CaregiverAlternateSummary {
  const sec = (opts.secondaryPhone ?? "").trim();
  const secondaryLine = sec ? formatPhoneForDisplay(sec) : null;

  const metadataLines: string[] = [];
  const meta = opts.relationshipMetadata;
  for (const { nameKey, phoneKey } of META_CAREGIVER_KEYS) {
    const name = readMetaString(meta, nameKey);
    const phoneRaw = readMetaString(meta, phoneKey);
    const phoneDisp = phoneRaw ? formatPhoneForDisplay(phoneRaw) : null;
    if (name && phoneDisp && phoneDisp !== "—") {
      metadataLines.push(`${name} · ${phoneDisp}`);
    } else if (name) {
      metadataLines.push(name);
    } else if (phoneRaw && phoneDisp && phoneDisp !== "—") {
      metadataLines.push(phoneDisp);
    }
  }

  const isEmpty = !secondaryLine && metadataLines.length === 0;
  return { secondaryLine, metadataLines, isEmpty };
}

export type DoctorOfficePatientFields = {
  doctor_office_name?: string | null;
  doctor_office_phone?: string | null;
  doctor_office_fax?: string | null;
  doctor_office_contact_person?: string | null;
  referring_doctor_name?: string | null;
  physician_name?: string | null;
};

export function hasDoctorOfficeDisplayInfo(p: DoctorOfficePatientFields): boolean {
  return [
    p.doctor_office_name,
    p.doctor_office_phone,
    p.doctor_office_fax,
    p.doctor_office_contact_person,
    p.referring_doctor_name,
    p.physician_name,
  ].some((x) => (typeof x === "string" ? x.trim() !== "" : false));
}
