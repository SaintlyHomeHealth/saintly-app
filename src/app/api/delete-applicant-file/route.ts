import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/admin'
import { getAuthenticatedUser } from '@/lib/supabase/server'
import { getStaffProfile, isAdminOrHigher } from '@/lib/staff-profile'
import { insertAuditLog } from '@/lib/audit-log'

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const staffProfile = await getStaffProfile()
    if (!isAdminOrHigher(staffProfile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { applicantId, documentType } = body

    if (!applicantId || !documentType) {
      return NextResponse.json(
        { error: 'Missing applicantId or documentType' },
        { status: 400 }
      )
    }

    const { data: existingFile, error: fetchError } = await supabaseAdmin
      .from('applicant_files')
      .select('id, file_path')
      .eq('applicant_id', applicantId)
      .eq('document_type', documentType)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!existingFile) {
      return NextResponse.json(
        { error: 'No uploaded file found for this document type' },
        { status: 404 }
      )
    }

    const { error: storageError } = await supabaseAdmin.storage
      .from('applicant-files')
      .remove([existingFile.file_path])

    if (storageError) {
      return NextResponse.json({ error: storageError.message }, { status: 500 })
    }

    const { error: deleteError } = await supabaseAdmin
      .from('applicant_files')
      .delete()
      .eq('id', existingFile.id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    await insertAuditLog({
      action: 'applicant_file_delete',
      entityType: 'applicant_file',
      entityId: existingFile.id,
      metadata: {
        applicant_id: applicantId,
        document_type: documentType,
        file_path: existingFile.file_path,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Delete failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}