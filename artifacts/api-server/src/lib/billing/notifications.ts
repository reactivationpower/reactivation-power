import { randomBytes } from 'crypto'
import type Stripe from 'stripe'
import { and, eq, lt, or, sql } from 'drizzle-orm'
import {
  billingNotificationsTable,
  db,
  type BillingNotification,
  type BillingNotificationType,
  type Customer,
  type CustomerCard,
} from '@workspace/db'

import { logger } from '@/lib/logger'
import { stripe } from '@/lib/stripe'
import { billingPageUrl, sendEmail, type CardSummary, type TemplateDataMap } from '@/lib/mail'
import { appOrigin } from '@/lib/app-origin'
import { invoiceDescription, latestInvoiceAttempt, type CardUsed } from './dunning'

/**
 * Customer-facing emails for the failed-payment flow, delivered through a
 * small outbox (`billing_notifications`):
 *
 *   - One row per (type, invoice). The unique index makes the "once per
 *     invoice" rule hold even when two Stripe events, or a webhook and the
 *     daily cron, race each other: exactly one caller wins the insert and
 *     sends; the others see the existing row and stop.
 *   - The rendered template data is stored on the row, so a send that the
 *     mail provider rejected is retried by `retryFailedNotifications()`
 *     (run from the daily billing cron) without touching Stripe again.
 *
 * Nothing here throws: these run inside webhook handlers where the ledger
 * write and the access change must never be rolled back by a mail problem.
 */

export type DunningEmailType = BillingNotificationType

const MAX_ATTEMPTS = 5
const newId = () => randomBytes(16).toString('hex')

type Payload<K extends DunningEmailType> = TemplateDataMap[K]

/**
 * Claim the (type, invoice) slot. Returns the row when this caller should
 * send, null when another caller already owns it (sent, or in flight).
 * A previous attempt that failed can be re-claimed until MAX_ATTEMPTS.
 */
async function claim<K extends DunningEmailType>(
  type: K,
  invoiceId: string,
  customer: Customer,
  payload: Payload<K>,
): Promise<BillingNotification | null> {
  const [inserted] = await db
    .insert(billingNotificationsTable)
    .values({
      id: newId(),
      type,
      stripeInvoiceId: invoiceId,
      customerId: customer.id,
      recipient: customer.email.trim().toLowerCase(),
      payload: payload as unknown as Record<string, unknown>,
      status: 'pending',
      attempts: 0,
    })
    .onConflictDoNothing({ target: [billingNotificationsTable.type, billingNotificationsTable.stripeInvoiceId] })
    .returning()
  if (inserted) return inserted
  // Someone else holds it. Only a failed earlier attempt may be taken over.
  const [reclaimed] = await db
    .update(billingNotificationsTable)
    .set({ status: 'pending', payload: payload as unknown as Record<string, unknown>, updatedAt: new Date() })
    .where(
      and(
        eq(billingNotificationsTable.type, type),
        eq(billingNotificationsTable.stripeInvoiceId, invoiceId),
        eq(billingNotificationsTable.status, 'failed'),
        lt(billingNotificationsTable.attempts, MAX_ATTEMPTS),
      ),
    )
    .returning()
  return reclaimed ?? null
}

/** Send the row's email and record the outcome on it. */
async function deliver(row: BillingNotification): Promise<boolean> {
  const result = await sendEmail(row.type, row.recipient, row.payload as never, {
    metadata: { customerId: row.customerId, invoiceId: row.stripeInvoiceId, notificationId: row.id },
  })
  await db
    .update(billingNotificationsTable)
    .set({
      status: result.ok ? 'sent' : 'failed',
      attempts: sql`${billingNotificationsTable.attempts} + 1`,
      lastError: result.ok ? null : (result.error ?? 'send failed'),
      emailLogId: result.logId,
      sentAt: result.ok ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(billingNotificationsTable.id, row.id))
  return result.ok
}

async function enqueueAndSend<K extends DunningEmailType>(
  type: K,
  invoiceId: string,
  customer: Customer,
  payload: Payload<K>,
): Promise<'sent' | 'failed' | 'duplicate'> {
  try {
    const row = await claim(type, invoiceId, customer, payload)
    if (!row) return 'duplicate'
    return (await deliver(row)) ? 'sent' : 'failed'
  } catch (err) {
    logger.error({ err, type, invoiceId, customerId: customer.id }, 'billing email: could not queue notification')
    return 'failed'
  }
}

/**
 * Re-send every notification whose last attempt failed (up to MAX_ATTEMPTS),
 * and pick up rows left `pending` by a crash mid-send. Called from the daily
 * billing cron.
 */
export async function retryFailedNotifications(): Promise<{ retried: number; sent: number; failed: number }> {
  const summary = { retried: 0, sent: 0, failed: 0 }
  const stale = new Date(Date.now() - 15 * 60 * 1000)
  const rows = await db
    .select()
    .from(billingNotificationsTable)
    .where(
      and(
        lt(billingNotificationsTable.attempts, MAX_ATTEMPTS),
        or(
          eq(billingNotificationsTable.status, 'failed'),
          and(eq(billingNotificationsTable.status, 'pending'), lt(billingNotificationsTable.updatedAt, stale)),
        ),
      ),
    )
    .limit(100)
  for (const candidate of rows) {
    // Lease the row before sending: a conditional update that only succeeds
    // while it is still in the state we selected it in, so two cron runs (or
    // the cron and a webhook re-claim) cannot both deliver it.
    const [row] = await db
      .update(billingNotificationsTable)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(
        and(
          eq(billingNotificationsTable.id, candidate.id),
          eq(billingNotificationsTable.status, candidate.status),
          eq(billingNotificationsTable.attempts, candidate.attempts),
          lt(billingNotificationsTable.attempts, MAX_ATTEMPTS),
        ),
      )
      .returning()
    if (!row) continue
    summary.retried += 1
    try {
      if (await deliver(row)) summary.sent += 1
      else summary.failed += 1
    } catch (err) {
      summary.failed += 1
      logger.error({ err, notificationId: row.id }, 'billing email: retry failed')
    }
  }
  return summary
}

export function cardSummary(card: Pick<CustomerCard, 'brand' | 'last4'> | CardUsed | null | undefined): CardSummary | null {
  if (!card) return null
  return { brand: card.brand ?? null, last4: card.last4 ?? null }
}

const recipientName = (customer: Customer) => customer.fullName?.trim() || customer.ownerName?.trim() || 'there'

/** Card 1 declined, card 2 paid the invoice. */
export async function notifyBackupCardUsed(input: {
  customer: Customer
  invoice: Stripe.Invoice
  declined: CardSummary | null
  charged: CardSummary | null
  reason: string | null
}): Promise<void> {
  const { customer, invoice } = input
  await enqueueAndSend('payment_failed_backup_used', invoice.id, customer, {
    name: recipientName(customer),
    amountCents: invoice.amount_due,
    description: invoiceDescription(invoice),
    reason: input.reason,
    declinedCard: input.declined,
    chargedCard: input.charged,
    updatePaymentUrl: billingPageUrl(customer.email),
  })
}

/** Every card declined; the portal is shut off until an invoice is paid. */
export async function notifyAccessPaused(input: {
  customer: Customer
  invoice: Stripe.Invoice
  cardsTried: CardSummary[]
  hadBackupCard: boolean
  reason: string | null
}): Promise<void> {
  const { customer, invoice } = input
  await enqueueAndSend('access_paused', invoice.id, customer, {
    name: recipientName(customer),
    amountCents: invoice.amount_due,
    description: invoiceDescription(invoice),
    reason: input.reason,
    cardsTried: input.cardsTried,
    hadBackupCard: input.hadBackupCard,
    updatePaymentUrl: billingPageUrl(customer.email),
  })
}

/**
 * A payment went through for a customer whose access was paused. Pass the
 * paid invoice when the caller has it; otherwise the subscription's most
 * recent paid invoice is looked up so the email can say what was paid.
 */
export async function notifyAccessRestored(input: {
  customer: Customer
  invoice?: Stripe.Invoice | null
  subscriptionId?: string | null
  charged?: CardSummary | null
}): Promise<void> {
  const { customer } = input
  let invoice = input.invoice ?? null
  if (!invoice && input.subscriptionId) {
    try {
      const paid = await stripe.invoices.list({ subscription: input.subscriptionId, status: 'paid', limit: 1 })
      invoice = paid.data[0] ?? null
    } catch (err) {
      logger.warn({ err, subscriptionId: input.subscriptionId }, 'billing email: could not find paid invoice for restore notice')
    }
  }
  if (!invoice) {
    logger.warn({ customerId: customer.id }, 'billing email: access restored without a paid invoice; no email sent')
    return
  }
  let charged = input.charged ?? null
  if (!charged) {
    try {
      charged = cardSummary(await latestInvoiceAttempt(invoice))
    } catch (err) {
      logger.warn({ err, invoiceId: invoice.id }, 'billing email: could not resolve card for restore notice')
    }
  }
  await enqueueAndSend('access_restored', invoice.id, customer, {
    name: recipientName(customer),
    amountCents: invoice.amount_paid || invoice.amount_due,
    description: invoiceDescription(invoice),
    paidAt: new Date((invoice.status_transitions?.paid_at ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    chargedCard: charged,
    portalUrl: `${appOrigin()}/portal`,
    billingUrl: billingPageUrl(customer.email),
  })
}
