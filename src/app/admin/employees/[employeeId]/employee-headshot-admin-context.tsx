"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { getEffectiveApplicantUploadMime } from "@/lib/applicant-file-upload-types";
import {
  HEADSHOT_DOCUMENT_TYPE,
  HEADSHOT_UPLOAD_LABEL,
  adminHeadshotViewUrl,
  getEmployeeInitials,
} from "@/lib/employee-headshot";

const HEADSHOT_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type EmployeeHeadshotAdminContextValue = {
  employeeId: string;
  displayName: string;
  initials: string;
  headshotViewUrl: string | null;
  hasHeadshot: boolean;
  badgeReady: boolean;
  headshotMissing: boolean;
  hasDriversLicense: boolean;
  canManageDocuments: boolean;
  isUploading: boolean;
  uploadError: string | null;
  uploadActionLabel: string;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  triggerFilePicker: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

const EmployeeHeadshotAdminContext = createContext<EmployeeHeadshotAdminContextValue | null>(
  null
);

export function useEmployeeHeadshotAdmin() {
  const value = useContext(EmployeeHeadshotAdminContext);
  if (!value) {
    throw new Error("useEmployeeHeadshotAdmin must be used within EmployeeHeadshotAdminProvider");
  }
  return value;
}

type ProviderProps = {
  employeeId: string;
  displayName: string;
  initialHeadshotViewUrl: string | null;
  initialHasHeadshot: boolean;
  canManageDocuments: boolean;
  hasDriversLicense: boolean;
  children: ReactNode;
};

export function EmployeeHeadshotAdminProvider({
  employeeId,
  displayName,
  initialHeadshotViewUrl,
  initialHasHeadshot,
  canManageDocuments,
  hasDriversLicense,
  children,
}: ProviderProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [headshotViewUrl, setHeadshotViewUrl] = useState(initialHeadshotViewUrl);
  const [hasHeadshot, setHasHeadshot] = useState(initialHasHeadshot);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    setHeadshotViewUrl(initialHeadshotViewUrl);
    setHasHeadshot(initialHasHeadshot);
  }, [initialHeadshotViewUrl, initialHasHeadshot]);

  const uploadFile = useCallback(
    async (file: File) => {
      const effectiveMime = getEffectiveApplicantUploadMime(file);
      if (!effectiveMime || !HEADSHOT_IMAGE_MIMES.has(effectiveMime)) {
        setUploadError(
          "Please choose a photo file (JPEG, PNG, WEBP, or HEIC). PDF files are not accepted for headshots."
        );
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setUploadError("File too large. Max size is 10MB.");
        return;
      }

      setIsUploading(true);
      setUploadError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("applicantId", employeeId);
        formData.append("documentType", HEADSHOT_DOCUMENT_TYPE);
        formData.append("displayName", HEADSHOT_UPLOAD_LABEL);
        formData.append("required", "true");

        const response = await fetch("/api/admin/employee-documents", {
          method: "POST",
          body: formData,
        });

        const result = (await response.json().catch(() => null)) as {
          error?: string;
          file?: { id?: string };
        } | null;

        if (!response.ok) {
          throw new Error(result?.error || "Upload failed");
        }

        const recordId = result?.file?.id;
        if (recordId) {
          setHeadshotViewUrl(`${adminHeadshotViewUrl(recordId)}&t=${Date.now()}`);
        } else if (file) {
          setHeadshotViewUrl(URL.createObjectURL(file));
        }

        setHasHeadshot(true);
        router.refresh();
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Upload failed");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [employeeId, router]
  );

  const onFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      void uploadFile(file);
    },
    [uploadFile]
  );

  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const value = useMemo<EmployeeHeadshotAdminContextValue>(
    () => ({
      employeeId,
      displayName,
      initials: getEmployeeInitials(displayName),
      headshotViewUrl,
      hasHeadshot,
      badgeReady: hasHeadshot && hasDriversLicense,
      headshotMissing: !hasHeadshot,
      hasDriversLicense,
      canManageDocuments,
      isUploading,
      uploadError,
      uploadActionLabel: hasHeadshot ? "Replace Headshot" : "Upload Headshot",
      onFileInputChange,
      triggerFilePicker,
      fileInputRef,
    }),
    [
      employeeId,
      displayName,
      headshotViewUrl,
      hasHeadshot,
      hasDriversLicense,
      canManageDocuments,
      isUploading,
      uploadError,
      onFileInputChange,
      triggerFilePicker,
    ]
  );

  return (
    <EmployeeHeadshotAdminContext.Provider value={value}>
      {children}
    </EmployeeHeadshotAdminContext.Provider>
  );
}
