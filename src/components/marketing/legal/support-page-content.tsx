import { ADDRESS_LINE_CITY, ADDRESS_LINE_STREET, EMAIL_INTAKE, PHONE_DISPLAY, TEL } from "@/components/marketing/marketing-constants";

/** Public Support / Contact page (Saintly Phone & general). */
export function SupportPageContent() {
  return (
    <>
      <p className="shh-legal-lead">
        Saintly Home Health LLC provides support for Saintly Phone (staff mobile app), the web workspace, and general
        inquiries about our services. Use the contact information below for the fastest help.
      </p>

      <h2>Contact Information</h2>
      <p>
        <strong>Saintly Home Health LLC</strong>
        <br />
        {ADDRESS_LINE_STREET}
        <br />
        {ADDRESS_LINE_CITY}
        <br />
        <br />
        <strong>Phone:</strong>{" "}
        <a className="text-sky-800 underline-offset-2 hover:underline" href={TEL}>
          {PHONE_DISPLAY}
        </a>
        <br />
        <strong>Email:</strong>{" "}
        <a className="text-sky-800 underline-offset-2 hover:underline" href={`mailto:${EMAIL_INTAKE}`}>
          {EMAIL_INTAKE}
        </a>
      </p>

      <h2>Hours &amp; response</h2>
      <p>
        For urgent clinical or operational issues, call the number above. Email is monitored during business hours;
        voicemail and email are checked regularly. If you need immediate assistance outside business hours, follow your
        agency’s escalation procedures.
      </p>

      <h2>What we can help with</h2>
      <ul>
        <li>
          <strong>Saintly Phone (mobile):</strong> calls, texts, voicemail, notifications, sign-in, and app access
        </li>
        <li>
          <strong>Web workspace:</strong> phone keypad, inbox, missed calls, voicemail list, and lead workflows
        </li>
        <li>
          <strong>Account access:</strong> password resets and sign-in issues (use your organization’s process; we may
          verify your identity before changing access)
        </li>
        <li>
          <strong>General:</strong> referrals, services, and employment (see also our{" "}
          <a className="text-sky-800 underline-offset-2 hover:underline" href="/contact">
            Contact
          </a>{" "}
          page)
        </li>
      </ul>

      <h2>Before you contact us</h2>
      <ul>
        <li>
          <strong>Calls or texts not working:</strong> confirm you are signed in, notifications are allowed for the app,
          and you have a stable network connection.
        </li>
        <li>
          <strong>New device:</strong> sign in again on the web workspace so your device can register for alerts and
          calling, as described in your internal rollout materials.
        </li>
        <li>
          <strong>Privacy questions:</strong> see our{" "}
          <a className="text-sky-800 underline-offset-2 hover:underline" href="/privacy">
            Privacy Policy
          </a>
          .
        </li>
      </ul>

      <p className="shh-legal-footnote">
        This page is for operational support. It does not provide medical advice or replace your supervisor or
        physician.
      </p>
    </>
  );
}
