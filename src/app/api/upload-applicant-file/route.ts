import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/admin'

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function normalizeDocumentType(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()

    const applicantId = formData.get('applicantId')?.toString()
    const documentTypeRaw = formData.get('documentType')?.toString()
    const displayName = formData.get('displayName')?.toString() || ''
    const documentType = documentTypeRaw ? normalizeDocumentType(documentTypeRaw) : ''
    const ALLOWED_DOCUMENT_TYPES = [
      'auto_insurance',
      'independent_contractor_insurance',
      'drivers_license',
      'cpr_card',
      'fingerprint_clearance_card',
      'background_check',
      'oig_check',
    ]

    if (!ALLOWED_DOCUMENT_TYPES.includes(documentType)) {
      return NextResponse.json(
        { error: `Invalid document type: ${documentType}` },
        { status: 400 }
      )
    }
    const required = formData.get('required')?.toString() === 'true'
    const completeComplianceEventId =
      formData.get('completeComplianceEventId')?.toString() || null
    const file = formData.get('file') as File | null

    if (!applicantId || !documentType || !file) {
      return NextResponse.json(
        { error: 'Missing applicantId, documentType, or file' },
        { status: 400 }
      )
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF, JPG, PNG, WEBP allowed.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Max size is 10MB.' },
        { status: 400 }
      )
    }

    const safeName = sanitizeFileName(file.name)
    const timestamp = Date.now()
    const filePath = `applicants/${applicantId}/${documentType}-${timestamp}-${safeName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabaseAdmin.storage
      .from('applicant-files')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: insertedFile, error: insertError } = await supabaseAdmin
      .from('applicant_files')
      .insert({
        applicant_id: applicantId,
        document_type: documentType,
        display_name: displayName || file.name,
        file_name: file.name,
        file_path: filePath,
        storage_path: filePath,
        file_type: file.type,
        file_size: file.size,
        required,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    if (documentType === 'auto_insurance') {
      const { error: applicantUpdateError } = await supabaseAdmin
        .from('applicants')
        .update({ auto_insurance_file: filePath, updated_at: new Date().toISOString() })
        .eq('id', applicantId)

      if (applicantUpdateError) {
        return NextResponse.json({ error: applicantUpdateError.message }, { status: 500 })
      }
    }

    if (completeComplianceEventId) {
      const { error: eventUpdateError } = await supabaseAdmin
        .from('admin_compliance_events')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', completeComplianceEventId)

      if (eventUpdateError) {
        return NextResponse.json({ error: eventUpdateError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      file: insertedFile,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Upload failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
