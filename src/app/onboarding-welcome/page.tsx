'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import OnboardingApplicantFromQuery from '../../components/OnboardingApplicantFromQuery'
import OnboardingProgressSync from '../../components/OnboardingProgressSync'
import OnboardingApplicantIdentity from '../../components/OnboardingApplicantIdentity'

export default function OnboardingWelcomePage() {
  const router = useRouter()

  return (
    <main className="shh-page">
      <Suspense fallback={null}>
        <OnboardingApplicantFromQuery />
      </Suspense>
      <OnboardingProgressSync sessionStarted />
      <section className="shh-shell">
        <div className="shh-step-banner">
          <div className="shh-step-banner-pill">Employee Onboarding · Step 1 of 6</div>
        </div>

        <OnboardingApplicantIdentity />

        <div className="shh-step-grid">
          {[
            { label: '1. Welcome', href: '/onboarding-welcome', state: 'current' },
            { label: '2. Application', href: '/onboarding-application', state: 'upcoming' },
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

            <h1 className="shh-title">Welcome to Saintly Home Health</h1>

            <p className="shh-subtitle">
              This secure onboarding portal will guide you through each required step so your
              employment file is complete, compliant, and ready for approval.
            </p>
            <p className="shh-reassurance">
              Most applicants complete onboarding in 10–15 minutes.
            </p>

            <div className="shh-hero-divider" />

            <p className="shh-hero-note">
              Welcome — Getting Started. We&apos;ll guide you step by step through your application,
              document uploads, agreements, and training so your file is ready for review.
            </p>

            <div className="shh-hero-actions">
              <div className="shh-primary-wrap">
                <button
                  type="button"
                  className="shh-btn shh-btn--primary"
                  onClick={() => router.push('/onboarding-application')}
                >
                  Start Application
                </button>
                <p className="shh-primary-subtext">Takes about 5 minutes to begin</p>
              </div>

              <button
                type="button"
                className="shh-btn shh-btn--secondary"
                onClick={() => router.push('/')}
              >
                Back to Home
              </button>
            </div>
          </div>
        </section>

        <section className="shh-card">
          <div className="shh-grid">
            <div className="shh-panel">
              <h2 className="shh-section-title">What to Expect</h2>
              <ul className="shh-list">
                <li>Complete your employment application</li>
                <li>Upload required compliance and credential documents</li>
                <li>Review and sign required policies and agreements</li>
                <li>Complete onboarding training and annual requirements</li>
                <li>Submit your onboarding packet for final approval</li>
              </ul>
            </div>

            <div className="shh-panel">
              <h2 className="shh-section-title">What You Should Have Ready</h2>
              <ul className="shh-list">
                <li>Government-issued ID</li>
                <li>Social Security card</li>
                <li>Professional license (if applicable)</li>
                <li>CPR/BLS certification</li>
                <li>Driver&apos;s license</li>
                <li>Auto insurance (if field staff)</li>
                <li>TB documentation (initial test + annual statement)</li>
                <li>Fingerprint clearance card (if required)</li>
                <li>Resume (for clinical staff)</li>
              </ul>
            </div>
          </div>

          <div className="shh-compliance-box">
            <h3 className="shh-compliance-title">Important Compliance Notice</h3>
            <p className="shh-compliance-copy">
              All required documents must be submitted before you can be activated as an
              employee. Missing items will delay your start date.
            </p>
          </div>

          <div className="shh-note">
            Your progress is saved as you move through onboarding. You can leave and return later if
            needed.
          </div>
        </section>
      </section>

      <style jsx>{`
        .shh-page {
          min-height: 100vh;
          background: #f8fafc;
        }

        .shh-shell {
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
          border-radius: 999px;
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

        .shh-hero-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-top: 28px;
        }

        .shh-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 22px;
          margin-top: 0;
        }

        .shh-panel {
          padding: 28px;
          border-radius: 24px;
          border: 1px solid rgb(226 232 240);
          background: white;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .shh-section-title {
          margin: 0 0 14px;
          font-size: 24px;
          font-weight: 800;
          color: rgb(15 23 42);
        }

        .shh-list {
          margin: 0;
          padding-left: 20px;
          color: rgb(71 85 105);
          line-height: 1.9;
          font-size: 16px;
        }

        .shh-compliance-box {
          margin-top: 22px;
          border-radius: 24px;
          border: 1px solid rgb(253 230 138);
          background: rgb(255 251 235);
          padding: 22px 24px;
        }

        .shh-compliance-title {
          margin: 0;
          font-size: 18px;
          font-weight: 700;
          color: rgb(120 53 15);
        }

        .shh-compliance-copy {
          margin: 8px 0 0;
          font-size: 14px;
          line-height: 1.7;
          color: rgb(146 64 14);
        }

        .shh-note {
          margin-top: 22px;
          border-radius: 22px;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
          padding: 20px 22px;
          font-size: 14px;
          line-height: 1.8;
          color: rgb(71 85 105);
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
          border: 1px solid rgb(203 213 225);
          background: white;
          color: rgb(51 65 85);
        }

        .shh-btn--primary {
          background: rgb(15 118 110);
          color: white;
          box-shadow: 0 16px 36px rgba(15, 118, 110, 0.28);
          min-height: 60px;
          padding: 0 28px;
          font-size: 14px;
        }

        .shh-primary-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .shh-primary-subtext {
          margin: 0;
          font-size: 13px;
          font-weight: 700;
          color: rgb(100 116 139);
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

          .shh-grid {
            grid-template-columns: 1fr;
          }

          .shh-hero-actions {
            flex-direction: column;
            align-items: stretch;
          }

          .shh-btn {
            width: 100%;
          }

          .shh-primary-wrap {
            align-items: stretch;
          }
        }
      `}</style>
    </main>
  )
}
