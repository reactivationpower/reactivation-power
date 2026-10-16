import { createContext, useCallback, useContext, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { SERVICE_GROUPS } from './_catalog'

/* ---- Routing stub: wouter <Link> becomes a plain anchor that never navigates ---- */
export function StaticLink({ onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} onClick={(event) => { event.preventDefault(); onClick?.(event) }} />
}

/* ---- @workspace/shared/opportunity (verbatim constants + math) ---- */
export const REACTIVATION_RATE = 0.05
export const INACTIVE_MIN = 100
export const INACTIVE_MAX = 5000
export const INACTIVE_STEP = 100
export const INACTIVE_DEFAULT = 1000
export const VALUE_MIN = 1000
export const VALUE_STEP = 100
export const VALUE_DEFAULT = 2000
export function reactivatedPatients(inactiveCount: number): number {
  return Math.max(1, Math.round(inactiveCount * REACTIVATION_RATE))
}
export function sliderFillPercent(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`
}
export interface CalculatorScenario {
  inactivePatients: number
  patientValue: number
  additionalPatientsPerMonth: number
  newPatientValue: number
}

/* ---- opportunity-context (verbatim) ---- */
export interface OpportunityState {
  inactiveCount: number
  patientValue: number
  inactiveTouched: boolean
  valueTouched: boolean
  setInactiveCount: (n: number) => void
  setPatientValue: (n: number) => void
}
const OpportunityContext = createContext<OpportunityState | null>(null)
export function OpportunityProvider({ children }: { children: ReactNode }) {
  const [inactiveCount, setInactive] = useState(INACTIVE_DEFAULT)
  const [patientValue, setValue] = useState(VALUE_DEFAULT)
  const [inactiveTouched, setInactiveTouched] = useState(false)
  const [valueTouched, setValueTouched] = useState(false)
  const setInactiveCount = useCallback((n: number) => { setInactive(n); setInactiveTouched(true) }, [])
  const setPatientValue = useCallback((n: number) => { setValue(n); setValueTouched(true) }, [])
  return (
    <OpportunityContext.Provider value={{ inactiveCount, patientValue, inactiveTouched, valueTouched, setInactiveCount, setPatientValue }}>
      {children}
    </OpportunityContext.Provider>
  )
}
export function useOpportunity(): OpportunityState | null {
  return useContext(OpportunityContext)
}

/* ---- site-footer (verbatim, Link -> StaticLink, image path -> sandbox) ---- */
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
          <StaticLink href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Home</StaticLink>
          <StaticLink href="/how-it-works" className="text-sm text-muted-foreground transition-colors hover:text-foreground">How It Works</StaticLink>
          <StaticLink href="/schedule-a-call" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Schedule a Call</StaticLink>
          <StaticLink href="/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Client Login</StaticLink>
        </nav>
        <p className="text-xs text-muted-foreground">
          {`© ${new Date().getFullYear()} Reactivation Power. All rights reserved.`}
        </p>
      </div>
    </footer>
  )
}

/* ---- site-header: identical markup/dimensions to the live SiteHeader; ONLY the logo file changes ---- */
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
            src="/__mockup/images/patient-pipeline-logo.png"
            alt="Patient Pipeline"
            width={2172}
            height={724}
            className="h-14 w-auto md:h-16"
          />
        </StaticLink>

        <nav aria-label="Main" className="flex items-center gap-1 md:gap-2">
          {NAV.map((item) => (
            <StaticLink
              key={item.href}
              href={item.href}
              className={`hidden rounded-md px-3 py-2 text-sm font-medium transition-colors sm:block ${
                pathname === item.href ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
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

/* ---- lead form: UI only, submission disabled (same stub used by the approved dual-product mockups) ---- */

// The source form is kept as UI; only its network submission and ZIP lookup
// are disabled for the isolated design baseline.
export function LeadForm(_props: { calculatorScenario?: CalculatorScenario }) {
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