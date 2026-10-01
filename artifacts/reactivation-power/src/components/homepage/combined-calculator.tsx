import { useState } from 'react'
import { Megaphone, Plus, RotateCcw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LeadForm } from '@/components/landing/lead-form'
import { useOpportunity } from '@/components/landing/opportunity-context'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  INACTIVE_MIN, INACTIVE_MAX, INACTIVE_STEP, VALUE_MIN, VALUE_STEP,
  reactivatedPatients, sliderFillPercent,
} from '@workspace/shared/opportunity'

export const LEADS_MIN = 1
export const LEADS_MAX = 40
export const LEADS_DEFAULT = 5
export const COMBINED_VALUE_MAX = 10000

export function calculateCombinedRevenue(inactiveCount: number, reactValue: number, leadsPerMonth: number, leadValue: number) {
  const reactivated = reactivatedPatients(inactiveCount)
  const reactivationRevenue = reactivated * reactValue
  const leadPatientsPerYear = leadsPerMonth * 12
  const leadRevenue = leadPatientsPerYear * leadValue
  return { reactivated, reactivationRevenue, leadPatientsPerYear, leadRevenue, total: reactivationRevenue + leadRevenue }
}

function formatMoney(value: number) {
  return '$' + Math.round(value).toLocaleString('en-US')
}

function SliderField({ id, label, display, min, max, step, value, onChange, tone }: {
  id: string; label: string; display: string; min: number; max: number; step: number
  value: number; onChange: (value: number) => void; tone: 'accent' | 'navy'
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col justify-end lg:min-h-10">
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor={id} className="text-sm font-medium leading-5 text-foreground">{label}</label>
          <span className={`shrink-0 whitespace-nowrap text-lg font-bold leading-5 tabular-nums ${tone === 'navy' ? 'text-primary' : 'text-accent'}`}>{display}</span>
        </div>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={event => onChange(Number(event.target.value))}
        className={`range-slider ${tone === 'navy' ? 'dph-range-navy' : ''}`}
        style={{ ['--range-pct' as string]: sliderFillPercent(value, min, max) }}
      />
    </div>
  )
}

function HalfHeader({ icon: Icon, kicker, title, tone }: {
  icon: LucideIcon; kicker: string; title: string; tone: 'accent' | 'navy'
}) {
  const color = tone === 'navy' ? 'text-primary' : 'text-accent'
  return (
    <div className="flex items-start gap-3">
      <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${tone === 'navy' ? 'bg-primary/10' : 'bg-accent/10'} ${color}`} aria-hidden="true"><Icon className="size-5" /></span>
      <div className="flex flex-col">
        <p className={`text-xs font-semibold uppercase tracking-[0.08em] ${color}`}>{kicker}</p>
        <h3 className="text-lg font-bold text-foreground md:text-xl">{title}</h3>
      </div>
    </div>
  )
}

export function CombinedCalculator() {
  const react = useOpportunity()
  const [leadsPerMonth, setLeadsPerMonth] = useState(LEADS_DEFAULT)
  const [leadValue, setLeadValue] = useState(2000)
  if (!react) throw new Error('CombinedCalculator requires OpportunityProvider')

  const { inactiveCount, patientValue: reactValue, setInactiveCount, setPatientValue } = react
  const { reactivated, reactivationRevenue, leadPatientsPerYear, leadRevenue, total } =
    calculateCombinedRevenue(inactiveCount, reactValue, leadsPerMonth, leadValue)

  return (
    <div className="dph-combo rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col gap-6 border-b border-border p-6 lg:border-b-0 lg:border-r md:p-8">
          <HalfHeader icon={RotateCcw} kicker="Workflow 01" title="Patient Reactivation" tone="accent" />
          <SliderField id="combo-inactive" label="How many inactive patient files do you have?"
            display={`${inactiveCount.toLocaleString('en-US')}${inactiveCount >= INACTIVE_MAX ? '+' : ''}`}
            min={INACTIVE_MIN} max={INACTIVE_MAX} step={INACTIVE_STEP} value={inactiveCount} onChange={setInactiveCount} tone="accent" />
          <SliderField id="combo-react-value" label="What's a patient worth to you per year?"
            display={formatMoney(reactValue)}
            min={VALUE_MIN} max={COMBINED_VALUE_MAX} step={VALUE_STEP} value={reactValue} onChange={setPatientValue} tone="accent" />
          <div className="mt-auto flex flex-col gap-1 rounded-lg bg-accent/10 px-5 py-5">
            <p className="text-sm font-medium text-muted-foreground">Estimated additional annual revenue</p>
            <p className="text-3xl font-bold tabular-nums text-accent md:text-4xl" aria-live="polite">{formatMoney(reactivationRevenue)}</p>
            <p className="text-sm text-muted-foreground">from roughly {reactivated.toLocaleString('en-US')} reactivated patients, using an illustrative 5% rate</p>
          </div>
        </div>
        <div className="flex flex-col gap-6 p-6 md:p-8">
          <HalfHeader icon={Megaphone} kicker="Workflow 02" title="Lead Follow-Up" tone="navy" />
          <SliderField id="combo-leads" label="How many additional new patients could better follow-up bring in each month?"
            display={`${leadsPerMonth}${leadsPerMonth >= LEADS_MAX ? '+' : ''} / mo`}
            min={LEADS_MIN} max={LEADS_MAX} step={1} value={leadsPerMonth} onChange={setLeadsPerMonth} tone="navy" />
          <SliderField id="combo-lead-value" label="What's a new patient worth over their first year?"
            display={formatMoney(leadValue)}
            min={VALUE_MIN} max={COMBINED_VALUE_MAX} step={VALUE_STEP} value={leadValue} onChange={setLeadValue} tone="navy" />
          <div className="mt-auto flex flex-col gap-1 rounded-lg bg-primary/[0.07] px-5 py-5">
            <p className="text-sm font-medium text-muted-foreground">Estimated additional annual revenue</p>
            <p className="text-3xl font-bold tabular-nums text-primary md:text-4xl" aria-live="polite">{formatMoney(leadRevenue)}</p>
            <p className="text-sm text-muted-foreground">from {leadPatientsPerYear.toLocaleString('en-US')} additional new patients over 12 months</p>
          </div>
        </div>
      </div>
      <div className="dph-combo-total border-t border-border px-6 py-8 md:px-8 md:py-10">
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-2 text-center lg:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary-foreground/70">Both workflows together</p>
            <p className="text-5xl font-bold tabular-nums text-primary-foreground md:text-6xl" aria-live="polite">{formatMoney(total)}</p>
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-primary-foreground/80 lg:justify-start">
              <span className="tabular-nums">{formatMoney(reactivationRevenue)} reactivation</span>
              <Plus className="size-3.5 opacity-70" aria-hidden="true" />
              <span className="tabular-nums">{formatMoney(leadRevenue)} lead follow-up</span>
              <span className="opacity-70">· estimated additional annual revenue</span>
            </p>
          </div>
          <Dialog>
            <DialogTrigger render={<button type="button" className="w-full rounded-md bg-accent px-7 py-3.5 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90 lg:w-auto" />}>Talk Through This Opportunity</DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-xl">Get started — it takes 30 seconds</DialogTitle>
                <DialogDescription>Fill this out, then pick a time for your call on the next page.</DialogDescription>
              </DialogHeader>
              <LeadForm calculatorScenario={{
                inactivePatients: inactiveCount, patientValue: reactValue,
                additionalPatientsPerMonth: leadsPerMonth, newPatientValue: leadValue,
              }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <div className="border-t border-border px-6 py-4 md:px-8">
        <p className="text-xs leading-relaxed text-muted-foreground">Illustrative estimates only, not a guarantee. Figures are revenue, not profit, and depend on your list, your services, your lead volume, and how consistently the calls get made. Reactivation assumes 5% of inactive files return; lead follow-up assumes the additional new patients you selected each month for 12 months, valued over their first year (which may not all be collected within the same calendar year). The combined figure assumes no overlap between the two groups. These are distinct workflows, both included together in one Patient Pipeline launch offer for one launch price; the total illustrates a scenario, not an expected result.</p>
      </div>
    </div>
  )
}