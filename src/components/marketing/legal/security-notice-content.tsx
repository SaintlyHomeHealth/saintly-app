import { ADDRESS_LINE_CITY, ADDRESS_LINE_STREET, EMAIL_INTAKE, PHONE_DISPLAY, TEL } from "@/components/marketing/marketing-constants";

/** Public HIPAA / security practices notice (not a certification claim). */
export function SecurityNoticeContent() {
  return (
    <>
      <p className="shh-legal-lead">
        Saintly Home Health LLC (&quot;Saintly&quot;) uses administrative, technical, and operational safeguards to
        protect information handled in the course of providing home health services and related communications. This
        page summarizes our practices at a high level and is not a legal contract.
      </p>

      <h2>Protected and health-related information</h2>
      <p>
        In the course of care coordination, scheduling, and communications, you may provide or we may handle
        information that is protected under HIPAA or applicable state law, or that is sensitive for other reasons. We
        treat such information in accordance with applicable law and our internal policies, including through
        agreements with service providers that support our operations.
      </p>
      <p>
        Saintly does not claim independent third-party &quot;HIPAA certification&quot; or certification of any specific
        product unless separately published and verified. Compliance depends on how systems are configured, used, and
        supervised in practice.
      </p>

      <h2>How we protect information</h2>
      <p>We use safeguards appropriate to the sensitivity of the information and the nature of our services, such as:</p>
      <ul>
        <li>Access controls and authentication for staff accounts</li>
        <li>Encryption in transit for communications where supported by our platforms</li>
        <li>Vendor and service-provider arrangements that include confidentiality and security expectations</li>
        <li>Operational training and policies for workforce members</li>
      </ul>
      <p>No method of storage or transmission is completely risk-free.</p>

      <h2>Service providers</h2>
      <p>
        We use trusted vendors to host applications, send messages, place and receive phone calls, and operate the
        business. Those providers may process data only as needed to deliver the services we configure and under
        appropriate contractual terms.
      </p>

      <h2>Questions</h2>
      <p>
        For privacy-related questions, contact us at{" "}
        <a className="text-sky-800 underline-offset-2 hover:underline" href={`mailto:${EMAIL_INTAKE}`}>
          {EMAIL_INTAKE}
        </a>{" "}
        or call{" "}
        <a className="text-sky-800 underline-offset-2 hover:underline" href={TEL}>
          {PHONE_DISPLAY}
        </a>
        .
      </p>
      <p>
        Saintly Home Health LLC
        <br />
        {ADDRESS_LINE_STREET}, {ADDRESS_LINE_CITY}
      </p>
    </>
  );
}
