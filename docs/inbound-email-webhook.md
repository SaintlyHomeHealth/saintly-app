# Inbound email webhook (`/api/inbound/email`)

Provider-agnostic HTTP endpoint that accepts parsed inbound email payloads, routes by **To** alias on `saintlyhomehealth.com`, writes CRM / recruiting / billing records, and stores an audit row in `inbound_communications`.

## Environment variables

| Variable | Required (production) | Purpose |
|----------|----------------------|---------|
| `INBOUND_EMAIL_SHARED_SECRET` | Yes | Shared secret; send in `x-inbound-email-secret`, `x-webhook-secret`, or `Authorization: Bearer …`. If unset in development, requests are allowed (for local curl). |
| `EMAIL_REFERRALS_SMS_AUTOREPLY_ENABLED` | No | `true` / `1` to send Twilio SMS ack for referrals channel (default off). |
| `EMAIL_CARE_SMS_AUTOREPLY_ENABLED` | No | Same for `care@`. |
| `EMAIL_JOIN_SMS_AUTOREPLY_ENABLED` | No | Same for `join@`. |

Billing never sends SMS. Existing Twilio env vars (`TWILIO_ACCOUNT_SID`, etc.) apply only when an autoreply flag is on.

## Aliases → channels

| To address | Channel key | Behavior |
|------------|-------------|----------|
| `referrals@saintlyhomehealth.com` | `referrals` | CRM lead `source = email_referral`, timeline activity |
| `care@saintlyhomehealth.com` | `care` | CRM lead `source = email_inquiry`, timeline activity |
| `join@saintlyhomehealth.com` | `join` | Recruiting candidate + activity (resume files are **not** downloaded in webhook) |
| `billing@saintlyhomehealth.com` | `billing` | `inbound_communications` only (no CRM lead, no candidate, no SMS) |

## Canonical JSON body (manual / default)

`Content-Type: application/json`

Optional header: `x-saintly-inbound-provider: default` to force canonical parsing.

```json
{
  "provider": "local-test",
  "messageId": "<unique-message-id@mail.example>",
  "fromEmail": "Sender Name <sender@example.com>",
  "fromName": "Sender Name",
  "toEmails": ["referrals@saintlyhomehealth.com"],
  "ccEmails": [],
  "subject": "Referral for Jane Doe",
  "textBody": "Please call 480-555-1212 regarding home health.",
  "htmlBody": null,
  "receivedAt": "2026-04-20T12:00:00.000Z",
  "attachments": [{ "filename": "note.pdf", "contentType": "application/pdf" }]
}
```

Validation uses Zod (`canonicalInboundEmailSchema` in `src/lib/inbound-email/zod-schemas.ts`).

## Provider hints

- **Resend**: auto-detected from `type: "email.received"` or `data.email_id`, or set `x-saintly-inbound-provider: resend`.
- **SendGrid Inbound Parse**: form POST with `headers`, `envelope`, `from`, `to`, `text`, `html`, or `x-saintly-inbound-provider: sendgrid`.
- **Mailgun routes**: form fields `sender`, `recipient`, `subject`, `body-plain`, etc., or `x-saintly-inbound-provider: mailgun`.

Normalizer entry points:

- `normalizeResendInboundEmail`
- `normalizeSendgridInboundEmail`
- `normalizeMailgunInboundEmail`

## cURL (local)

```bash
export SECRET="dev-secret"
export BASE="http://localhost:3000"

curl -sS -X POST "$BASE/api/inbound/email" \
  -H "Content-Type: application/json" \
  -H "x-inbound-email-secret: $SECRET" \
  -d '{
    "provider":"curl-test",
    "messageId":"test-msg-1",
    "fromEmail":"nurse@example.com",
    "toEmails":["referrals@saintlyhomehealth.com"],
    "subject":"Referral",
    "textBody":"Patient John Smith, call 480-555-1212"
  }'
```

Repeat the same `messageId` to verify idempotent handling (`duplicate: true`).

## Idempotency

When `messageId` is present, a unique index on `(provider, external_message_id)` in `inbound_communications` prevents duplicate audit rows. CRM leads also dedupe on `(source, external_source_id)` when the message id is stored on the lead.

## Follow-up to go live

1. Apply migration `20260430253000_inbound_communications_and_lead_email_sources.sql`.
2. Set `INBOUND_EMAIL_SHARED_SECRET` in Vercel.
3. Point each Google Workspace alias (or routing rule) at your provider’s inbound URL targeting `https://<your-domain>/api/inbound/email` with the secret header.
4. Optionally enable SMS autoreply flags after content review.

## Verification script

```bash
npm run verify:inbound-email
```
