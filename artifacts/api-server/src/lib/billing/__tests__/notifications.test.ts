import type Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Customer emails in the dunning flow go through the billing_notifications
 * outbox: one row per (type, invoice) claimed atomically, the template data
 * stored on the row, and failed sends retried by the cron. The database is
 * an in-memory table that honours the unique (slot, invoice) index — and the
 * generated `slot` column behind it — the way Postgres does;
 * the mail transport is a stub whose outcome the test controls.
 */

interface Row {
  id: string
  type: string
  stripeInvoiceId: string
  customerId: string
  recipient: string
  payload: Record<string, unknown>
  status: 'pending' | 'sent' | 'failed'
  attempts: number
  lastError: string | null
  emailLogId: string | null
  sentAt: Date | null
  updatedAt: Date
}
const rows: Row[] = []

// ── drizzle stand-ins ──────────────────────────────────────────────────────
// Conditions are reduced to plain predicate objects; `sql` increments are a marker.
type Cond = { col: string; op: 'eq' | 'lt'; value: unknown } | { or: Cond[] } | { and: Cond[] }
const COLS: Record<string, string> = {}
const col = (name: string) => {
  COLS[name] = name
  return name
}
const table = {
  id: col('id'),
  type: col('type'),
  slot: col('slot'),
  stripeInvoiceId: col('stripeInvoiceId'),
  customerId: col('customerId'),
  recipient: col('recipient'),
  payload: col('payload'),
  status: col('status'),
  attempts: col('attempts'),
  lastError: col('lastError'),
  emailLogId: col('emailLogId'),
  sentAt: col('sentAt'),
  updatedAt: col('updatedAt'),
}
const matches = (row: Row, c: Cond | undefined): boolean => {
  if (!c) return true
  if ('and' in c) return c.and.every((x) => matches(row, x))
  if ('or' in c) return c.or.some((x) => matches(row, x))
  const v = row[c.col as keyof Row] as unknown
  if (c.op === 'eq') return v === c.value
  return (v as number | Date) < (c.value as number | Date)
}
const INCREMENT = Symbol('increment')
// Mirrors the generated `slot` column: the two emails about one successful payment share a slot.
const slotOf = (type: string) => (type === 'access_restored' || type === 'payment_received' ? 'paid' : type)
vi.mock('drizzle-orm', () => ({
  and: (...parts: Cond[]) => ({ and: parts.filter(Boolean) }),
  or: (...parts: Cond[]) => ({ or: parts.filter(Boolean) }),
  eq: (c: string, value: unknown) => ({ col: c, op: 'eq', value }),
  lt: (c: string, value: unknown) => ({ col: c, op: 'lt', value }),
  sql: () => INCREMENT,
}))

const applyPatch = (row: Row, patch: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(patch)) (row as unknown as Record<string, unknown>)[k] = v === INCREMENT ? row.attempts + 1 : v
}

vi.mock('@workspace/db', () => ({
  billingNotificationsTable: table,
  db: {
    insert: () => ({
      values: (v: Omit<Row, 'updatedAt' | 'lastError' | 'emailLogId' | 'sentAt'>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const slot = slotOf(v.type)
            if (rows.some((r) => slotOf(r.type) === slot && r.stripeInvoiceId === v.stripeInvoiceId)) return []
            const row: Row = { ...v, lastError: null, emailLogId: null, sentAt: null, updatedAt: new Date() }
            rows.push(row)
            return [row]
          },
        }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: (c: Cond) => ({
          returning: async () => {
            const hit = rows.filter((r) => matches(r, c))
            for (const r of hit) applyPatch(r, patch)
            return hit
          },
          then: (resolve: (v: unknown) => void) => {
            for (const r of rows.filter((r) => matches(r, c))) applyPatch(r, patch)
            resolve(undefined)
          },
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: (c: Cond) => ({ limit: async () => rows.filter((r) => matches(r, c)).map((r) => ({ ...r })) }), // snapshots, like a real result set
      }),
    }),
  },
}))

// ── mail transport stub ────────────────────────────────────────────────────
const sent: { type: string; to: string; data: Record<string, unknown> }[] = []
let sendOutcome: () => boolean = () => true
let sendGate: Promise<void> | null = null
vi.mock('@/lib/mail', () => ({
  billingPageUrl: (email: string) => `https://app.test/billing?email=${encodeURIComponent(email.trim().toLowerCase())}`,
  sendEmail: async (type: string, to: string, data: Record<string, unknown>) => {
    if (sendGate) await sendGate
    const ok = sendOutcome()
    sent.push({ type, to, data })
    return ok ? { ok: true, logId: `log-${sent.length}` } : { ok: false, logId: `log-${sent.length}`, error: 'Resend responded 500' }
  },
}))

const paidInvoices: Stripe.Invoice[] = []
vi.mock('@/lib/stripe', () => ({
  stripe: {
    invoices: { list: async () => ({ data: paidInvoices }) },
    paymentIntents: { retrieve: async () => ({ id: 'pi', payment_method: null, latest_charge: null }) },
  },
}))
vi.mock('@/lib/app-origin', () => ({ appOrigin: () => 'https://app.test' }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { notifyAccessPaused, notifyAccessRestored, notifyBackupCardUsed, notifyPaymentReceived, notifySubscriptionCancelled, retryFailedNotifications } = await import(
  '@/lib/billing/notifications'
)

const customer = {
  id: 'cus_1',
  email: 'Owner@Example.com',
  fullName: 'Dr. Michael Chen',
  ownerName: 'Michael Chen',
  billingStatus: 'active',
  billingBlockedAt: null,
} as never

const invoice = (id: string, extra: Partial<Stripe.Invoice> = {}) =>
  ({
    id,
    amount_due: 47500,
    amount_paid: 47500,
    currency: 'usd',
    description: 'Monthly access',
    lines: { data: [] },
    status_transitions: { paid_at: 1_790_000_000 },
    payments: { data: [] },
    ...extra,
  }) as unknown as Stripe.Invoice

const backupArgs = (id: string) => ({
  customer,
  invoice: invoice(id),
  declined: { brand: 'visa', last4: '0341' },
  charged: { brand: 'mastercard', last4: '4444' },
  reason: 'Your card was declined.',
})

beforeEach(() => {
  rows.length = 0
  sent.length = 0
  paidInvoices.length = 0
  sendOutcome = () => true
  sendGate = null
})

describe('one email per kind per invoice', () => {
  it('sends once and records the outbox row as sent', async () => {
    await notifyBackupCardUsed(backupArgs('in_1'))
    await notifyBackupCardUsed(backupArgs('in_1')) // Stripe re-delivered the event
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: 'payment_failed_backup_used',
      to: 'owner@example.com',
      data: {
        name: 'Dr. Michael Chen',
        amountCents: 47500,
        declinedCard: { last4: '0341' },
        chargedCard: { last4: '4444' },
        updatePaymentUrl: 'https://app.test/billing?email=owner%40example.com',
      },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'sent', attempts: 1, emailLogId: 'log-1', stripeInvoiceId: 'in_1' })
  })

  it('is per invoice and per kind, not per customer', async () => {
    await notifyBackupCardUsed(backupArgs('in_1'))
    await notifyBackupCardUsed(backupArgs('in_2'))
    await notifyAccessPaused({ customer, invoice: invoice('in_1'), cardsTried: [], hadBackupCard: false, reason: null })
    await notifyAccessRestored({ customer, invoice: invoice('in_1'), charged: { brand: 'visa', last4: '4242' } })
    expect(sent.map((s) => s.type)).toEqual(['payment_failed_backup_used', 'payment_failed_backup_used', 'access_paused', 'access_restored'])
  })

  it('lets exactly one of two concurrent callers send (invoice.paid racing subscription.updated)', async () => {
    let release!: () => void
    sendGate = new Promise<void>((r) => (release = r))
    const a = notifyAccessRestored({ customer, invoice: invoice('in_5'), charged: null })
    const b = notifyAccessRestored({ customer, invoice: invoice('in_5'), charged: null })
    await new Promise((r) => setTimeout(r, 5)) // both have passed the claim step; one is blocked in send
    release()
    await Promise.all([a, b])
    expect(sent).toHaveLength(1)
    expect(rows).toHaveLength(1)
  })

  it('does not take over a slot that is still pending (in flight)', async () => {
    let release!: () => void
    sendGate = new Promise<void>((r) => (release = r))
    const first = notifyBackupCardUsed(backupArgs('in_1'))
    await new Promise((r) => setTimeout(r, 5))
    sendGate = null
    await notifyBackupCardUsed(backupArgs('in_1')) // second caller while the first is mid-send
    release()
    await first
    expect(sent).toHaveLength(1)
  })
})

describe('monthly receipt', () => {
  it('is sent once per invoice with the hosted invoice link and the card that paid', async () => {
    const inv = invoice('in_r1', { hosted_invoice_url: 'https://invoice.stripe.com/i/in_r1' } as Partial<Stripe.Invoice>)
    const args = { customer, invoice: inv, charged: { brand: 'visa', last4: '4242' }, receiptUrl: 'https://pay.stripe.com/receipts/x' }
    expect(await notifyPaymentReceived(args)).toBe('sent')
    expect(await notifyPaymentReceived(args)).toBe('duplicate') // invoice.paid + invoice.payment_succeeded
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: 'payment_received',
      to: 'owner@example.com',
      data: {
        name: 'Dr. Michael Chen',
        amountCents: 47500,
        description: 'Monthly access',
        paidAt: new Date(1_790_000_000 * 1000).toISOString(),
        receiptUrl: 'https://invoice.stripe.com/i/in_r1',
        cardBrand: 'visa',
        cardLast4: '4242',
        portalUrl: 'https://app.test/portal',
      },
    })
    expect(rows[0]).toMatchObject({ type: 'payment_received', stripeInvoiceId: 'in_r1', status: 'sent' })
  })

  it('falls back to the card receipt when Stripe has no hosted invoice page', async () => {
    await notifyPaymentReceived({ customer, invoice: invoice('in_r2'), charged: null, receiptUrl: 'https://pay.stripe.com/receipts/x' })
    expect(sent[0].data).toMatchObject({ receiptUrl: 'https://pay.stripe.com/receipts/x', cardBrand: null, cardLast4: null })
  })

  it('is not sent when the same payment already produced an access-restored email', async () => {
    await notifyAccessRestored({ customer, invoice: invoice('in_r3'), charged: { brand: 'visa', last4: '4242' } })
    expect(await notifyPaymentReceived({ customer, invoice: invoice('in_r3'), charged: { brand: 'visa', last4: '4242' } })).toBe('duplicate')
    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('access_restored')
    expect(rows).toHaveLength(1)
  })

  it('a receipt claimed first keeps a later access-restored notice for the same invoice from going out', async () => {
    await notifyPaymentReceived({ customer, invoice: invoice('in_r3b'), charged: null })
    await notifyAccessRestored({ customer, invoice: invoice('in_r3b'), charged: null })
    expect(sent.map((s) => s.type)).toEqual(['payment_received'])
  })

  it('invoice.paid and subscription.updated racing on one payment send exactly one email between them', async () => {
    let release!: () => void
    sendGate = new Promise<void>((r) => (release = r))
    const receipt = notifyPaymentReceived({ customer, invoice: invoice('in_r6'), charged: null })
    const restored = notifyAccessRestored({ customer, invoice: invoice('in_r6'), charged: null })
    await new Promise((r) => setTimeout(r, 5)) // both have tried to claim; the winner is blocked in send
    release()
    const [a] = await Promise.all([receipt, restored])
    expect(a).toBe('sent') // the receipt claimed first here; the restore notice found the slot taken
    expect(sent).toHaveLength(1)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('sent')
  })

  it('a $0 invoice (trial start) gets no receipt', async () => {
    const trial = invoice('in_r7', { amount_due: 0, amount_paid: 0 })
    expect(await notifyPaymentReceived({ customer, invoice: trial, charged: null })).toBe('skipped')
    expect(sent).toHaveLength(0)
    expect(rows).toHaveLength(0)
  })

  it('is its own kind: a receipt for one invoice does not block the next month', async () => {
    await notifyPaymentReceived({ customer, invoice: invoice('in_r4'), charged: null })
    await notifyPaymentReceived({ customer, invoice: invoice('in_r5'), charged: null })
    expect(sent.map((s) => s.type)).toEqual(['payment_received', 'payment_received'])
  })
})

describe('failed sends', () => {
  it('leave a failed row that the next caller for the same invoice re-claims', async () => {
    sendOutcome = () => false
    await notifyBackupCardUsed(backupArgs('in_1'))
    expect(rows[0]).toMatchObject({ status: 'failed', attempts: 1, lastError: 'Resend responded 500' })
    sendOutcome = () => true
    await notifyBackupCardUsed(backupArgs('in_1'))
    expect(sent).toHaveLength(2)
    expect(rows[0]).toMatchObject({ status: 'sent', attempts: 2, lastError: null })
  })

  it('are retried by the cron from the stored payload without a new trigger', async () => {
    sendOutcome = () => false
    await notifyAccessPaused({
      customer,
      invoice: invoice('in_9'),
      cardsTried: [{ brand: 'visa', last4: '0341' }, { brand: 'mastercard', last4: '4444' }],
      hadBackupCard: true,
      reason: 'Insufficient funds.',
    })
    sendOutcome = () => true
    const summary = await retryFailedNotifications()
    expect(summary).toEqual({ retried: 1, sent: 1, failed: 0 })
    expect(sent).toHaveLength(2)
    expect(sent[1].data).toMatchObject({ hadBackupCard: true, reason: 'Insufficient funds.' })
    expect(rows[0].status).toBe('sent')
    // Nothing left to do on the following pass.
    expect(await retryFailedNotifications()).toEqual({ retried: 0, sent: 0, failed: 0 })
    expect(sent).toHaveLength(2)
  })

  it('give up after the attempt cap instead of retrying forever', async () => {
    sendOutcome = () => false
    await notifyBackupCardUsed(backupArgs('in_1'))
    for (let i = 0; i < 6; i++) await retryFailedNotifications()
    expect(rows[0].attempts).toBe(5)
    expect(sent).toHaveLength(5)
  })

  it('two cron runs at once deliver a failed row exactly once (lease before send)', async () => {
    sendOutcome = () => false
    await notifyBackupCardUsed(backupArgs('in_1'))
    sendOutcome = () => true
    let release!: () => void
    sendGate = new Promise<void>((r) => (release = r))
    const a = retryFailedNotifications()
    const b = retryFailedNotifications()
    await new Promise((r) => setTimeout(r, 5))
    release()
    const [sa, sb] = await Promise.all([a, b])
    expect(sa.retried + sb.retried).toBe(1)
    expect(sent).toHaveLength(2) // the original failure + one retry
    expect(rows[0]).toMatchObject({ status: 'sent', attempts: 2 })
  })

  it('a webhook re-claim and the cron cannot both send the same failed row', async () => {
    sendOutcome = () => false
    await notifyBackupCardUsed(backupArgs('in_1'))
    sendOutcome = () => true
    let release!: () => void
    sendGate = new Promise<void>((r) => (release = r))
    const cron = retryFailedNotifications()
    await new Promise((r) => setTimeout(r, 5)) // cron holds the lease, blocked in send
    sendGate = null
    await notifyBackupCardUsed(backupArgs('in_1')) // webhook redelivery sees a pending row and stops
    release()
    await cron
    expect(sent).toHaveLength(2)
  })

  it('picks up a row left pending by a crash mid-send once it is stale', async () => {
    rows.push({
      id: 'stuck',
      type: 'access_restored',
      stripeInvoiceId: 'in_3',
      customerId: 'cus_1',
      recipient: 'owner@example.com',
      payload: { name: 'Michael', amountCents: 1, description: 'x', paidAt: new Date().toISOString(), portalUrl: 'p', billingUrl: 'b' },
      status: 'pending',
      attempts: 0,
      lastError: null,
      emailLogId: null,
      sentAt: null,
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    })
    expect(await retryFailedNotifications()).toEqual({ retried: 1, sent: 1, failed: 0 })
    expect(rows[0].status).toBe('sent')
  })
})

describe('access restored', () => {
  it('uses the invoice it is given and the card that paid', async () => {
    await notifyAccessRestored({ customer, invoice: invoice('in_5'), charged: { brand: 'visa', last4: '4242' } })
    expect(sent[0]).toMatchObject({
      type: 'access_restored',
      data: { amountCents: 47500, chargedCard: { last4: '4242' }, paidAt: new Date(1_790_000_000 * 1000).toISOString(), portalUrl: 'https://app.test/portal' },
    })
  })

  it('looks up the latest paid invoice when only the subscription is known', async () => {
    paidInvoices.push(invoice('in_7'))
    await notifyAccessRestored({ customer, subscriptionId: 'sub_1' })
    await notifyAccessRestored({ customer, subscriptionId: 'sub_1' })
    expect(sent).toHaveLength(1)
    expect(rows[0].stripeInvoiceId).toBe('in_7')
  })

  it('stays silent rather than sending a receipt with no invoice behind it', async () => {
    await notifyAccessRestored({ customer, subscriptionId: 'sub_none' })
    expect(sent).toHaveLength(0)
    expect(rows).toHaveLength(0)
  })
})

describe('subscription cancelled', () => {
  const cancelled = (subscriptionId: string, accessEndsAt = new Date('2026-09-23T15:00:00Z')) =>
    notifySubscriptionCancelled({ customer, subscriptionId, monthlyCents: 47500, accessEndsAt })

  it('tells the customer once per subscription, keyed on the subscription id', async () => {
    expect(await cancelled('sub_1')).toBe('sent')
    expect(sent[0]).toMatchObject({
      type: 'subscription_cancelled',
      to: 'owner@example.com',
      data: {
        name: 'Dr. Michael Chen',
        description: 'Patient Pipeline — $475.00/month',
        accessEndsAt: '2026-09-23T15:00:00.000Z',
        reactivateUrl: 'https://app.test/billing?email=owner%40example.com',
      },
    })
    expect(rows[0]).toMatchObject({ type: 'subscription_cancelled', stripeInvoiceId: 'sub_1', status: 'sent' })
  })

  it('the admin action and the customer.subscription.deleted webhook produce a single email', async () => {
    let release!: () => void
    sendGate = new Promise<void>((r) => (release = r))
    const admin = cancelled('sub_9')
    const webhook = cancelled('sub_9')
    await new Promise((r) => setTimeout(r, 5))
    release()
    const outcomes = await Promise.all([admin, webhook])
    expect(outcomes.sort()).toEqual(['duplicate', 'sent'])
    expect(sent).toHaveLength(1)
  })

  it('a second subscription for the same customer gets its own notice', async () => {
    await cancelled('sub_1')
    await cancelled('sub_2')
    expect(sent).toHaveLength(2)
  })

  it('falls back to a generic description when no monthly amount is on file', async () => {
    await notifySubscriptionCancelled({ customer, subscriptionId: 'sub_3', monthlyCents: null, accessEndsAt: new Date() })
    expect(sent[0].data.description).toBe('Patient Pipeline — monthly subscription')
  })
})
