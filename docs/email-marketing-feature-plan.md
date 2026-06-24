# Email & Marketing — shared CRM inbox feature plan

Last updated: 2026-06-25

## Goal

Full CRM shared inbox for **admin@saintlyhomehealth.com** — send, receive, view, and reply inside the CRM without Gmail passwords and **without any connection to info@saintlyhomehealth.com**.

Route: `/admin/email-marketing` (nav label: **Email & Marketing**)

## Architecture

| Layer | Implementation |
|-------|----------------|
| Preferred provider | **Gmail API** (`EMAIL_PROVIDER=gmail`) — inbound sync, threading, replies, attachments |
| Fallback outbound | Resend / SendGrid / Postmark / SMTP (send-only; no inbox sync) |
| Storage | Supabase tables + private `email-inbox-attachments` bucket |
| Sync | Manual **Sync inbox** + `POST /api/cron/email-marketing-sync` (CRON_SECRET) |
| Future | `POST /api/admin/email-marketing/gmail/push` stub when `GOOGLE_PUBSUB_TOPIC` is set |

## Mailboxes

| Address | CRM role |
|---------|----------|
| **admin@saintlyhomehealth.com** | Shared CRM inbox — connect via Gmail OAuth or `GOOGLE_GMAIL_REFRESH_TOKEN` |
| **info@saintlyhomehealth.com** | Private owner inbox — **never synced or exposed** in staff tools |

Outbound:
- **From:** `Saintly Home Health <admin@saintlyhomehealth.com>`
- **Reply-To:** `admin@saintlyhomehealth.com`
- **Signature:** selected sender profile (Paul, Sandy, Saintly Admin, Custom)

## Database

Migration `20260625120000_email_marketing_shared_inbox.sql`:

| Table | Purpose |
|-------|---------|
| `email_mailboxes` | Gmail connection, last sync, historyId, sync errors |
| `email_threads` | Conversation threads (`gmail_thread_id`, assignment, CRM links) |
| `email_messages` | Inbound/outbound messages with RFC headers for threading |
| `email_attachments` | Metadata; files fetched on demand into private storage |

Prior migration `20260624120000_email_marketing.sql` retains templates, sender profiles, flyers, legacy `email_marketing_messages`.

## UI tabs

1. **Inbox** — thread list, filters, conversation view, reply box
2. **Composer** — new branded outreach
3. **Templates**
4. **Flyers**
5. **Sent / Drafts** — legacy marketing log + composer drafts
6. **Settings** (admin only) — Gmail connect/disconnect, sync status

## Permissions

- `email_marketing` Staff Access page key required
- Owner/admin: all threads, Settings, Gmail connect
- Staff: inbox + reply via admin@; own legacy marketing history unless admin
- All sends record `sent_by_user_id`

## Environment

```
EMAIL_PROVIDER=gmail
EMAIL_FROM_ADDRESS=admin@saintlyhomehealth.com
EMAIL_REPLY_TO=admin@saintlyhomehealth.com
EMAIL_FROM_NAME=Saintly Home Health
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_GMAIL_REFRESH_TOKEN=
GOOGLE_GMAIL_CONNECTED_EMAIL=admin@saintlyhomehealth.com
CRON_SECRET=
```

OAuth routes:
- `GET /api/admin/email-marketing/gmail/connect`
- `GET /api/admin/email-marketing/gmail/callback`
- `POST /api/admin/email-marketing/gmail/disconnect`

API:
- `POST /api/admin/email-marketing/sync`
- `POST /api/admin/email-marketing/threads/[threadId]/reply`
- `GET /api/admin/email-marketing/attachments/download?id=`

## Test plan

1. Apply both email migrations.
2. Admin → Settings → Connect Gmail for admin@ (or set refresh token env).
3. Send composer email → appears in Sent/Drafts and Inbox thread after sync.
4. Reply from external mailbox → Sync inbox → thread shows inbound message.
5. Reply from CRM → verify Gmail threading (In-Reply-To / References / threadId).
6. Staff with `email_marketing` can use inbox; without access, page blocked.
7. Confirm info@ never appears in synced threads.
8. `npm run build`

## Files

| Area | Path |
|------|------|
| Inbox migration | `supabase/migrations/20260625120000_email_marketing_shared_inbox.sql` |
| Gmail lib | `src/lib/email-marketing/gmail/*` |
| Reply service | `src/lib/email-marketing/thread-reply.ts` |
| APIs | `src/app/api/admin/email-marketing/**` |
| UI | `src/app/admin/email-marketing/_components/*` |
