import Image from 'next/image'
import { MarketingFinalCtaStrip } from './MarketingFinalCtaStrip'
import { MarketingSiteFooter } from './MarketingSiteFooter'
import { MarketingSiteHeader } from './MarketingSiteHeader'
import { MarketingStickyMobileCta } from './MarketingStickyMobileCta'
import { PHONE_DISPLAY, TEL } from './marketing-constants'
import './marketing-home.css'

/** Local asset in /public/marketing/ or override with NEXT_PUBLIC_MARKETING_HERO_URL */
const HERO_IMAGE_SRC =
  process.env.NEXT_PUBLIC_MARKETING_HERO_URL || '/marketing/hero-home.jpg'

type Service = {
  tag: string
  tagIcon: string
  title: string
  body: string
  meta: string
  featured?: boolean
}

const SERVICES: Service[] = [
  {
    tag: 'Wound Care',
    tagIcon: '✚',
    title: 'Advanced Wound Care',
    body: 'Dressing changes and monitoring for chronic, surgical, and diabetic wounds—by skilled nurses at home.',
    meta: 'Infection awareness and teaching to support healing and avoid readmissions.',
    featured: true,
  },
  {
    tag: 'Nursing',
    tagIcon: 'RN',
    title: 'Skilled Nursing',
    body: 'Assessments, injections, vitals, and med teaching with clear updates to your physician.',
    meta: 'Education for patients and families on managing conditions safely at home.',
    featured: true,
  },
  {
    tag: 'Therapy',
    tagIcon: 'PT',
    title: 'Physical Therapy',
    body: 'Strength, balance, and mobility after surgery or illness—without travel to a clinic.',
    meta: 'Home safety checks and practical steps to reduce fall risk.',
    featured: true,
  },
  {
    tag: 'Therapy',
    tagIcon: 'OT',
    title: 'Occupational Therapy',
    body: 'Daily living skills—dressing, bathing, meal prep—so independence stays within reach.',
    meta: 'Energy-saving strategies and home setup tips.',
  },
  {
    tag: 'Therapy',
    tagIcon: 'ST',
    title: 'Speech Therapy',
    body: 'Speech, language, cognition, and swallowing support after stroke or illness.',
    meta: 'Focused on communication, safety, and confidence.',
  },
  {
    tag: 'Specialty',
    tagIcon: '◎',
    title: 'Catheter & Ostomy Care',
    body: 'Hands-on care, skin checks, and teaching for comfort and infection prevention.',
    meta: 'Respectful, step-by-step support for you and caregivers.',
  },
  {
    tag: 'Meds',
    tagIcon: 'Rx',
    title: 'Medication Management',
    body: 'Reviews and teaching to help you take the right dose at the right time.',
    meta: 'Fewer mix-ups and clearer communication with your doctor.',
  },
  {
    tag: 'Support',
    tagIcon: 'MSW',
    title: 'Medical Social Work',
    body: 'Resources, planning, and emotional support for families navigating complex care.',
    meta: 'Help with programs, paperwork, and next steps.',
  },
  {
    tag: 'Care',
    tagIcon: '♥',
    title: 'Home Health Aide Support',
    body: 'Personal care tasks under professional direction—safety and dignity first.',
    meta: 'Aligned with your plan of care from nursing and therapy.',
  },
]

export function MarketingHome() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div id="top" className="shh-home-page">
        <MarketingSiteHeader />

        <section className="shh-hero" aria-labelledby="hero-heading">
          <div className="shh-hero-inner">
            <div className="shh-hero-heading">
              <div className="shh-pill">
                <span aria-hidden>✧</span>
                Medicare-Certified Home Health · Greater Phoenix
              </div>
              <h1 id="hero-heading">
                Skilled Nursing, Wound Care &amp; Therapy{' '}
                <span>at Home</span>
              </h1>
              <p className="shh-hero-sub">
                We bring skilled nursing, wound care, and therapy to you—often within 24–48 hours after
                eligibility and orders—so you can recover safely with your doctor’s team guiding every
                visit.
              </p>
              <ul className="shh-hero-list">
                <li>Care at home under your physician’s orders</li>
                <li>Fast coordination—we handle the follow-up with your doctor’s office</li>
                <li>Medicare-friendly coverage for eligible home health services</li>
              </ul>
              <div className="shh-hero-coverage">
                <strong>Now accepting Medicare patients.</strong>
                <span>Medicare Advantage, AHCCCS &amp; Veterans—in progress.</span>
              </div>
              <div className="shh-hero-phone-row">
                <a className="shh-hero-phone-link" href={TEL}>
                  Call {PHONE_DISPLAY}
                </a>
              </div>
              <div className="shh-hero-cta">
                <a className="shh-btn-primary" href={TEL}>
                  Start care — call now
                </a>
                <a className="shh-btn-secondary" href="/services">
                  View services
                </a>
                <p className="shh-hero-cta-note">
                  We’ll check eligibility, explain Medicare coverage, and coordinate next steps with your
                  doctor.
                </p>
              </div>
            </div>

            <aside className="shh-hero-card" aria-labelledby="card-title">
              <div className="shh-hero-card-header">
                <div className="shh-hero-halo" aria-hidden>
                  ☁
                </div>
                <div>
                  <h3 id="card-title">Talk with a nurse-led team</h3>
                  <p>Quick answers—no pressure.</p>
                </div>
              </div>
              <ul>
                <li>See if home health fits your situation</li>
                <li>Review recent hospital or clinic visits</li>
                <li>Understand how Medicare may cover care at home</li>
              </ul>
              <div className="shh-hero-card-footer">
                <div className="shh-hero-phone">
                  Tempe-based intake:{' '}
                  <a href={TEL}>{PHONE_DISPLAY}</a>
                </div>
                <div className="shh-hero-note">
                  Same-day or next-day start may be possible once orders are received.
                </div>
              </div>
            </aside>
          </div>

          <div className="shh-hero-media">
            <Image
              src={HERO_IMAGE_SRC}
              alt="Caregiver supporting an older adult at home"
              fill
              sizes="(max-width: 768px) 100vw, min(1120px, 100vw)"
              className="object-cover shh-hero-media-img"
              priority
            />
          </div>
        </section>

        <section className="shh-stats" aria-label="Highlights">
          <div className="shh-stat-card">
            <div className="shh-stat-label">Where we serve</div>
            <div className="shh-stat-value">Greater Phoenix &amp; beyond</div>
            <div className="shh-stat-text">
              Tempe-based clinicians across Maricopa, Pinal, Gila, Yavapai, and Pima counties.
            </div>
          </div>
          <div className="shh-stat-card">
            <div className="shh-stat-label">Type of care</div>
            <div className="shh-stat-value">Skilled home health</div>
            <div className="shh-stat-text">
              Nursing, wound care, PT, OT, ST, MSW, and more—ordered by your physician.
            </div>
          </div>
          <div className="shh-stat-card">
            <div className="shh-stat-label">Getting started</div>
            <div className="shh-stat-value">Fast start of care</div>
            <div className="shh-stat-text">
              Many patients begin within 24–48 hours after eligibility and orders are confirmed.
            </div>
          </div>
        </section>

        <section className="shh-section" id="services" aria-labelledby="services-title">
          <div className="shh-services-intro">
            <div className="shh-section-header shh-services-intro-text">
              <div className="shh-section-kicker">Our services</div>
              <h2 className="shh-section-title" id="services-title">
                Skilled care where you live
              </h2>
              <p className="shh-section-text">
                Hospital-level oversight in the comfort of home. Your plan is built with your doctor and
                adjusted as you improve.
              </p>
            </div>
            <div className="shh-services-intro-figure">
              <Image
                src="/marketing/wound-care.jpg"
                alt="Skilled nurse providing wound care at home"
                fill
                sizes="(max-width: 767px) 100vw, (max-width: 1100px) 52vw, 560px"
                className="object-cover shh-services-intro-img"
              />
            </div>
          </div>

          <div className="shh-therapy-visual">
            <div className="shh-therapy-visual-img">
              <Image
                src="/marketing/therapy.jpg"
                alt=""
                fill
                sizes="(max-width: 639px) 148px, 168px"
                className="object-cover"
              />
            </div>
          </div>

          <div className="shh-service-grid">
            {SERVICES.map((s) => (
              <article
                key={s.title}
                className={[
                  'shh-service-card',
                  s.featured ? 'shh-service-card--featured' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="shh-service-tag">
                  <span aria-hidden>{s.tagIcon}</span> {s.tag}
                </div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <div className="shh-service-meta">{s.meta}</div>
              </article>
            ))}
          </div>

          <div className="shh-services-footer">
            <a className="shh-btn-secondary" href="/contact#form">
              Request intake help
            </a>
            <span>Questions about coverage or orders? We’ll walk you through it.</span>
          </div>
        </section>

        <section
          className="shh-section shh-section--ambient-bg"
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <div className="shh-section-header">
            <div className="shh-section-kicker">How it works</div>
            <h2 className="shh-section-title" id="how-title">
              Medicare home health at a glance
            </h2>
            <p className="shh-section-text">
              Home health is medical care at home under your doctor’s direction. If you qualify, Medicare
              often covers approved services at <strong>100%</strong>.
            </p>
          </div>

          <div className="shh-steps">
            <div className="shh-step">
              <div className="shh-step-number">Step 1</div>
              <h3>Call us</h3>
              <p>Share a few details about your health and recent visits.</p>
            </div>
            <div className="shh-step">
              <div className="shh-step-number">Step 2</div>
              <h3>We verify eligibility</h3>
              <p>We review Medicare coverage and whether home health is appropriate.</p>
            </div>
            <div className="shh-step">
              <div className="shh-step-number">Step 3</div>
              <h3>We coordinate with your doctor</h3>
              <p>We work to obtain the physician orders needed to start care.</p>
            </div>
            <div className="shh-step">
              <div className="shh-step-number">Step 4</div>
              <h3>Care starts at home</h3>
              <p>A nurse or therapist visits, completes your assessment, and begins care.</p>
            </div>
          </div>

          <p className="shh-steps-note">
            We’re accepting <strong>Medicare</strong> today and are actively contracting Medicare Advantage,
            AHCCCS, and Veterans programs—ask us about your plan.
          </p>
        </section>

        <section className="shh-section" id="why-saintly" aria-labelledby="why-title">
          <div className="shh-trust-intro">
            <div className="shh-section-header shh-trust-intro-text">
              <div className="shh-section-kicker">Why families choose us</div>
              <h2 className="shh-section-title" id="why-title">
                Clinical skill with a human touch
              </h2>
              <p className="shh-section-text">
                Clear communication, honest timelines, and respect in every visit—for families and patients
                alike.
              </p>
            </div>
            <div className="shh-trust-intro-figure">
              <Image
                src="/marketing/trust.jpg"
                alt="Clinician and patient sharing a warm moment at home"
                fill
                sizes="(max-width: 767px) 100vw, (max-width: 1100px) 55vw, 620px"
                className="object-cover shh-trust-intro-img"
              />
            </div>
          </div>

          <div className="shh-reasons-grid">
            <article className="shh-reason">
              <h3>Medicare-certified agency</h3>
              <p>
                Tempe-based, serving Greater Phoenix with strong clinical standards and compliance you can
                trust.
              </p>
            </article>
            <article className="shh-reason">
              <h3>Experienced local clinicians</h3>
              <p>
                RNs, therapists, and support staff who know the community and coordinate closely with your
                physicians.
              </p>
            </article>
            <article className="shh-reason">
              <h3>Values rooted in dignity</h3>
              <p>
                “Saintly” reflects how we show up—honest, patient, and professional—meeting people where
                they are.
              </p>
            </article>
            <article className="shh-reason">
              <h3>Safety &amp; independence</h3>
              <p>
                We monitor changes early, teach what matters, and help you stay home safely whenever
                possible.
              </p>
            </article>
          </div>
        </section>

        <section className="shh-section" id="coverage" aria-labelledby="area-title">
          <div className="shh-section-header">
            <div className="shh-section-kicker">Service area</div>
            <h2 className="shh-section-title" id="area-title">
              Greater Phoenix &amp; surrounding counties
            </h2>
            <p className="shh-section-text">
              Based in Tempe—serving Maricopa, Pinal, Gila, Yavapai, and Pima counties.
            </p>
          </div>

          <div className="shh-area">
            <p className="shh-section-text" style={{ marginBottom: 12 }}>
              Communities we often serve include:
            </p>
            <div className="shh-area-list">
              {[
                'Tempe',
                'Phoenix',
                'Mesa',
                'Chandler',
                'Gilbert',
                'Scottsdale',
                'Glendale',
                'Peoria',
                'Goodyear',
                'Avondale',
                'Surprise',
                'Queen Creek',
                'Tucson',
                'Casa Grande',
                'Prescott',
                'Prescott Valley',
                'Cottonwood',
                'Surrounding areas',
              ].map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <p className="shh-section-text" style={{ marginTop: 14 }}>
              Not sure about your address? Call—we’ll confirm coverage quickly.
            </p>
          </div>
        </section>

        <section className="shh-section" id="employment" aria-labelledby="employment-title">
          <div className="shh-caregiver">
            <div>
              <h2 id="employment-title">Careers at Saintly</h2>
              <p>
                We hire nurses, therapists (PT, OT, ST), medical social workers, and home health aides who
                want meaningful work in patients’ homes across Greater Phoenix.
              </p>
              <p className="shh-caregiver-meta">
                Full-time, part-time, and PRN opportunities—clinical growth with a team that cares.
              </p>
            </div>
            <div className="shh-caregiver-right">
              <a className="shh-btn-secondary" href="/employment">
                Apply today
              </a>
              <span>Staff applicants: use our secure application flow.</span>
            </div>
          </div>
        </section>

        <MarketingFinalCtaStrip />

        <MarketingSiteFooter />
      </div>

      <MarketingStickyMobileCta />
    </div>
  )
}
