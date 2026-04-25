# Twilio SMS sender verification (internal)

Saintly’s application code defaults outbound SMS to the primary long code **+1 480-360-0008** (`+14803600008`). The backup line **+1 480-571-2062** (`+14805712062`) is only used when an admin explicitly selects it in the Text-from UI (or when `FACEBOOK_LEAD_INTRO_SMS_FROM` / other overrides intentionally point at that number).

## Messaging Service (`TWILIO_SMS_FROM` starts with `MG`)

When `TWILIO_SMS_FROM` is a **Messaging Service SID** (`MG…`):

- The app **does not** choose the exact long code in code. Twilio selects the sending number from the **sender pool** attached to that Messaging Service.
- **Operator action:** In [Twilio Console](https://console.twilio.com/) → Messaging → Services → your service → **Sender Pool**, confirm:
  - The pool contains **+14803600008** and it is the **intended primary** sender for customer-facing SMS, **or**
  - The pool is restricted to **only +14803600008** if you require every message to leave from that number.
- If **+14805712062** remains in the sender pool, Twilio may still send from it for some messages even when the app’s default configuration prefers the primary line. Document this for on-call: backup traffic can still appear from the carrier side until the pool is adjusted.

## Production smoke test (manual)

Use **Twilio Monitor → Logs → Messaging** (or the message detail) to read the **From** value on the outbound message record.

| Step | Action | Expected Twilio `From` (E.164) |
|------|--------|--------------------------------|
| 1 | Trigger or wait for **Facebook lead intro SMS** | `+14803600008` unless an env override applies |
| 2 | From **CRM lead detail**, send a message in the embedded SMS thread | `+14803600008` unless you explicitly picked the backup in Text-from |
| 3 | **Workspace phone inbox** → reply in a thread | `+14803600008` unless you explicitly picked the backup |
| 4 | Send an **onboarding invite** with SMS delivery | `+14803600008` (uses the same `sendSms` default when no override) |

If **From** shows `+14805712062` when you did **not** choose the backup in the UI, check Messaging Service sender pool configuration and any `TWILIO_SMS_FROM` / `FACEBOOK_LEAD_INTRO_SMS_FROM` env overrides.

## Related

- Code constants: `src/lib/twilio/sms-from-numbers.ts`
- **Admin report:** `/admin/phone/sms-sender-audit` — groups outbound `messages` by stored `From` for the last 7 days and highlights the backup E.164 (also linked from SMS suggestion telemetry).

## Backup number policy

In the product UI, the backup line **+14805712062** is only used when an admin **explicitly** selects it in the Text-from control (and the thread metadata records that choice). The app does not auto-pick the backup for leads or from inbound “To” alone.
