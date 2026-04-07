import { ADDRESS_LINE_CITY, ADDRESS_LINE_STREET, EMAIL_INTAKE } from "@/components/marketing/marketing-constants";

/** Long-form Privacy Policy body (exact marketing copy). */
export function PrivacyPolicyContent() {
  return (
    <>
      <p className="shh-legal-lead">
        Saintly Home Health LLC (&quot;Saintly,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to
        protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when
        you interact with our website, services, and communications.
      </p>

      <h2>Information We Collect</h2>
      <p>We may collect the following information:</p>
      <ul>
        <li>Name, phone number, email address</li>
        <li>Mailing address and general location information</li>
        <li>Information you provide through forms (contact, intake, employment)</li>
        <li>Basic service-related or employment-related details you voluntarily submit</li>
      </ul>
      <p>We do not collect sensitive medical information through our website unless explicitly provided by you.</p>

      <h2>How We Use Your Information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>Respond to inquiries and intake requests</li>
        <li>Coordinate home health services with patients, families, and physicians</li>
        <li>Communicate regarding care, scheduling, or eligibility</li>
        <li>Process employment inquiries and applications</li>
        <li>Improve our services and operations</li>
      </ul>

      <h2>SMS Communications</h2>
      <p>
        Saintly Home Health LLC may send SMS messages related to care coordination, scheduling, service updates, and
        follow-up communication. Message frequency may vary. Message and data rates may apply. You may opt out at any
        time by replying STOP. For assistance, reply HELP. Consent to receive SMS messages is not a condition of
        purchase. We do not sell or share SMS consent or phone numbers with third parties or affiliates for
        third-party marketing purposes.
      </p>

      <h2>Information Sharing</h2>
      <p>We do not sell, rent, or share your personal information with third parties for marketing purposes.</p>
      <p>We may share information only when necessary to:</p>
      <ul>
        <li>Coordinate care with physicians or healthcare providers</li>
        <li>Comply with legal or regulatory requirements</li>
        <li>Support internal operations (e.g., secure systems or communication platforms)</li>
      </ul>

      <h2>Data Security</h2>
      <p>
        We take reasonable administrative and technical measures to protect your information. However, no system is 100%
        secure, and we cannot guarantee absolute security.
      </p>

      <h2>Cookies &amp; Website Usage</h2>
      <p>
        Our website may use basic cookies or analytics tools to understand website usage and improve performance. This
        data does not personally identify you.
      </p>

      <h2>Third-Party Services</h2>
      <p>
        We may use trusted third-party services (such as communication or hosting platforms) to support operations.
        These providers are required to maintain confidentiality and security.
      </p>

      <h2>Your Rights</h2>
      <p>You may:</p>
      <ul>
        <li>Request access to your information</li>
        <li>Request corrections or updates</li>
        <li>Request deletion of your data (where applicable)</li>
      </ul>
      <p>To make a request, contact us using the information below.</p>

      <h2>Contact Information</h2>
      <p>
        Saintly Home Health LLC
        <br />
        {ADDRESS_LINE_STREET}, {ADDRESS_LINE_CITY}
        <br />
        (480) 360-0008
        <br />
        (480) 808-7157
        <br />
        {EMAIL_INTAKE}
      </p>

      <p className="shh-legal-footnote">
        We may update this Privacy Policy from time to time. Updates will be posted on this page with a revised
        effective date.
      </p>
    </>
  );
}
