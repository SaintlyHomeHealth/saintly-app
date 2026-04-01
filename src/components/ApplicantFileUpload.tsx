'use client'

import { useRef, useState } from 'react'

type Props = {
  applicantId: string
  documentType: string
  label: string
  required?: boolean
  completeComplianceEventId?: string
  onUploadComplete?: () => void
  onUploadSuccess?: () => void
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as {
      message?: string
      error?: string
      details?: string
      hint?: string
      code?: string
      statusCode?: string | number
    }

    const parts = [
      maybeError.message,
      maybeError.error,
      maybeError.details,
      maybeError.hint,
      maybeError.code ? `Code: ${maybeError.code}` : null,
      maybeError.statusCode != null ? `HTTP ${maybeError.statusCode}` : null,
    ].filter(Boolean)

    if (parts.length) return parts.join(' ')
  }

  return 'Upload failed'
}

export default function ApplicantFileUpload({
  applicantId,
  documentType,
  label,
  required = false,
  completeComplianceEventId,
  onUploadComplete,
  onUploadSuccess,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const handleUpload = async () => {
    if (!file || !applicantId) {
      setErrorMessage('Please choose a file before uploading.')
      return
    }

    let uploadStep = 'init'

    try {
      setUploading(true)
      setErrorMessage('')
      setSuccessMessage('')
      const formData = new FormData()
      formData.append('applicantId', applicantId)
      formData.append('documentType', documentType)
      formData.append('displayName', label)
      formData.append('required', required ? 'true' : 'false')
      if (completeComplianceEventId) {
        formData.append('completeComplianceEventId', completeComplianceEventId)
      }
      formData.append('file', file)

      uploadStep = 'fetch /api/upload-applicant-file'
      const response = await fetch('/api/upload-applicant-file', {
        method: 'POST',
        body: formData,
      })

      uploadStep = 'parseResponse'
      const rawText = await response.text()
      let result: { error?: string; details?: string; success?: boolean } | null = null
      if (rawText) {
        try {
          result = JSON.parse(rawText) as { error?: string; details?: string; success?: boolean }
        } catch {
          console.error('[ApplicantFileUpload] Non-JSON response body', {
            step: uploadStep,
            status: response.status,
            preview: rawText.slice(0, 400),
          })
          throw new Error(
            `Invalid response (${response.status}). ${rawText.slice(0, 200)}`
          )
        }
      }

      if (!response.ok) {
        const msg =
          result?.error ||
          result?.details ||
          `HTTP ${response.status} ${response.statusText || ''}`.trim()
        console.error('[ApplicantFileUpload] Upload request failed', {
          step: uploadStep,
          status: response.status,
          result,
        })
        throw { message: msg, statusCode: response.status, details: result?.details }
      }

      setSuccessMessage(`${label} uploaded successfully.`)
      setFile(null)

      if (inputRef.current) {
        inputRef.current.value = ''
      }

      if (onUploadComplete) onUploadComplete()
      if (onUploadSuccess) onUploadSuccess()
    } catch (error) {
      console.error('[ApplicantFileUpload.handleUpload] failed', {
        step: uploadStep,
        applicantId,
        documentType,
        error,
      })
      const base = getErrorMessage(error)
      setErrorMessage(uploadStep !== 'init' ? `${base} (step: ${uploadStep})` : base)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="shh-upload">
      <div className="shh-upload__row">
        <div className="shh-upload__picker">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            className="shh-upload__input"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null)
              setErrorMessage('')
              setSuccessMessage('')
            }}
          />
          <button
            type="button"
            className="shh-upload__picker-btn"
            onClick={() => inputRef.current?.click()}
          >
            Choose File
          </button>
          <span className={`shh-upload__file-name ${file ? 'has-file' : ''}`}>
            {file ? file.name : 'No file selected'}
          </span>
        </div>

        <button
          type="button"
          className="shh-upload__button"
          onClick={handleUpload}
          disabled={uploading || !file}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {successMessage ? (
        <div className="shh-upload__message shh-upload__message--success">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="shh-upload__message shh-upload__message--error">
          {errorMessage}
        </div>
      ) : null}

      {!file ? <div className="shh-upload__hint">Choose a file to enable upload.</div> : null}

      <style jsx>{`
        .shh-upload {
          display: flex;
          flex-direction: column;
          gap: 12px;
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
          transition:
            transform 0.2s ease,
            opacity 0.2s ease,
            box-shadow 0.2s ease;
        }

        .shh-upload__button:hover {
          transform: translateY(-1px);
        }

        .shh-upload__button:disabled {
          cursor: not-allowed;
          opacity: 0.6;
          transform: none;
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

        .shh-upload__hint {
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
        }

        @media (max-width: 768px) {
          .shh-upload__row {
            flex-direction: column;
            align-items: stretch;
          }

          .shh-upload__picker {
            width: 100%;
          }

          .shh-upload__button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}
