"use client";

import { useRouter } from "next/navigation";
import ApplicantFileUpload from "@/components/ApplicantFileUpload";

type Props = {
  applicantId: string;
  documentType: string;
  label: string;
  required?: boolean;
  completeComplianceEventId?: string;
};

export default function ApplicantFileUploadWithRefresh({
  applicantId,
  documentType,
  label,
  required = false,
  completeComplianceEventId,
}: Props) {
  const router = useRouter();

  return (
    <ApplicantFileUpload
      applicantId={applicantId}
      documentType={documentType}
      label={label}
      required={required}
      completeComplianceEventId={completeComplianceEventId}
      onUploadSuccess={() => {
        window.setTimeout(() => {
          router.refresh();
        }, 700);
      }}
    />
  );
}
