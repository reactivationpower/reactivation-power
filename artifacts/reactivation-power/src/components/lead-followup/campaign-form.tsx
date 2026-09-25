// @ts-nocheck

import { useMemo, useState, useTransition } from 'react'
import { useLocation } from 'wouter'
import { Loader2, Plus, X } from 'lucide-react'
import {
  formatPriceLine,
  parseDollarsToCents,
  PRICE_LINE_STYLE_OPTIONS,
  validateCampaignInput,
  type CampaignField,
  type PriceLineStyle,
} from '@workspace/shared/lead-followup'
import { createCampaign, updateCampaign } from '@/app/actions/lead-followup'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NicheSelect } from '@/components/reactivation/niche-select'
import { cn } from '@/lib/utils'
import { useRouter } from '@/hooks/use-router'

/**
 * New / edit campaign form. Validation is the shared validateCampaignInput()
 * so the browser and server agree on the one tricky rule: the regular price
 * is only required for the "Normally X, now Y" style.
 */

export interface CampaignFormValues {
  nicheId: string
  name: string
  offerItems: string[]
  regularPrice: string
  offerPrice: string
  priceLineStyle: PriceLineStyle
  urgencyNote: string
}

function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)
}

export function campaignToFormValues(campaign: any): CampaignFormValues {
  return {
    nicheId: campaign.nicheId,
    name: campaign.name,
    offerItems: campaign.offerItems?.length ? [...campaign.offerItems] : [''],
    regularPrice: centsToInput(campaign.regularPriceCents),
    offerPrice: centsToInput(campaign.offerPriceCents),
    priceLineStyle: campaign.priceLineStyle,
    urgencyNote: campaign.urgencyNote ?? '',
  }
}

const EMPTY: CampaignFormValues = {
  nicheId: '',
  name: '',
  offerItems: ['', ''],
  regularPrice: '',
  offerPrice: '',
  priceLineStyle: 'normally_now',
  urgencyNote: '',
}

export function CampaignForm({
  niches,
  campaignId,
  initial,
}: {
  niches: { id: string; name: string }[]
  /** Present when editing. */
  campaignId?: string
  initial?: CampaignFormValues
}) {
  const router = useRouter()
  const [, navigate] = useLocation()
  const [values, setValues] = useState<CampaignFormValues>(initial ?? { ...EMPTY, nicheId: niches.length === 1 ? niches[0].id : '' })
  const [errors, setErrors] = useState<Partial<Record<CampaignField, string>>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const set = <K extends keyof CampaignFormValues>(key: K, value: CampaignFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const needsRegular = values.priceLineStyle === 'normally_now'
  const needsOffer = values.priceLineStyle !== 'no_price'

  const preview = useMemo(() => {
    const regular = parseDollarsToCents(values.regularPrice)
    const offer = parseDollarsToCents(values.offerPrice)
    return formatPriceLine({
      priceLineStyle: values.priceLineStyle,
      regularPriceCents: Number.isNaN(regular) ? null : regular,
      offerPriceCents: Number.isNaN(offer) ? null : offer,
    })
  }, [values.priceLineStyle, values.regularPrice, values.offerPrice])

  function submit(e: React.FormEvent, later = false) {
    e?.preventDefault?.()
    setServerError(null)
    const checked = validateCampaignInput(values)
    if (!checked.ok) {
      setErrors(checked.errors)
      return
    }
    setErrors({})
    startTransition(async () => {
      const res = campaignId ? await updateCampaign(campaignId, values) : await createCampaign(values)
      if (res?.errors) {
        setErrors(res.errors)
        return
      }
      if (res?.error) {
        setServerError(res.error)
        return
      }
      router.refresh()
      const newId = res?.campaign?.id ?? campaignId
      if (!newId) {
        setServerError('Saved, but we could not open the campaign. Find it on the Campaigns page.')
        return
      }
      navigate(campaignId ? `/portal/campaigns/${newId}` : `/portal/campaigns/${newId}${later ? '' : '?setup=1'}`)
    })
  }

  const nicheItems = niches.map((n) => ({ value: n.id, label: n.name }))

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" noValidate>
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-niche">Service type</Label>
          <NicheSelect
            id="campaign-niche"
            value={values.nicheId || null}
            onValueChange={(v) => v && set('nicheId', v)}
            items={nicheItems}
            aria-label="Service type"
            data-testid="select-niche"
            className="w-full sm:max-w-sm"
            placeholder="Pick the service this ad was for"
          />
          <p className="text-xs text-muted-foreground">Decides which lead script the caller sees.</p>
          <FieldError message={errors.nicheId} />
          {niches.length === 0 ? (
            <p className="text-sm text-destructive">
              No healthcare services are enabled on this account yet. Ask your administrator to turn some on.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-name">Campaign name</Label>
          <Input
            id="campaign-name"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Back Pain Relief — $49 New Patient Special"
            maxLength={80}
            data-testid="input-campaign-name"
            className="sm:max-w-lg"
          />
          <FieldError message={errors.name} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">What&rsquo;s included in the offer</h2>
          <p className="text-sm text-muted-foreground">One line per item, the way the caller will read it out.</p>
        </div>
        <ul className="flex flex-col gap-2">
          {values.offerItems.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              <Input
                value={item}
                onChange={(e) => {
                  const next = [...values.offerItems]
                  next[i] = e.target.value
                  set('offerItems', next)
                }}
                placeholder={i === 0 ? 'Example: Consultation with the doctor' : i === 1 ? 'Example: Full exam' : 'Enter another item'}
                maxLength={120}
                aria-label={`Offer item ${i + 1}`}
                data-testid={`input-offer-item-${i}`}
                className="sm:max-w-lg"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove item ${i + 1}`}
                disabled={values.offerItems.length === 1}
                onClick={() => set('offerItems', values.offerItems.filter((_, j) => j !== i))}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit gap-1.5"
          disabled={values.offerItems.length >= 12}
          onClick={() => set('offerItems', [...values.offerItems, ''])}
          data-testid="button-add-offer-item"
        >
          <Plus className="size-4" />
          Add a line
        </Button>
        <FieldError message={errors.offerItems} />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Price</h2>
          <p className="text-sm text-muted-foreground">How the caller mentions price on the phone.</p>
        </div>
        <div role="radiogroup" aria-label="Price line style" className="grid gap-2 sm:grid-cols-3">
          {PRICE_LINE_STYLE_OPTIONS.map((opt) => {
            const selected = values.priceLineStyle === opt.id
            return (
              <label
                key={opt.id}
                className={cn(
                  'flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors',
                  selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                )}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="priceLineStyle"
                    value={opt.id}
                    checked={selected}
                    onChange={() => set('priceLineStyle', opt.id)}
                    className="accent-primary"
                    data-testid={`radio-price-style-${opt.id}`}
                  />
                  <span className="text-sm font-medium text-foreground">{opt.label}</span>
                </span>
                <span className="pl-6 text-xs text-muted-foreground">{opt.description}</span>
              </label>
            )
          })}
        </div>
        <FieldError message={errors.priceLineStyle} />
        <div className="grid gap-4 sm:grid-cols-2 sm:max-w-lg">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-regular">
              Regular price {needsRegular ? null : <span className="font-normal text-muted-foreground">(optional)</span>}
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
              <Input
                id="campaign-regular"
                inputMode="decimal"
                value={values.regularPrice}
                onChange={(e) => set('regularPrice', e.target.value)}
                placeholder="Example: 249"
                className="pl-7"
                data-testid="input-regular-price"
              />
            </div>
            <FieldError message={errors.regularPriceCents} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign-offer">
              Offer price {needsOffer ? null : <span className="font-normal text-muted-foreground">(optional)</span>}
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
              <Input
                id="campaign-offer"
                inputMode="decimal"
                value={values.offerPrice}
                onChange={(e) => set('offerPrice', e.target.value)}
                placeholder="49"
                className="pl-7"
                data-testid="input-offer-price"
              />
            </div>
            <FieldError message={errors.offerPriceCents} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-price-preview">
          On the call:{' '}
          <span className="font-medium text-foreground">
            {values.priceLineStyle === 'no_price' ? 'price is not mentioned' : preview ? `\u201c${preview}\u201d` : '\u2014 enter the price above'}
          </span>
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="campaign-urgency">
            Offer expiration or limited spots <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="campaign-urgency"
            value={values.urgencyNote}
            onChange={(e) => set('urgencyNote', e.target.value)}
            placeholder="Offer ends Friday — only 10 spots this week"
            maxLength={160}
            data-testid="input-urgency-note"
            className="sm:max-w-lg"
          />
          <FieldError message={errors.urgencyNote} />
        </div>
      </section>

      {serverError ? <p className="text-sm text-destructive" role="alert">{serverError}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || niches.length === 0} data-testid="button-save-campaign" className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {campaignId ? 'Save changes' : 'Save & Connect Leads'}
        </Button>
        {!campaignId ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending || niches.length === 0}
            onClick={(e) => submit(e, true)}
            data-testid="button-save-later"
          >
            Save, connect later
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigate(campaignId ? `/portal/campaigns/${campaignId}` : '/portal/campaigns')}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-sm text-destructive" role="alert">{message}</p>
}
