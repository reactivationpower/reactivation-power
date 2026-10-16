import { createContext, useCallback, useContext, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { Activity, Scale, Smile, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { PRACTICE_TYPES_LINE, SERVICE_GROUPS, type ServiceGroupId } from './catalog'

export { PRACTICE_TYPES_LINE }

// The only route substitution: links retain their real hrefs and styling,
// but don't navigate out of the isolated preview.
export function StaticLink({ onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} onClick={(event) => { event.preventDefault(); onClick?.(event) }} />
}

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/how-it-works', label: 'How It Works' },
] as const

export function SiteHeader() {
  const pathname = '/'

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <StaticLink href="/" aria-label="Reactivation Power — Home">
          <img
            src="/__mockup/images/logo-slogan.png"
            alt="Reactivation Power — Turning Old Business Into New Business & New Money!"
            width={1189}
            height={578}
            className="h-12 w-auto md:h-14"
          />
        </StaticLink>

        <nav aria-label="Main" className="flex items-center gap-1 md:gap-2">
          {NAV.map((item) => (
            <StaticLink
              key={item.href}
              href={item.href}
              className={`hidden rounded-md px-3 py-2 text-sm font-medium transition-colors sm:block ${
                pathname === item.href
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </StaticLink>
          ))}
          <StaticLink
            href="/login"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:block"
          >
            Client Login
          </StaticLink>
          <StaticLink
            href="/schedule-a-call"
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Schedule a Call
          </StaticLink>
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-10 text-center md:px-6">
        <img
          src="/__mockup/images/logo-slogan.png"
          alt="Reactivation Power — Turning Old Business Into New Business & New Money!"
          width={1189}
          height={578}
          className="h-14 w-auto"
        />
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <StaticLink href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Home
          </StaticLink>
          <StaticLink href="/how-it-works" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            How It Works
          </StaticLink>
          <StaticLink href="/schedule-a-call" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Schedule a Call
          </StaticLink>
          <StaticLink href="/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Client Login
          </StaticLink>
        </nav>
        <p className="text-xs text-muted-foreground">
          {`© ${new Date().getFullYear()} Reactivation Power. All rights reserved.`}
        </p>
      </div>
    </footer>
  )
}

const GROUP_ICONS: Record<ServiceGroupId, LucideIcon> = {
  chiropractic: Activity,
  dental: Smile,
  medspa: Sparkles,
  weight: Scale,
}

export function ServicesWeSupport({
  surface = 'background',
  className = '',
}: {
  surface?: 'background' | 'card'
  className?: string
}) {
  const sectionBg = surface === 'card' ? 'bg-card' : 'bg-background'
  const cardBg = surface === 'card' ? 'bg-background' : 'bg-card'

  return (
    <section
      className={`${sectionBg} ${className}`.trim()}
      aria-labelledby="services-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2
            id="services-heading"
            className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl"
          >
            Scripts written for the services you actually offer
          </h2>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
            A lapsed chiropractic patient and a past Botox client need very
            different conversations. Every service below has its own
            word-for-word script, written for that service and that patient.
          </p>
        </div>

        <ul className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICE_GROUPS.map((group) => {
            const Icon = GROUP_ICONS[group.id]
            return (
              <li
                key={group.id}
                className={`flex flex-col gap-5 rounded-xl border border-border ${cardBg} p-6`}
              >
                <div className="flex flex-col gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent/10">
                    <Icon className="size-5 text-accent" aria-hidden="true" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold leading-snug text-foreground">
                      {group.title}
                    </h3>
                    <p className="text-xs leading-snug text-muted-foreground">
                      {group.audience}
                    </p>
                  </div>
                </div>
                <ul className="flex flex-col gap-2 border-t border-border pt-4">
                  {group.services.map((service) => (
                    <li
                      key={service.niche}
                      className="flex items-start gap-2.5 text-sm leading-snug text-foreground"
                    >
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                        aria-hidden="true"
                      />
                      {service.label}
                    </li>
                  ))}
                  {group.alsoOffered?.map((line) => (
                    <li
                      key={line}
                      className="flex items-start gap-2.5 text-sm leading-snug text-foreground"
                    >
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                        aria-hidden="true"
                      />
                      {line}
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          {"Don't see your service? Tell us on the call and we'll build the script for you."}
        </p>
      </div>
    </section>
  )
}

const INACTIVE_MIN = 100
const INACTIVE_MAX = 5000
const INACTIVE_STEP = 100
const VALUE_MIN = 1000
const VALUE_MAX = 5000
const VALUE_STEP = 100
const REACTIVATION_RATE = 0.05

type OpportunityState = {
  inactiveCount: number
  patientValue: number
  setInactiveCount: (n: number) => void
  setPatientValue: (n: number) => void
}
const OpportunityContext = createContext<OpportunityState | null>(null)

export function OpportunityProvider({ children }: { children: ReactNode }) {
  const [inactiveCount, setInactive] = useState(1000)
  const [patientValue, setValue] = useState(2000)
  const setInactiveCount = useCallback((n: number) => setInactive(n), [])
  const setPatientValue = useCallback((n: number) => setValue(n), [])
  return (
    <OpportunityContext.Provider value={{ inactiveCount, patientValue, setInactiveCount, setPatientValue }}>
      {children}
    </OpportunityContext.Provider>
  )
}

function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}
function sliderFillPercent(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`
}

export function HeroOpportunity() {
  const calc = useContext(OpportunityContext)
  if (!calc) {
    throw new Error('HeroOpportunity must be rendered inside <OpportunityProvider>')
  }
  const { inactiveCount, setInactiveCount, patientValue, setPatientValue } = calc
  const patients = Math.max(1, Math.round(inactiveCount * REACTIVATION_RATE))
  const revenue = patients * patientValue

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Your Revenue Opportunity
        </p>
        <h2 className="text-balance text-xl font-bold text-foreground md:text-2xl">
          See what&apos;s hiding in your inactive patient list
        </h2>
        <p className="text-pretty text-sm text-muted-foreground">
          Drag the sliders to match your practice.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="hero-inactive" className="text-sm font-medium text-foreground">
            How many inactive patient files do you have?
          </label>
          <span className="text-lg font-bold tabular-nums text-accent">
            {inactiveCount.toLocaleString('en-US')}
            {inactiveCount >= INACTIVE_MAX ? '+' : ''}
          </span>
        </div>
        <input
          id="hero-inactive"
          type="range"
          min={INACTIVE_MIN}
          max={INACTIVE_MAX}
          step={INACTIVE_STEP}
          value={inactiveCount}
          onChange={(e) => setInactiveCount(Number(e.target.value))}
          className="range-slider"
          style={{ ['--range-pct' as string]: sliderFillPercent(inactiveCount, INACTIVE_MIN, INACTIVE_MAX) }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="hero-value" className="text-sm font-medium text-foreground">
            What&apos;s a patient worth to you per year?
          </label>
          <span className="text-lg font-bold tabular-nums text-accent">
            {formatMoney(patientValue)}
          </span>
        </div>
        <input
          id="hero-value"
          type="range"
          min={VALUE_MIN}
          max={VALUE_MAX}
          step={VALUE_STEP}
          value={patientValue}
          onChange={(e) => setPatientValue(Number(e.target.value))}
          className="range-slider"
          style={{ ['--range-pct' as string]: sliderFillPercent(patientValue, VALUE_MIN, VALUE_MAX) }}
        />
      </div>

      <div className="flex flex-col items-center gap-1 rounded-lg bg-accent/10 px-6 py-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Estimated additional annual revenue
        </p>
        <p className="text-4xl font-bold tabular-nums text-accent transition-all duration-200 md:text-5xl" aria-live="polite">
          {formatMoney(revenue)}
        </p>
        <p className="text-sm text-muted-foreground">
          from roughly {patients.toLocaleString('en-US')} reactivated patients
          who already trust you
        </p>
      </div>

      <LeadDialog>
        <button
          type="button"
          className="w-full rounded-md bg-accent px-6 py-3 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
        >
          Show Me How to Capture This
        </button>
      </LeadDialog>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Based on just 5% of your inactive files reactivating. No ad spend, no
        new leads, just patients you already have that trust and like you!
      </p>
    </div>
  )
}

function LeadDialog({ children }: { children: React.ReactElement }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Get started — it takes 30 seconds</DialogTitle>
          <DialogDescription>Fill this out, then pick a time for your call on the next page.</DialogDescription>
        </DialogHeader>
        <LeadForm />
      </DialogContent>
    </Dialog>
  )
}

// The source form is kept as UI; only its network submission and ZIP lookup
// are disabled for the isolated design baseline.
function LeadForm() {
  const [phone, setPhone] = useState('')
  const [zip, setZip] = useState('')
  const [inactive, setInactive] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const calc = useContext(OpportunityContext)
  const inputBase = 'h-11 rounded-md border border-input bg-card px-3 text-base text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-ring/30'
  const required = <span className="text-destructive" aria-hidden="true"> *</span>

  return (
    <form onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {([['firstName', 'First name', 'given-name'], ['lastName', 'Last name', 'family-name']] as const).map(([name, label, autoComplete]) => (
          <div key={name} className="flex flex-col gap-1.5">
            <label htmlFor={`lead-${name}`} className="text-sm font-medium text-foreground">{label}{required}</label>
            <input id={`lead-${name}`} name={name} required autoComplete={autoComplete} className={inputBase} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="lead-email" className="text-sm font-medium text-foreground">Email address{required}</label>
        <input id="lead-email" name="email" type="email" required autoComplete="email" className={inputBase} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lead-phone" className="text-sm font-medium text-foreground">Phone number{required}</label>
          <input id="lead-phone" name="phone" type="tel" required inputMode="numeric" autoComplete="tel" placeholder="(555) 555-1234" value={phone} onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '').slice(0, 10)
            setPhone(d.length <= 3 ? `(${d}` : d.length <= 6 ? `(${d.slice(0, 3)}) ${d.slice(3)}` : `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`)
          }} maxLength={14} className={inputBase} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lead-zip" className="text-sm font-medium text-foreground">Zip code{required}</label>
          <input id="lead-zip" name="zip" required inputMode="numeric" autoComplete="postal-code" placeholder="12345" value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))} maxLength={5} className={inputBase} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="lead-practice" className="text-sm font-medium text-foreground">Practice name <span className="font-normal text-muted-foreground">(optional)</span></label>
        <input id="lead-practice" name="practiceName" autoComplete="organization" className={inputBase} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lead-years" className="text-sm font-medium text-foreground">How long in practice?{required}</label>
          <select id="lead-years" name="yearsInPractice" required defaultValue="" className={inputBase}>
            <option value="" disabled>Select one</option>
            <option value="Less than 1 year">Less than 1 year</option>
            <option value="1-3 years">1–3 years</option>
            <option value="4-7 years">4–7 years</option>
            <option value="8-15 years">8–15 years</option>
            <option value="16+ years">16+ years</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lead-inactive" className="text-sm font-medium text-foreground">Inactive patient files{required}</label>
          <input id="lead-inactive" name="inactivePatients" required inputMode="numeric" autoComplete="off" placeholder="e.g. 1,000" value={inactive || calc?.inactiveCount.toLocaleString('en-US') || ''} onChange={(e) => setInactive(e.target.value.replace(/\D/g, '').slice(0, 6))} className={inputBase} />
          <p className="text-xs text-muted-foreground">Carried over from your calculator — edit if needed.</p>
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">What services do you offer?{required} <span className="font-normal text-muted-foreground">(select all that apply)</span></legend>
        <div className="flex flex-col gap-4 rounded-md">
          {SERVICE_GROUPS.map((group) => (
            <div key={group.id} className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {group.services.map((service) => {
                  const checked = selected.includes(service.niche)
                  return (
                    <button key={service.niche} type="button" role="checkbox" aria-checked={checked}
                      onClick={() => setSelected(checked ? selected.filter((s) => s !== service.niche) : [...selected, service.niche])}
                      className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${checked ? 'border-accent bg-accent/10 text-foreground' : 'border-input bg-card text-foreground hover:bg-muted'}`}>
                      <span className={`flex size-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-accent bg-accent text-accent-foreground' : 'border-input bg-card'}`} aria-hidden="true">{checked ? '✓' : null}</span>
                      {service.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-2.5 rounded-md border border-input bg-card px-3 py-3 text-sm leading-relaxed">
          <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-accent" />
          <span className="text-muted-foreground">I consent to being contacted by text message and phone call for marketing related to Reactivation Power. Message and data rates may apply. Reply STOP to opt out at any time.{required}</span>
        </label>
      </div>
      <button type="submit" className="h-12 rounded-lg bg-accent text-base font-semibold text-accent-foreground hover:bg-accent/90">Get My Free Strategy Call</button>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">Your information is never sold or shared. After submitting, you&apos;ll pick a time for your call on the next page.</p>
    </form>
  )
}