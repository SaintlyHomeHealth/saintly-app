import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type TelnyxRecord = Record<string, unknown>;

type DiagnosticEndpoint = {
  label: string;
  path: string;
  product: string;
  idForFaxSend: boolean;
};

const TELNYX_API_BASE = "https://api.telnyx.com/v2";
const ENDPOINTS: DiagnosticEndpoint[] = [
  {
    label: "fax_applications",
    path: "/fax_applications",
    product: "programmable_fax",
    idForFaxSend: true,
  },
  {
    label: "credential_connections",
    path: "/credential_connections",
    product: "sip_connection_reference_only",
    idForFaxSend: false,
  },
  {
    label: "ip_connections",
    path: "/ip_connections",
    product: "sip_connection_reference_only",
    idForFaxSend: false,
  },
  {
    label: "fqdn_connections",
    path: "/fqdn_connections",
    product: "sip_connection_reference_only",
    idForFaxSend: false,
  },
];

function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

function readString(record: TelnyxRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNestedString(record: TelnyxRecord, path: string[]): string | null {
  let current: unknown = record;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return null;
    current = (current as TelnyxRecord)[key];
  }
  return typeof current === "string" && current.trim() ? current.trim() : null;
}

function safeRecord(endpoint: DiagnosticEndpoint, record: TelnyxRecord) {
  const webhookEventUrl = readString(record, ["webhook_event_url"]);
  return {
    id: readString(record, ["id"]),
    name: readString(record, ["application_name", "connection_name", "name"]),
    record_type: readString(record, ["record_type"]),
    product: endpoint.product,
    connection_type: readString(record, ["connection_type", "type"]) ?? readString(record, ["record_type"]),
    webhook_event_url: webhookEventUrl,
    webhook_points_to_fax_inbound: webhookEventUrl ? webhookEventUrl.includes("/api/fax/inbound") : null,
    active: typeof record.active === "boolean" ? record.active : null,
    outbound_voice_profile_id: readNestedString(record, ["outbound", "outbound_voice_profile_id"]),
    id_for_telnyx_fax_send: endpoint.idForFaxSend,
  };
}

async function telnyxGet(endpoint: DiagnosticEndpoint, apiKey: string) {
  const url = new URL(`${TELNYX_API_BASE}${endpoint.path}`);
  url.searchParams.set("page[size]", "100");
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const body = (await response.json().catch(() => ({}))) as TelnyxRecord;
  const data = Array.isArray(body.data) ? (body.data as TelnyxRecord[]) : [];
  const errors = Array.isArray(body.errors) ? (body.errors as TelnyxRecord[]) : [];
  return { response, data, errors };
}

async function main() {
  loadLocalEnv();

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("TELNYX_API_KEY is not configured.");
  }

  const configuredFaxConnectionId = process.env.TELNYX_FAX_CONNECTION_ID?.trim() ?? null;
  const faxApplicationIds = new Set<string>();

  console.log("Telnyx fax diagnostics");
  console.log(
    JSON.stringify(
      {
        telnyx_api_key_configured: true,
        telnyx_fax_connection_id_configured: Boolean(configuredFaxConnectionId),
        note: "Use the id from a record where record_type is fax_application for TELNYX_FAX_CONNECTION_ID. The Fax Application webhook_event_url should point to /api/fax/inbound for inbound fax receiving.",
      },
      null,
      2
    )
  );

  for (const endpoint of ENDPOINTS) {
    const { response, data, errors } = await telnyxGet(endpoint, apiKey);
    const safeData = data.map((record) => safeRecord(endpoint, record));
    if (endpoint.idForFaxSend) {
      for (const item of safeData) {
        if (item.id) faxApplicationIds.add(item.id);
      }
    }

    console.log(
      JSON.stringify(
        {
          endpoint: endpoint.label,
          path: endpoint.path,
          status: response.status,
          id_for_telnyx_fax_send: endpoint.idForFaxSend,
          count: safeData.length,
          records: safeData,
          errors: errors.map((error) => ({
            code: readString(error, ["code"]),
            title: readString(error, ["title"]),
            detail: readString(error, ["detail"]),
          })),
        },
        null,
        2
      )
    );
  }

  console.log(
    JSON.stringify(
      {
        configured_telnyx_fax_connection_id_matches_fax_application:
          configuredFaxConnectionId ? faxApplicationIds.has(configuredFaxConnectionId) : null,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : "Telnyx fax diagnostics failed.",
      },
      null,
      2
    )
  );
  process.exit(1);
});
