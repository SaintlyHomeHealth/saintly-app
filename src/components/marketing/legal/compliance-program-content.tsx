import {
  COMPLIANCE_PROGRAM_BLOCKS,
  COMPLIANCE_PROGRAM_EFFECTIVE_DATE,
} from "@/lib/marketing/compliance-program-content-data";
import {
  ADDRESS_LINE_CITY,
  ADDRESS_LINE_STREET,
  EMAIL_INTAKE,
  PHONE_DISPLAY,
  TEL,
} from "@/components/marketing/marketing-constants";

/** Public Compliance Program summary for payer credentialing and transparency. */
export function ComplianceProgramContent() {
  return (
    <>
      <p className="shh-legal-lead">
        Saintly Home Health LLC maintains a corporate compliance program to detect and prevent illegal and unethical
        activities in home health operations. This page summarizes the program for patients, partners, payers, and
        workforce members.
      </p>
      <p>
        <strong>Effective date:</strong> {COMPLIANCE_PROGRAM_EFFECTIVE_DATE}
      </p>
      {COMPLIANCE_PROGRAM_BLOCKS.map((block, index) => {
        if (block.type === "h2") {
          return <h2 key={index}>{block.text}</h2>;
        }
        if (block.type === "h3") {
          return <h3 key={index}>{block.text}</h3>;
        }
        if (block.type === "ul") {
          return (
            <ul key={index}>
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }
        return <p key={index}>{block.text}</p>;
      })}
      <p>
        <strong>Saintly Home Health LLC</strong>
        <br />
        {ADDRESS_LINE_STREET}
        <br />
        {ADDRESS_LINE_CITY}
        <br />
        Phone:{" "}
        <a className="text-sky-800 underline-offset-2 hover:underline" href={TEL}>
          {PHONE_DISPLAY}
        </a>
        <br />
        Email:{" "}
        <a className="text-sky-800 underline-offset-2 hover:underline" href={`mailto:${EMAIL_INTAKE}`}>
          {EMAIL_INTAKE}
        </a>
      </p>
    </>
  );
}
