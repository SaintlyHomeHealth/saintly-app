'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    position: '',
    license_number: '',
    years_experience: '',
    preferred_hours: '',
    available_start_date: '',
  })

  useEffect(() => {
    const loadApplicant = async () => {
      const savedEmail = localStorage.getItem('applicant_email')
      if (!savedEmail) return

      const { data } = await supabase
        .from('applicants')
        .select('*')
        .eq('email', savedEmail)
        .maybeSingle()

      if (data) {
        if (data.id) {
          localStorage.setItem('applicantId', data.id)
        }

        setForm({
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          zip: data.zip || '',
          position: data.position || '',
          license_number: data.license_number || '',
          years_experience: data.years_experience || '',
          preferred_hours: data.preferred_hours || '',
          available_start_date: data.available_start_date || '',
        })
      }
    }

    loadApplicant()
  }, [])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const saveApplicant = async () => {
    localStorage.setItem('applicant_email', form.email)

    const { data, error } = await supabase
      .from('applicants')
      .upsert(
        {
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone: form.phone,
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
          position: form.position,
          license_number: form.license_number,
          years_experience: form.years_experience,
          preferred_hours: form.preferred_hours,
          available_start_date: form.available_start_date,
        },
        {
          onConflict: 'email',
        }
      )
      .select('id')
      .single()

    if (data?.id) {
      localStorage.setItem('applicantId', data.id)
    }

    return { data, error }
  }

  const handleStep1Save = async () => {
    setLoading(true)
    setMessage('')

    const { error } = await saveApplicant()

    setLoading(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('')
    setStep(2)
  }

  const handleStep2Save = async () => {
    setLoading(true)
    setMessage('')

    const { error } = await saveApplicant()

    setLoading(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('')
    setStep(3)
  }

  const handleStep3Save = async () => {
    setLoading(true)
    setMessage('')

    const { error } = await saveApplicant()

    setLoading(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Application saved successfully.')
    setStep(4)
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Saintly Application</h1>

      {step === 1 && (
        <div style={{ marginTop: '24px' }}>
          <h2>Step 1: Personal Information</h2>

          <input
            name="first_name"
            placeholder="First Name"
            value={form.first_name}
            onChange={handleChange}
            style={inputStyle}
          />
          <input
            name="last_name"
            placeholder="Last Name"
            value={form.last_name}
            onChange={handleChange}
            style={inputStyle}
          />
          <input
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            style={inputStyle}
          />
          <input
            name="phone"
            placeholder="Phone"
            value={form.phone}
            onChange={handleChange}
            style={inputStyle}
          />

          <button onClick={handleStep1Save} disabled={loading} style={buttonStyle}>
            {loading ? 'Saving...' : 'Save & Continue'}
          </button>

          {message && <p style={{ marginTop: 16 }}>{message}</p>}
        </div>
      )}

      {step === 2 && (
        <div style={{ marginTop: '24px' }}>
          <h2>Step 2: Additional Information</h2>

          <input
            name="address"
            placeholder="Address"
            value={form.address}
            onChange={handleChange}
            style={inputStyle}
          />
          <input
            name="city"
            placeholder="City"
            value={form.city}
            onChange={handleChange}
            style={inputStyle}
          />
          <input
            name="state"
            placeholder="State"
            value={form.state}
            onChange={handleChange}
            style={inputStyle}
          />
          <input
            name="zip"
            placeholder="Zip Code"
            value={form.zip}
            onChange={handleChange}
            style={inputStyle}
          />

          <select
            name="position"
            value={form.position}
            onChange={handleChange}
            style={inputStyle}
          >
            <option value="">Select Position</option>
            <option value="RN">RN</option>
            <option value="LVN">LVN</option>
            <option value="PT">PT</option>
            <option value="OT">OT</option>
            <option value="HHA">HHA</option>
          </select>

          <div style={{ marginTop: '12px' }}>
            <button
              onClick={() => setStep(1)}
              style={{ ...buttonStyle, marginRight: '10px' }}
            >
              Back
            </button>
            <button onClick={handleStep2Save} disabled={loading} style={buttonStyle}>
              {loading ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>

          {message && <p style={{ marginTop: 16 }}>{message}</p>}
        </div>
      )}

      {step === 3 && (
        <div style={{ marginTop: '24px' }}>
          <h2>Step 3: Work & License Info</h2>

          <input
            name="license_number"
            placeholder="License Number"
            value={form.license_number}
            onChange={handleChange}
            style={inputStyle}
          />

          <input
            name="years_experience"
            placeholder="Years of Experience"
            value={form.years_experience}
            onChange={handleChange}
            style={inputStyle}
          />

          <input
            name="preferred_hours"
            placeholder="Preferred Hours (Full-time, Part-time, PRN)"
            value={form.preferred_hours}
            onChange={handleChange}
            style={inputStyle}
          />

          <input
            name="available_start_date"
            placeholder="Available Start Date"
            value={form.available_start_date}
            onChange={handleChange}
            style={inputStyle}
          />

          <div style={{ marginTop: '12px' }}>
            <button
              onClick={() => setStep(2)}
              style={{ ...buttonStyle, marginRight: '10px' }}
            >
              Back
            </button>
            <button onClick={handleStep3Save} disabled={loading} style={buttonStyle}>
              {loading ? 'Saving...' : 'Finish Application'}
            </button>
          </div>

          {message && <p style={{ marginTop: 16 }}>{message}</p>}
        </div>
      )}

      {step === 4 && (
        <div style={{ marginTop: '24px' }}>
          <h2>Application Complete</h2>
          <p>Your applicant record has been saved successfully.</p>
          <p>You can now continue to the documents page.</p>
          <a
            href="/onboarding-documents"
            style={{
              display: 'inline-block',
              marginTop: '12px',
              padding: '12px 18px',
              borderRadius: '8px',
              background: '#0f766e',
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            Go to Documents
          </a>
        </div>
      )}
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '12px',
  padding: '12px',
  width: '320px',
  border: '1px solid #ccc',
  borderRadius: '8px',
}

const buttonStyle: React.CSSProperties = {
  padding: '12px 18px',
  borderRadius: '8px',
  border: 'none',
  cursor: 'pointer',
}