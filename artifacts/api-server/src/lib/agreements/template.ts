import { createHash } from 'node:crypto'
import { AGREEMENT_DEFAULTS, COMPANY, agreementTitle } from './defaults'

/**
 * Agreement text as a small template language so the owner can edit it in
 * one place (or per agreement from the admin) without touching code:
 *
 *   ## Section title [initials]     starts a section; "[initials]" marks it
 *                                   as one the customer must initial
 *   blank line                      separates paragraphs
 *   {{field}}                       merge field (see MERGE_FIELDS)
 *
 * Sections are hashed individually so an edit only clears the initials on
 * the sections whose text actually changed.
 */

export const MERGE_FIELDS = [
  'full_name',
  'business_name',
  'business_address',
  'phone',
  'owner_name',
  'owner_phone',
  'email',
  'term_months',
  'monthly_amount',
  'setup_fee',
  'start_date',
  'end_date',
  'notice_days',
  'trial_days',
  'company_name',
  'company_email',
  'agreement_date',
] as const

export type MergeField = (typeof MERGE_FIELDS)[number]
export type MergeValues = Record<MergeField, string>

export const DEFAULT_AGREEMENT_BODY = `## Parties and Services
This Service Agreement (the "Agreement") is between {{company_name}}, the owner and operator of Patient Pipeline ("Company", "we", "us"), and {{business_name}}, located at {{business_address}} ("Customer", "you"), represented by {{full_name}}. The business owner of record is {{owner_name}} ({{owner_phone}}). Notices to Customer may be sent to {{email}} or {{phone}}.

Company will provide Customer with access to Patient Pipeline, including Patient Reactivation and Lead Follow-Up, guided call scripts, contact and follow-up queues, call-outcome logging, training content, and reporting for Customer's team (the "Services"). Patient Reactivation supports staff-led outreach to past or inactive patients; Lead Follow-Up supports staff-led outreach to new inquiries about Customer's campaigns or offers. Customer's own staff make the calls. Integrated telephone service, automated calling, and call recording are not promised as part of these Services. Access is granted to the Customer's owner account and up to five staff accounts for use within Customer's own business only.

## Term of Agreement [initials]
The initial term of this Agreement is {{term_months}} months (the "Term"). The Term begins on the Start Date, which is {{trial_days}} days after the setup fee is paid, and ends {{term_months}} months later (the "End Date"). Based on today's date, the estimated Start Date is {{start_date}} and the estimated End Date is {{end_date}}; the actual dates are fixed by the date the setup fee is charged.

Access to the Services begins as soon as the setup fee has been paid and this Agreement has been signed, so the {{trial_days}} days before the Start Date are included at no additional charge.

## Fees and Billing [initials]
Customer agrees to pay a one-time setup fee of {{setup_fee}}, charged when this Agreement is signed, and a recurring monthly fee of {{monthly_amount}} for the Services. The first monthly fee is charged on the Start Date and on the same day of each month thereafter for the remainder of the Term. All amounts are in U.S. dollars. Fees are not refundable except as required by law.

If a monthly payment cannot be collected, Company may retry the charge, charge the backup card on file, and suspend access to the Services until the balance is paid. Customer remains responsible for all fees for the full Term.

## Payment Authorization and Cards on File [initials]
Customer authorizes Company to keep two payment cards on file with its payment processor (Stripe) and to charge the primary card for every amount due under this Agreement. If a charge to the primary card fails, Customer authorizes Company to charge the backup card for the same amount. Customer agrees to keep at least one valid card on file for the whole Term and to update card details promptly when they change.

Card details are entered directly into Stripe and are never stored on Company's systems.

## Cancellation and Notice [initials]
Customer may schedule cancellation at any time through the billing page in the Patient Pipeline portal. A confirmed portal cancellation counts as notice; no separate advance-notice period or written cancellation letter is required. During the initial Term, cancellation takes effect on the End Date, and scheduled monthly payments remain due through that date. Scheduling cancellation does not end access immediately or waive the remaining payments. Cancellation before the End Date requires written agreement of both parties, except as required by law.

If cancellation has not been scheduled by the End Date, this Agreement continues month to month. During month-to-month renewal, a confirmed portal cancellation takes effect at the end of the current billing period, with access continuing until that date. The monthly fee remains the agreed amount unless changed by an agreement in writing. Either party may give written notice of non-renewal before the applicable Term or billing-period end; Company notices are sent to Customer's contact information above. Customer may contact {{company_email}} for cancellation assistance if unable to use the portal.

Company may end this Agreement immediately if Customer misuses the Services, shares access outside its own business, or fails to pay an amount due within thirty (30) days of a written reminder.

## Customer Responsibilities
Customer is responsible for the accuracy and lawful collection and use of the contact lists it uploads and for complying with the laws that apply to its outreach, including calling, texting, email, do-not-call, privacy, healthcare-marketing, and health-information rules. Customer may use Patient Reactivation for its own past or inactive patients and Lead Follow-Up for new inquiries about its campaigns or offers, only where the proposed contact is lawful. An existing patient relationship or a submitted inquiry is not blanket permission to contact a person through every channel or for every purpose. Customer must obtain and retain any required consent, respect opt-outs and contact restrictions, and ensure that its staff use appropriate scripts. These responsibilities do not remove Company's own obligations under applicable law.

Customer will keep login details confidential, will not share accounts between people, and will let Company know promptly if it believes an account has been compromised.

## Intellectual Property and Confidentiality
The Services, training content, scripts and software remain the property of Company. Customer receives a limited, non-transferable licence to use them for its own business during the Term and may not copy, resell, record or distribute them. Customer's contact data remains Customer's property; Company uses it only to provide the Services and keeps it confidential.

## Disclaimer and Limitation of Liability [initials]
Company provides training and tools; results depend on how Customer's team uses them. Company does not guarantee any number of appointments, reactivated customers or revenue. To the fullest extent permitted by law, the Services are provided "as is", and Company's total liability under this Agreement is limited to the fees Customer paid in the three (3) months before the claim arose. Neither party is liable for indirect or consequential damages.

## Electronic Signature and Entire Agreement
Customer agrees that signing this Agreement electronically, including by typing or drawing a signature and initialing sections, has the same effect as a handwritten signature, and that Company may keep this Agreement and its record of completion electronically. This Agreement, together with the amounts shown above, is the entire agreement between the parties about the Services and replaces any earlier discussions. It may only be changed in writing signed by both parties. Signed on {{agreement_date}}.`

export interface TemplateSection {
  /** Stable id used to bind initials: position + title slug. */
  id: string
  title: string
  paragraphs: string[]
  requiresInitials: boolean
}

export interface RenderedSection extends TemplateSection {
  /** Hash of the merged section text; initials are valid while this matches. */
  hash: string
}

export interface RenderedDocument {
  title: string
  sections: RenderedSection[]
  fields: MergeValues
  /** Hash of the whole merged document (title + every section). */
  hash: string
}

export const sha256 = (input: string): string => createHash('sha256').update(input, 'utf8').digest('hex')

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

/** Split template text into sections (before merge). */
export function parseTemplate(body: string): TemplateSection[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const sections: TemplateSection[] = []
  let current: { title: string; requiresInitials: boolean; buffer: string[]; paragraphs: string[] } | null = null
  const flushParagraph = () => {
    if (!current) return
    const text = current.buffer.join(' ').replace(/\s+/g, ' ').trim()
    if (text) current.paragraphs.push(text)
    current.buffer = []
  }
  const flushSection = () => {
    if (!current) return
    flushParagraph()
    const index = sections.length + 1
    sections.push({
      id: `s${index}-${slug(current.title) || 'section'}`,
      title: current.title,
      paragraphs: current.paragraphs,
      requiresInitials: current.requiresInitials,
    })
    current = null
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = /^##\s+(.*)$/.exec(line)
    if (heading) {
      flushSection()
      let title = heading[1].trim()
      let requiresInitials = false
      if (/\[initials\]\s*$/i.test(title)) {
        requiresInitials = true
        title = title.replace(/\s*\[initials\]\s*$/i, '').trim()
      }
      current = { title, requiresInitials, buffer: [], paragraphs: [] }
      continue
    }
    if (!current) {
      // Text before the first heading becomes an untitled preamble section
      if (!line.trim()) continue
      current = { title: 'Introduction', requiresInitials: false, buffer: [], paragraphs: [] }
    }
    if (!line.trim()) flushParagraph()
    else current.buffer.push(line.trim())
  }
  flushSection()
  return sections
}

export function validateTemplate(body: string): string | null {
  const text = body.replace(/\r\n?/g, '\n').trim()
  if (!text) return 'The agreement text cannot be empty.'
  if (text.length > 60000) return 'The agreement text is too long (60,000 characters max).'
  const sections = parseTemplate(text)
  if (sections.length === 0) return 'Add at least one "## Section" heading.'
  const unknown = [...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)]
    .map((m) => m[1])
    .filter((f) => !(MERGE_FIELDS as readonly string[]).includes(f))
  if (unknown.length) return `Unknown merge field: {{${[...new Set(unknown)].join('}}, {{')}}}`
  return null
}

export const formatMoney = (cents: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

export const formatLongDate = (d: Date): string =>
  d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })

export interface MergeInput {
  customer: {
    fullName: string
    businessName: string
    businessAddress: string
    phone: string
    ownerName: string
    ownerPhone: string
    email: string
  }
  termMonths: number
  monthlyCents: number
  setupFeeCents: number
  noticeDays: number
  /** Setup-fee payment date; the start date is trialDays after it. Falls back to `asOf`. */
  setupPaidAt?: Date | null
  /** "Today" for the merge (signing date, or now for previews). */
  asOf?: Date
}

/** Start date = setup paid (or today) + trial days; end = start + term. */
export function agreementDates(input: {
  termMonths: number
  setupPaidAt?: Date | null
  asOf?: Date
}): { start: Date; end: Date } {
  const anchor = input.setupPaidAt ?? input.asOf ?? new Date()
  const start = new Date(anchor.getTime() + AGREEMENT_DEFAULTS.trialDays * 86400000)
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + input.termMonths)
  return { start, end }
}

export function mergeValues(input: MergeInput): MergeValues {
  const asOf = input.asOf ?? new Date()
  const { start, end } = agreementDates({ termMonths: input.termMonths, setupPaidAt: input.setupPaidAt, asOf })
  return {
    full_name: input.customer.fullName,
    business_name: input.customer.businessName,
    business_address: input.customer.businessAddress,
    phone: input.customer.phone,
    owner_name: input.customer.ownerName,
    owner_phone: input.customer.ownerPhone,
    email: input.customer.email,
    term_months: String(input.termMonths),
    monthly_amount: formatMoney(input.monthlyCents),
    setup_fee: input.setupFeeCents > 0 ? formatMoney(input.setupFeeCents) : '$0.00 (waived)',
    start_date: formatLongDate(start),
    end_date: formatLongDate(end),
    notice_days: String(input.noticeDays),
    trial_days: String(AGREEMENT_DEFAULTS.trialDays),
    company_name: COMPANY.legalName,
    company_email: COMPANY.supportEmail,
    agreement_date: formatLongDate(asOf),
  }
}

export function fillFields(text: string, values: MergeValues): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key: string) =>
    key in values ? values[key as MergeField] : m,
  )
}

/** Merge a template body with customer + terms into the document the customer reads. */
export function renderDocument(body: string, input: MergeInput): RenderedDocument {
  const fields = mergeValues(input)
  const sections: RenderedSection[] = parseTemplate(body).map((s) => {
    const title = fillFields(s.title, fields)
    const paragraphs = s.paragraphs.map((p) => fillFields(p, fields))
    return { ...s, title, paragraphs, hash: sha256(`${title}\n${paragraphs.join('\n')}`) }
  })
  const title = agreementTitle(input.termMonths)
  const hash = sha256([title, ...sections.map((s) => `${s.id}:${s.hash}`)].join('\n'))
  return { title, sections, fields, hash }
}

/** Hash of a version: the template plus the numbers merged into it. */
export function versionHash(v: { body: string; termMonths: number; monthlyCents: number; setupFeeCents: number; noticeDays: number }): string {
  return sha256(
    `${v.termMonths}|${v.monthlyCents}|${v.setupFeeCents}|${v.noticeDays}\n${v.body.replace(/\r\n?/g, '\n').trim()}`,
  )
}
