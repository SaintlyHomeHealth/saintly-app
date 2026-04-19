import {
  ADDRESS_LINE_CITY,
  ADDRESS_LINE_STREET,
  EMAIL_INTAKE,
  PHONE_DISPLAY,
  TEL,
} from "@/components/marketing/marketing-constants";

/** Terms of Service — website, Saintly Phone, and staff workspace (authorized use). */
export function TermsOfServiceContent() {
  return (
    <>
      <p className="shh-legal-lead">
        By accessing or using the Saintly Home Health LLC website, the Saintly Phone mobile application, or the staff web
        workspace (together, the &quot;Services&quot;), you agree to these Terms of Service. If you do not agree, do not
        use the Services.
      </p>

      <h2>Authorized use</h2>
      <p>
        Saintly Phone and the staff workspace are intended for use by authorized employees and contractors of Saintly
        Home Health LLC (and other parties we expressly permit) in connection with legitimate business operations. You
        must use the Services only for lawful, authorized purposes and in accordance with company policies and applicable
        law.
      </p>

      <h2>Use of the public website</h2>
      <p>
        The public website provides general information about our services and ways to contact us. It does not provide
        medical advice or replace consultation with a licensed healthcare provider.
      </p>

      <h2>No medical advice</h2>
      <p>
        Information on the site or in general communications is for informational purposes only and is not medical
        advice. Always consult a qualified healthcare provider regarding any medical condition.
      </p>

      <h2>Account security</h2>
      <p>You are responsible for:</p>
      <ul>
        <li>Maintaining the confidentiality of your credentials and devices</li>
        <li>Promptly notifying your supervisor or IT contact of suspected unauthorized access</li>
        <li>Using multi-factor authentication or other controls when required</li>
      </ul>
      <p>We may suspend or terminate access if we reasonably believe an account is compromised or misused.</p>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Services in violation of law or regulation</li>
        <li>Attempt to access data or areas of the system you are not authorized to use</li>
        <li>Interfere with or disrupt the Services, networks, or security controls</li>
        <li>Use the Services to send unlawful, harassing, or deceptive communications</li>
        <li>Reverse engineer or attempt to extract source code except where permitted by law</li>
      </ul>

      <h2>Communications features</h2>
      <p>
        The Services may include voice calls, SMS, voicemail, notifications, and related workflows. You are responsible
        for communications you initiate or approve. Message and data rates may apply to SMS. Follow organizational
        policies for consent, documentation, and patient privacy.
      </p>

      <h2>SMS (public-facing opt-in)</h2>
      <p>
        If you provide a mobile number and opt in through our website forms, Saintly Home Health LLC may send SMS
        messages for care coordination, scheduling, service updates, follow-up communication, and (where applicable)
        employment or application updates. Message frequency may vary. Message and data rates may apply. Reply STOP to
        opt out and HELP for help where supported. Consent to receive SMS is not a condition of purchase. We do not sell
        or share SMS consent or phone numbers with third parties for their own marketing.
      </p>

      <h2>Availability and disclaimer</h2>
      <p>
        We strive for reliable operation but do not guarantee uninterrupted or error-free service. The Services are
        provided on an &quot;as is&quot; and &quot;as available&quot; basis to the maximum extent permitted by law. We
        disclaim implied warranties where allowed.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by applicable law, Saintly Home Health LLC and its officers, directors,
        employees, and contractors are not liable for any indirect, incidental, special, consequential, or punitive
        damages, or for loss of profits, data, or goodwill, arising out of or related to your use of the Services. Our
        aggregate liability for any claim arising out of these Terms or the Services is limited to the greater of (a)
        amounts you paid us specifically for the Services giving rise to the claim in the twelve months before the
        claim, or (b) one hundred U.S. dollars, except where prohibited by law.
      </p>

      <h2>Suspension and termination</h2>
      <p>
        We may suspend or terminate access to the Services at any time for operational, security, or legal reasons, or
        when your employment or engagement ends. Provisions that by their nature should survive will survive termination.
      </p>

      <h2>Intellectual property</h2>
      <p>
        Content, branding, and software provided through the Services are owned by Saintly Home Health LLC or its
        licensors and are protected by intellectual property laws. You receive a limited, non-exclusive license to use the
        Services as permitted by these Terms.
      </p>

      <h2>Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of Arizona, without regard to conflict-of-law principles,
        except where preempted by federal law. You agree to the exclusive jurisdiction and venue of the state and
        federal courts located in Maricopa County, Arizona, for disputes arising from these Terms or the Services,
        subject to any rights you cannot waive under applicable law.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Services after changes constitutes acceptance
        of the updated Terms, except where additional consent is required by law.
      </p>

      <h2>Contact</h2>
      <p>
        Saintly Home Health LLC
        <br />
        {ADDRESS_LINE_STREET}, {ADDRESS_LINE_CITY}
        <br />
        <a className="text-sky-800 underline-offset-2 hover:underline" href={TEL}>
          {PHONE_DISPLAY}
        </a>
        <br />
        <a className="text-sky-800 underline-offset-2 hover:underline" href={`mailto:${EMAIL_INTAKE}`}>
          {EMAIL_INTAKE}
        </a>
      </p>
      <p>
        Support:{" "}
        <a className="text-sky-800 underline-offset-2 hover:underline" href="/support">
          Support &amp; Contact
        </a>
      </p>
    </>
  );
}
