import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Megaphone, Plus, RotateCcw } from 'lucide-react'
import {
  INACTIVE_MAX, INACTIVE_MIN, INACTIVE_STEP, VALUE_MIN, VALUE_STEP, sliderFillPercent,
} from '@workspace/shared/opportunity'
import {
  COMBINED_VALUE_MAX, LEADS_DEFAULT, LEADS_MAX, LEADS_MIN, calculateCombinedRevenue,
} from '@/components/homepage/combined-calculator'
import '@/components/homepage/home.css'

// Booking thank-you calculator covering both Patient Pipeline workflows. Uses
// the same slider ranges and math as the homepage combined calculator, with
// the reactivation side starting from what the visitor entered on the form.
const CALC_STEPS = [
  'Looking at your inactive patient list...',
  'Adding new patients from faster lead follow-up...',
  'Calculating your combined opportunity...',
]

type Tone = 'accent' | 'navy'

function formatMoney(value: number) {
  return '$' + Math.round(value).toLocaleString('en-US')
}

function SliderField({ id, label, display, min, max, step, value, onChange, tone }: {
  id: string; label: string; display: string; min: number; max: number; step: number
  value: number; onChange: (value: number) => void; tone: Tone
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col justify-end lg:min-h-10">
        <div className="flex items-end justify-between gap-4">
          <label htmlFor={id} className="text-sm font-medium leading-5 text-foreground">{label}</label>
          <span className={`shrink-0 whitespace-nowrap text-lg font-bold leading-5 tabular-nums ${tone === 'navy' ? 'text-primary' : 'text-accent'}`}>{display}</span>
        </div>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={event => onChange(Number(event.target.value))}
        className={`range-slider ${tone === 'navy' ? 'dph-range-navy' : ''}`}
        style={{ ['--range-pct' as string]: sliderFillPercent(Math.min(value, max), min, max) }}
      />
    </div>
  )
}

function HalfHeader({ icon: Icon, title, blurb, tone }: { icon: LucideIcon; title: string; blurb: string; tone: Tone }) {
  const color = tone === 'navy' ? 'text-primary' : 'text-accent'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${tone === 'navy' ? 'bg-primary/10' : 'bg-accent/10'} ${color}`} aria-hidden="true"><Icon className="size-5" /></span>
        <h3 className="text-lg font-bold text-foreground md:text-xl">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{blurb}</p>
    </div>
  )
}

function useCountUp(target: number, active: boolean) {
  const [shown, setShown] = useState(0)
  const shownRef = useRef(0)
  useEffect(() => {
    if (!active) return
    const start = shownRef.current
    if (start === target) return
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 900)
      const next = start + (target - start) * (1 - Math.pow(1 - p, 3))
      shownRef.current = next
      setShown(next)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, active])
  return shown
}

export function CombinedOpportunity({ inactiveCount: initialInactive, patientValue: initialValue, leadsPerMonth: initialLeads, leadValue: initialLeadValue, servicesLabel }: {
  inactiveCount: number
  patientValue: number
  leadsPerMonth?: number
  leadValue?: number
  servicesLabel?: string
}) {
  const [phase, setPhase] = useState<'calculating' | 'reveal'>('calculating')
  const [calcStep, setCalcStep] = useState(0)
  const [inactiveCount, setInactiveCount] = useState(initialInactive)
  const [reactValue, setReactValue] = useState(initialValue)
  const [leadsPerMonth, setLeadsPerMonth] = useState(initialLeads ?? LEADS_DEFAULT)
  const [leadValue, setLeadValue] = useState(initialLeadValue ?? 2000)

  const { reactivated, reactivationRevenue, leadPatientsPerYear, leadRevenue, total } =
    calculateCombinedRevenue(inactiveCount, reactValue, leadsPerMonth, leadValue)
  const shownTotal = useCountUp(total, phase === 'reveal')

  useEffect(() => {
    if (phase !== 'calculating') return
    if (calcStep < CALC_STEPS.length - 1) {
      const t = setTimeout(() => setCalcStep(s => s + 1), 900)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setPhase('reveal'), 1100)
    return () => clearTimeout(t)
  }, [phase, calcStep])

  return (
    <section aria-labelledby="opportunity-heading" className="dph mx-auto flex w-full max-w-4xl flex-col items-center gap-8 text-center">
      <div className="flex max-w-2xl flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Your Patient Pipeline Opportunity</p>
        <h2 id="opportunity-heading" className="text-balance text-2xl font-bold text-foreground sm:text-3xl">
          Two ways to grow your practice, in one launch offer
        </h2>
        <p className="text-pretty text-base leading-relaxed text-muted-foreground">
          Reactivation brings back past patients who haven&apos;t been in for a while. Lead Follow-Up makes sure every new
          inquiry gets a fast, guided call. Drag the sliders to see what both could add{servicesLabel ? ` to your ${servicesLabel} practice` : ''}.
        </p>
      </div>

      {phase === 'calculating' ? (
        <div className="flex w-full flex-col items-center justify-center gap-5 rounded-2xl border border-border bg-card px-6 py-20 shadow-sm">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-accent border-t-transparent" role="status" aria-label="Calculating" />
          <p className="text-base text-muted-foreground" aria-live="polite">{CALC_STEPS[calcStep]}</p>
        </div>
      ) : (
        <div className="dph-combo w-full rounded-2xl border border-border bg-card text-left">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="flex flex-col gap-6 border-b border-border p-6 md:p-8 lg:border-b-0 lg:border-r">
              <HalfHeader icon={RotateCcw} title="Patient Reactivation" tone="accent"
                blurb="Your team calls inactive patients with a guided script and brings them back for care." />
              <SliderField id="bty-inactive" label="How many inactive patient files do you have?"
                display={`${inactiveCount.toLocaleString('en-US')}${inactiveCount >= INACTIVE_MAX ? '+' : ''}`}
                min={INACTIVE_MIN} max={INACTIVE_MAX} step={INACTIVE_STEP} value={inactiveCount} onChange={setInactiveCount} tone="accent" />
              <SliderField id="bty-react-value" label="What's a patient worth to you per year?" display={formatMoney(reactValue)}
                min={VALUE_MIN} max={COMBINED_VALUE_MAX} step={VALUE_STEP} value={reactValue} onChange={setReactValue} tone="accent" />
              <div className="mt-auto flex flex-col gap-1 rounded-lg bg-accent/10 px-5 py-5">
                <p className="text-sm font-medium text-muted-foreground">Estimated additional annual revenue</p>
                <p className="text-3xl font-bold tabular-nums text-accent md:text-4xl" aria-live="polite">{formatMoney(reactivationRevenue)}</p>
                <p className="min-h-10 text-sm text-muted-foreground">from roughly {reactivated.toLocaleString('en-US')} returning patients, using an illustrative 5% rate</p>
              </div>
            </div>
            <div className="flex flex-col gap-6 p-6 md:p-8">
              <HalfHeader icon={Megaphone} title="Lead Follow-Up" tone="navy"
                blurb="New inquiries from your ads and website get called quickly, with a script built for your campaign." />
              <SliderField id="bty-leads" label="How many more new patients per month?"
                display={`${leadsPerMonth}${leadsPerMonth >= LEADS_MAX ? '+' : ''} / mo`}
                min={LEADS_MIN} max={LEADS_MAX} step={1} value={leadsPerMonth} onChange={setLeadsPerMonth} tone="navy" />
              <SliderField id="bty-lead-value" label="What's a new patient worth in year one?" display={formatMoney(leadValue)}
                min={VALUE_MIN} max={COMBINED_VALUE_MAX} step={VALUE_STEP} value={leadValue} onChange={setLeadValue} tone="navy" />
              <div className="mt-auto flex flex-col gap-1 rounded-lg bg-primary/[0.07] px-5 py-5">
                <p className="text-sm font-medium text-muted-foreground">Estimated additional annual revenue</p>
                <p className="text-3xl font-bold tabular-nums text-primary md:text-4xl" aria-live="polite">{formatMoney(leadRevenue)}</p>
                <p className="min-h-10 text-sm text-muted-foreground">from {leadPatientsPerYear.toLocaleString('en-US')} additional new patients over 12 months</p>
              </div>
            </div>
          </div>
          <div className="dph-combo-total px-6 py-7 md:px-8">
            <div className="grid grid-cols-1 items-center gap-5 lg:grid-cols-[1fr_auto]">
              <div className="flex flex-col gap-2 text-center lg:text-left">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-foreground/70">Both workflows together</p>
                <p className="text-5xl font-bold tabular-nums text-primary-foreground md:text-6xl" aria-live="polite">{formatMoney(shownTotal)}</p>
                <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-primary-foreground/80 lg:justify-start">
                  <span className="tabular-nums">{formatMoney(reactivationRevenue)} reactivation</span>
                  <Plus className="size-3.5 opacity-70" aria-hidden="true" />
                  <span className="tabular-nums">{formatMoney(leadRevenue)} lead follow-up</span>
                  <span className="opacity-70">· estimated additional annual revenue</span>
                </p>
              </div>
              <p className="max-w-xs text-pretty text-center text-sm leading-relaxed text-primary-foreground/85 lg:text-right">
                On your call, we&apos;ll walk through these numbers and map out how both workflows would run at your practice.
              </p>
            </div>
          </div>
          <div className="border-t border-border px-6 py-4 md:px-8">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Illustrative estimates only, not a guarantee. Figures are revenue, not profit, and depend on your list, your services, your lead
              volume, and how consistently the calls get made. Reactivation assumes 5% of inactive files return; lead follow-up assumes the
              additional new patients you selected each month for 12 months, valued over their first year. The combined figure assumes no
              overlap between the two groups. Both workflows are included together in one Patient Pipeline launch offer.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
