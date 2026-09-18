import { useState, type MouseEvent, type ReactNode } from 'react'
import {
  ArrowRight,
  CalendarCheck,
  DollarSign,
  ListChecks,
  PhoneCall,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'

import './warm-advisory.css'

/* ---------- data (mirrors the live site's catalog + copy) ---------- */

const PRACTICE_TYPES_LINE =
  'For chiropractic, acupuncture, dental, med spa & weight-loss practices'

const REACTIVATION_RATE = 0.05
const INACTIVE_MIN = 100
const INACTIVE_MAX = 5000
const INACTIVE_STEP = 100
const VALUE_MIN = 1000
const VALUE_MAX = 5000
const VALUE_STEP = 100

const STATS = [
  { value: '5–7x', label: 'cheaper than acquiring a new patient' },
  { value: '$0', label: 'in ad spend required' },
]

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Users,
    title: 'Your inactive patient files',
    body: 'Every practice has hundreds of past patients who drifted away — not because they were unhappy, but because life got busy and nobody checked in.',
  },
  {
    icon: PhoneCall,
    title: 'A proven reactivation system',
    body: 'Your front desk calls with a word-for-word interactive script that leads with genuine care — so patients feel valued, never sold to.',
  },
  {
    icon: CalendarCheck,
    title: 'Recovered revenue',
    body: 'Appointments get booked, follow-ups resurface automatically, and reactivation becomes a repeatable monthly process — not a one-time blitz.',
  },
]

const BENEFITS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: DollarSign,
    title: 'Money you already earned',
    body: 'Your inactive patient list is the highest-ROI asset you own. Reactivation taps revenue sitting in your database instead of paying to reach strangers.',
  },
  {
    icon: ShieldCheck,
    title: 'Reputation-safe by design',
    body: 'Most reactivation attempts sound like pushy sales calls. Our scripts are built around genuine care, protecting the trust your practice took years to build.',
  },
  {
    icon: ListChecks,
    title: 'No sales experience needed',
    body: 'The interactive script tells your team exactly what to say at every turn — including every common objection — so anyone at the front desk can do it.',
  },
  {
    icon: TrendingUp,
    title: 'Works for new services too',
    body: 'Launching a new service? Your existing and inactive patients are the easiest people to introduce it to — they already know and trust you.',
  },
]

const SERVICE_GROUPS = [
  {
    id: 'chiropractic',
    numeral: 'I',
    title: 'Chiropractic, Acupuncture & Wellness',
    audience: 'Chiropractic, acupuncture, and integrated wellness offices',
    services: [
      'Chiropractic',
      'Spinal Decompression',
      'Neuropathy',
      'Joint Pain',
      'Softwave / Shockwave',
      'Acupuncture',
      'Massage Therapy',
      'Gut Health',
      'ChiroThin & Weight Loss Programs',
    ],
  },
  {
    id: 'medspa',
    numeral: 'II',
    title: 'Med Spa & Aesthetics',
    audience: 'Med spas, aesthetic clinics, and cosmetic add-ons',
    services: [
      'Botox',
      'Skin Tightening',
      'Cellulite Reduction',
      'Red Light Body Contouring',
      'Laser Hair Removal',
      'Body Waxing',
      'GLP-1 & Weight Loss Programs',
    ],
  },
  {
    id: 'dental',
    numeral: 'III',
    title: 'Dental & Orthodontic',
    audience: 'General, cosmetic, and orthodontic practices',
    services: [
      'Clear Aligners',
      'Braces / Orthodontics',
      'Dental Implants',
      'Teeth Whitening',
    ],
  },
  {
    id: 'weight',
    numeral: 'IV',
    title: 'Weight Loss',
    audience: 'Chiropractic offices, med spas, and clinics',
    services: [
      'ChiroThin',
      'In-Office Weight Loss Programs',
      'GLP-1 Patients',
    ],
  },
]

/* ---------- helpers ---------- */

const stay = (e: MouseEvent<HTMLAnchorElement>) => e.preventDefault()

function money(n: number) {
  return '$' + Math.round(n).toLocaleString('en-US')
}
function pct(v: number, min: number, max: number) {
  return `${((v - min) / (max - min)) * 100}%`
}

/* ---------- pieces ---------- */

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/" onClick={stay} aria-label="Reactivation Power — Home" className="flex items-baseline gap-2 no-underline">
      <span
        className="wa-serif font-medium"
        style={{ fontSize: compact ? '1.25rem' : '1.5rem', color: 'var(--wa-ink)' }}
      >
        Reactivation
      </span>
      <span
        className="wa-serif italic font-light"
        style={{ fontSize: compact ? '1.25rem' : '1.5rem', color: 'var(--wa-copper)' }}
      >
        Power
      </span>
    </a>
  )
}

function Header() {
  const links = [
    { href: '/', label: 'Home', active: true },
    { href: '/how-it-works', label: 'How It Works', active: false },
    { href: '/login', label: 'Client Login', active: false },
  ]
  return (
    <header
      className="sticky top-0 z-40 backdrop-blur"
      style={{ background: 'rgba(245,239,228,0.86)', borderBottom: '1px solid var(--wa-rule)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-8">
        <Wordmark />
        <nav aria-label="Main" className="flex items-center gap-1 md:gap-5">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={stay}
              className="wa-link hidden text-sm font-medium sm:block"
              style={l.active ? { color: 'var(--wa-ink)' } : undefined}
            >
              {l.label}
            </a>
          ))}
          <a href="/schedule-a-call" onClick={stay} className="wa-btn wa-btn-ink" style={{ padding: '0.65rem 1.15rem', fontSize: '0.875rem' }}>
            Schedule a Call
          </a>
        </nav>
      </div>
    </header>
  )
}

function Calculator() {
  const [inactive, setInactive] = useState(1000)
  const [value, setValue] = useState(2000)
  const patients = Math.max(1, Math.round(inactive * REACTIVATION_RATE))
  const revenue = patients * value

  return (
    <div className="wa-card wa-rise flex flex-col gap-7 rounded-2xl p-7 md:p-9" style={{ animationDelay: '220ms' }}>
      <div className="flex flex-col gap-2">
        <p className="wa-eyebrow">Your revenue opportunity</p>
        <h2 className="wa-serif text-2xl font-medium leading-snug md:text-[1.75rem]">
          See what&apos;s hiding in your inactive patient list
        </h2>
        <p className="text-sm" style={{ color: 'var(--wa-ink-mute)' }}>
          Drag the sliders to match your practice.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="wa-inactive" className="text-sm font-medium" style={{ color: 'var(--wa-ink-soft)' }}>
            How many inactive patient files do you have?
          </label>
          <span className="wa-serif wa-tabular text-2xl font-medium" style={{ color: 'var(--wa-copper-deep)' }}>
            {inactive.toLocaleString('en-US')}
            {inactive >= INACTIVE_MAX ? '+' : ''}
          </span>
        </div>
        <input
          id="wa-inactive"
          type="range"
          min={INACTIVE_MIN}
          max={INACTIVE_MAX}
          step={INACTIVE_STEP}
          value={inactive}
          onChange={(e) => setInactive(Number(e.target.value))}
          className="wa-range"
          style={{ ['--wa-pct' as string]: pct(inactive, INACTIVE_MIN, INACTIVE_MAX) }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="wa-value" className="text-sm font-medium" style={{ color: 'var(--wa-ink-soft)' }}>
            What&apos;s a patient worth to you per year?
          </label>
          <span className="wa-serif wa-tabular text-2xl font-medium" style={{ color: 'var(--wa-copper-deep)' }}>
            {money(value)}
          </span>
        </div>
        <input
          id="wa-value"
          type="range"
          min={VALUE_MIN}
          max={VALUE_MAX}
          step={VALUE_STEP}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="wa-range"
          style={{ ['--wa-pct' as string]: pct(value, VALUE_MIN, VALUE_MAX) }}
        />
      </div>

      <div
        className="flex flex-col items-center gap-1.5 rounded-xl px-6 py-7 text-center"
        style={{ background: 'var(--wa-copper-wash)', borderTop: '2px solid var(--wa-copper)' }}
      >
        <p className="wa-eyebrow" style={{ color: 'var(--wa-copper-deep)' }}>
          Estimated additional annual revenue
        </p>
        <p
          className="wa-serif wa-tabular text-5xl font-medium leading-none md:text-6xl"
          style={{ color: 'var(--wa-ink)' }}
          aria-live="polite"
        >
          {money(revenue)}
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--wa-ink-soft)' }}>
          from roughly {patients.toLocaleString('en-US')} reactivated patients who already trust you
        </p>
      </div>

      <button type="button" className="wa-btn wa-btn-primary w-full justify-center" style={{ padding: '1rem 1.5rem' }}>
        Show me how to recover this
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

function SectionHeading({ number, title, children }: { number: string; title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="wa-eyebrow">{number}</p>
      <h2 className="wa-serif mt-3 text-balance text-3xl font-medium leading-tight md:text-[2.75rem]">{title}</h2>
      {children ? (
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-relaxed" style={{ color: 'var(--wa-ink-soft)' }}>
          {children}
        </p>
      ) : null}
    </div>
  )
}

/* ---------- page ---------- */

export default function WarmAdvisory() {
  return (
    <div className="wa-root flex min-h-[100dvh] flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24">
          <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
            <div className="flex flex-col gap-7">
              <p className="wa-eyebrow wa-rise">{PRACTICE_TYPES_LINE}</p>
              <h1
                className="wa-serif wa-rise text-balance text-[2.75rem] font-light leading-[1.05] md:text-6xl"
                style={{ animationDelay: '60ms' }}
              >
                Turning old business into{' '}
                <em className="not-italic" style={{ color: 'var(--wa-copper)', fontStyle: 'italic' }}>
                  new business
                </em>{' '}
                &amp; new money.
              </h1>
              <p
                className="wa-rise max-w-xl text-pretty text-lg leading-relaxed"
                style={{ color: 'var(--wa-ink-soft)', animationDelay: '120ms' }}
              >
                Reactivation Power helps practices recover the revenue hiding in their inactive patient files —
                without spending a dollar on marketing to people who have never heard of you.
              </p>
              <div className="wa-rise flex flex-wrap items-center gap-3" style={{ animationDelay: '180ms' }}>
                <a href="/schedule-a-call" onClick={stay} className="wa-btn wa-btn-primary">
                  Schedule a Call
                </a>
                <a href="/how-it-works" onClick={stay} className="wa-btn wa-btn-ghost">
                  How It Works
                  <ArrowRight className="size-4" aria-hidden="true" />
                </a>
              </div>
              <dl
                className="wa-rise mt-3 grid grid-cols-2 gap-6 pt-6"
                style={{ borderTop: '1px solid var(--wa-rule-strong)', animationDelay: '240ms' }}
              >
                {STATS.map((s) => (
                  <div key={s.label} className="flex flex-col gap-1">
                    <dt className="sr-only">{s.label}</dt>
                    <dd className="wa-serif text-4xl font-light leading-none md:text-5xl">{s.value}</dd>
                    <dd className="text-sm leading-snug" style={{ color: 'var(--wa-ink-mute)' }}>
                      {s.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <Calculator />
          </div>
        </section>

        {/* The idea */}
        <section style={{ background: 'var(--wa-plum)', color: 'var(--wa-paper)' }}>
          <div className="mx-auto max-w-3xl px-5 py-20 md:px-8 md:py-28">
            <p className="wa-eyebrow" style={{ color: '#d9a07f' }}>
              The idea
            </p>
            <h2 className="wa-serif mt-4 text-balance text-3xl font-light leading-tight md:text-[2.75rem]">
              The most profitable patients are the ones you already have.
            </h2>
            <p className="wa-drop mt-8 text-pretty text-lg leading-[1.75]" style={{ color: 'rgba(245,239,228,0.78)' }}>
              Acquiring a brand-new patient means paying for ads, clicks, leads, and follow-up — with an uncertain
              outcome. Reactivating a past patient takes a phone call. They already know you, already trust you, and
              already said yes to you once. Reactivation Power gives your practice the complete system to bring them
              back the right way.
            </p>
          </div>
        </section>

        {/* Services */}
        <section aria-labelledby="wa-services" style={{ borderBottom: '1px solid var(--wa-rule)' }}>
          <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
            <SectionHeading number="Scripts by service" title="Written for the services you actually offer">
              A lapsed chiropractic patient and a past Botox client need very different conversations. Every service
              below has its own word-for-word script, written for that service and that patient.
            </SectionHeading>

            <ul className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl sm:grid-cols-2 lg:grid-cols-4" style={{ background: 'var(--wa-rule)', border: '1px solid var(--wa-rule)' }}>
              {SERVICE_GROUPS.map((group) => (
                <li key={group.id} className="flex flex-col gap-5 p-7" style={{ background: 'var(--wa-card)' }}>
                  <div className="flex flex-col gap-3">
                    <span className="wa-serif text-3xl font-light leading-none" style={{ color: 'var(--wa-copper)' }}>
                      {group.numeral}
                    </span>
                    <div className="flex flex-col gap-1">
                      <h3 className="wa-serif text-xl font-medium leading-snug">{group.title}</h3>
                      <p className="text-xs leading-snug" style={{ color: 'var(--wa-ink-mute)' }}>
                        {group.audience}
                      </p>
                    </div>
                  </div>
                  <ul className="flex flex-col gap-2 pt-4" style={{ borderTop: '1px dashed var(--wa-rule-strong)' }}>
                    {group.services.map((s) => (
                      <li key={s} className="flex items-start gap-2.5 text-sm leading-snug" style={{ color: 'var(--wa-ink-soft)' }}>
                        <span className="mt-[0.45rem] size-1.5 shrink-0 rounded-full" style={{ background: 'var(--wa-copper)' }} aria-hidden="true" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-center text-sm italic" style={{ color: 'var(--wa-ink-mute)' }}>
              Don&apos;t see your service? Tell us on the call and we&apos;ll build the script for you.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
          <SectionHeading number="How it works" title="From dormant files to booked appointments" />
          <ol className="mt-14 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-4 pt-6" style={{ borderTop: '2px solid var(--wa-ink)' }}>
                <div className="flex items-center justify-between">
                  <span className="wa-serif text-lg italic" style={{ color: 'var(--wa-ink-mute)' }}>
                    Step {i + 1}
                  </span>
                  <step.icon className="size-5" style={{ color: 'var(--wa-copper)' }} aria-hidden="true" />
                </div>
                <h3 className="wa-serif text-2xl font-medium leading-snug">{step.title}</h3>
                <p className="text-[0.95rem] leading-relaxed" style={{ color: 'var(--wa-ink-soft)' }}>
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Benefits */}
        <section style={{ background: 'var(--wa-paper-deep)', borderTop: '1px solid var(--wa-rule)', borderBottom: '1px solid var(--wa-rule)' }}>
          <div className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
            <SectionHeading number="Why practices stay" title="Why practices choose Reactivation Power" />
            <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {BENEFITS.map((b) => (
                <div key={b.title} className="wa-card flex gap-5 rounded-2xl p-7">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--wa-sage-wash)' }}>
                    <b.icon className="size-5" style={{ color: 'var(--wa-sage)' }} aria-hidden="true" />
                  </span>
                  <div className="flex flex-col gap-2">
                    <h3 className="wa-serif text-xl font-medium leading-snug">{b.title}</h3>
                    <p className="text-[0.95rem] leading-relaxed" style={{ color: 'var(--wa-ink-soft)' }}>
                      {b.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-3xl px-5 py-20 text-center md:px-8 md:py-28">
          <p className="wa-eyebrow">A free strategy call</p>
          <h2 className="wa-serif mt-4 text-balance text-3xl font-light leading-tight md:text-[2.75rem]">
            See what reactivation could do for your practice
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-relaxed" style={{ color: 'var(--wa-ink-soft)' }}>
            Book a free strategy call. We&apos;ll walk through your practice and your inactive list — no pressure,
            no obligation.
          </p>
          <a href="/schedule-a-call" onClick={stay} className="wa-btn wa-btn-primary mt-9" style={{ padding: '1rem 2rem', fontSize: '1rem' }}>
            Schedule a Call
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid var(--wa-rule)', background: 'var(--wa-card)' }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-5 py-12 text-center md:px-8">
          <Wordmark compact />
          <p className="wa-serif text-sm italic" style={{ color: 'var(--wa-ink-mute)' }}>
            Turning old business into new business &amp; new money.
          </p>
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-7 gap-y-2">
            {['Home', 'How It Works', 'Schedule a Call', 'Client Login'].map((l) => (
              <a key={l} href="/" onClick={stay} className="wa-link text-sm">
                {l}
              </a>
            ))}
          </nav>
          <p className="text-xs" style={{ color: 'var(--wa-ink-mute)' }}>
            © {new Date().getFullYear()} Reactivation Power. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
