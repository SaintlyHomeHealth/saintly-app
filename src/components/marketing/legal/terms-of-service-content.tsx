import { ADDRESS_LINE_CITY, ADDRESS_LINE_STREET, EMAIL_INTAKE } from "@/components/marketing/marketing-constants";

/** Long-form Terms of Service body (exact marketing copy). */
export function TermsOfServiceContent() {
  return (
    <>
      <p className="shh-legal-lead">
        By accessing or using the Saintly Home Health LLC website or services, you agree to the following terms.
      </p>

      <h2>Use of Website</h2>
      <p>
        This website is intended to provide general information about our services and allow users to contact us. It
        does not provide medical advice or replace consultation with a licensed healthcare provider.
      </p>

      <h2>No Medical Advice</h2>
      <p>
        Information on this site is for informational purposes only and should not be considered medical advice.
        Always consult your physician or qualified healthcare provider regarding any medical condition.
      </p>

      <h2>SMS/Text Messaging Terms</h2>
      <p>
        By providing your phone number, you consent to receive SMS/text messages from Saintly Home Health LLC related
        to:
      </p>
      <ul>
        <li>Patient intake and eligibility</li>
        <li>Care coordination and scheduling</li>
        <li>Service-related communication</li>
        <li>Employment or application updates</li>
      </ul>
      <p>SMS Terms:</p>
      <ul>
        <li>Message frequency may vary</li>
        <li>Message and data rates may apply</li>
        <li>You may opt out at any time by replying STOP</li>
        <li>For help, reply HELP or contact us</li>
      </ul>
      <p>Consent to receive messages is not a condition of receiving services.</p>

      <h2>User Responsibilities</h2>
      <p>You agree to:</p>
      <ul>
        <li>Provide accurate and truthful information</li>
        <li>Not misuse the website or submit false inquiries</li>
        <li>Use the site only for lawful purposes</li>
      </ul>

      <h2>Employment Inquiries</h2>
      <p>
        Submitting an application or inquiry does not guarantee employment. Saintly Home Health LLC reserves the right
        to review, accept, or decline applicants at its discretion.
      </p>

      <h2>Intellectual Property</h2>
      <p>
        All content on this website (text, design, branding) is the property of Saintly Home Health LLC and may not be
        copied or reused without permission.
      </p>

      <h2>Limitation of Liability</h2>
      <p>Saintly Home Health LLC is not liable for:</p>
      <ul>
        <li>Any decisions made based on website information</li>
        <li>Delays or interruptions in website availability</li>
        <li>Any indirect or incidental damages</li>
      </ul>

      <h2>Changes to Terms</h2>
      <p>
        We may update these Terms of Service at any time. Continued use of the website constitutes acceptance of any
        updates.
      </p>

      <h2>Contact Information</h2>
      <p>
        Saintly Home Health LLC
        <br />
        {ADDRESS_LINE_STREET}, {ADDRESS_LINE_CITY}
        <br />
        (480) 360-0008
        <br />
        {EMAIL_INTAKE}
      </p>

      <p className="shh-legal-footnote">If you have questions about these Terms, please contact us directly.</p>
    </>
  );
}
