# Twilio A2P 10DLC — internal reference (Saintly Home Health)

Use this when registering or updating a campaign in Twilio. **Business:** Saintly Home Health LLC · **Brand site:** Saintly Home Health · **Phone:** 480-360-0008.

---

## 1. Campaign description

Saintly Home Health LLC uses SMS messaging to communicate with patients and prospective patients regarding care coordination, scheduling, service updates, and follow-up communication related to home health services.

---

## 2. Call to action / opt-in description

Users opt in by submitting a website form and checking a required SMS consent checkbox. The form clearly states that message frequency may vary, message and data rates may apply, and that users can reply STOP to opt out and HELP for help. SMS consent is not a condition of purchase.

---

## 3. Sample SMS messages

**Sample message 1**

Saintly Home Health: Your visit is scheduled for tomorrow at 10:00 AM. Reply STOP to opt out. Reply HELP for help.

**Sample message 2**

Saintly Home Health: Please call us at 480-360-0008 regarding your care coordination. Msg & data rates may apply. Reply STOP to opt out. Reply HELP for help.

**Sample message 3**

Saintly Home Health: We received your request and a team member will contact you shortly. Reply STOP to opt out. Reply HELP for help.

---

## 4. Post-deploy checklist

- Website Privacy Policy and Terms include the SMS Communications section.
- Public intake and employment forms require the consent checkbox before submit; consent is validated server-side where applicable.
- Employment applications store `sms_consent: true` in `leads.external_source_metadata.employment_application`.
