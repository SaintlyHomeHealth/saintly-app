'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  APPLICANT_FILE_UPLOAD_ACCEPTED_MIME_TYPES,
  getEffectiveApplicantUploadMime,
} from '@/lib/applicant-file-upload-types'
import {
  HEADSHOT_DOCUMENT_TYPE,
  HEADSHOT_IMAGE_ACCEPT,
  HEADSHOT_UPLOAD_HELPER_TEXT,
  HEADSHOT_UPLOAD_LABEL,
  applicantHeadshotViewUrl,
} from '@/lib/employee-headshot'

type Props = {
  applicantId: string
  required?: boolean
  onUploadComplete?: () => void
}

const IMAGE_MIMES = APPLICANT_FILE_UPLOAD_ACCEPTED_MIME_TYPES.filter((m) =>
  m.startsWith('image/')
)

function isImageMime(mime: string) {
  return IMAGE_MIMES.includes(mime as (typeof IMAGE_MIMES)[number])
}

export default function ApplicantHeadshotUpload({
  applicantId,
  required = true,
  onUploadComplete,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const [storedPreviewUrl, setStoredPreviewUrl] = useState<string | null>(null)
  const [hasStoredHeadshot, setHasStoredHeadshot] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loadingStored, setLoadingStored] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const previewUrl = localPreviewUrl || storedPreviewUrl

  const loadStoredPreview = useCallback(async () => {
    if (!applicantId) return

    setLoadingStored(true)
    try {
      const url = `${applicantHeadshotViewUrl(applicantId)}&t=${Date.now()}`
      const response = await fetch(url)
      if (response.ok) {
        const blob = await response.blob()
        setStoredPreviewUrl(URL.createObjectURL(blob))
        setHasStoredHeadshot(true)
      } else {
        setStoredPreviewUrl(null)
        setHasStoredHeadshot(false)
      }
    } catch {
      setStoredPreviewUrl(null)
      setHasStoredHeadshot(false)
    } finally {
      setLoadingStored(false)
    }
  }, [applicantId])

  useEffect(() => {
    void loadStoredPreview()
  }, [loadStoredPreview])

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl)
    }
  }, [localPreviewUrl])

  useEffect(() => {
    return () => {
      if (storedPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(storedPreviewUrl)
    }
  }, [storedPreviewUrl])

  const handleUpload = async () => {
    if (!file || !applicantId) {
      setErrorMessage('Please choose a photo before uploading.')
      return
    }

    const effectiveMime = getEffectiveApplicantUploadMime(file)
    if (!effectiveMime || !isImageMime(effectiveMime)) {
      setErrorMessage(
        'Please choose a photo file (JPEG, PNG, WEBP, or HEIC). PDF files are not accepted for headshots.'
      )
      return
    }

    try {
      setUploading(true)
      setErrorMessage('')
      setSuccessMessage('')

      const formData = new FormData()
      formData.append('applicantId', applicantId)
      formData.append('documentType', HEADSHOT_DOCUMENT_TYPE)
      formData.append('displayName', HEADSHOT_UPLOAD_LABEL)
      formData.append('required', required ? 'true' : 'false')
      formData.append('file', file)

      const response = await fetch('/api/upload-applicant-file', {
        method: 'POST',
        body: formData,
      })

      const rawText = await response.text()
      let result: { error?: string } | null = null
      if (rawText) {
        try {
          result = JSON.parse(rawText) as { error?: string }
        } catch {
          throw new Error(`Invalid response (${response.status}).`)
        }
      }

      if (!response.ok) {
        throw new Error(result?.error || `Upload failed (${response.status}).`)
      }

      setSuccessMessage(HEADSHOT_UPLOAD_LABEL + ' uploaded successfully.')
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''

      if (storedPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(storedPreviewUrl)
      }
      setStoredPreviewUrl(localPreviewUrl)
      setHasStoredHeadshot(true)
      setLocalPreviewUrl(null)

      onUploadComplete?.()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="shh-headshot-upload">
      {previewUrl ? (
        <div className="shh-headshot-preview-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Professional headshot preview"
            className="shh-headshot-preview"
          />
          <p className="shh-headshot-preview-caption">
            {hasStoredHeadshot && !file
              ? 'Current headshot on file. Choose a new photo to replace it.'
              : 'Preview — upload to save this headshot.'}
          </p>
        </div>
      ) : loadingStored ? (
        <p className="shh-headshot-loading">Loading headshot…</p>
      ) : null}

      <div className="shh-upload__row">
        <div className="shh-upload__picker">
          <input
            ref={inputRef}
            type="file"
            accept={HEADSHOT_IMAGE_ACCEPT}
            className="shh-upload__input"
            onChange={(e) => {
              const next = e.target.files?.[0] || null
              setFile(next)
              setErrorMessage('')
              setSuccessMessage('')
              if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl)
              setLocalPreviewUrl(next ? URL.createObjectURL(next) : null)
            }}
          />
          <button
            type="button"
            className="shh-upload__picker-btn"
            onClick={() => inputRef.current?.click()}
          >
            Choose Photo
          </button>
          <span className={`shh-upload__file-name ${file ? 'has-file' : ''}`}>
            {file ? file.name : 'No photo selected'}
          </span>
        </div>

        <button
          type="button"
          className="shh-upload__button"
          onClick={() => void handleUpload()}
          disabled={uploading || !file}
        >
          {uploading ? 'Uploading...' : hasStoredHeadshot ? 'Replace Headshot' : 'Upload Headshot'}
        </button>
      </div>

      <p className="shh-headshot-helper">{HEADSHOT_UPLOAD_HELPER_TEXT}</p>
      <p className="shh-upload__formats">
        Accepted file types: JPG, JPEG, PNG, WEBP, HEIC (maximum 10 MB).
      </p>

      {successMessage ? (
        <div className="shh-upload__message shh-upload__message--success">{successMessage}</div>
      ) : null}

      {errorMessage ? (
        <div className="shh-upload__message shh-upload__message--error">{errorMessage}</div>
      ) : null}

      {!file && !hasStoredHeadshot ? (
        <div className="shh-upload__hint">Choose a photo to enable upload.</div>
      ) : null}

      <style jsx>{`
        .shh-headshot-upload {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .shh-headshot-preview-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .shh-headshot-preview {
          width: 140px;
          height: 140px;
          border-radius: 999px;
          object-fit: cover;
          border: 3px solid rgba(22, 82, 156, 0.14);
          box-shadow: 0 10px 24px rgba(22, 82, 156, 0.12);
        }

        .shh-headshot-preview-caption {
          margin: 0;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          text-align: center;
        }

        .shh-headshot-loading {
          margin: 0;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
        }

        .shh-headshot-helper {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          font-weight: 600;
          color: #475569;
        }

        .shh-upload__row {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .shh-upload__picker {
          display: flex;
          align-items: center;
          gap: 14px;
          flex: 1;
          min-width: 280px;
          padding: 14px 16px;
          border-radius: 18px;
          border: 1px solid rgba(22, 82, 156, 0.12);
          background: #ffffff;
          cursor: pointer;
        }

        .shh-upload__input {
          display: none;
        }

        .shh-upload__picker-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 0 16px;
          border-radius: 12px;
          background: #eef5ff;
          color: #1f5ca8;
          font-size: 14px;
          font-weight: 800;
          white-space: nowrap;
          border: none;
          cursor: pointer;
        }

        .shh-upload__file-name {
          color: #7a93b3;
          font-size: 15px;
          line-height: 1.4;
          word-break: break-word;
        }

        .shh-upload__file-name.has-file {
          color: #183f6b;
          font-weight: 700;
        }

        .shh-upload__button {
          min-height: 48px;
          padding: 0 20px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #56a3ff 0%, #1d6fce 100%);
          color: #ffffff;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 14px 26px rgba(29, 111, 206, 0.22);
        }

        .shh-upload__button:disabled {
          cursor: not-allowed;
          opacity: 0.6;
          box-shadow: none;
        }

        .shh-upload__message {
          padding: 12px 14px;
          border-radius: 14px;
          font-size: 14px;
          font-weight: 700;
        }

        .shh-upload__message--success {
          background: rgba(43, 155, 94, 0.08);
          border: 1px solid rgba(43, 155, 94, 0.14);
          color: #1e7b49;
        }

        .shh-upload__message--error {
          background: rgba(210, 60, 60, 0.08);
          border: 1px solid rgba(210, 60, 60, 0.14);
          color: #a12626;
        }

        .shh-upload__hint,
        .shh-upload__formats {
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.45;
        }

        @media (max-width: 768px) {
          .shh-upload__row {
            flex-direction: column;
            align-items: stretch;
          }

          .shh-upload__picker,
          .shh-upload__button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}
