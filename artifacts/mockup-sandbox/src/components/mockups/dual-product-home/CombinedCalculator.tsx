import { useState } from 'react'
import { Megaphone, Plus, RotateCcw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

/* ------------------------------------------------------------------ */
/* Two-part revenue calculator: Reactivation + Lead Follow-Up          */
/* Reactivation math is unchanged from the live calculator.            */
/* Lead follow-up math: additional new patients / month × 12 × value.  */
/* ------------------------------------------------------------------ */

const INACTIVE_MIN = 100
const INACTIVE_MAX = 5000
const INACTIVE_STEP = 100
const VALUE_MIN = 1000
const VALUE_MAX = 5000
const VALUE_STEP = 100
const REACTIVATION_RATE = 0.05

const LEADS_MIN = 1
const LEADS_MAX = 40
const LEADS_STEP = 1

function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}
function pct(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`
}

function SliderField({
  id,
  label,
  display,
  min,
  max,
  step,
  value,
  onChange,
  tone,
}: {
  id: string
  label: string
  display: string
  min: number
  max: number
  step: number
  value: number
  onChange: (n: number) => void
  tone: 'accent' | 'navy'
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <span
          className={`shrink-0 whitespace-nowrap text-lg font-bold tabular-nums ${tone === 'navy' ? 'text-primary' : 'text-accent'}`}
        >
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`range-slider ${tone === 'navy' ? 'dph-range-navy' : ''}`}
        style={{ ['--range-pct' as string]: pct(value, min, max) }}
      />
    </div>
  )
}

function HalfHeader({
  icon: Icon,
  kicker,
  title,
  tone,
}: {
  icon: LucideIcon
  kicker: string
  title: string
  tone: 'accent' | 'navy'
}) {
  const color = tone === 'navy' ? 'text-primary' : 'text-accent'
  const ring = tone === 'navy' ? 'bg-primary/10' : 'bg-accent/10'
  return (
    <div className="flex items-start gap-3">
      <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${ring} ${color}`} aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <div className="flex flex-col">
        <p className={`text-xs font-semibold uppercase tracking-[0.08em] ${color}`}>{kicker}</p>
        <h3 className="text-lg font-bold text-foreground md:text-xl">{title}</h3>
      </div>
    </div>
  )
}

function CtaDialog({ children }: { children: React.ReactElement }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Get started — it takes 30 seconds</DialogTitle>
          <DialogDescription>
            In the live site this opens the existing lead form, with your calculator numbers carried over.
            Nothing is submitted from this mockup.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}

export function CombinedCalculator() {
  const [inactiveCount, setInactiveCount] = useState(1000)
  const [reactValue, setReactValue] = useState(2000)
  const [leadsPerMonth, setLeadsPerMonth] = useState(5)
  const [leadValue, setLeadValue] = useState(2000)

  const reactivated = Math.max(1, Math.round(inactiveCount * REACTIVATION_RATE))
  const reactivationRevenue = reactivated * reactValue
  const leadPatientsPerYear = leadsPerMonth * 12
  const leadRevenue = leadPatientsPerYear * leadValue
  const total = reactivationRevenue + leadRevenue

  return (
    <div className="dph-combo rounded-2xl border border-border bg-card shadow-sm">
      {/* Two halves */}
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Reactivation */}
        <div className="flex flex-col gap-6 border-b border-border p-6 lg:border-b-0 lg:border-r md:p-8">
          <HalfHeader icon={RotateCcw} kicker="Product 01" title="Patient Reactivation" tone="accent" />
          <SliderField
            id="combo-inactive"
            label="How many inactive patient files do you have?"
            display={`${inactiveCount.toLocaleString('en-US')}${inactiveCount >= INACTIVE_MAX ? '+' : ''}`}
            min={INACTIVE_MIN}
            max={INACTIVE_MAX}
            step={INACTIVE_STEP}
            value={inactiveCount}
            onChange={setInactiveCount}
            tone="accent"
          />
          <SliderField
            id="combo-react-value"
            label="What's a patient worth to you per year?"
            display={formatMoney(reactValue)}
            min={VALUE_MIN}
            max={VALUE_MAX}
            step={VALUE_STEP}
            value={reactValue}
            onChange={setReactValue}
            tone="accent"
          />
          <div className="mt-auto flex flex-col gap-1 rounded-lg bg-accent/10 px-5 py-5">
            <p className="text-sm font-medium text-muted-foreground">Estimated additional annual revenue</p>
            <p className="text-3xl font-bold tabular-nums text-accent md:text-4xl" aria-live="polite">
              {formatMoney(reactivationRevenue)}
            </p>
            <p className="text-sm text-muted-foreground">
              from roughly {reactivated.toLocaleString('en-US')} reactivated patients, using an illustrative 5% rate
            </p>
          </div>
        </div>

        {/* Lead follow-up */}
        <div className="flex flex-col gap-6 p-6 md:p-8">
          <HalfHeader icon={Megaphone} kicker="Product 02" title="Lead Follow-Up" tone="navy" />
          <SliderField
            id="combo-leads"
            label="How many additional new patients could better follow-up bring in each month?"
            display={`${leadsPerMonth}${leadsPerMonth >= LEADS_MAX ? '+' : ''} / mo`}
            min={LEADS_MIN}
            max={LEADS_MAX}
            step={LEADS_STEP}
            value={leadsPerMonth}
            onChange={setLeadsPerMonth}
            tone="navy"
          />
          <SliderField
            id="combo-lead-value"
            label="What's a new patient worth over their first year?"
            display={formatMoney(leadValue)}
            min={VALUE_MIN}
            max={VALUE_MAX}
            step={VALUE_STEP}
            value={leadValue}
            onChange={setLeadValue}
            tone="navy"
          />
          <div className="mt-auto flex flex-col gap-1 rounded-lg bg-primary/[0.07] px-5 py-5">
            <p className="text-sm font-medium text-muted-foreground">Estimated additional annual revenue</p>
            <p className="text-3xl font-bold tabular-nums text-primary md:text-4xl" aria-live="polite">
              {formatMoney(leadRevenue)}
            </p>
            <p className="text-sm text-muted-foreground">
              from {leadPatientsPerYear.toLocaleString('en-US')} additional new patients over 12 months
            </p>
          </div>
        </div>
      </div>

      {/* Combined total */}
      <div className="dph-combo-total border-t border-border px-6 py-8 md:px-8 md:py-10">
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-2 text-center lg:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-foreground/70">
              Both products together
            </p>
            <p className="text-5xl font-bold tabular-nums text-primary-foreground md:text-6xl" aria-live="polite">
              {formatMoney(total)}
            </p>
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-primary-foreground/80 lg:justify-start">
              <span className="tabular-nums">{formatMoney(reactivationRevenue)} reactivation</span>
              <Plus className="size-3.5 opacity-70" aria-hidden="true" />
              <span className="tabular-nums">{formatMoney(leadRevenue)} lead follow-up</span>
              <span className="opacity-70">· estimated additional annual revenue</span>
            </p>
          </div>
          <CtaDialog>
            <button
              type="button"
              className="w-full rounded-md bg-accent px-7 py-3.5 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90 lg:w-auto"
            >
              Show Me How to Capture This
            </button>
          </CtaDialog>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="border-t border-border px-6 py-4 md:px-8">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Illustrative estimates only, not a guarantee. Figures are revenue, not profit, and depend on your
          list, your services, your lead volume, and how consistently the calls get made. Reactivation
          assumes 5% of inactive files return; lead follow-up assumes the additional new patients you
          selected each month for 12 months, valued over their first year (which may not all be collected
          within the same calendar year). The combined figure assumes no overlap between the two groups.
          Each product is available on its own; the total is shown to illustrate scale, not a bundle.
        </p>
      </div>
    </div>
  )
}
