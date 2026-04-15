'use client'

import { ChangeEvent, FormEvent, Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import OnboardingApplicantFromQuery from '../../components/OnboardingApplicantFromQuery'
import OnboardingProgressSync from '../../components/OnboardingProgressSync'
import { supabase } from '../../lib/supabase/client'
import { syncOnboardingProgressForApplicant } from '../../lib/onboarding/sync-progress'
import OnboardingApplicantIdentity from '../../components/OnboardingApplicantIdentity'
import {
  CPR_BLS_STATUS_LABELS,
  isCprBlsStatusValue,
  normalizeCprBlsStatusFromDb,
  type CprBlsStatusValue,
} from '../../lib/cpr-bls-status'

type ApplicationFormData = {
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  position: string
  licenseNumber: string
  yearsExperience: string
  preferredHours: string
  availabilityStartDate: string
  typeOfPosition: string
  educationalLevel: string
  hasReliableTransportation: string
  canProvideTransportation: string
  driversLicenseState: string
  driversLicenseExpirationDate: string
  primaryDiscipline: string
  licenseCertificationNumber: string
  licenseIssuingState: string
  licenseExpirationDate: string
  cprBlsStatus: '' | CprBlsStatusValue
  cprExpirationDate: string
  otherCertifications: string
  hasConviction: string
  convictionExplanation: string
  hasLicenseDiscipline: string
  licenseDisciplineExplanation: string
  needsAccommodation: string
  accommodationExplanation: string
  attestationFullName: string
  attestationDate: string
  attestationAcknowledged: boolean
}

type WorkHistoryEntry = {
  employerName: string
  jobTitle: string
  cityState: string
  datesEmployed: string
  primaryDuties: string
  reasonForLeaving: string
}

type ReferenceEntry = {
  name: string
  relationship: string
  phone: string
  email: string
}

type EmergencyFormData = {
  contactName: string
  relationship: string
  phoneNumber: string
  secondaryContact: string
  medicalConditions: string
  allergies: string
  acknowledged: boolean
  fullName: string
  signedDate: string
}

type ApplicantRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  position?: string | null
  license_number?: string | null
  years_experience?: string | null
  preferred_hours?: string | null
  availability_start_date?: string | null
  type_of_position?: string | null
  educational_level?: string | null
  has_reliable_transportation?: boolean | null
  can_provide_transportation?: boolean | null
  drivers_license_state?: string | null
  drivers_license_expiration_date?: string | null
  primary_discipline?: string | null
  license_certification_number?: string | null
  license_issuing_state?: string | null
  license_expiration_date?: string | null
  cpr_bls_status?: string | null
  cpr_expiration_date?: string | null
  other_certifications?: string | null
  has_conviction?: boolean | null
  conviction_explanation?: string | null
  has_license_discipline?: boolean | null
  license_discipline_explanation?: string | null
  needs_accommodation?: boolean | null
  accommodation_explanation?: string | null
  attestation_full_name?: string | null
  attestation_date?: string | null
  attestation_acknowledged?: boolean | null
}

type WorkHistoryRow = {
  employer_name?: string | null
  job_title?: string | null
  city_state?: string | null
  dates_employed?: string | null
  primary_duties?: string | null
  reason_for_leaving?: string | null
}

type ReferenceRow = {
  name?: string | null
  relationship?: string | null
  phone?: string | null
  email?: string | null
}

type OnboardingContractsEmergencyRow = {
  emergency_contact_name?: string | null
  emergency_contact_relationship?: string | null
  emergency_contact_phone?: string | null
  emergency_contact_secondary?: string | null
  emergency_medical_conditions?: string | null
  emergency_allergies?: string | null
  emergency_acknowledged?: boolean | null
  emergency_full_name?: string | null
  emergency_signed_at?: string | null
}

const LOCAL_STORAGE_KEY = 'applicantId'

const defaultFormData: ApplicationFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  position: '',
  licenseNumber: '',
  yearsExperience: '',
  preferredHours: '',
  availabilityStartDate: '',
  typeOfPosition: '',
  educationalLevel: '',
  hasReliableTransportation: '',
  canProvideTransportation: '',
  driversLicenseState: '',
  driversLicenseExpirationDate: '',
  primaryDiscipline: '',
  licenseCertificationNumber: '',
  licenseIssuingState: '',
  licenseExpirationDate: '',
  cprBlsStatus: '',
  cprExpirationDate: '',
  otherCertifications: '',
  hasConviction: '',
  convictionExplanation: '',
  hasLicenseDiscipline: '',
  licenseDisciplineExplanation: '',
  needsAccommodation: '',
  accommodationExplanation: '',
  attestationFullName: '',
  attestationDate: '',
  attestationAcknowledged: false,
}

const defaultEmergencyForm: EmergencyFormData = {
  contactName: '',
  relationship: '',
  phoneNumber: '',
  secondaryContact: '',
  medicalConditions: '',
  allergies: '',
  acknowledged: false,
  fullName: '',
  signedDate: '',
}

function createBlankWorkHistoryEntry(): WorkHistoryEntry {
  return {
    employerName: '',
    jobTitle: '',
    cityState: '',
    datesEmployed: '',
    primaryDuties: '',
    reasonForLeaving: '',
  }
}

function createBlankReferenceEntry(): ReferenceEntry {
  return {
    name: '',
    relationship: '',
    phone: '',
    email: '',
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as {
      message?: string
      details?: string
      hint?: string
      code?: string
    }

    return (
      maybeError.message ||
      maybeError.details ||
      maybeError.hint ||
      maybeError.code ||
      'Something went wrong while saving the application.'
    )
  }

  return 'Something went wrong while saving the application.'
}

function toYesNo(value: unknown) {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (v === 'true' || v === 't' || v === 'yes' || v === 'y' || v === '1') return 'yes'
    if (v === 'false' || v === 'f' || v === 'no' || v === 'n' || v === '0') return 'no'
  }
  if (value === 1) return 'yes'
  if (value === 0) return 'no'
  return ''
}

function fromYesNo(value: string) {
  if (value === 'yes') return true
  if (value === 'no') return false
  return null
}

function ensureMinimumEntries<T>(items: T[], minimum: number, createItem: () => T) {
  if (items.length >= minimum) return items
  return [...items, ...Array.from({ length: minimum - items.length }, createItem)]
}

function isWorkHistoryEntryBlank(entry: WorkHistoryEntry) {
  return !Object.values(entry).some((value) => value.trim())
}

function isWorkHistoryEntryComplete(entry: WorkHistoryEntry) {
  return Boolean(
    entry.employerName.trim() &&
      entry.jobTitle.trim() &&
      entry.cityState.trim() &&
      entry.datesEmployed.trim() &&
      entry.primaryDuties.trim() &&
      entry.reasonForLeaving.trim()
  )
}

function isReferenceEntryBlank(entry: ReferenceEntry) {
  return !Object.values(entry).some((value) => value.trim())
}

function isReferenceEntryComplete(entry: ReferenceEntry) {
  return Boolean(
    entry.name.trim() &&
      entry.relationship.trim() &&
      entry.phone.trim() &&
      entry.email.trim()
  )
}

function hasValue(value: string) {
  return value.trim().length > 0
}

export default function OnboardingApplicationPage() {
  const router = useRouter()

  const [formData, setFormData] = useState<ApplicationFormData>(defaultFormData)
  const [workHistory, setWorkHistory] = useState<WorkHistoryEntry[]>([
    createBlankWorkHistoryEntry(),
    createBlankWorkHistoryEntry(),
  ])
  const [references, setReferences] = useState<ReferenceEntry[]>([
    createBlankReferenceEntry(),
    createBlankReferenceEntry(),
  ])
  const [emergencyForm, setEmergencyForm] = useState<EmergencyFormData>(defaultEmergencyForm)
  const [applicantId, setApplicantId] = useState('')
  const [isHydrating, setIsHydrating] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    const loadApplicant = async () => {
      try {
        const savedApplicantId = localStorage.getItem(LOCAL_STORAGE_KEY) || ''

        if (!savedApplicantId) {
          setIsHydrating(false)
          return
        }

        setApplicantId(savedApplicantId)

        const [
          { data: applicantData, error: applicantError },
          { data: workHistoryData, error: workHistoryError },
          { data: referenceData, error: referenceError },
          { data: emergencyData, error: emergencyError },
        ] = await Promise.all([
          supabase
            .from('applicants')
            .select(
              `
                id,
                first_name,
                last_name,
                email,
                phone,
                address,
                city,
                state,
                zip,
                position,
                license_number,
                years_experience,
                preferred_hours,
                availability_start_date,
                type_of_position,
                educational_level,
                has_reliable_transportation,
                can_provide_transportation,
                drivers_license_state,
                drivers_license_expiration_date,
                primary_discipline,
                license_certification_number,
                license_issuing_state,
                license_expiration_date,
                cpr_bls_status,
                cpr_expiration_date,
                other_certifications,
                has_conviction,
                conviction_explanation,
                has_license_discipline,
                license_discipline_explanation,
                needs_accommodation,
                accommodation_explanation,
                attestation_full_name,
                attestation_date,
                attestation_acknowledged
              `
            )
            .eq('id', savedApplicantId)
            .maybeSingle<ApplicantRow>(),
          supabase
            .from('applicant_work_history')
            .select(
              'employer_name, job_title, city_state, dates_employed, primary_duties, reason_for_leaving'
            )
            .eq('applicant_id', savedApplicantId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('applicant_references')
            .select('name, relationship, phone, email')
            .eq('applicant_id', savedApplicantId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('onboarding_contracts')
            .select(
              `
                emergency_contact_name,
                emergency_contact_relationship,
                emergency_contact_phone,
                emergency_contact_secondary,
                emergency_medical_conditions,
                emergency_allergies,
                emergency_acknowledged,
                emergency_full_name,
                emergency_signed_at
              `
            )
            .eq('applicant_id', savedApplicantId)
            .maybeSingle<OnboardingContractsEmergencyRow>(),
        ])

        if (applicantError) {
          console.error('Error loading applicant:', applicantError)
          setIsHydrating(false)
          return
        }

        if (workHistoryError) {
          console.error('Error loading work history:', workHistoryError)
        }

        if (referenceError) {
          console.error('Error loading references:', referenceError)
        }

        if (emergencyError) {
          console.error('Error loading emergency form:', emergencyError)
        }

        if (!applicantData) {
          localStorage.removeItem(LOCAL_STORAGE_KEY)
          setApplicantId('')
          setIsHydrating(false)
          return
        }

        setFormData({
          firstName: applicantData.first_name ?? '',
          lastName: applicantData.last_name ?? '',
          email: applicantData.email ?? '',
          phone: applicantData.phone ?? '',
          address: applicantData.address ?? '',
          city: applicantData.city ?? '',
          state: applicantData.state ?? '',
          zip: applicantData.zip ?? '',
          position: applicantData.position ?? '',
          licenseNumber: applicantData.license_number ?? '',
          yearsExperience: applicantData.years_experience ?? '',
          preferredHours: applicantData.preferred_hours ?? '',
          availabilityStartDate: applicantData.availability_start_date ?? '',
          typeOfPosition: applicantData.type_of_position ?? '',
          educationalLevel: applicantData.educational_level ?? '',
          hasReliableTransportation: toYesNo(applicantData.has_reliable_transportation),
          canProvideTransportation: toYesNo(applicantData.can_provide_transportation),
          driversLicenseState: applicantData.drivers_license_state ?? '',
          driversLicenseExpirationDate: applicantData.drivers_license_expiration_date ?? '',
          primaryDiscipline: applicantData.primary_discipline ?? '',
          licenseCertificationNumber: applicantData.license_certification_number ?? '',
          licenseIssuingState: applicantData.license_issuing_state ?? '',
          licenseExpirationDate: applicantData.license_expiration_date ?? '',
          cprBlsStatus: normalizeCprBlsStatusFromDb(applicantData.cpr_bls_status),
          cprExpirationDate: applicantData.cpr_expiration_date ?? '',
          otherCertifications: applicantData.other_certifications ?? '',
          hasConviction: toYesNo(applicantData.has_conviction),
          convictionExplanation: applicantData.conviction_explanation ?? '',
          hasLicenseDiscipline: toYesNo(applicantData.has_license_discipline),
          licenseDisciplineExplanation: applicantData.license_discipline_explanation ?? '',
          needsAccommodation: toYesNo(applicantData.needs_accommodation),
          accommodationExplanation: applicantData.accommodation_explanation ?? '',
          attestationFullName: applicantData.attestation_full_name ?? '',
          attestationDate: applicantData.attestation_date ?? '',
          attestationAcknowledged: Boolean(applicantData.attestation_acknowledged),
        })

        const normalizedWorkHistory = ((workHistoryData || []) as WorkHistoryRow[]).map((row) => ({
          employerName: row.employer_name ?? '',
          jobTitle: row.job_title ?? '',
          cityState: row.city_state ?? '',
          datesEmployed: row.dates_employed ?? '',
          primaryDuties: row.primary_duties ?? '',
          reasonForLeaving: row.reason_for_leaving ?? '',
        }))

        setWorkHistory(
          ensureMinimumEntries(normalizedWorkHistory, 2, createBlankWorkHistoryEntry)
        )

        const normalizedReferences = ((referenceData || []) as ReferenceRow[]).map((row) => ({
          name: row.name ?? '',
          relationship: row.relationship ?? '',
          phone: row.phone ?? '',
          email: row.email ?? '',
        }))

        setReferences(
          ensureMinimumEntries(normalizedReferences, 2, createBlankReferenceEntry)
        )

        setEmergencyForm({
          contactName: emergencyData?.emergency_contact_name ?? '',
          relationship: emergencyData?.emergency_contact_relationship ?? '',
          phoneNumber: emergencyData?.emergency_contact_phone ?? '',
          secondaryContact: emergencyData?.emergency_contact_secondary ?? '',
          medicalConditions: emergencyData?.emergency_medical_conditions ?? '',
          allergies: emergencyData?.emergency_allergies ?? '',
          acknowledged: Boolean(emergencyData?.emergency_acknowledged),
          fullName: emergencyData?.emergency_full_name ?? '',
          signedDate: emergencyData?.emergency_signed_at
            ? emergencyData.emergency_signed_at.slice(0, 10)
            : '',
        })
      } catch (error) {
        console.error('Hydration error:', error)
      } finally {
        setIsHydrating(false)
      }
    }

    loadApplicant()
  }, [])

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name } = event.target
    const nextValue =
      event.target instanceof HTMLInputElement && event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value

    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: nextValue,
      }

      if (name === 'hasConviction' && nextValue !== 'yes') {
        return { ...next, convictionExplanation: '' }
      }
      if (name === 'hasLicenseDiscipline' && nextValue !== 'yes') {
        return { ...next, licenseDisciplineExplanation: '' }
      }
      if (name === 'needsAccommodation' && nextValue !== 'yes') {
        return { ...next, accommodationExplanation: '' }
      }
      if (name === 'cprBlsStatus' && nextValue !== 'active') {
        return { ...next, cprExpirationDate: '' }
      }

      return next
    })
  }

  const updateWorkHistory = (
    index: number,
    field: keyof WorkHistoryEntry,
    value: string
  ) => {
    setWorkHistory((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry
      )
    )
  }

  const addWorkHistoryEntry = () => {
    setWorkHistory((prev) => [...prev, createBlankWorkHistoryEntry()])
  }

  const removeWorkHistoryEntry = (index: number) => {
    setWorkHistory((prev) =>
      prev.length <= 2 ? prev : prev.filter((_, entryIndex) => entryIndex !== index)
    )
  }

  const updateReference = (
    index: number,
    field: keyof ReferenceEntry,
    value: string
  ) => {
    setReferences((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry
      )
    )
  }

  const addReference = () => {
    setReferences((prev) => [...prev, createBlankReferenceEntry()])
  }

  const removeReference = (index: number) => {
    setReferences((prev) =>
      prev.length <= 2 ? prev : prev.filter((_, entryIndex) => entryIndex !== index)
    )
  }

  const isFormValid = useMemo(() => {
    const firstTwoWorkHistoryValid =
      workHistory.length >= 2 &&
      workHistory.slice(0, 2).every(isWorkHistoryEntryComplete)

    const optionalWorkHistoryValid = workHistory
      .slice(2)
      .every((entry) => isWorkHistoryEntryBlank(entry) || isWorkHistoryEntryComplete(entry))

    const firstTwoReferencesValid =
      references.length >= 2 &&
      references.slice(0, 2).every(isReferenceEntryComplete)

    const optionalReferencesValid = references
      .slice(2)
      .every((entry) => isReferenceEntryBlank(entry) || isReferenceEntryComplete(entry))

    return Boolean(
      formData.firstName.trim() &&
        formData.lastName.trim() &&
        formData.email.trim() &&
        formData.phone.trim() &&
        formData.address.trim() &&
        formData.city.trim() &&
        formData.state.trim() &&
        formData.zip.trim() &&
        formData.position.trim() &&
        formData.typeOfPosition.trim() &&
        formData.educationalLevel.trim() &&
        formData.hasReliableTransportation &&
        formData.canProvideTransportation &&
        formData.driversLicenseState.trim() &&
        formData.driversLicenseExpirationDate &&
        formData.primaryDiscipline.trim() &&
        formData.licenseCertificationNumber.trim() &&
        formData.licenseIssuingState.trim() &&
        formData.licenseExpirationDate &&
        isCprBlsStatusValue(formData.cprBlsStatus) &&
        (formData.cprBlsStatus !== 'active' || Boolean(formData.cprExpirationDate)) &&
        formData.hasConviction &&
        (formData.hasConviction === 'no' || formData.convictionExplanation.trim()) &&
        formData.hasLicenseDiscipline &&
        (formData.hasLicenseDiscipline === 'no' || formData.licenseDisciplineExplanation.trim()) &&
        formData.needsAccommodation &&
        (formData.needsAccommodation === 'no' || formData.accommodationExplanation.trim()) &&
        formData.attestationFullName.trim() &&
        formData.attestationDate &&
        formData.attestationAcknowledged &&
        emergencyForm.contactName.trim() &&
        emergencyForm.relationship.trim() &&
        emergencyForm.phoneNumber.trim() &&
        emergencyForm.acknowledged &&
        emergencyForm.fullName.trim() &&
        emergencyForm.signedDate &&
        firstTwoWorkHistoryValid &&
        optionalWorkHistoryValid &&
        firstTwoReferencesValid &&
        optionalReferencesValid
    )
  }, [formData, workHistory, references, emergencyForm])

  const applicationProgressGroups = useMemo(() => {
    const firstTwoWorkHistoryValid =
      workHistory.length >= 2 &&
      workHistory.slice(0, 2).every(isWorkHistoryEntryComplete)

    const optionalWorkHistoryValid = workHistory
      .slice(2)
      .every((entry) => isWorkHistoryEntryBlank(entry) || isWorkHistoryEntryComplete(entry))

    const firstTwoReferencesValid =
      references.length >= 2 &&
      references.slice(0, 2).every(isReferenceEntryComplete)

    const optionalReferencesValid = references
      .slice(2)
      .every((entry) => isReferenceEntryBlank(entry) || isReferenceEntryComplete(entry))

    const conductQuestionsComplete =
      !!formData.hasConviction &&
      (formData.hasConviction === 'no' || hasValue(formData.convictionExplanation)) &&
      !!formData.hasLicenseDiscipline &&
      (formData.hasLicenseDiscipline === 'no' ||
        hasValue(formData.licenseDisciplineExplanation)) &&
      !!formData.needsAccommodation &&
      (formData.needsAccommodation === 'no' || hasValue(formData.accommodationExplanation))

    const emergencyContactComplete =
      hasValue(emergencyForm.contactName) &&
      hasValue(emergencyForm.relationship) &&
      hasValue(emergencyForm.phoneNumber) &&
      emergencyForm.acknowledged &&
      hasValue(emergencyForm.fullName) &&
      Boolean(emergencyForm.signedDate)

    return [
      {
        label: 'Personal Information',
        items: [
          {
            label: 'Full legal name',
            complete: hasValue(formData.firstName) && hasValue(formData.lastName),
          },
          {
            label: 'Contact information',
            complete: hasValue(formData.email) && hasValue(formData.phone),
          },
        ],
      },
      {
        label: 'Address & Eligibility',
        items: [
          {
            label: 'Current address',
            complete:
              hasValue(formData.address) &&
              hasValue(formData.city) &&
              hasValue(formData.state) &&
              hasValue(formData.zip),
          },
          {
            label: 'Position type and transportation',
            complete:
              hasValue(formData.typeOfPosition) &&
              !!formData.hasReliableTransportation &&
              !!formData.canProvideTransportation &&
              hasValue(formData.driversLicenseState) &&
              Boolean(formData.driversLicenseExpirationDate),
          },
          {
            label: 'Availability and screening questions',
            complete: conductQuestionsComplete,
          },
        ],
      },
      {
        label: 'Professional Background',
        items: [
          {
            label: 'Position applied for',
            complete: hasValue(formData.position),
          },
          {
            label: 'License / certification information',
            complete:
              hasValue(formData.primaryDiscipline) &&
              hasValue(formData.licenseCertificationNumber) &&
              hasValue(formData.licenseIssuingState) &&
              Boolean(formData.licenseExpirationDate) &&
              isCprBlsStatusValue(formData.cprBlsStatus) &&
              (formData.cprBlsStatus !== 'active' || Boolean(formData.cprExpirationDate)),
          },
          {
            label: 'Education',
            complete: hasValue(formData.educationalLevel),
          },
          {
            label: 'Employment history',
            complete: firstTwoWorkHistoryValid && optionalWorkHistoryValid,
          },
        ],
      },
      {
        label: 'References & Support',
        items: [
          {
            label: 'References',
            complete: firstTwoReferencesValid && optionalReferencesValid,
          },
          {
            label: 'Emergency contact and health acknowledgment',
            complete: emergencyContactComplete,
          },
        ],
      },
      {
        label: 'Final Review',
        items: [
          {
            label: 'Signature and certification',
            complete:
              hasValue(formData.attestationFullName) &&
              Boolean(formData.attestationDate) &&
              formData.attestationAcknowledged,
          },
        ],
      },
    ]
  }, [emergencyForm, formData, references, workHistory])

  const totalTrackedCount = applicationProgressGroups.reduce(
    (sum, group) => sum + group.items.length,
    0
  )
  const totalCompletedCount = applicationProgressGroups.reduce(
    (sum, group) => sum + group.items.filter((item) => item.complete).length,
    0
  )
  const progressPercent =
    totalTrackedCount === 0 ? 0 : Math.round((totalCompletedCount / totalTrackedCount) * 100)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setErrorMessage('')
    setSuccessMessage('')

    if (!isFormValid) {
      setErrorMessage('Please complete all required application fields before continuing.')
      return
    }

    setIsSubmitting(true)

    try {
      const payload = {
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        zip: formData.zip.trim(),
        position: formData.position.trim(),
        license_number: formData.licenseNumber.trim() || null,
        years_experience: formData.yearsExperience.trim() || null,
        preferred_hours: formData.preferredHours.trim() || null,
        availability_start_date: formData.availabilityStartDate || null,
        type_of_position: formData.typeOfPosition.trim() || null,
        educational_level: formData.educationalLevel.trim() || null,
        has_reliable_transportation: fromYesNo(formData.hasReliableTransportation),
        can_provide_transportation: fromYesNo(formData.canProvideTransportation),
        drivers_license_state: formData.driversLicenseState.trim() || null,
        drivers_license_expiration_date: formData.driversLicenseExpirationDate || null,
        primary_discipline: formData.primaryDiscipline.trim() || null,
        license_certification_number: formData.licenseCertificationNumber.trim() || null,
        license_issuing_state: formData.licenseIssuingState.trim() || null,
        license_expiration_date: formData.licenseExpirationDate || null,
        cpr_bls_status: isCprBlsStatusValue(formData.cprBlsStatus) ? formData.cprBlsStatus : null,
        cpr_expiration_date:
          formData.cprBlsStatus === 'active' && formData.cprExpirationDate
            ? formData.cprExpirationDate
            : null,
        other_certifications: formData.otherCertifications.trim() || null,
        has_conviction: fromYesNo(formData.hasConviction),
        conviction_explanation:
          formData.hasConviction === 'yes' ? formData.convictionExplanation.trim() || null : null,
        has_license_discipline: fromYesNo(formData.hasLicenseDiscipline),
        license_discipline_explanation:
          formData.hasLicenseDiscipline === 'yes'
            ? formData.licenseDisciplineExplanation.trim() || null
            : null,
        needs_accommodation: fromYesNo(formData.needsAccommodation),
        accommodation_explanation:
          formData.needsAccommodation === 'yes'
            ? formData.accommodationExplanation.trim() || null
            : null,
        attestation_full_name: formData.attestationFullName.trim() || null,
        attestation_date: formData.attestationDate || null,
        attestation_acknowledged: formData.attestationAcknowledged,
        status: 'application_completed',
        updated_at: new Date().toISOString(),
      }

      let finalApplicantId = applicantId

      if (applicantId) {
        const { error } = await supabase.from('applicants').update(payload).eq('id', applicantId)

        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('applicants')
          .insert(payload)
          .select('id')
          .single()

        if (error) throw error

        finalApplicantId = data.id
        setApplicantId(data.id)
        localStorage.setItem(LOCAL_STORAGE_KEY, data.id)
      }

      if (!finalApplicantId) {
        throw new Error('Applicant ID was not returned after save.')
      }

      const normalizedWorkHistory = workHistory
        .filter((entry) => !isWorkHistoryEntryBlank(entry))
        .map((entry, index) => ({
          applicant_id: finalApplicantId,
          sort_order: index,
          employer_name: entry.employerName.trim(),
          job_title: entry.jobTitle.trim(),
          city_state: entry.cityState.trim(),
          dates_employed: entry.datesEmployed.trim(),
          primary_duties: entry.primaryDuties.trim(),
          reason_for_leaving: entry.reasonForLeaving.trim(),
        }))

      const normalizedReferences = references
        .filter((entry) => !isReferenceEntryBlank(entry))
        .map((entry, index) => ({
          applicant_id: finalApplicantId,
          sort_order: index,
          name: entry.name.trim(),
          relationship: entry.relationship.trim(),
          phone: entry.phone.trim(),
          email: entry.email.trim().toLowerCase(),
        }))

      const emergencySignedAt = new Date(
        `${emergencyForm.signedDate}T12:00:00Z`
      ).toISOString()

      const { error: workHistoryDeleteError } = await supabase
        .from('applicant_work_history')
        .delete()
        .eq('applicant_id', finalApplicantId)

      if (workHistoryDeleteError) throw workHistoryDeleteError

      if (normalizedWorkHistory.length > 0) {
        const { error: workHistoryInsertError } = await supabase
          .from('applicant_work_history')
          .insert(normalizedWorkHistory)

        if (workHistoryInsertError) throw workHistoryInsertError
      }

      const { error: referencesDeleteError } = await supabase
        .from('applicant_references')
        .delete()
        .eq('applicant_id', finalApplicantId)

      if (referencesDeleteError) throw referencesDeleteError

      if (normalizedReferences.length > 0) {
        const { error: referencesInsertError } = await supabase
          .from('applicant_references')
          .insert(normalizedReferences)

        if (referencesInsertError) throw referencesInsertError
      }

      const { error: emergencyUpsertError } = await supabase
        .from('onboarding_contracts')
        .upsert(
          {
            applicant_id: finalApplicantId,
            emergency_contact_name: emergencyForm.contactName.trim(),
            emergency_contact_relationship: emergencyForm.relationship.trim(),
            emergency_contact_phone: emergencyForm.phoneNumber.trim(),
            emergency_contact_secondary: emergencyForm.secondaryContact.trim() || null,
            emergency_medical_conditions: emergencyForm.medicalConditions.trim() || null,
            emergency_allergies: emergencyForm.allergies.trim() || null,
            emergency_acknowledged: emergencyForm.acknowledged,
            emergency_full_name: emergencyForm.fullName.trim(),
            emergency_signed_at: emergencySignedAt,
          },
          { onConflict: 'applicant_id' }
        )

      if (emergencyUpsertError) throw emergencyUpsertError

      try {
        const { error: statusError } = await supabase.from('onboarding_status').upsert(
          {
            applicant_id: finalApplicantId,
            current_step: 3,
            application_completed: true,
          },
          { onConflict: 'applicant_id' }
        )

        if (statusError) {
          console.error('onboarding_status update failed:', statusError)
        }
      } catch (statusCatchError) {
        console.error('onboarding_status catch error:', statusCatchError)
      }

      void syncOnboardingProgressForApplicant(supabase, finalApplicantId, {})

      setSuccessMessage('Application saved successfully.')

      setTimeout(() => {
        router.push('/onboarding-documents')
      }, 400)
    } catch (error) {
      console.error('Application save error:', error)
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isHydrating) {
    return (
      <main className="shh-app-page">
        <section className="shh-app-shell">
          <div className="shh-loading-card">Loading application…</div>
        </section>

        <style jsx>{`
          .shh-app-page {
            min-height: 100vh;
            background: #f8fafc;
          }
          .shh-app-shell {
            max-width: 1200px;
            margin: 0 auto;
            padding: 32px 16px 80px;
          }
          .shh-loading-card {
            padding: 32px;
            border-radius: 24px;
            background: white;
            border: 1px solid rgb(226 232 240);
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
            color: rgb(15 23 42);
            font-size: 18px;
            font-weight: 700;
            text-align: center;
          }
        `}</style>
      </main>
    )
  }

  return (
    <main className="shh-app-page">
      <Suspense fallback={null}>
        <OnboardingApplicantFromQuery />
      </Suspense>
      <OnboardingProgressSync />
      <section className="shh-app-shell">
        <div className="shh-step-banner">
          <div className="shh-step-banner-pill">Employee Onboarding · Step 2 of 6</div>
        </div>

        <OnboardingApplicantIdentity />

        <div className="shh-step-grid">
          {[
            { label: '1. Welcome', href: '/onboarding-welcome', state: 'complete' },
            { label: '2. Application', href: '/onboarding-application', state: 'current' },
            { label: '3. Documents', href: '/onboarding-documents', state: 'upcoming' },
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

        <section className="shh-hero-card">
          <div className="shh-hero-inner">
            <div className="shh-badge">Welcome to Saintly Home Health</div>
            <h1 className="shh-title">Employment Application</h1>
            <p className="shh-subtitle">
              Please complete the information below so our team can review your qualifications,
              confirm your role, and prepare your onboarding packet.
            </p>
            <p className="shh-reassurance">
              Your progress is saved automatically as you move through onboarding.
            </p>

            <div className="shh-hero-divider" />

            <p className="shh-hero-note">
              Application — Employment Details. Complete the required fields below to move forward
              to your document packet.
            </p>
          </div>
        </section>

        <form className="shh-form-card" onSubmit={handleSubmit}>
          <div className="shh-content-grid">
            <aside className="shh-progress-card">
              <div className="shh-progress-label">Application Progress</div>

              <div className="shh-progress-count">{totalCompletedCount}/{totalTrackedCount}</div>

              <p className="shh-progress-copy">Required application sections completed</p>

              <div className="shh-progress-track">
                <div className="shh-progress-bar" style={{ width: `${progressPercent}%` }} />
              </div>

              <div className="shh-progress-percent">{progressPercent}% complete</div>

              <div className="shh-progress-breakdown">
                {applicationProgressGroups.map((group) => {
                  const completedCount = group.items.filter((item) => item.complete).length

                  return (
                    <div key={group.label} className="shh-progress-breakdown-row">
                      <span>{group.label}</span>
                      <span>
                        {completedCount}/{group.items.length}
                      </span>
                    </div>
                  )
                })}
                <div className="shh-progress-breakdown-row shh-progress-breakdown-row--total">
                  <span>Total</span>
                  <span>
                    {totalCompletedCount}/{totalTrackedCount}
                  </span>
                </div>
              </div>

              <div className={`shh-progress-badge ${isFormValid ? 'is-complete' : ''}`}>
                {isFormValid ? 'Ready to Continue' : 'Application Incomplete'}
              </div>

              <div className="shh-progress-checklist">
                {applicationProgressGroups.map((group) => {
                  const completedCount = group.items.filter((item) => item.complete).length

                  return (
                    <div key={group.label} className="shh-progress-section">
                      <div className="shh-progress-section-header">
                        <span>{group.label}</span>
                        <span>
                          {completedCount}/{group.items.length}
                        </span>
                      </div>

                      <div className="shh-progress-section-list">
                        {group.items.map((item) => (
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
                  )
                })}
              </div>

              <div className="shh-reminder-box">
                <div className="shh-reminder-title">Before you continue</div>
                <p className="shh-reminder-copy">
                  Complete each required application section before moving to documents.
                </p>
              </div>

              {applicantId ? (
                <div className="shh-session-card">
                  <div className="shh-session-label">Session</div>
                  <div className="shh-session-value">{applicantId}</div>
                </div>
              ) : null}
            </aside>

            <div>
              <div className="shh-section-header">
                <h2>Applicant Information</h2>
                <p>Please fill out all required fields to continue to the documents step.</p>
                <p className="shh-step-reinforcement">Step 2 of 6 — Application</p>
              </div>

              <div className="shh-form-groups">
                <section className="shh-group-card">
              <div className="shh-group-header">
                <p className="shh-group-eyebrow">Section 1</p>
                <h3 className="shh-group-title">Personal Information</h3>
                <p className="shh-group-description">
                  Provide your legal name as it appears on your identification.
                </p>
              </div>

              <div className="shh-grid">
                <div className="shh-field">
                  <label htmlFor="firstName">
                    First Name <span className="shh-required">*</span>
                  </label>
                  <input id="firstName" name="firstName" value={formData.firstName} onChange={handleChange} />
                </div>

                <div className="shh-field">
                  <label htmlFor="lastName">
                    Last Name <span className="shh-required">*</span>
                  </label>
                  <input id="lastName" name="lastName" value={formData.lastName} onChange={handleChange} />
                </div>
              </div>
            </section>

            <section className="shh-group-card">
              <div className="shh-group-header">
                <p className="shh-group-eyebrow">Section 2</p>
                <h3 className="shh-group-title">Contact Information</h3>
                <p className="shh-group-description">
                  Enter the best contact details for scheduling and communication.
                </p>
              </div>

              <div className="shh-grid">
                <div className="shh-field">
                  <label htmlFor="email">
                    Email <span className="shh-required">*</span>
                  </label>
                  <input id="email" name="email" type="email" value={formData.email} onChange={handleChange} />
                </div>

                <div className="shh-field">
                  <label htmlFor="phone">
                    Phone <span className="shh-required">*</span>
                  </label>
                  <input id="phone" name="phone" value={formData.phone} onChange={handleChange} />
                </div>

                <div className="shh-field shh-field--full">
                  <label htmlFor="address">
                    Address <span className="shh-required">*</span>
                  </label>
                  <input id="address" name="address" value={formData.address} onChange={handleChange} />
                </div>

                <div className="shh-field">
                  <label htmlFor="city">
                    City <span className="shh-required">*</span>
                  </label>
                  <input id="city" name="city" value={formData.city} onChange={handleChange} />
                </div>

                <div className="shh-field">
                  <label htmlFor="state">
                    State <span className="shh-required">*</span>
                  </label>
                  <input id="state" name="state" value={formData.state} onChange={handleChange} />
                </div>

                <div className="shh-field">
                  <label htmlFor="zip">
                    ZIP <span className="shh-required">*</span>
                  </label>
                  <input id="zip" name="zip" value={formData.zip} onChange={handleChange} />
                </div>
              </div>
            </section>

            <section className="shh-group-card">
              <div className="shh-group-header">
                <p className="shh-group-eyebrow">Section 3</p>
                <h3 className="shh-group-title">Position Information</h3>
                <p className="shh-group-description">
                  Tell us about your role, credentials, and professional experience.
                </p>
              </div>

              <div className="shh-grid">
                <div className="shh-field">
                  <label htmlFor="position">
                    Position Applying For <span className="shh-required">*</span>
                  </label>
                  <select id="position" name="position" value={formData.position} onChange={handleChange}>
                    <option value="">Select a position</option>
                    <option value="RN">RN</option>
                    <option value="LPN">LPN</option>
                    <option value="LVN">LVN</option>
                    <option value="CNA">CNA</option>
                    <option value="HHA">HHA</option>
                    <option value="PT">PT</option>
                    <option value="PTA">PTA</option>
                    <option value="OT">OT</option>
                    <option value="OTA">OTA</option>
                    <option value="ST">ST</option>
                    <option value="MSW">MSW</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="shh-field">
                  <label htmlFor="licenseNumber">License Number</label>
                  <input id="licenseNumber" name="licenseNumber" value={formData.licenseNumber} onChange={handleChange} />
                </div>

                <div className="shh-field">
                  <label htmlFor="yearsExperience">Years of Experience</label>
                  <input id="yearsExperience" name="yearsExperience" value={formData.yearsExperience} onChange={handleChange} />
                </div>
              </div>
            </section>

            <section className="shh-group-card">
              <div className="shh-group-header">
                <p className="shh-group-eyebrow">Section 4</p>
                <h3 className="shh-group-title">Work Availability</h3>
                <p className="shh-group-description">
                  Let us know your availability and preferred start date.
                </p>
              </div>

              <div className="shh-grid">
                <div className="shh-field">
                  <label htmlFor="preferredHours">Preferred Hours</label>
                  <input id="preferredHours" name="preferredHours" value={formData.preferredHours} onChange={handleChange} />
                </div>

                <div className="shh-field">
                  <label htmlFor="availabilityStartDate">Available Start Date</label>
                  <input
                    id="availabilityStartDate"
                    name="availabilityStartDate"
                    type="date"
                    value={formData.availabilityStartDate}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </section>

            <section className="shh-group-card">
              <div className="shh-group-header">
                <p className="shh-group-eyebrow">Section 5</p>
                <h3 className="shh-group-title">Work Eligibility & Transportation</h3>
                <p className="shh-group-description">
                  Confirm job type, education, and transportation readiness for field work.
                </p>
              </div>

              <div className="shh-grid">
                <div className="shh-field">
                  <label htmlFor="typeOfPosition">
                    Type of Position <span className="shh-required">*</span>
                  </label>
                  <input id="typeOfPosition" name="typeOfPosition" value={formData.typeOfPosition} onChange={handleChange} />
                </div>

                <div className="shh-field">
                  <label htmlFor="educationalLevel">
                    Educational Level <span className="shh-required">*</span>
                  </label>
                  <input id="educationalLevel" name="educationalLevel" value={formData.educationalLevel} onChange={handleChange} />
                </div>

                <div className="shh-field">
                  <label htmlFor="hasReliableTransportation">
                    Has Reliable Transportation? <span className="shh-required">*</span>
                  </label>
                  <select
                    id="hasReliableTransportation"
                    name="hasReliableTransportation"
                    value={formData.hasReliableTransportation}
                    onChange={handleChange}
                  >
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div className="shh-field">
                  <label htmlFor="canProvideTransportation">
                    Can You Provide Transportation if Needed? <span className="shh-required">*</span>
                  </label>
                  <select
                    id="canProvideTransportation"
                    name="canProvideTransportation"
                    value={formData.canProvideTransportation}
                    onChange={handleChange}
                  >
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div className="shh-field">
                  <label htmlFor="driversLicenseState">
                    Driver&apos;s License State <span className="shh-required">*</span>
                  </label>
                  <input id="driversLicenseState" name="driversLicenseState" value={formData.driversLicenseState} onChange={handleChange} />
                </div>

                <div className="shh-field">
                  <label htmlFor="driversLicenseExpirationDate">
                    DL Expiration Date <span className="shh-required">*</span>
                  </label>
                  <input
                    id="driversLicenseExpirationDate"
                    name="driversLicenseExpirationDate"
                    type="date"
                    value={formData.driversLicenseExpirationDate}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </section>

            <section className="shh-group-card">
              <div className="shh-group-header">
                <p className="shh-group-eyebrow">Section 6</p>
                <h3 className="shh-group-title">Professional Licensure & Certifications</h3>
                <p className="shh-group-description">
                  Capture discipline, license details, CPR/BLS status, and additional certifications.
                </p>
              </div>

              <div className="shh-grid">
                <div className="shh-field">
                  <label htmlFor="primaryDiscipline">
                    Primary Discipline <span className="shh-required">*</span>
                  </label>
                  <input id="primaryDiscipline" name="primaryDiscipline" value={formData.primaryDiscipline} onChange={handleChange} />
                </div>

                <div className="shh-field">
                  <label htmlFor="licenseCertificationNumber">
                    License / Certification Number <span className="shh-required">*</span>
                  </label>
                  <input
                    id="licenseCertificationNumber"
                    name="licenseCertificationNumber"
                    value={formData.licenseCertificationNumber}
                    onChange={handleChange}
                  />
                </div>

                <div className="shh-field">
                  <label htmlFor="licenseIssuingState">
                    Issuing State <span className="shh-required">*</span>
                  </label>
                  <input id="licenseIssuingState" name="licenseIssuingState" value={formData.licenseIssuingState} onChange={handleChange} />
                </div>

                <div className="shh-field">
                  <label htmlFor="licenseExpirationDate">
                    License Expiration Date <span className="shh-required">*</span>
                  </label>
                  <input
                    id="licenseExpirationDate"
                    name="licenseExpirationDate"
                    type="date"
                    value={formData.licenseExpirationDate}
                    onChange={handleChange}
                  />
                </div>

                <div className="shh-field">
                  <label htmlFor="cprBlsStatus">
                    CPR / BLS Status <span className="shh-required">*</span>
                  </label>
                  <select
                    id="cprBlsStatus"
                    name="cprBlsStatus"
                    value={formData.cprBlsStatus}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select</option>
                    <option value="active">{CPR_BLS_STATUS_LABELS.active}</option>
                    <option value="expired">{CPR_BLS_STATUS_LABELS.expired}</option>
                    <option value="not_certified">{CPR_BLS_STATUS_LABELS.not_certified}</option>
                  </select>
                </div>

                {formData.cprBlsStatus === 'active' ? (
                  <div className="shh-field">
                    <label htmlFor="cprExpirationDate">
                      CPR / BLS Expiration Date <span className="shh-required">*</span>
                    </label>
                    <input
                      id="cprExpirationDate"
                      name="cprExpirationDate"
                      type="date"
                      value={formData.cprExpirationDate}
                      onChange={handleChange}
                      required
                    />
                  </div>
                ) : null}

                <div className="shh-field shh-field--full">
                  <label htmlFor="otherCertifications">Other Certifications</label>
                  <textarea id="otherCertifications" name="otherCertifications" rows={4} value={formData.otherCertifications} onChange={handleChange} />
                </div>
              </div>
            </section>

            <section className="shh-group-card">
              <div className="shh-group-header shh-group-header--with-action">
                <div>
                  <p className="shh-group-eyebrow">Section 7</p>
                  <h3 className="shh-group-title">Work History</h3>
                  <p className="shh-group-description">
                    Provide at least two recent employers so our team can review your background.
                  </p>
                </div>
                <button type="button" className="shh-btn shh-btn--tertiary" onClick={addWorkHistoryEntry}>
                  Add Employer
                </button>
              </div>

              <div className="shh-subgroup-list">
                {workHistory.map((entry, index) => (
                  <div key={index} className="shh-subgroup-card">
                    <div className="shh-subgroup-head">
                      <h4 className="shh-subgroup-title">Employer {index + 1}</h4>
                      {workHistory.length > 2 ? (
                        <button
                          type="button"
                          className="shh-subgroup-remove"
                          onClick={() => removeWorkHistoryEntry(index)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <div className="shh-grid">
                      <div className="shh-field">
                        <label>Employer Name <span className="shh-required">*</span></label>
                        <input value={entry.employerName} onChange={(event) => updateWorkHistory(index, 'employerName', event.target.value)} />
                      </div>
                      <div className="shh-field">
                        <label>Job Title <span className="shh-required">*</span></label>
                        <input value={entry.jobTitle} onChange={(event) => updateWorkHistory(index, 'jobTitle', event.target.value)} />
                      </div>
                      <div className="shh-field">
                        <label>City / State <span className="shh-required">*</span></label>
                        <input value={entry.cityState} onChange={(event) => updateWorkHistory(index, 'cityState', event.target.value)} />
                      </div>
                      <div className="shh-field">
                        <label>Dates Employed <span className="shh-required">*</span></label>
                        <input value={entry.datesEmployed} onChange={(event) => updateWorkHistory(index, 'datesEmployed', event.target.value)} />
                      </div>
                      <div className="shh-field shh-field--full">
                        <label>Primary Duties <span className="shh-required">*</span></label>
                        <textarea rows={4} value={entry.primaryDuties} onChange={(event) => updateWorkHistory(index, 'primaryDuties', event.target.value)} />
                      </div>
                      <div className="shh-field shh-field--full">
                        <label>Reason for Leaving <span className="shh-required">*</span></label>
                        <textarea rows={3} value={entry.reasonForLeaving} onChange={(event) => updateWorkHistory(index, 'reasonForLeaving', event.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="shh-group-card">
              <div className="shh-group-header shh-group-header--with-action">
                <div>
                  <p className="shh-group-eyebrow">Section 8</p>
                  <h3 className="shh-group-title">Professional References</h3>
                  <p className="shh-group-description">
                    Provide at least two professional references we may contact.
                  </p>
                </div>
                <button type="button" className="shh-btn shh-btn--tertiary" onClick={addReference}>
                  Add Reference
                </button>
              </div>

              <div className="shh-subgroup-list">
                {references.map((entry, index) => (
                  <div key={index} className="shh-subgroup-card">
                    <div className="shh-subgroup-head">
                      <h4 className="shh-subgroup-title">Reference {index + 1}</h4>
                      {references.length > 2 ? (
                        <button
                          type="button"
                          className="shh-subgroup-remove"
                          onClick={() => removeReference(index)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <div className="shh-grid">
                      <div className="shh-field">
                        <label>Name <span className="shh-required">*</span></label>
                        <input value={entry.name} onChange={(event) => updateReference(index, 'name', event.target.value)} />
                      </div>
                      <div className="shh-field">
                        <label>Relationship <span className="shh-required">*</span></label>
                        <input value={entry.relationship} onChange={(event) => updateReference(index, 'relationship', event.target.value)} />
                      </div>
                      <div className="shh-field">
                        <label>Phone <span className="shh-required">*</span></label>
                        <input value={entry.phone} onChange={(event) => updateReference(index, 'phone', event.target.value)} />
                      </div>
                      <div className="shh-field">
                        <label>Email <span className="shh-required">*</span></label>
                        <input type="email" value={entry.email} onChange={(event) => updateReference(index, 'email', event.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="shh-group-card">
              <div className="shh-group-header">
                <p className="shh-group-eyebrow">Section 9</p>
                <h3 className="shh-group-title">Conduct Questions</h3>
                <p className="shh-group-description">
                  Answer these screening questions honestly so Saintly can review your file appropriately.
                </p>
              </div>

              <div className="shh-grid">
                <div className="shh-field">
                  <label htmlFor="hasConviction">
                    Have you ever been convicted of a felony or misdemeanor?{' '}
                    <span className="shh-required">*</span>
                  </label>
                  <select
                    id="hasConviction"
                    name="hasConviction"
                    value={formData.hasConviction}
                    onChange={handleChange}
                    required
                    aria-required="true"
                  >
                    <option value="">Select Yes or No</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div className="shh-field">
                  <label htmlFor="hasLicenseDiscipline">
                    Have you ever had any professional license suspended, revoked, or disciplined?{' '}
                    <span className="shh-required">*</span>
                  </label>
                  <select
                    id="hasLicenseDiscipline"
                    name="hasLicenseDiscipline"
                    value={formData.hasLicenseDiscipline}
                    onChange={handleChange}
                    required
                    aria-required="true"
                  >
                    <option value="">Select Yes or No</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div className="shh-field">
                  <label htmlFor="needsAccommodation">
                    Do you require any reasonable accommodations to perform job duties?{' '}
                    <span className="shh-required">*</span>
                  </label>
                  <select
                    id="needsAccommodation"
                    name="needsAccommodation"
                    value={formData.needsAccommodation}
                    onChange={handleChange}
                    required
                    aria-required="true"
                  >
                    <option value="">Select Yes or No</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                {formData.hasConviction === 'yes' ? (
                  <div className="shh-field shh-field--full">
                    <label htmlFor="convictionExplanation">
                      Conviction explanation <span className="shh-required">*</span>
                    </label>
                    <textarea
                      id="convictionExplanation"
                      name="convictionExplanation"
                      rows={4}
                      value={formData.convictionExplanation}
                      onChange={handleChange}
                      required
                      aria-required="true"
                    />
                  </div>
                ) : null}
                {formData.hasLicenseDiscipline === 'yes' ? (
                  <div className="shh-field shh-field--full">
                    <label htmlFor="licenseDisciplineExplanation">
                      License discipline explanation <span className="shh-required">*</span>
                    </label>
                    <textarea
                      id="licenseDisciplineExplanation"
                      name="licenseDisciplineExplanation"
                      rows={4}
                      value={formData.licenseDisciplineExplanation}
                      onChange={handleChange}
                      required
                      aria-required="true"
                    />
                  </div>
                ) : null}
                {formData.needsAccommodation === 'yes' ? (
                  <div className="shh-field shh-field--full">
                    <label htmlFor="accommodationExplanation">
                      Accommodation explanation <span className="shh-required">*</span>
                    </label>
                    <textarea
                      id="accommodationExplanation"
                      name="accommodationExplanation"
                      rows={4}
                      value={formData.accommodationExplanation}
                      onChange={handleChange}
                      required
                      aria-required="true"
                    />
                  </div>
                ) : null}
              </div>
            </section>

            <section className="shh-group-card">
              <div className="shh-group-header">
                <p className="shh-group-eyebrow">Section 10</p>
                <h3 className="shh-group-title">Applicant Attestation & Authorization</h3>
                <p className="shh-group-description">
                  Confirm the application information is accurate and authorize Saintly to review it.
                </p>
              </div>

              <div className="shh-grid">
                <div className="shh-field">
                  <label htmlFor="attestationFullName">
                    Typed Legal Name <span className="shh-required">*</span>
                  </label>
                  <input id="attestationFullName" name="attestationFullName" value={formData.attestationFullName} onChange={handleChange} />
                </div>
                <div className="shh-field">
                  <label htmlFor="attestationDate">
                    Date <span className="shh-required">*</span>
                  </label>
                  <input id="attestationDate" name="attestationDate" type="date" value={formData.attestationDate} onChange={handleChange} />
                </div>
                <label className="shh-checkbox-card shh-checkbox-card--full">
                  <input
                    type="checkbox"
                    name="attestationAcknowledged"
                    checked={formData.attestationAcknowledged}
                    onChange={handleChange}
                    className="shh-checkbox-input"
                  />
                  <span className="shh-checkbox-copy">
                    I certify that the information provided in this application is true,
                    complete, and accurate to the best of my knowledge.
                    <span className="shh-required"> *</span>
                  </span>
                </label>
              </div>
            </section>

            <section className="shh-group-card">
              <div className="shh-group-header">
                <p className="shh-group-eyebrow">Section 11</p>
                <h3 className="shh-group-title">Emergency Contact + Health Information</h3>
                <p className="shh-group-description">
                  Complete this intake section during the Application step. It still saves to the onboarding contracts record.
                </p>
              </div>

              <div className="shh-grid">
                <div className="shh-field">
                  <label>Emergency Contact Name <span className="shh-required">*</span></label>
                  <input value={emergencyForm.contactName} onChange={(event) => setEmergencyForm((prev) => ({ ...prev, contactName: event.target.value }))} />
                </div>
                <div className="shh-field">
                  <label>Relationship <span className="shh-required">*</span></label>
                  <input value={emergencyForm.relationship} onChange={(event) => setEmergencyForm((prev) => ({ ...prev, relationship: event.target.value }))} />
                </div>
                <div className="shh-field">
                  <label>Phone Number <span className="shh-required">*</span></label>
                  <input value={emergencyForm.phoneNumber} onChange={(event) => setEmergencyForm((prev) => ({ ...prev, phoneNumber: event.target.value }))} />
                </div>
                <div className="shh-field">
                  <label>Secondary Contact</label>
                  <input value={emergencyForm.secondaryContact} onChange={(event) => setEmergencyForm((prev) => ({ ...prev, secondaryContact: event.target.value }))} />
                </div>
                <div className="shh-field shh-field--full">
                  <label>Medical Conditions</label>
                  <textarea rows={3} value={emergencyForm.medicalConditions} onChange={(event) => setEmergencyForm((prev) => ({ ...prev, medicalConditions: event.target.value }))} />
                </div>
                <div className="shh-field shh-field--full">
                  <label>Allergies</label>
                  <textarea rows={3} value={emergencyForm.allergies} onChange={(event) => setEmergencyForm((prev) => ({ ...prev, allergies: event.target.value }))} />
                </div>
                <label className="shh-checkbox-card shh-checkbox-card--full">
                  <input
                    type="checkbox"
                    checked={emergencyForm.acknowledged}
                    onChange={(event) => setEmergencyForm((prev) => ({ ...prev, acknowledged: event.target.checked }))}
                    className="shh-checkbox-input"
                  />
                  <span className="shh-checkbox-copy">
                    I confirm that the emergency contact and health information above is accurate.
                    <span className="shh-required"> *</span>
                  </span>
                </label>
                <div className="shh-field">
                  <label>Full Legal Name <span className="shh-required">*</span></label>
                  <input value={emergencyForm.fullName} onChange={(event) => setEmergencyForm((prev) => ({ ...prev, fullName: event.target.value }))} />
                </div>
                <div className="shh-field">
                  <label>Date <span className="shh-required">*</span></label>
                  <input type="date" value={emergencyForm.signedDate} onChange={(event) => setEmergencyForm((prev) => ({ ...prev, signedDate: event.target.value }))} />
                </div>
              </div>
                </section>
              </div>

              {errorMessage ? <div className="shh-alert shh-alert--error">{errorMessage}</div> : null}
              {successMessage ? <div className="shh-alert shh-alert--success">{successMessage}</div> : null}

              <div className="shh-actions">
                <button type="button" className="shh-btn shh-btn--secondary" onClick={() => router.push('/onboarding-welcome')}>
                  Save & Continue Later
                </button>

                <button type="submit" className="shh-btn shh-btn--primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving Application...' : 'Save & Continue to Documents'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </section>

      <style jsx>{`
        .shh-app-page {
          min-height: 100vh;
          background: #f8fafc;
        }
        .shh-app-shell {
          max-width: 1200px;
          margin: 0 auto;
          padding: 32px 16px 80px;
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
          margin-bottom: 24px;
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
        .shh-reassurance {
          margin: 12px 0 0;
          font-size: 14px;
          font-weight: 700;
          color: rgb(15 118 110);
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
        .shh-form-card {
          background: white;
          border: 1px solid rgb(226 232 240);
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }
        .shh-section-header {
          margin-bottom: 28px;
        }
        .shh-section-header h2 {
          margin: 0;
          font-size: 28px;
          font-weight: 800;
          color: rgb(15 23 42);
        }
        .shh-section-header p {
          margin: 8px 0 0;
          color: rgb(71 85 105);
          line-height: 1.7;
          font-size: 15px;
        }
        .shh-content-grid {
          display: grid;
          gap: 24px;
          grid-template-columns: minmax(280px, 0.9fr) minmax(0, 2fr);
          align-items: start;
        }
        .shh-progress-card {
          border-radius: 24px;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
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
          background: rgb(226 232 240);
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
          background: white;
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
          background: white;
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
          background: white;
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
        .shh-step-reinforcement {
          margin: 10px 0 0;
          font-size: 12px;
          font-weight: 700;
          color: rgb(13 148 136);
        }
        .shh-form-groups {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .shh-group-card {
          padding: 24px;
          border-radius: 24px;
          background: rgb(248 250 252);
          border: 1px solid rgb(226 232 240);
        }
        .shh-group-header {
          margin-bottom: 18px;
        }
        .shh-group-header--with-action {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .shh-group-eyebrow {
          margin: 0 0 6px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgb(100 116 139);
        }
        .shh-group-title {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          color: rgb(15 23 42);
        }
        .shh-group-description {
          margin: 8px 0 0;
          font-size: 14px;
          line-height: 1.7;
          color: rgb(100 116 139);
        }
        .shh-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 20px;
        }
        .shh-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .shh-field--full {
          grid-column: 1 / -1;
        }
        .shh-field label {
          font-size: 14px;
          font-weight: 700;
          color: rgb(51 65 85);
        }
        .shh-required {
          margin-left: 4px;
          color: rgb(239 68 68);
        }
        .shh-field input,
        .shh-field select,
        .shh-field textarea {
          width: 100%;
          min-height: 54px;
          border-radius: 16px;
          border: 1px solid rgb(203 213 225);
          background: white;
          padding: 14px 16px;
          font-size: 15px;
          color: rgb(15 23 42);
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }
        .shh-field textarea {
          min-height: 120px;
          resize: vertical;
        }
        .shh-field input:focus,
        .shh-field select:focus,
        .shh-field textarea:focus {
          border-color: rgb(20 184 166);
          box-shadow: 0 0 0 4px rgba(20, 184, 166, 0.12);
          background: white;
        }
        .shh-subgroup-list {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .shh-subgroup-card {
          border-radius: 20px;
          border: 1px solid rgb(226 232 240);
          background: white;
          padding: 20px;
        }
        .shh-subgroup-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }
        .shh-subgroup-title {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: rgb(15 23 42);
        }
        .shh-subgroup-remove {
          border: none;
          background: transparent;
          color: rgb(185 28 28);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
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
        .shh-checkbox-card--full {
          grid-column: 1 / -1;
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
        .shh-alert {
          margin-top: 20px;
          padding: 14px 16px;
          border-radius: 16px;
          font-size: 14px;
          font-weight: 700;
        }
        .shh-alert--error {
          background: rgb(254 242 242);
          border: 1px solid rgb(254 202 202);
          color: rgb(185 28 28);
        }
        .shh-alert--success {
          background: rgb(240 253 250);
          border: 1px solid rgb(167 243 208);
          color: rgb(15 118 110);
        }
        .shh-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          margin-top: 28px;
          flex-wrap: wrap;
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
        .shh-btn--secondary {
          background: white;
          color: rgb(51 65 85);
          border: 1px solid rgb(203 213 225);
        }
        .shh-btn--primary {
          background: rgb(15 118 110);
          color: white;
          box-shadow: 0 16px 36px rgba(15, 118, 110, 0.28);
          min-height: 60px;
          padding: 0 28px;
          font-size: 14px;
        }
        .shh-btn--tertiary {
          background: rgb(240 253 250);
          color: rgb(15 118 110);
          border: 1px solid rgb(167 243 208);
          padding: 0 18px;
        }
        @media (max-width: 768px) {
          .shh-hero-card,
          .shh-form-card {
            padding: 22px;
            border-radius: 24px;
          }
          .shh-content-grid {
            grid-template-columns: 1fr;
          }
          .shh-progress-card {
            position: static;
          }
          .shh-step-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .shh-group-card {
            padding: 18px;
            border-radius: 20px;
          }
          .shh-grid {
            grid-template-columns: 1fr;
          }
          .shh-group-header--with-action,
          .shh-subgroup-head {
            flex-direction: column;
            align-items: stretch;
          }
          .shh-actions {
            flex-direction: column-reverse;
            align-items: stretch;
          }
          .shh-btn {
            width: 100%;
          }
        }
      `}</style>
    </main>
  )
}
