'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ApplicantFileUpload from '../../components/ApplicantFileUpload'
import OnboardingApplicantIdentity from '../../components/OnboardingApplicantIdentity'
import { applicantRolePrimaryForCompliance } from '@/lib/applicant-role-for-compliance'
import { supabase } from '../../lib/supabase/client'

const AUTO_INSURANCE_DOCUMENT_TYPE = 'auto_insurance'
const INDEPENDENT_CONTRACTOR_INSURANCE_DOCUMENT_TYPE = 'independent_contractor_insurance'

type OnboardingContractsRow = {
  selected_role?: string | null
  handbook_acknowledged: boolean | null
  conflict_confidentiality_acknowledged: boolean | null
  conflict_confidentiality_disclosure: string | null
  conflict_confidentiality_full_name: string | null
  conflict_confidentiality_signed_at: string | null
  electronic_signature_agreement_acknowledged: boolean | null
  electronic_signature_agreement_full_name: string | null
  electronic_signature_agreement_signed_at: string | null
  hep_b_declination_acknowledged: boolean | null
  hep_b_declination_full_name: string | null
  hep_b_declination_signed_at: string | null
  tb_history_positive_test_or_infection: boolean | null
  tb_history_bcg_vaccine: boolean | null
  tb_symptom_prolonged_recurrent_fever: boolean | null
  tb_symptom_recent_weight_loss: boolean | null
  tb_symptom_chronic_cough: boolean | null
  tb_symptom_coughing_blood: boolean | null
  tb_symptom_night_sweats: boolean | null
  tb_risk_silicosis: boolean | null
  tb_risk_gastrectomy: boolean | null
  tb_risk_intestinal_bypass: boolean | null
  tb_risk_weight_10_percent_below_ideal: boolean | null
  tb_risk_chronic_renal_disease: boolean | null
  tb_risk_diabetes_mellitus: boolean | null
  tb_risk_steroid_or_immunosuppressive_therapy: boolean | null
  tb_risk_hematologic_disorder: boolean | null
  tb_risk_exposure_to_hiv_or_aids: boolean | null
  tb_risk_other_malignancies: boolean | null
  tb_baseline_residence_high_tb_country: boolean | null
  tb_baseline_current_or_planned_immunosuppression: boolean | null
  tb_baseline_close_contact_with_infectious_tb: boolean | null
  tb_additional_comments: string | null
  tb_acknowledged: boolean | null
  tb_full_name: string | null
  tb_signed_at: string | null
}

type YesNoValue = '' | 'yes' | 'no'

type TbFormData = {
  positiveTestOrInfection: YesNoValue
  bcgVaccine: YesNoValue
  prolongedRecurrentFever: YesNoValue
  recentWeightLoss: YesNoValue
  chronicCough: YesNoValue
  coughingBlood: YesNoValue
  nightSweats: YesNoValue
  riskSilicosis: boolean
  riskGastrectomy: boolean
  riskIntestinalBypass: boolean
  riskWeightBelowIdeal: boolean
  riskChronicRenalDisease: boolean
  riskDiabetesMellitus: boolean
  riskSteroidOrImmunosuppressiveTherapy: boolean
  riskHematologicDisorder: boolean
  riskExposureToHivOrAids: boolean
  riskOtherMalignancies: boolean
  residenceHighTbCountry: YesNoValue
  currentOrPlannedImmunosuppression: YesNoValue
  closeContactWithInfectiousTb: YesNoValue
  additionalComments: string
  acknowledged: boolean
  fullName: string
  signedDate: string
}

const documentChecklist = [
  { documentType: 'resume', label: 'Resume', required: true, description: 'Upload your most current resume.' },
  { documentType: 'drivers_license', label: "Driver's License", required: true, description: 'Upload a clear copy of your driver’s license.' },
  { documentType: 'fingerprint_clearance_card', label: 'AZ Fingerprint Clearance Card', required: true, description: 'Upload a clear copy of your Arizona Fingerprint Clearance Card.' },
  { documentType: 'social_security_card', label: 'Social Security Card', required: true, description: 'Upload a copy of your Social Security card.' },
  { documentType: 'cpr_front', label: 'CPR Card', required: true, description: 'Upload your current CPR certification card.' },
  { documentType: 'tb_test', label: 'TB Test', required: true, description: 'Upload your TB test or TB clearance documentation.' },
]

const defaultTbForm: TbFormData = {
  positiveTestOrInfection: '',
  bcgVaccine: '',
  prolongedRecurrentFever: '',
  recentWeightLoss: '',
  chronicCough: '',
  coughingBlood: '',
  nightSweats: '',
  riskSilicosis: false,
  riskGastrectomy: false,
  riskIntestinalBypass: false,
  riskWeightBelowIdeal: false,
  riskChronicRenalDisease: false,
  riskDiabetesMellitus: false,
  riskSteroidOrImmunosuppressiveTherapy: false,
  riskHematologicDisorder: false,
  riskExposureToHivOrAids: false,
  riskOtherMalignancies: false,
  residenceHighTbCountry: '',
  currentOrPlannedImmunosuppression: '',
  closeContactWithInfectiousTb: '',
  additionalComments: '',
  acknowledged: false,
  fullName: '',
  signedDate: '',
}

function toYesNo(value?: boolean | null): YesNoValue {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  return ''
}

function fromYesNo(value: YesNoValue): boolean | null {
  if (value === 'yes') return true
  if (value === 'no') return false
  return null
}

function isIndependentContractorClassification(value?: string | null) {
  const normalized = (value || '')
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')

  return (
    normalized === 'contractor' ||
    normalized === 'independent contractor' ||
    normalized === '1099' ||
    normalized === 'ic' ||
    normalized.includes('contractor') ||
    normalized.includes('1099')
  )
}

function isFieldStaffRole(value?: string | null) {
  const normalized = (value || '')
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
  if (!normalized) return false

  return (
    normalized === 'rn' ||
    normalized === 'lpn' ||
    normalized === 'lvn' ||
    normalized === 'pt' ||
    normalized === 'pta' ||
    normalized === 'ot' ||
    normalized === 'ota' ||
    normalized === 'st' ||
    normalized === 'slp' ||
    normalized === 'msw' ||
    normalized.includes('registered nurse') ||
    normalized.includes('licensed practical nurse') ||
    normalized.includes('licensed vocational nurse') ||
    normalized.includes('physical therapist') ||
    normalized.includes('physical therapy assistant') ||
    normalized.includes('occupational therapist') ||
    normalized.includes('occupational therapy assistant') ||
    normalized.includes('speech therapist') ||
    normalized.includes('speech language') ||
    normalized.includes('medical social worker') ||
    normalized.includes('caregiver') ||
    normalized.includes('hha') ||
    normalized.includes('cna') ||
    normalized.includes('field staff') ||
    normalized.includes('home health aide') ||
    normalized.includes('home health assistant') ||
    normalized.includes('home care aide') ||
    normalized.includes('direct care')
  )
}

export default function OnboardingDocumentsPage() {
  const router = useRouter()

  const [applicantId, setApplicantId] = useState('')
  const [uploadedDocs, setUploadedDocs] = useState<string[]>([])
  const [handbookAcknowledged, setHandbookAcknowledged] = useState(false)
  const [conflictForm, setConflictForm] = useState({
    acknowledged: false,
    disclosure: 'None',
    fullName: '',
    signedDate: '',
  })
  const [electronicAgreementForm, setElectronicAgreementForm] = useState({
    acknowledged: false,
    fullName: '',
    signedDate: '',
  })
  const [hepBDeclinationForm, setHepBDeclinationForm] = useState({
    acknowledged: false,
    fullName: '',
    signedDate: '',
  })
  const [tbForm, setTbForm] = useState<TbFormData>(defaultTbForm)
  const [isSavingConflictForm, setIsSavingConflictForm] = useState(false)
  const [isSavingElectronicAgreementForm, setIsSavingElectronicAgreementForm] = useState(false)
  const [isSavingHepBDeclinationForm, setIsSavingHepBDeclinationForm] = useState(false)
  const [isSavingTbForm, setIsSavingTbForm] = useState(false)
  const [conflictFormMessage, setConflictFormMessage] = useState('')
  const [conflictFormError, setConflictFormError] = useState('')
  const [electronicAgreementFormMessage, setElectronicAgreementFormMessage] = useState('')
  const [electronicAgreementFormError, setElectronicAgreementFormError] = useState('')
  const [hepBDeclinationFormMessage, setHepBDeclinationFormMessage] = useState('')
  const [hepBDeclinationFormError, setHepBDeclinationFormError] = useState('')
  const [tbFormMessage, setTbFormMessage] = useState('')
  const [tbFormError, setTbFormError] = useState('')
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [pageError, setPageError] = useState('')
  const [applicantRoleHint, setApplicantRoleHint] = useState('')
  const [onboardingSelectedRole, setOnboardingSelectedRole] = useState('')
  const [contractEmploymentClassification, setContractEmploymentClassification] = useState<
    string | null
  >(null)
  const [taxFormEmploymentClassification, setTaxFormEmploymentClassification] = useState<
    string | null
  >(null)

  const fetchUploadedDocs = async (id: string) => {
    setLoadingDocs(true)
    setPageError('')

    const { data: documentsData, error: documentsError } = await supabase
      .from('documents')
      .select('document_type, file_url')
      .eq('applicant_id', id)

    const { data: applicantFilesData, error: applicantFilesError } = await supabase
      .from('applicant_files')
      .select('document_type')
      .eq('applicant_id', id)

    if (documentsError || applicantFilesError) {
      console.error('Error loading uploaded docs:', documentsError || applicantFilesError)
      setPageError('Could not load document status right now.')
      setLoadingDocs(false)
      return
    }

    const uniqueTypes = Array.from(
      new Set([
        ...(documentsData || []).map((doc) => doc.document_type),
        ...(applicantFilesData || []).map((doc) => doc.document_type),
      ])
    )

    setUploadedDocs(uniqueTypes)
    setLoadingDocs(false)
  }

  const fetchOnboardingContractsState = async (id: string) => {
    const { data, error } = await supabase
      .from('onboarding_contracts')
      .select(
        `
          selected_role,
          handbook_acknowledged,
          conflict_confidentiality_acknowledged,
          conflict_confidentiality_disclosure,
          conflict_confidentiality_full_name,
          conflict_confidentiality_signed_at,
          electronic_signature_agreement_acknowledged,
          electronic_signature_agreement_full_name,
          electronic_signature_agreement_signed_at,
          hep_b_declination_acknowledged,
          hep_b_declination_full_name,
          hep_b_declination_signed_at,
          tb_history_positive_test_or_infection,
          tb_history_bcg_vaccine,
          tb_symptom_prolonged_recurrent_fever,
          tb_symptom_recent_weight_loss,
          tb_symptom_chronic_cough,
          tb_symptom_coughing_blood,
          tb_symptom_night_sweats,
          tb_risk_silicosis,
          tb_risk_gastrectomy,
          tb_risk_intestinal_bypass,
          tb_risk_weight_10_percent_below_ideal,
          tb_risk_chronic_renal_disease,
          tb_risk_diabetes_mellitus,
          tb_risk_steroid_or_immunosuppressive_therapy,
          tb_risk_hematologic_disorder,
          tb_risk_exposure_to_hiv_or_aids,
          tb_risk_other_malignancies,
          tb_baseline_residence_high_tb_country,
          tb_baseline_current_or_planned_immunosuppression,
          tb_baseline_close_contact_with_infectious_tb,
          tb_additional_comments,
          tb_acknowledged,
          tb_full_name,
          tb_signed_at
        `
      )
      .eq('applicant_id', id)
      .maybeSingle<OnboardingContractsRow>()

    if (error) {
      console.error('Error loading onboarding contracts state:', error)
      console.error(
        'Error loading onboarding contracts state JSON:',
        JSON.stringify(error, null, 2)
      )
      console.error('Error loading onboarding contracts state details:', {
        message: (error as { message?: string })?.message,
        code: (error as { code?: string })?.code,
        details: (error as { details?: string })?.details,
        hint: (error as { hint?: string })?.hint,
      })
      setHandbookAcknowledged(false)
      return
    }

    setHandbookAcknowledged(Boolean(data?.handbook_acknowledged))
    setOnboardingSelectedRole(data?.selected_role || '')
    setConflictForm({
      acknowledged: Boolean(data?.conflict_confidentiality_acknowledged),
      disclosure: data?.conflict_confidentiality_disclosure || 'None',
      fullName: data?.conflict_confidentiality_full_name || '',
      signedDate: data?.conflict_confidentiality_signed_at
        ? data.conflict_confidentiality_signed_at.slice(0, 10)
        : '',
    })
    setElectronicAgreementForm({
      acknowledged: Boolean(data?.electronic_signature_agreement_acknowledged),
      fullName: data?.electronic_signature_agreement_full_name || '',
      signedDate: data?.electronic_signature_agreement_signed_at
        ? data.electronic_signature_agreement_signed_at.slice(0, 10)
        : '',
    })
    setHepBDeclinationForm({
      acknowledged: Boolean(data?.hep_b_declination_acknowledged),
      fullName: data?.hep_b_declination_full_name || '',
      signedDate: data?.hep_b_declination_signed_at
        ? data.hep_b_declination_signed_at.slice(0, 10)
        : '',
    })
    setTbForm({
      positiveTestOrInfection: toYesNo(data?.tb_history_positive_test_or_infection),
      bcgVaccine: toYesNo(data?.tb_history_bcg_vaccine),
      prolongedRecurrentFever: toYesNo(data?.tb_symptom_prolonged_recurrent_fever),
      recentWeightLoss: toYesNo(data?.tb_symptom_recent_weight_loss),
      chronicCough: toYesNo(data?.tb_symptom_chronic_cough),
      coughingBlood: toYesNo(data?.tb_symptom_coughing_blood),
      nightSweats: toYesNo(data?.tb_symptom_night_sweats),
      riskSilicosis: Boolean(data?.tb_risk_silicosis),
      riskGastrectomy: Boolean(data?.tb_risk_gastrectomy),
      riskIntestinalBypass: Boolean(data?.tb_risk_intestinal_bypass),
      riskWeightBelowIdeal: Boolean(data?.tb_risk_weight_10_percent_below_ideal),
      riskChronicRenalDisease: Boolean(data?.tb_risk_chronic_renal_disease),
      riskDiabetesMellitus: Boolean(data?.tb_risk_diabetes_mellitus),
      riskSteroidOrImmunosuppressiveTherapy: Boolean(
        data?.tb_risk_steroid_or_immunosuppressive_therapy
      ),
      riskHematologicDisorder: Boolean(data?.tb_risk_hematologic_disorder),
      riskExposureToHivOrAids: Boolean(data?.tb_risk_exposure_to_hiv_or_aids),
      riskOtherMalignancies: Boolean(data?.tb_risk_other_malignancies),
      residenceHighTbCountry: toYesNo(data?.tb_baseline_residence_high_tb_country),
      currentOrPlannedImmunosuppression: toYesNo(
        data?.tb_baseline_current_or_planned_immunosuppression
      ),
      closeContactWithInfectiousTb: toYesNo(
        data?.tb_baseline_close_contact_with_infectious_tb
      ),
      additionalComments: data?.tb_additional_comments || '',
      acknowledged: Boolean(data?.tb_acknowledged),
      fullName: data?.tb_full_name || '',
      signedDate: data?.tb_signed_at ? data.tb_signed_at.slice(0, 10) : '',
    })
  }

  const fetchEmploymentContext = async (id: string) => {
    const [{ data: applicantData }, { data: currentContractData }, { data: currentTaxFormData }] =
      await Promise.all([
        supabase
          .from('applicants')
          .select('position, discipline')
          .eq('id', id)
          .maybeSingle<{ position?: string | null; discipline?: string | null }>(),
        supabase
          .from('employee_contracts')
          .select('employment_classification')
          .eq('applicant_id', id)
          .eq('is_current', true)
          .maybeSingle<{ employment_classification?: string | null }>(),
        supabase
          .from('employee_tax_forms')
          .select('employment_classification')
          .eq('applicant_id', id)
          .eq('is_current', true)
          .maybeSingle<{ employment_classification?: string | null }>(),
      ])

    setApplicantRoleHint(applicantRolePrimaryForCompliance(applicantData ?? {}))
    setContractEmploymentClassification(currentContractData?.employment_classification || null)
    setTaxFormEmploymentClassification(currentTaxFormData?.employment_classification || null)
  }

  useEffect(() => {
    queueMicrotask(() => {
      setApplicantId(window.localStorage.getItem('applicantId') || '')
    })
  }, [])

  useEffect(() => {
    if (!applicantId) return

    queueMicrotask(() => {
      fetchUploadedDocs(applicantId)
      fetchOnboardingContractsState(applicantId)
      fetchEmploymentContext(applicantId)
    })
  }, [applicantId])

  const requiredDocs = useMemo(() => documentChecklist.filter((doc) => doc.required), [])

  const requiredUploadedCount = useMemo(() => {
    return requiredDocs.filter((doc) => uploadedDocs.includes(doc.documentType)).length
  }, [requiredDocs, uploadedDocs])
  const isConflictFormComplete =
    conflictForm.acknowledged &&
    conflictForm.disclosure.trim().length > 0 &&
    conflictForm.fullName.trim().length > 0 &&
    Boolean(conflictForm.signedDate)
  const isElectronicAgreementFormComplete =
    electronicAgreementForm.acknowledged &&
    electronicAgreementForm.fullName.trim().length > 0 &&
    Boolean(electronicAgreementForm.signedDate)
  const isHepBDeclinationFormComplete =
    hepBDeclinationForm.acknowledged &&
    hepBDeclinationForm.fullName.trim().length > 0 &&
    Boolean(hepBDeclinationForm.signedDate)
  const isTbFormComplete =
    Boolean(tbForm.positiveTestOrInfection) &&
    Boolean(tbForm.bcgVaccine) &&
    Boolean(tbForm.prolongedRecurrentFever) &&
    Boolean(tbForm.recentWeightLoss) &&
    Boolean(tbForm.chronicCough) &&
    Boolean(tbForm.coughingBlood) &&
    Boolean(tbForm.nightSweats) &&
    Boolean(tbForm.residenceHighTbCountry) &&
    Boolean(tbForm.currentOrPlannedImmunosuppression) &&
    Boolean(tbForm.closeContactWithInfectiousTb) &&
    tbForm.acknowledged &&
    tbForm.fullName.trim().length > 0 &&
    Boolean(tbForm.signedDate)
  const requiredPortalForms = useMemo(
    () => [
      { label: 'Conflict of Interest + Confidentiality', complete: isConflictFormComplete },
      {
        label: 'Electronic Documentation Signature Agreement',
        complete: isElectronicAgreementFormComplete,
      },
      { label: 'Hepatitis B Vaccine Declination', complete: isHepBDeclinationFormComplete },
      { label: 'TB Questionnaire / Risk Assessment', complete: isTbFormComplete },
    ],
    [
      isConflictFormComplete,
      isElectronicAgreementFormComplete,
      isHepBDeclinationFormComplete,
      isTbFormComplete,
    ]
  )
  const requiredUploadChecklistItems = useMemo(
    () =>
      requiredDocs.map((doc) => ({
        label: doc.label,
        complete: uploadedDocs.includes(doc.documentType),
      })),
    [requiredDocs, uploadedDocs]
  )
  const requiredFormsCompletedCount = requiredPortalForms.filter((form) => form.complete).length
  const totalRequiredUploadsCount = requiredDocs.length
  const totalRequiredFormsCount = requiredPortalForms.length
  const totalRequiredCount = totalRequiredUploadsCount + totalRequiredFormsCount
  const totalCompletedCount = requiredUploadedCount + requiredFormsCompletedCount
  const progressPercent =
    totalRequiredCount === 0 ? 0 : Math.round((totalCompletedCount / totalRequiredCount) * 100)
  const isReadyForContracts = totalCompletedCount === totalRequiredCount
  const roleHints = [applicantRoleHint, onboardingSelectedRole].filter(Boolean)
  const showOptionalAutoInsurance = roleHints.some((value) => isFieldStaffRole(value))
  const effectiveEmploymentClassification =
    contractEmploymentClassification || taxFormEmploymentClassification || null
  const showOptionalIndependentContractorInsurance = isIndependentContractorClassification(
    effectiveEmploymentClassification
  )
  const optionalDocumentChecklist = [
    ...(showOptionalAutoInsurance
      ? [
          {
            documentType: AUTO_INSURANCE_DOCUMENT_TYPE,
            label: 'Auto Insurance',
            description: 'Optional upload for field staff. Provide current proof of auto insurance.',
          },
        ]
      : []),
    ...(showOptionalIndependentContractorInsurance
      ? [
          {
            documentType: INDEPENDENT_CONTRACTOR_INSURANCE_DOCUMENT_TYPE,
            label: 'Independent Contractor Insurance',
            description:
              'Optional upload for IC / 1099 staff. Provide your current contractor insurance document.',
          },
        ]
      : []),
  ]
  const optionalUploadChecklistItems = useMemo(
    () =>
      optionalDocumentChecklist.map((doc) => ({
        label: doc.label,
        complete: uploadedDocs.includes(doc.documentType),
      })),
    [optionalDocumentChecklist, uploadedDocs]
  )
  const optionalUploadsCompletedCount = optionalUploadChecklistItems.filter((item) => item.complete).length

  const handleConflictFormSave = async () => {
    if (!applicantId) return

    setConflictFormMessage('')
    setConflictFormError('')

    if (
      !conflictForm.acknowledged ||
      !conflictForm.disclosure.trim() ||
      !conflictForm.fullName.trim() ||
      !conflictForm.signedDate
    ) {
      setConflictFormError(
        'Please complete the acknowledgment, disclosure, full legal name, and date before saving.'
      )
      return
    }

    setIsSavingConflictForm(true)

    const signedAt = new Date(`${conflictForm.signedDate}T12:00:00Z`).toISOString()
    const payload = {
      applicant_id: applicantId,
      conflict_confidentiality_acknowledged: true,
      conflict_confidentiality_disclosure: conflictForm.disclosure.trim(),
      conflict_confidentiality_full_name: conflictForm.fullName.trim(),
      conflict_confidentiality_signed_at: signedAt,
    }

    console.log('Saving conflict/confidentiality form payload:', payload)

    const { data, error } = await supabase
      .from('onboarding_contracts')
      .upsert(payload, { onConflict: 'applicant_id' })
      .select()

    console.log('Conflict/confidentiality upsert result:', { data, error })

    if (error) {
      console.error('Error saving conflict/confidentiality form:', error)
      setConflictFormError('We could not save this form right now. Please try again.')
      setIsSavingConflictForm(false)
      return
    }

    setConflictFormMessage('Conflict of Interest + Confidentiality form saved.')
    setIsSavingConflictForm(false)
  }

  const handleElectronicAgreementFormSave = async () => {
    if (!applicantId) return

    setElectronicAgreementFormMessage('')
    setElectronicAgreementFormError('')

    if (
      !electronicAgreementForm.acknowledged ||
      !electronicAgreementForm.fullName.trim() ||
      !electronicAgreementForm.signedDate
    ) {
      setElectronicAgreementFormError(
        'Please complete the acknowledgment, full legal name, and date before saving.'
      )
      return
    }

    setIsSavingElectronicAgreementForm(true)

    const signedAt = new Date(
      `${electronicAgreementForm.signedDate}T12:00:00Z`
    ).toISOString()
    const payload = {
      applicant_id: applicantId,
      electronic_signature_agreement_acknowledged: true,
      electronic_signature_agreement_full_name: electronicAgreementForm.fullName.trim(),
      electronic_signature_agreement_signed_at: signedAt,
    }

    console.log('Saving electronic agreement form payload:', payload)

    const { data, error } = await supabase
      .from('onboarding_contracts')
      .upsert(payload, { onConflict: 'applicant_id' })
      .select()

    console.log('Electronic agreement upsert result:', { data, error })

    if (error) {
      console.error('Error saving electronic signature agreement form:', error)
      setElectronicAgreementFormError('We could not save this form right now. Please try again.')
      setIsSavingElectronicAgreementForm(false)
      return
    }

    setElectronicAgreementFormMessage('Electronic Documentation Signature Agreement saved.')
    setIsSavingElectronicAgreementForm(false)
  }

  const handleHepBDeclinationFormSave = async () => {
    if (!applicantId) return

    setHepBDeclinationFormMessage('')
    setHepBDeclinationFormError('')

    if (
      !hepBDeclinationForm.acknowledged ||
      !hepBDeclinationForm.fullName.trim() ||
      !hepBDeclinationForm.signedDate
    ) {
      setHepBDeclinationFormError(
        'Please complete the acknowledgment, full legal name, and date before saving.'
      )
      return
    }

    setIsSavingHepBDeclinationForm(true)

    const signedAt = new Date(`${hepBDeclinationForm.signedDate}T12:00:00Z`).toISOString()
    const payload = {
      applicant_id: applicantId,
      hep_b_declination_acknowledged: true,
      hep_b_declination_full_name: hepBDeclinationForm.fullName.trim(),
      hep_b_declination_signed_at: signedAt,
    }

    const { data, error } = await supabase
      .from('onboarding_contracts')
      .upsert(payload, { onConflict: 'applicant_id' })
      .select()

    console.log('Hep B declination upsert result:', { data, error })

    if (error) {
      console.error('Error saving Hepatitis B declination form:', error)
      setHepBDeclinationFormError('We could not save this form right now. Please try again.')
      setIsSavingHepBDeclinationForm(false)
      return
    }

    setHepBDeclinationFormMessage('Hepatitis B Vaccine Declination saved.')
    setIsSavingHepBDeclinationForm(false)
  }

  const handleTbFormSave = async () => {
    if (!applicantId) return

    setTbFormMessage('')
    setTbFormError('')

    if (!isTbFormComplete) {
      setTbFormError('Please complete all required TB questionnaire fields before saving.')
      return
    }

    setIsSavingTbForm(true)

    const signedAt = new Date(`${tbForm.signedDate}T12:00:00Z`).toISOString()
    const payload = {
      applicant_id: applicantId,
      tb_history_positive_test_or_infection: fromYesNo(tbForm.positiveTestOrInfection),
      tb_history_bcg_vaccine: fromYesNo(tbForm.bcgVaccine),
      tb_symptom_prolonged_recurrent_fever: fromYesNo(tbForm.prolongedRecurrentFever),
      tb_symptom_recent_weight_loss: fromYesNo(tbForm.recentWeightLoss),
      tb_symptom_chronic_cough: fromYesNo(tbForm.chronicCough),
      tb_symptom_coughing_blood: fromYesNo(tbForm.coughingBlood),
      tb_symptom_night_sweats: fromYesNo(tbForm.nightSweats),
      tb_risk_silicosis: tbForm.riskSilicosis,
      tb_risk_gastrectomy: tbForm.riskGastrectomy,
      tb_risk_intestinal_bypass: tbForm.riskIntestinalBypass,
      tb_risk_weight_10_percent_below_ideal: tbForm.riskWeightBelowIdeal,
      tb_risk_chronic_renal_disease: tbForm.riskChronicRenalDisease,
      tb_risk_diabetes_mellitus: tbForm.riskDiabetesMellitus,
      tb_risk_steroid_or_immunosuppressive_therapy:
        tbForm.riskSteroidOrImmunosuppressiveTherapy,
      tb_risk_hematologic_disorder: tbForm.riskHematologicDisorder,
      tb_risk_exposure_to_hiv_or_aids: tbForm.riskExposureToHivOrAids,
      tb_risk_other_malignancies: tbForm.riskOtherMalignancies,
      tb_baseline_residence_high_tb_country: fromYesNo(tbForm.residenceHighTbCountry),
      tb_baseline_current_or_planned_immunosuppression: fromYesNo(
        tbForm.currentOrPlannedImmunosuppression
      ),
      tb_baseline_close_contact_with_infectious_tb: fromYesNo(
        tbForm.closeContactWithInfectiousTb
      ),
      tb_additional_comments: tbForm.additionalComments.trim() || null,
      tb_acknowledged: true,
      tb_full_name: tbForm.fullName.trim(),
      tb_signed_at: signedAt,
    }

    const { data, error } = await supabase
      .from('onboarding_contracts')
      .upsert(payload, { onConflict: 'applicant_id' })
      .select()

    console.log('TB questionnaire upsert result:', { data, error })

    if (error) {
      console.error('Error saving TB questionnaire form:', error)
      console.error(
        'Error saving TB questionnaire form JSON:',
        JSON.stringify(error, null, 2)
      )
      console.error('Error saving TB questionnaire form details:', {
        message: (error as { message?: string })?.message,
        code: (error as { code?: string })?.code,
        details: (error as { details?: string })?.details,
        hint: (error as { hint?: string })?.hint,
      })
      setTbFormError('We could not save this form right now. Please try again.')
      setIsSavingTbForm(false)
      return
    }

    setTbFormMessage('TB Questionnaire / Risk Assessment saved.')
    setIsSavingTbForm(false)
  }

  return (
    <main className="shh-docs-page">
      <div className="shh-docs-shell">
        <section>
          <div className="shh-step-banner">
            <div className="shh-step-banner-pill">
              Employee Onboarding · Step 3 of 6
            </div>
          </div>

          <OnboardingApplicantIdentity />

          <div className="shh-step-grid">
            {[
              { label: '1. Welcome', href: '/onboarding-welcome', state: 'complete' },
              { label: '2. Application', href: '/onboarding-application', state: 'complete' },
              { label: '3. Documents', href: '/onboarding-documents', state: 'current' },
              { label: '4. Contracts', href: '/onboarding-contracts', state: 'upcoming' },
              { label: '5. Training', href: '/onboarding-training', state: 'upcoming' },
              { label: '6. Complete', href: '/onboarding-complete', state: 'upcoming' },
            ].map((step) => {
              const isComplete = step.state === 'complete'
              const isCurrent = step.state === 'current'

              return (
                <a
                  key={step.label}
                  href={step.href}
                  className={[
                    'shh-step-pill',
                    isComplete ? 'is-complete' : '',
                    isCurrent ? 'is-current' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {isComplete ? `✓ ${step.label}` : step.label}
                </a>
              )
            })}
          </div>

          <div className="shh-hero-card">
            <div className="shh-hero-inner">
              <div className="shh-badge">
                Welcome to Saintly Home Health
              </div>

              <h1 className="shh-title">
                Required Documents & Compliance Uploads
              </h1>

              <p className="shh-subtitle">
                Upload the required employment and compliance documents below. Your progress is
                saved automatically as you complete each document requirement.
              </p>

              <div className="shh-hero-divider" />

              <p className="shh-hero-note">
                Once every required upload and portal form is complete, you can continue to the
                contracts step.
              </p>
            </div>
          </div>

          {!applicantId ? (
            <section className="shh-card">
            <div className="shh-alert shh-alert--error">
              Missing applicant ID. Please complete the application step first.
            </div>

            <div className="shh-actions">
              <button
                type="button"
                className="shh-btn shh-btn--secondary"
                onClick={() => router.push('/onboarding-application')}
              >
                Go to Application
              </button>
            </div>
            </section>
          ) : (
            <>
              <div className="shh-content-grid">
              <aside className="shh-progress-card">
                <div className="shh-progress-label">Document Progress</div>

                <div className="shh-progress-count">{totalCompletedCount}/{totalRequiredCount}</div>

                <p className="shh-progress-copy">Required uploads and forms completed</p>

                <div className="shh-progress-track">
                  <div className="shh-progress-bar" style={{ width: `${progressPercent}%` }} />
                </div>

                <div className="shh-progress-percent">{progressPercent}% complete</div>

                <div className="shh-progress-breakdown">
                  <div className="shh-progress-breakdown-row">
                    <span>Uploads</span>
                    <span>{requiredUploadedCount}/{totalRequiredUploadsCount}</span>
                  </div>
                  <div className="shh-progress-breakdown-row">
                    <span>Forms</span>
                    <span>{requiredFormsCompletedCount}/{totalRequiredFormsCount}</span>
                  </div>
                  <div className="shh-progress-breakdown-row shh-progress-breakdown-row--total">
                    <span>Total</span>
                    <span>{totalCompletedCount}/{totalRequiredCount}</span>
                  </div>
                </div>

                <div className={`shh-progress-badge ${isReadyForContracts ? 'is-complete' : ''}`}>
                  {isReadyForContracts ? 'Ready for Contracts' : 'Items Still Needed'}
                </div>

                <div className="shh-progress-checklist">
                  <div className="shh-progress-section">
                    <div className="shh-progress-section-header">
                      <span>Portal Forms</span>
                      <span>{requiredFormsCompletedCount}/{totalRequiredFormsCount}</span>
                    </div>

                    <div className="shh-progress-section-list">
                      {requiredPortalForms.map((item) => (
                        <div key={item.label} className="shh-progress-item">
                          <span className="shh-progress-item-label">{item.label}</span>
                          <span
                            className={`shh-progress-item-status ${
                              item.complete ? 'is-complete' : 'is-missing'
                            }`}
                          >
                            {item.complete ? 'Completed' : 'Missing'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="shh-progress-section">
                    <div className="shh-progress-section-header">
                      <span>Required Uploads</span>
                      <span>{requiredUploadedCount}/{totalRequiredUploadsCount}</span>
                    </div>

                    <div className="shh-progress-section-list">
                      {requiredUploadChecklistItems.map((item) => (
                        <div key={item.label} className="shh-progress-item">
                          <span className="shh-progress-item-label">{item.label}</span>
                          <span
                            className={`shh-progress-item-status ${
                              item.complete ? 'is-complete' : 'is-missing'
                            }`}
                          >
                            {item.complete ? 'Completed' : 'Missing'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {optionalUploadChecklistItems.length > 0 ? (
                    <div className="shh-progress-section">
                      <div className="shh-progress-section-header">
                        <span>Optional Uploads</span>
                        <span>{optionalUploadsCompletedCount}/{optionalUploadChecklistItems.length}</span>
                      </div>

                      <div className="shh-progress-section-list">
                        {optionalUploadChecklistItems.map((item) => (
                          <div key={item.label} className="shh-progress-item">
                            <span className="shh-progress-item-label">{item.label}</span>
                            <span
                              className={`shh-progress-item-status ${
                                item.complete ? 'is-complete' : 'is-missing'
                              }`}
                            >
                              {item.complete ? 'Uploaded' : 'Optional'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="shh-reminder-box">
                  <div className="shh-reminder-title">Before you continue</div>
                  <p className="shh-reminder-copy">
                    Every required upload and portal form must be complete before the Continue
                    button unlocks.
                  </p>
                </div>

                <button
                  type="button"
                  className="shh-btn shh-btn--refresh"
                  onClick={() => fetchUploadedDocs(applicantId)}
                >
                  {loadingDocs ? 'Refreshing...' : 'Refresh Status'}
                </button>

                {pageError ? <div className="shh-alert shh-alert--error">{pageError}</div> : null}

                <div className="shh-session-card">
                  <div className="shh-session-label">Session</div>
                  <div className="shh-session-value">{applicantId}</div>
                </div>
              </aside>

              <section className="shh-doc-list">
                <article
                  className={`shh-doc-card ${handbookAcknowledged ? 'is-uploaded' : ''}`}
                >
                  <div className="shh-doc-main">
                    <div className="shh-doc-copy-wrap">
                      <div className="shh-doc-meta">
                        <span className="shh-doc-type">Required Review</span>
                        <span className="shh-doc-category">Saintly Policies</span>
                        {handbookAcknowledged ? (
                          <span className="shh-doc-complete">Acknowledged</span>
                        ) : null}
                      </div>

                      <h2 className="shh-doc-title">Employee Handbook</h2>

                      <p className="shh-doc-copy">
                        Review the Saintly Home Health Employee Handbook and confirm your
                        acknowledgment in the onboarding portal. If a handbook file has already
                        been uploaded to this onboarding session, you can view it here.
                      </p>

                      <p className="shh-doc-status-text">
                        Status: {handbookAcknowledged ? 'Completed' : 'Missing'}
                      </p>

                      <p className="shh-handbook-note">
                        Handbook acknowledgment is tracked using the existing onboarding contracts
                        record and is not added to the Step 3 upload gate.
                      </p>
                    </div>

                    <div className="shh-doc-action-card">
                      <div
                        className={`shh-status-pill ${
                          handbookAcknowledged ? 'is-uploaded' : 'is-missing'
                        }`}
                      >
                        {handbookAcknowledged ? 'Completed' : 'Missing'}
                      </div>

                      <div className="shh-upload-wrap">
                        <a
                          href="/employee-handbook.pdf"
                          target="_blank"
                          rel="noreferrer"
                          className="shh-btn shh-btn--secondary shh-btn--link"
                        >
                          Download Handbook
                        </a>
                      </div>
                    </div>
                  </div>
                </article>

                <article
                  className={`shh-doc-card shh-doc-card--portal ${isConflictFormComplete ? 'is-uploaded' : ''}`}
                >
                  <div className="shh-doc-main shh-doc-main--portal">
                    <div className="shh-doc-copy-wrap">
                      <div className="shh-doc-meta">
                        <span className="shh-doc-type">Portal Form</span>
                        <span className="shh-doc-category">Compliance Review</span>
                        {isConflictFormComplete ? (
                          <span className="shh-doc-complete">Completed</span>
                        ) : null}
                      </div>

                      <h2 className="shh-doc-title">Conflict of Interest + Confidentiality</h2>

                      <p className="shh-doc-copy">
                        Complete this form in the portal to confirm you understand Saintly’s
                        confidentiality expectations and to disclose any actual or potential
                        conflicts of interest, or state “none.”
                      </p>

                      <p className="shh-doc-status-text">
                        Status: {isConflictFormComplete ? 'Completed' : 'Missing'}
                      </p>

                      <p className="shh-handbook-note">
                        This required portal form is counted in Step 3 progress and must be
                        completed before you can continue to contracts.
                      </p>
                    </div>

                    <div className="shh-doc-action-card shh-doc-action-card--form">
                      <div
                        className={`shh-status-pill ${
                          isConflictFormComplete ? 'is-uploaded' : 'is-missing'
                        }`}
                      >
                        {isConflictFormComplete ? 'Completed' : 'Missing'}
                      </div>

                      <div className="shh-portal-form">
                        <div className="shh-agreement-block">
                          <div className="shh-agreement-label">Agreement Text</div>
                          <div className="shh-agreement-copy">
                            <p>
                              I have read and am fully familiar with the Agency&apos;s policy
                              statement regarding conflict of interest. I am not presently
                              involved in any transaction, investment, or other matter in which I
                              would profit or gain directly or indirectly as a result of my
                              employment with the Agency. I will disclose all known relationships
                              that may present a conflict of interest. Furthermore, I agree to
                              immediately disclose any such interest or outside employment which
                              may occur in accordance with the requirements of the policy and agree
                              to abstain from any vote or action regarding the Agency&apos;s
                              business that might result in any profit or gain, directly or
                              indirectly for myself.
                            </p>
                            <p>
                              I understand that patient privacy and Protected Health Information
                              must be maintained at all times. Any information related to the care
                              of patients through Saintly Home Health LLC will be held
                              confidential. All information, written or verbal, will be disclosed
                              only to appropriate health care personnel, appropriate staff, those
                              with a need-to-know basis, or to individuals the patient requests.
                            </p>
                          </div>
                        </div>

                        <label className="shh-checkbox-card">
                          <input
                            type="checkbox"
                            checked={conflictForm.acknowledged}
                            onChange={(event) => {
                              setConflictForm((prev) => ({
                                ...prev,
                                acknowledged: event.target.checked,
                              }))
                              setConflictFormMessage('')
                              setConflictFormError('')
                            }}
                            className="shh-checkbox-input"
                          />
                          <span className="shh-checkbox-copy">
                            I have read and agree to Saintly’s Conflict of Interest and
                            Confidentiality expectations.
                          </span>
                        </label>

                        <div className="shh-form-field">
                          <label htmlFor="conflictDisclosure" className="shh-form-label">
                            Disclosure
                          </label>
                          <textarea
                            id="conflictDisclosure"
                            value={conflictForm.disclosure}
                            onChange={(event) => {
                              setConflictForm((prev) => ({
                                ...prev,
                                disclosure: event.target.value,
                              }))
                              setConflictFormMessage('')
                              setConflictFormError('')
                            }}
                            className="shh-form-textarea"
                            rows={4}
                            placeholder="Enter any conflict of interest details, or type None"
                          />
                        </div>

                        <div className="shh-form-field">
                          <label htmlFor="conflictFullName" className="shh-form-label">
                            Full Legal Name
                          </label>
                          <input
                            id="conflictFullName"
                            type="text"
                            value={conflictForm.fullName}
                            onChange={(event) => {
                              setConflictForm((prev) => ({
                                ...prev,
                                fullName: event.target.value,
                              }))
                              setConflictFormMessage('')
                              setConflictFormError('')
                            }}
                            className="shh-form-input"
                            placeholder="Type your full legal name"
                          />
                        </div>

                        <div className="shh-form-field">
                          <label htmlFor="conflictSignedDate" className="shh-form-label">
                            Date
                          </label>
                          <input
                            id="conflictSignedDate"
                            type="date"
                            value={conflictForm.signedDate}
                            onChange={(event) => {
                              setConflictForm((prev) => ({
                                ...prev,
                                signedDate: event.target.value,
                              }))
                              setConflictFormMessage('')
                              setConflictFormError('')
                            }}
                            className="shh-form-input"
                          />
                        </div>

                        <button
                          type="button"
                          className="shh-btn shh-btn--primary"
                          onClick={handleConflictFormSave}
                          disabled={isSavingConflictForm}
                        >
                          {isSavingConflictForm ? 'Saving...' : 'Save Form'}
                        </button>

                        {conflictFormMessage ? (
                          <div className="shh-form-message shh-form-message--success">
                            {conflictFormMessage}
                          </div>
                        ) : null}

                        {conflictFormError ? (
                          <div className="shh-form-message shh-form-message--error">
                            {conflictFormError}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>

                <article
                  className={`shh-doc-card shh-doc-card--portal ${isElectronicAgreementFormComplete ? 'is-uploaded' : ''}`}
                >
                  <div className="shh-doc-main shh-doc-main--portal">
                    <div className="shh-doc-copy-wrap">
                      <div className="shh-doc-meta">
                        <span className="shh-doc-type">Portal Form</span>
                        <span className="shh-doc-category">Documentation Agreement</span>
                        {isElectronicAgreementFormComplete ? (
                          <span className="shh-doc-complete">Completed</span>
                        ) : null}
                      </div>

                      <h2 className="shh-doc-title">
                        Electronic Documentation Signature Agreement
                      </h2>

                      <p className="shh-doc-copy">
                        Complete this agreement in the portal to confirm your acknowledgment of
                        Saintly&apos;s electronic documentation signature requirements.
                      </p>

                      <p className="shh-doc-status-text">
                        Status: {isElectronicAgreementFormComplete ? 'Completed' : 'Missing'}
                      </p>

                      <p className="shh-handbook-note">
                        This required portal form is counted in Step 3 progress and must be
                        completed before you can continue to contracts.
                      </p>
                    </div>

                    <div className="shh-doc-action-card shh-doc-action-card--form">
                      <div
                        className={`shh-status-pill ${
                          isElectronicAgreementFormComplete ? 'is-uploaded' : 'is-missing'
                        }`}
                      >
                        {isElectronicAgreementFormComplete ? 'Completed' : 'Missing'}
                      </div>

                      <div className="shh-portal-form">
                        <div className="shh-agreement-block">
                          <div className="shh-agreement-label">Agreement Text</div>
                          <div className="shh-agreement-copy">
                            <p>
                              I understand that Agency staff may use electronic signatures on
                              computer-generated documentation. An electronic signature serves as
                              authentication on patient record documents and other agency documents
                              generated in the electronic system.
                            </p>
                            <p>
                              For the purpose of the computerized medical record and other agency
                              documentation, I acknowledge that my login authentication password
                              and signature passcode serve as my legal signature. I understand
                              that I must not divulge my password or signature passcode, must
                              securely exit the application whenever it is not in my possession,
                              and must review my documentation before submitting it to the agency
                              system.
                            </p>
                          </div>
                        </div>

                        <label className="shh-checkbox-card">
                          <input
                            type="checkbox"
                            checked={electronicAgreementForm.acknowledged}
                            onChange={(event) => {
                              setElectronicAgreementForm((prev) => ({
                                ...prev,
                                acknowledged: event.target.checked,
                              }))
                              setElectronicAgreementFormMessage('')
                              setElectronicAgreementFormError('')
                            }}
                            className="shh-checkbox-input"
                          />
                          <span className="shh-checkbox-copy">
                            I have read and agree to the Electronic Documentation Signature Agreement.
                          </span>
                        </label>

                        <div className="shh-form-field">
                          <label
                            htmlFor="electronicAgreementFullName"
                            className="shh-form-label"
                          >
                            Full Legal Name
                          </label>
                          <input
                            id="electronicAgreementFullName"
                            type="text"
                            value={electronicAgreementForm.fullName}
                            onChange={(event) => {
                              setElectronicAgreementForm((prev) => ({
                                ...prev,
                                fullName: event.target.value,
                              }))
                              setElectronicAgreementFormMessage('')
                              setElectronicAgreementFormError('')
                            }}
                            className="shh-form-input"
                            placeholder="Type your full legal name"
                          />
                        </div>

                        <div className="shh-form-field">
                          <label
                            htmlFor="electronicAgreementSignedDate"
                            className="shh-form-label"
                          >
                            Date
                          </label>
                          <input
                            id="electronicAgreementSignedDate"
                            type="date"
                            value={electronicAgreementForm.signedDate}
                            onChange={(event) => {
                              setElectronicAgreementForm((prev) => ({
                                ...prev,
                                signedDate: event.target.value,
                              }))
                              setElectronicAgreementFormMessage('')
                              setElectronicAgreementFormError('')
                            }}
                            className="shh-form-input"
                          />
                        </div>

                        <button
                          type="button"
                          className="shh-btn shh-btn--primary"
                          onClick={handleElectronicAgreementFormSave}
                          disabled={isSavingElectronicAgreementForm}
                        >
                          {isSavingElectronicAgreementForm ? 'Saving...' : 'Save Form'}
                        </button>

                        {electronicAgreementFormMessage ? (
                          <div className="shh-form-message shh-form-message--success">
                            {electronicAgreementFormMessage}
                          </div>
                        ) : null}

                        {electronicAgreementFormError ? (
                          <div className="shh-form-message shh-form-message--error">
                            {electronicAgreementFormError}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>

                <article
                  className={`shh-doc-card shh-doc-card--portal ${isHepBDeclinationFormComplete ? 'is-uploaded' : ''}`}
                >
                  <div className="shh-doc-main shh-doc-main--portal">
                    <div className="shh-doc-copy-wrap">
                      <div className="shh-doc-meta">
                        <span className="shh-doc-type">Portal Form</span>
                        <span className="shh-doc-category">Health Compliance</span>
                        {isHepBDeclinationFormComplete ? (
                          <span className="shh-doc-complete">Completed</span>
                        ) : null}
                      </div>

                      <h2 className="shh-doc-title">Hepatitis B Vaccine Declination</h2>

                      <p className="shh-doc-copy">
                        Complete this form in the portal to document your Hepatitis B vaccine
                        declination acknowledgment for Saintly onboarding records.
                      </p>

                      <p className="shh-doc-status-text">
                        Status: {isHepBDeclinationFormComplete ? 'Completed' : 'Missing'}
                      </p>

                      <p className="shh-handbook-note">
                        This required portal form is counted in Step 3 progress and must be
                        completed before you can continue to contracts.
                      </p>
                    </div>

                    <div className="shh-doc-action-card shh-doc-action-card--form">
                      <div
                        className={`shh-status-pill ${
                          isHepBDeclinationFormComplete ? 'is-uploaded' : 'is-missing'
                        }`}
                      >
                        {isHepBDeclinationFormComplete ? 'Completed' : 'Missing'}
                      </div>

                      <div className="shh-portal-form">
                        <div className="shh-agreement-block">
                          <div className="shh-agreement-label">Agreement Text</div>
                          <div className="shh-agreement-copy">
                            <p>
                              I understand that due to my occupational exposure to blood or other
                              potentially infectious materials, I may be at risk of acquiring
                              Hepatitis B virus (HBV) infection.
                            </p>
                            <p>
                              I have been given the opportunity to be vaccinated with Hepatitis B
                              vaccine at no charge to myself. However, I decline Hepatitis B
                              vaccination at this time.
                            </p>
                            <p>
                              I understand that by declining this vaccine, I continue to be at
                              risk of acquiring Hepatitis B, a serious disease, and I accept
                              responsibility for this decision.
                            </p>
                          </div>
                        </div>

                        <label className="shh-checkbox-card">
                          <input
                            type="checkbox"
                            checked={hepBDeclinationForm.acknowledged}
                            onChange={(event) => {
                              setHepBDeclinationForm((prev) => ({
                                ...prev,
                                acknowledged: event.target.checked,
                              }))
                              setHepBDeclinationFormMessage('')
                              setHepBDeclinationFormError('')
                            }}
                            className="shh-checkbox-input"
                          />
                          <span className="shh-checkbox-copy">
                            I have read and acknowledge the Hepatitis B Vaccine Declination statement.
                          </span>
                        </label>

                        <div className="shh-form-field">
                          <label htmlFor="hepBDeclinationFullName" className="shh-form-label">
                            Full Legal Name
                          </label>
                          <input
                            id="hepBDeclinationFullName"
                            type="text"
                            value={hepBDeclinationForm.fullName}
                            onChange={(event) => {
                              setHepBDeclinationForm((prev) => ({
                                ...prev,
                                fullName: event.target.value,
                              }))
                              setHepBDeclinationFormMessage('')
                              setHepBDeclinationFormError('')
                            }}
                            className="shh-form-input"
                            placeholder="Type your full legal name"
                          />
                        </div>

                        <div className="shh-form-field">
                          <label htmlFor="hepBDeclinationSignedDate" className="shh-form-label">
                            Date
                          </label>
                          <input
                            id="hepBDeclinationSignedDate"
                            type="date"
                            value={hepBDeclinationForm.signedDate}
                            onChange={(event) => {
                              setHepBDeclinationForm((prev) => ({
                                ...prev,
                                signedDate: event.target.value,
                              }))
                              setHepBDeclinationFormMessage('')
                              setHepBDeclinationFormError('')
                            }}
                            className="shh-form-input"
                          />
                        </div>

                        <button
                          type="button"
                          className="shh-btn shh-btn--primary"
                          onClick={handleHepBDeclinationFormSave}
                          disabled={isSavingHepBDeclinationForm}
                        >
                          {isSavingHepBDeclinationForm ? 'Saving...' : 'Save Form'}
                        </button>

                        {hepBDeclinationFormMessage ? (
                          <div className="shh-form-message shh-form-message--success">
                            {hepBDeclinationFormMessage}
                          </div>
                        ) : null}

                        {hepBDeclinationFormError ? (
                          <div className="shh-form-message shh-form-message--error">
                            {hepBDeclinationFormError}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>

                <article className={`shh-doc-card shh-doc-card--portal ${isTbFormComplete ? 'is-uploaded' : ''}`}>
                  <div className="shh-doc-main shh-doc-main--portal">
                    <div className="shh-doc-copy-wrap">
                      <div className="shh-doc-meta">
                        <span className="shh-doc-type">Portal Form</span>
                        <span className="shh-doc-category">Health Screening</span>
                        {isTbFormComplete ? (
                          <span className="shh-doc-complete">Completed</span>
                        ) : null}
                      </div>

                      <h2 className="shh-doc-title">TB Questionnaire / Risk Assessment</h2>

                      <p className="shh-doc-copy">
                        Complete this TB screening questionnaire in the portal so Saintly can
                        document baseline TB history, current symptoms, and risk factors for onboarding review.
                      </p>

                      <p className="shh-doc-status-text">
                        Status: {isTbFormComplete ? 'Completed' : 'Missing'}
                      </p>

                      <p className="shh-handbook-note">
                        This required portal form is counted in Step 3 progress and must be
                        completed before you can continue to contracts.
                      </p>
                    </div>

                    <div className="shh-doc-action-card shh-doc-action-card--form shh-doc-action-card--tb">
                      <div
                        className={`shh-status-pill ${isTbFormComplete ? 'is-uploaded' : 'is-missing'}`}
                      >
                        {isTbFormComplete ? 'Completed' : 'Missing'}
                      </div>

                      <div className="shh-portal-form">
                        <div className="shh-agreement-block">
                          <div className="shh-agreement-label">Agreement Text</div>
                          <div className="shh-agreement-copy">
                            <p>
                              Please complete this tuberculosis questionnaire and risk assessment
                              honestly and completely. This information is used to document TB
                              history, current symptoms, and baseline risk factors in accordance
                              with Saintly Home Health onboarding requirements.
                            </p>
                            <p>
                              If any symptoms, prior positive testing, or risk exposures apply,
                              additional follow-up, testing, or provider review may be required
                              before clinical clearance is finalized.
                            </p>
                          </div>
                        </div>

                        <div className="shh-form-section">
                          <div className="shh-form-section-title">TB History</div>

                          <div className="shh-form-field">
                            <label className="shh-form-label">
                              Positive TB skin test or history of TB infection
                            </label>
                            <select
                              className="shh-form-input"
                              value={tbForm.positiveTestOrInfection}
                              onChange={(event) =>
                                setTbForm((prev) => ({
                                  ...prev,
                                  positiveTestOrInfection: event.target.value as YesNoValue,
                                }))
                              }
                            >
                              <option value="">Select</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </div>

                          <div className="shh-form-field">
                            <label className="shh-form-label">BCG vaccine</label>
                            <select
                              className="shh-form-input"
                              value={tbForm.bcgVaccine}
                              onChange={(event) =>
                                setTbForm((prev) => ({
                                  ...prev,
                                  bcgVaccine: event.target.value as YesNoValue,
                                }))
                              }
                            >
                              <option value="">Select</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </div>
                        </div>

                        <div className="shh-form-section">
                          <div className="shh-form-section-title">Symptoms</div>

                          <div className="shh-form-field">
                            <label className="shh-form-label">Prolonged or recurrent fever</label>
                            <select
                              className="shh-form-input"
                              value={tbForm.prolongedRecurrentFever}
                              onChange={(event) =>
                                setTbForm((prev) => ({
                                  ...prev,
                                  prolongedRecurrentFever: event.target.value as YesNoValue,
                                }))
                              }
                            >
                              <option value="">Select</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </div>

                          <div className="shh-form-field">
                            <label className="shh-form-label">Recent weight loss</label>
                            <select
                              className="shh-form-input"
                              value={tbForm.recentWeightLoss}
                              onChange={(event) =>
                                setTbForm((prev) => ({
                                  ...prev,
                                  recentWeightLoss: event.target.value as YesNoValue,
                                }))
                              }
                            >
                              <option value="">Select</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </div>

                          <div className="shh-form-field">
                            <label className="shh-form-label">Chronic cough</label>
                            <select
                              className="shh-form-input"
                              value={tbForm.chronicCough}
                              onChange={(event) =>
                                setTbForm((prev) => ({
                                  ...prev,
                                  chronicCough: event.target.value as YesNoValue,
                                }))
                              }
                            >
                              <option value="">Select</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </div>

                          <div className="shh-form-field">
                            <label className="shh-form-label">Coughing blood</label>
                            <select
                              className="shh-form-input"
                              value={tbForm.coughingBlood}
                              onChange={(event) =>
                                setTbForm((prev) => ({
                                  ...prev,
                                  coughingBlood: event.target.value as YesNoValue,
                                }))
                              }
                            >
                              <option value="">Select</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </div>

                          <div className="shh-form-field">
                            <label className="shh-form-label">Night sweats</label>
                            <select
                              className="shh-form-input"
                              value={tbForm.nightSweats}
                              onChange={(event) =>
                                setTbForm((prev) => ({
                                  ...prev,
                                  nightSweats: event.target.value as YesNoValue,
                                }))
                              }
                            >
                              <option value="">Select</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </div>
                        </div>

                        <div className="shh-form-section">
                          <div className="shh-form-section-title">Risk Factors</div>

                          <div className="shh-checkbox-grid">
                            <label className="shh-checkbox-card">
                              <input
                                type="checkbox"
                                checked={tbForm.riskSilicosis}
                                onChange={(event) =>
                                  setTbForm((prev) => ({
                                    ...prev,
                                    riskSilicosis: event.target.checked,
                                  }))
                                }
                                className="shh-checkbox-input"
                              />
                              <span className="shh-checkbox-copy">Silicosis</span>
                            </label>

                            <label className="shh-checkbox-card">
                              <input
                                type="checkbox"
                                checked={tbForm.riskGastrectomy}
                                onChange={(event) =>
                                  setTbForm((prev) => ({
                                    ...prev,
                                    riskGastrectomy: event.target.checked,
                                  }))
                                }
                                className="shh-checkbox-input"
                              />
                              <span className="shh-checkbox-copy">Gastrectomy</span>
                            </label>

                            <label className="shh-checkbox-card">
                              <input
                                type="checkbox"
                                checked={tbForm.riskIntestinalBypass}
                                onChange={(event) =>
                                  setTbForm((prev) => ({
                                    ...prev,
                                    riskIntestinalBypass: event.target.checked,
                                  }))
                                }
                                className="shh-checkbox-input"
                              />
                              <span className="shh-checkbox-copy">Intestinal bypass</span>
                            </label>

                            <label className="shh-checkbox-card">
                              <input
                                type="checkbox"
                                checked={tbForm.riskWeightBelowIdeal}
                                onChange={(event) =>
                                  setTbForm((prev) => ({
                                    ...prev,
                                    riskWeightBelowIdeal: event.target.checked,
                                  }))
                                }
                                className="shh-checkbox-input"
                              />
                              <span className="shh-checkbox-copy">
                                Weight 10 percent below ideal body weight
                              </span>
                            </label>

                            <label className="shh-checkbox-card">
                              <input
                                type="checkbox"
                                checked={tbForm.riskChronicRenalDisease}
                                onChange={(event) =>
                                  setTbForm((prev) => ({
                                    ...prev,
                                    riskChronicRenalDisease: event.target.checked,
                                  }))
                                }
                                className="shh-checkbox-input"
                              />
                              <span className="shh-checkbox-copy">Chronic renal disease</span>
                            </label>

                            <label className="shh-checkbox-card">
                              <input
                                type="checkbox"
                                checked={tbForm.riskDiabetesMellitus}
                                onChange={(event) =>
                                  setTbForm((prev) => ({
                                    ...prev,
                                    riskDiabetesMellitus: event.target.checked,
                                  }))
                                }
                                className="shh-checkbox-input"
                              />
                              <span className="shh-checkbox-copy">Diabetes mellitus</span>
                            </label>

                            <label className="shh-checkbox-card">
                              <input
                                type="checkbox"
                                checked={tbForm.riskSteroidOrImmunosuppressiveTherapy}
                                onChange={(event) =>
                                  setTbForm((prev) => ({
                                    ...prev,
                                    riskSteroidOrImmunosuppressiveTherapy:
                                      event.target.checked,
                                  }))
                                }
                                className="shh-checkbox-input"
                              />
                              <span className="shh-checkbox-copy">
                                Prolonged high-dose corticosteroid therapy or other
                                immunosuppressive therapy
                              </span>
                            </label>

                            <label className="shh-checkbox-card">
                              <input
                                type="checkbox"
                                checked={tbForm.riskHematologicDisorder}
                                onChange={(event) =>
                                  setTbForm((prev) => ({
                                    ...prev,
                                    riskHematologicDisorder: event.target.checked,
                                  }))
                                }
                                className="shh-checkbox-input"
                              />
                              <span className="shh-checkbox-copy">Hematologic disorder</span>
                            </label>

                            <label className="shh-checkbox-card">
                              <input
                                type="checkbox"
                                checked={tbForm.riskExposureToHivOrAids}
                                onChange={(event) =>
                                  setTbForm((prev) => ({
                                    ...prev,
                                    riskExposureToHivOrAids: event.target.checked,
                                  }))
                                }
                                className="shh-checkbox-input"
                              />
                              <span className="shh-checkbox-copy">Exposure to HIV or AIDS</span>
                            </label>

                            <label className="shh-checkbox-card">
                              <input
                                type="checkbox"
                                checked={tbForm.riskOtherMalignancies}
                                onChange={(event) =>
                                  setTbForm((prev) => ({
                                    ...prev,
                                    riskOtherMalignancies: event.target.checked,
                                  }))
                                }
                                className="shh-checkbox-input"
                              />
                              <span className="shh-checkbox-copy">Other malignancies</span>
                            </label>
                          </div>
                        </div>

                        <div className="shh-form-section">
                          <div className="shh-form-section-title">Baseline TB Risk Assessment</div>

                          <div className="shh-form-field">
                            <label className="shh-form-label">
                              Residence greater than 1 month in a high TB rate country
                            </label>
                            <select
                              className="shh-form-input"
                              value={tbForm.residenceHighTbCountry}
                              onChange={(event) =>
                                setTbForm((prev) => ({
                                  ...prev,
                                  residenceHighTbCountry: event.target.value as YesNoValue,
                                }))
                              }
                            >
                              <option value="">Select</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </div>

                          <div className="shh-form-field">
                            <label className="shh-form-label">
                              Current or planned immunosuppression
                            </label>
                            <select
                              className="shh-form-input"
                              value={tbForm.currentOrPlannedImmunosuppression}
                              onChange={(event) =>
                                setTbForm((prev) => ({
                                  ...prev,
                                  currentOrPlannedImmunosuppression:
                                    event.target.value as YesNoValue,
                                }))
                              }
                            >
                              <option value="">Select</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </div>

                          <div className="shh-form-field">
                            <label className="shh-form-label">
                              Close contact with someone with infectious TB since last TB test
                            </label>
                            <select
                              className="shh-form-input"
                              value={tbForm.closeContactWithInfectiousTb}
                              onChange={(event) =>
                                setTbForm((prev) => ({
                                  ...prev,
                                  closeContactWithInfectiousTb:
                                    event.target.value as YesNoValue,
                                }))
                              }
                            >
                              <option value="">Select</option>
                              <option value="yes">Yes</option>
                              <option value="no">No</option>
                            </select>
                          </div>
                        </div>

                        <div className="shh-form-field">
                          <label htmlFor="tbAdditionalComments" className="shh-form-label">
                            Additional Comments
                          </label>
                          <textarea
                            id="tbAdditionalComments"
                            className="shh-form-textarea"
                            rows={4}
                            value={tbForm.additionalComments}
                            onChange={(event) =>
                              setTbForm((prev) => ({
                                ...prev,
                                additionalComments: event.target.value,
                              }))
                            }
                          />
                        </div>

                        <label className="shh-checkbox-card">
                          <input
                            type="checkbox"
                            checked={tbForm.acknowledged}
                            onChange={(event) =>
                              setTbForm((prev) => ({
                                ...prev,
                                acknowledged: event.target.checked,
                              }))
                            }
                            className="shh-checkbox-input"
                          />
                          <span className="shh-checkbox-copy">
                            I certify that the TB questionnaire and risk assessment responses
                            provided above are complete and accurate to the best of my knowledge.
                          </span>
                        </label>

                        <div className="shh-form-field">
                          <label htmlFor="tbFullName" className="shh-form-label">
                            Full Legal Name
                          </label>
                          <input
                            id="tbFullName"
                            type="text"
                            value={tbForm.fullName}
                            onChange={(event) =>
                              setTbForm((prev) => ({
                                ...prev,
                                fullName: event.target.value,
                              }))
                            }
                            className="shh-form-input"
                            placeholder="Type your full legal name"
                          />
                        </div>

                        <div className="shh-form-field">
                          <label htmlFor="tbSignedDate" className="shh-form-label">
                            Date
                          </label>
                          <input
                            id="tbSignedDate"
                            type="date"
                            value={tbForm.signedDate}
                            onChange={(event) =>
                              setTbForm((prev) => ({
                                ...prev,
                                signedDate: event.target.value,
                              }))
                            }
                            className="shh-form-input"
                          />
                        </div>

                        <button
                          type="button"
                          className="shh-btn shh-btn--primary"
                          onClick={handleTbFormSave}
                          disabled={isSavingTbForm}
                        >
                          {isSavingTbForm ? 'Saving...' : 'Save Form'}
                        </button>

                        {tbFormMessage ? (
                          <div className="shh-form-message shh-form-message--success">
                            {tbFormMessage}
                          </div>
                        ) : null}

                        {tbFormError ? (
                          <div className="shh-form-message shh-form-message--error">
                            {tbFormError}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>

                {documentChecklist.map((doc) => {
                  const isUploaded = uploadedDocs.includes(doc.documentType)

                  return (
                    <article
                      key={doc.documentType}
                      className={`shh-doc-card ${isUploaded ? 'is-uploaded' : ''}`}
                    >
                      <div className="shh-doc-main">
                        <div className="shh-doc-copy-wrap">
                          <div className="shh-doc-meta">
                            <span className="shh-doc-type">Required Document</span>
                            <span className="shh-doc-category">Onboarding Packet</span>
                            {isUploaded ? (
                              <span className="shh-doc-complete">Uploaded</span>
                            ) : null}
                          </div>

                          <h2 className="shh-doc-title">
                            {doc.label}{' '}
                            {doc.required ? <span className="shh-required">*</span> : null}
                          </h2>

                          <p className="shh-doc-copy">{doc.description}</p>

                          <p className="shh-doc-status-text">
                            Status: {isUploaded ? 'Uploaded and ready for review' : 'Missing'}
                          </p>
                        </div>

                        <div className="shh-doc-action-card">
                          <div className={`shh-status-pill ${isUploaded ? 'is-uploaded' : 'is-missing'}`}>
                            {isUploaded ? 'Uploaded' : 'Missing'}
                          </div>

                          <div className="shh-upload-wrap">
                            <ApplicantFileUpload
                              applicantId={applicantId}
                              documentType={doc.documentType}
                              label={doc.label}
                              required={doc.required}
                              onUploadComplete={() => fetchUploadedDocs(applicantId)}
                              onUploadSuccess={() => fetchUploadedDocs(applicantId)}
                            />
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}

                {optionalDocumentChecklist.length > 0 ? (
                  <article className="shh-doc-card">
                    <div className="shh-doc-main">
                      <div className="shh-doc-copy-wrap">
                        <div className="shh-doc-meta">
                          <span className="shh-doc-type">Optional Uploads</span>
                          <span className="shh-doc-category">Insurance</span>
                        </div>
                        <h2 className="shh-doc-title">Optional Insurance Documents</h2>
                        <p className="shh-doc-copy">
                          These uploads are optional and do not affect Step 3 completion.
                        </p>
                      </div>
                    </div>
                  </article>
                ) : null}

                {optionalDocumentChecklist.map((doc) => {
                  const isUploaded = uploadedDocs.includes(doc.documentType)

                  return (
                    <article
                      key={doc.documentType}
                      className={`shh-doc-card ${isUploaded ? 'is-uploaded' : ''}`}
                    >
                      <div className="shh-doc-main">
                        <div className="shh-doc-copy-wrap">
                          <div className="shh-doc-meta">
                            <span className="shh-doc-type">Optional Document</span>
                            <span className="shh-doc-category">Insurance</span>
                            {isUploaded ? <span className="shh-doc-complete">Uploaded</span> : null}
                          </div>

                          <h2 className="shh-doc-title">{doc.label}</h2>

                          <p className="shh-doc-copy">{doc.description}</p>

                          <p className="shh-doc-status-text">
                            Status: {isUploaded ? 'Uploaded and ready for review' : 'Not uploaded'}
                          </p>
                        </div>

                        <div className="shh-doc-action-card">
                          <div className={`shh-status-pill ${isUploaded ? 'is-uploaded' : 'is-missing'}`}>
                            {isUploaded ? 'Uploaded' : 'Optional'}
                          </div>

                          <div className="shh-upload-wrap">
                            <ApplicantFileUpload
                              applicantId={applicantId}
                              documentType={doc.documentType}
                              label={doc.label}
                              required={false}
                              onUploadComplete={() => fetchUploadedDocs(applicantId)}
                              onUploadSuccess={() => fetchUploadedDocs(applicantId)}
                            />
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </section>
            </div>

            <section className="shh-card shh-next-step-card">
              <div className="shh-next-step-copy">
                <div className="shh-next-step-label">Next Step</div>
                <h3 className="shh-next-step-title">Finish required items and continue</h3>
                <p className="shh-note">
                  Please make sure all uploaded files are clear, current, and legible. Required
                  uploads and portal forms must be complete before you move to the contracts step.
                </p>
              </div>

              <div className="shh-actions">
                <button
                  type="button"
                  className="shh-btn shh-btn--secondary"
                  onClick={() => router.push('/onboarding-application')}
                >
                  Back to Application
                </button>

                {isReadyForContracts ? (
                  <button
                    type="button"
                    className="shh-btn shh-btn--primary"
                    onClick={() => router.push('/onboarding-contracts')}
                  >
                    Continue to Contracts
                  </button>
                ) : (
                  <button type="button" className="shh-btn shh-btn--disabled" disabled>
                    Continue to Contracts
                  </button>
                )}
              </div>

              {!isReadyForContracts ? (
                <p className="shh-warning">
                  Complete all required uploads and portal forms to continue to the contracts
                  step.
                </p>
              ) : null}
              </section>
            </>
          )}
        </section>
      </div>

      <style jsx>{`
        .shh-docs-page {
          min-height: 100vh;
          background: #f8fafc;
        }

        .shh-docs-shell {
          max-width: 1200px;
          margin: 0 auto;
          padding: 32px 16px 80px;
        }

        .shh-card {
          border: 1px solid rgb(226 232 240);
          background: white;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .shh-step-banner {
          margin-bottom: 24px;
          display: flex;
          justify-content: center;
        }

        .shh-step-banner-pill {
          border-radius: 999px;
          border: 1px solid rgb(153 246 228);
          background: white;
          padding: 8px 16px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgb(71 85 105);
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
        }

        .shh-step-grid {
          margin-bottom: 16px;
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(6, minmax(0, 1fr));
        }

        .shh-step-pill {
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 14px 16px;
          text-align: center;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgb(148 163 184);
          text-decoration: none;
          transition: 0.2s ease;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .shh-step-pill.is-complete {
          border-color: rgb(13 148 136);
          background: rgb(15 118 110);
          color: white;
          box-shadow: 0 16px 32px rgba(15, 118, 110, 0.16);
        }

        .shh-step-pill.is-current {
          border-color: rgb(15 118 110);
          background: linear-gradient(to bottom right, rgb(236 254 255), white);
          color: rgb(15 23 42);
          box-shadow: 0 16px 32px rgba(15, 118, 110, 0.12);
        }

        .shh-hero-card {
          overflow: hidden;
          border-radius: 28px;
          border: 1px solid rgba(165, 243, 252, 0.7);
          background: radial-gradient(circle at top left, rgba(224, 247, 244, 1) 0%, rgba(255, 255, 255, 1) 58%);
          padding: 32px;
          box-shadow: 0 24px 60px rgba(14, 116, 144, 0.12);
        }

        .shh-hero-inner {
          margin: 0 auto;
          max-width: 850px;
          text-align: center;
        }

        .shh-badge {
          display: inline-flex;
          align-items: center;
          margin-bottom: 12px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: rgb(15 118 110);
        }

        .shh-title {
          margin: 0;
          font-size: clamp(32px, 4vw, 40px);
          font-weight: 800;
          letter-spacing: -0.03em;
          color: rgb(15 23 42);
        }

        .shh-subtitle {
          margin: 16px auto 0;
          max-width: 760px;
          font-size: 16px;
          line-height: 1.7;
          color: rgb(71 85 105);
        }

        .shh-hero-divider {
          margin: 24px auto 0;
          height: 6px;
          width: 80px;
          border-radius: 999px;
          background: rgb(15 118 110);
        }

        .shh-hero-note {
          margin: 24px auto 0;
          max-width: 760px;
          font-size: 14px;
          line-height: 1.8;
          color: rgb(100 116 139);
        }

        .shh-content-grid {
          margin-top: 32px;
          display: grid;
          gap: 24px;
          grid-template-columns: 1.05fr 2fr;
        }

        .shh-progress-card {
          height: fit-content;
          border-radius: 24px;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 24px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .shh-progress-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgb(100 116 139);
        }

        .shh-progress-count {
          margin-top: 12px;
          font-size: 36px;
          font-weight: 800;
          color: rgb(15 23 42);
        }

        .shh-progress-copy {
          margin-top: 8px;
          font-size: 14px;
          color: rgb(71 85 105);
        }

        .shh-progress-track {
          margin-top: 20px;
          overflow: hidden;
          border-radius: 999px;
          background: rgb(241 245 249);
        }

        .shh-progress-bar {
          height: 12px;
          border-radius: 999px;
          background: rgb(15 118 110);
          transition: width 0.3s ease;
        }

        .shh-progress-percent {
          margin-top: 10px;
          font-size: 14px;
          font-weight: 700;
          color: rgb(15 118 110);
        }

        .shh-progress-breakdown {
          margin-top: 16px;
          border-radius: 16px;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
          padding: 12px 14px;
        }

        .shh-progress-breakdown-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 13px;
          color: rgb(71 85 105);
        }

        .shh-progress-breakdown-row + .shh-progress-breakdown-row {
          margin-top: 8px;
        }

        .shh-progress-breakdown-row--total {
          font-weight: 700;
          color: rgb(15 23 42);
        }

        .shh-progress-badge {
          margin-top: 18px;
          display: inline-flex;
          border-radius: 999px;
          background: rgb(254 243 199);
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgb(146 64 14);
        }

        .shh-progress-badge.is-complete {
          background: rgb(240 253 250);
          color: rgb(15 118 110);
        }

        .shh-progress-checklist {
          margin-top: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .shh-progress-section {
          border-radius: 16px;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
          padding: 14px;
        }

        .shh-progress-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgb(51 65 85);
        }

        .shh-progress-section-list {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .shh-progress-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .shh-progress-item-label {
          min-width: 0;
          font-size: 13px;
          line-height: 1.5;
          color: rgb(71 85 105);
        }

        .shh-progress-item-status {
          flex-shrink: 0;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .shh-progress-item-status.is-complete {
          background: rgb(240 253 250);
          color: rgb(15 118 110);
        }

        .shh-progress-item-status.is-missing {
          background: rgb(254 242 242);
          color: rgb(185 28 28);
        }

        .shh-reminder-box {
          margin-top: 24px;
          border-radius: 16px;
          border: 1px solid rgb(253 230 138);
          background: rgb(255 251 235);
          padding: 16px;
        }

        .shh-reminder-title {
          font-size: 14px;
          font-weight: 700;
          color: rgb(120 53 15);
        }

        .shh-reminder-copy {
          margin: 8px 0 0;
          font-size: 14px;
          line-height: 1.7;
          color: rgb(146 64 14);
        }

        .shh-session-card {
          margin-top: 24px;
          border-radius: 16px;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
          padding: 16px;
        }

        .shh-session-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgb(100 116 139);
        }

        .shh-session-value {
          margin-top: 8px;
          word-break: break-all;
          font-size: 14px;
          color: rgb(71 85 105);
        }

        .shh-doc-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .shh-doc-card {
          border-radius: 24px;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 20px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          transition: 0.2s ease;
        }

        .shh-doc-card.is-uploaded {
          border-color: rgb(153 246 228);
          box-shadow: 0 0 0 1px rgba(204, 251, 241, 1);
        }

        .shh-doc-card--portal {
          padding: 24px;
        }

        .shh-doc-main {
          display: flex;
          gap: 20px;
          justify-content: space-between;
          align-items: flex-start;
        }

        .shh-doc-main--portal {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(360px, 520px);
          gap: 24px;
          align-items: flex-start;
        }

        .shh-doc-copy-wrap {
          min-width: 0;
          flex: 1;
        }

        .shh-doc-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .shh-doc-type,
        .shh-doc-category,
        .shh-doc-complete {
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }

        .shh-doc-type {
          background: rgb(241 245 249);
          color: rgb(71 85 105);
        }

        .shh-doc-category {
          background: rgb(236 254 255);
          color: rgb(8 145 178);
        }

        .shh-doc-complete {
          background: rgb(240 253 250);
          color: rgb(15 118 110);
        }

        .shh-doc-title {
          margin: 16px 0 0;
          font-size: 24px;
          font-weight: 700;
          color: rgb(15 23 42);
        }

        .shh-doc-copy {
          margin: 14px 0 0;
          max-width: 700px;
          font-size: 14px;
          line-height: 1.8;
          color: rgb(71 85 105);
        }

        .shh-doc-status-text {
          margin: 14px 0 0;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgb(100 116 139);
        }

        .shh-doc-action-card {
          width: 100%;
          max-width: 320px;
          border-radius: 16px;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
          padding: 16px;
        }

        .shh-doc-action-card--form {
          max-width: 520px;
        }

        .shh-doc-action-card--tb {
          max-width: 520px;
        }

        .shh-status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .shh-status-pill.is-uploaded {
          background: rgb(240 253 250);
          color: rgb(15 118 110);
        }

        .shh-status-pill.is-missing {
          background: rgb(254 242 242);
          color: rgb(185 28 28);
        }

        .shh-upload-wrap {
          margin-top: 16px;
        }

        .shh-handbook-note {
          margin: 12px 0 0;
          font-size: 13px;
          line-height: 1.7;
          color: rgb(100 116 139);
        }

        .shh-portal-form {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .shh-agreement-block {
          border-radius: 16px;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
          padding: 14px;
        }

        .shh-agreement-label {
          margin-bottom: 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgb(100 116 139);
        }

        .shh-agreement-copy {
          font-size: 13px;
          line-height: 1.75;
          color: rgb(51 65 85);
        }

        .shh-agreement-copy p {
          margin: 0;
        }

        .shh-agreement-copy p + p {
          margin-top: 12px;
        }

        .shh-form-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .shh-form-section-title {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgb(100 116 139);
        }

        .shh-checkbox-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .shh-checkbox-card {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          border-radius: 16px;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 14px;
          cursor: pointer;
        }

        .shh-checkbox-input {
          margin-top: 2px;
          height: 16px;
          width: 16px;
          accent-color: rgb(15 118 110);
        }

        .shh-checkbox-copy {
          font-size: 13px;
          line-height: 1.7;
          color: rgb(51 65 85);
        }

        .shh-form-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .shh-form-label {
          font-size: 13px;
          font-weight: 700;
          color: rgb(51 65 85);
        }

        .shh-form-input,
        .shh-form-textarea {
          width: 100%;
          border-radius: 16px;
          border: 1px solid rgb(203 213 225);
          background: white;
          padding: 12px 14px;
          font-size: 14px;
          color: rgb(15 23 42);
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .shh-form-input:focus,
        .shh-form-textarea:focus {
          border-color: rgb(20 184 166);
          box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.12);
        }

        .shh-form-textarea {
          resize: vertical;
          min-height: 110px;
        }

        .shh-form-message {
          border-radius: 14px;
          padding: 12px 14px;
          font-size: 13px;
          line-height: 1.6;
        }

        .shh-form-message--success {
          border: 1px solid rgb(167 243 208);
          background: rgb(240 253 250);
          color: rgb(15 118 110);
        }

        .shh-form-message--error {
          border: 1px solid rgb(254 202 202);
          background: rgb(254 242 242);
          color: rgb(185 28 28);
        }

        .shh-next-step-card {
          margin-top: 32px;
          border-radius: 24px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .shh-next-step-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgb(100 116 139);
        }

        .shh-next-step-title {
          margin: 10px 0 0;
          font-size: 30px;
          font-weight: 700;
          color: rgb(15 23 42);
        }

        .shh-note {
          margin: 12px 0 0;
          max-width: 760px;
          font-size: 14px;
          line-height: 1.8;
          color: rgb(71 85 105);
        }

        .shh-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          align-items: center;
          justify-content: space-between;
        }

        .shh-btn {
          min-height: 54px;
          padding: 0 22px;
          border-radius: 999px;
          border: none;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: 0.2s ease;
        }

        .shh-btn--link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          text-decoration: none;
        }

        .shh-btn--secondary {
          border: 1px solid rgb(203 213 225);
          background: white;
          color: rgb(51 65 85);
        }

        .shh-btn--primary {
          background: rgb(15 118 110);
          color: white;
          box-shadow: 0 16px 36px rgba(15, 118, 110, 0.28);
        }

        .shh-btn--disabled {
          cursor: not-allowed;
          background: rgb(226 232 240);
          color: rgb(100 116 139);
        }

        .shh-btn--refresh {
          margin-top: 20px;
          width: 100%;
          border: 1px solid rgb(203 213 225);
          background: white;
          color: rgb(51 65 85);
        }

        .shh-alert {
          margin-top: 20px;
          border-radius: 16px;
          border: 1px solid rgb(254 202 202);
          background: rgb(254 242 242);
          padding: 16px;
          font-size: 14px;
          color: rgb(185 28 28);
        }

        .shh-required {
          color: rgb(220 38 38);
        }

        .shh-warning {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
          color: rgb(185 28 28);
        }

        @media (max-width: 1024px) {
          .shh-step-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .shh-content-grid {
            grid-template-columns: 1fr;
          }

          .shh-doc-main {
            flex-direction: column;
          }

          .shh-doc-main--portal {
            grid-template-columns: 1fr;
          }

          .shh-doc-action-card {
            max-width: none;
          }
        }

        @media (max-width: 768px) {
          .shh-hero-card,
          .shh-card {
            padding: 22px;
            border-radius: 24px;
          }

          .shh-step-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .shh-hero-card {
            padding: 28px 22px;
          }

          .shh-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .shh-btn {
            width: 100%;
          }

          .shh-next-step-title {
            font-size: 26px;
          }

          .shh-doc-card--portal {
            padding: 20px;
          }
        }
      `}</style>
    </main>
  )
}
