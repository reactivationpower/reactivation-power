import { Router, type IRouter, type Request, type Response } from "express";
import type Stripe from "stripe";
import { and, eq, lte } from "drizzle-orm";
import { db, stripeEventsTable, paymentHistoryTable, paymentLinkTermsTable } from "@workspace/db";
import { processAffiliateDispute, processAffiliateHistory, recordAffiliateEligibility } from "@/lib/affiliates/ledger";
import { processResellerDispute, recordResellerEligibility, queueResellerHistory, processResellerRefundedCharge } from "@/lib/resellers/ledger";
import { logger } from "@/lib/logger";
import { getStripeWebhookSecret, stripe } from "@/lib/stripe";
import { getAdminClient } from "@/lib/supabase/admin";
import { reconcileMarketing } from "@/lib/marketing/reconcile";
import { reconcile } from "@/actions/enrollment";
import {
  handleChargeRefunded,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
  type HandleResult,
} from "@/lib/billing/dunning";

/**
 * Stripe billing events.
 *
 * Register https://<app>/api/webhooks/stripe in the Stripe Dashboard (one
 * endpoint per mode) with these events, and store the signing secret as
 * STRIPE_WEBHOOK_SECRET (live) / STRIPE_TEST_WEBHOOK_SECRET (sandbox):
 *
 *   invoice.paid, invoice.payment_failed,
 *   customer.subscription.updated, customer.subscription.deleted,
 *   charge.refunded, payment_intent.succeeded
 *
 * The signature is checked over the exact bytes received (app.ts keeps them
 * on req.rawBody). Every event id is claimed in `stripe_events` before any
 * work happens, so Stripe redelivering an event is acknowledged without
 * re-running side effects.
 */

const router: IRouter = Router();

export const HANDLED_EVENTS = new Set([
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
  "payment_intent.succeeded",
  "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed",
  "charge.dispute.funds_withdrawn", "charge.dispute.funds_reinstated",
]);

/** Claim an event id. Returns false when we have seen it before. */
export async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const inserted = await db
    .insert(stripeEventsTable)
    .values({ id: event.id, type: event.type, livemode: event.livemode, status: "processing" })
    .onConflictDoNothing()
    .returning({ id: stripeEventsTable.id });
  if (inserted.length > 0) return true;
  const reclaimed = await db.update(stripeEventsTable)
    .set({ status: "processing", receivedAt: new Date(), error: null })
    .where(and(eq(stripeEventsTable.id, event.id), eq(stripeEventsTable.status, "processing"),
      lte(stripeEventsTable.receivedAt, new Date(Date.now() - 5 * 60_000))))
    .returning({ id: stripeEventsTable.id });
  return reclaimed.length > 0;
}

export async function dispatchEvent(event: Stripe.Event): Promise<HandleResult> {
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const [terms] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.stripeSubscriptionId, sub.id)).limit(1);
    if (terms) await recordResellerEligibility(terms.linkId,
      event.type !== 'customer.subscription.deleted' && !['paused', 'canceled', 'incomplete_expired'].includes(sub.status) && !sub.pause_collection,
      new Date((sub.ended_at ?? event.created) * 1000), event.id);
    if (terms) await recordAffiliateEligibility(terms.customerId,
      event.type !== 'customer.subscription.deleted' && !['paused', 'canceled', 'incomplete_expired'].includes(sub.status) && !sub.pause_collection,
      new Date((sub.ended_at ?? event.created) * 1000), event.id);
  }
  switch (event.type) {
    case 'charge.refunded':
      await processResellerRefundedCharge(event.data.object as Stripe.Charge,new Date(event.created*1000));
      return handleChargeRefunded(event.data.object as Stripe.Charge,event.id);
    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
    case 'charge.dispute.funds_withdrawn':
    case 'charge.dispute.funds_reinstated':
      await processAffiliateDispute(event.data.object as Stripe.Dispute, new Date(event.created * 1000));
      await processResellerDispute(event.data.object as Stripe.Dispute, new Date(event.created * 1000));
      return { handled: true };
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const linkId = intent.metadata?.rp_link_id;
      if (!linkId || !intent.metadata?.agreement_id) return { handled: false, note: "Not an enrollment payment." };
      const { data } = await getAdminClient().from("agreements").select("token").eq("id", intent.metadata.agreement_id).eq("link_id", linkId).maybeSingle();
      if (!data?.token) throw new Error("Enrollment payment link no longer exists.");
      const outcome = await reconcile(data.token);
      if (!outcome.ok || !outcome.completed) throw new Error(outcome.error ?? "Enrollment reconciliation did not complete.");
      return { handled: true };
    }
    case "invoice.paid":
      return handleInvoicePaid(event.data.object as Stripe.Invoice, event.id);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, event.id);
    case "customer.subscription.updated":
      return handleSubscriptionUpdated(event.data.object as Stripe.Subscription, event.id);
    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event.data.object as Stripe.Subscription, event.id);
    default:
      return { handled: false, note: "unhandled event type" };
  }
}

router.post("/webhooks/stripe", async (req: Request, res: Response) => {
  const secret = getStripeWebhookSecret();
  if (!secret) {
    logger.error("Stripe webhook secret is not set for the active mode; rejecting webhook");
    res.status(503).json({ error: "Webhook secret not configured" });
    return;
  }
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature = req.header("stripe-signature");
  if (!(rawBody instanceof Buffer) || !signature) {
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Stripe webhook signature rejected");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    res.json({ received: true, ignored: true });
    return;
  }

  const fresh = await claimEvent(event);
  if (!fresh) {
    const [existing] = await db.select({ status: stripeEventsTable.status }).from(stripeEventsTable)
      .where(eq(stripeEventsTable.id, event.id)).limit(1);
    if (existing?.status === "processing") {
      res.setHeader("Retry-After", "30");
      res.status(503).json({ error: "Event processing is still in progress; retry this delivery." });
      return;
    }
    res.json({ received: true, duplicate: true });
    return;
  }

  try {
    const result = await dispatchEvent(event);
    // Retry even when the billing handler already recorded history before a prior attempt failed.
    const history = await db.select().from(paymentHistoryTable).where(eq(paymentHistoryTable.stripeEventId, event.id));
    for (const row of history) {
      await queueResellerHistory(row);
      await processAffiliateHistory(row);
    }
    await reconcileMarketing().catch(() => logger.warn("Marketing payment outcome awaits reconciliation"));
    await db
      .update(stripeEventsTable)
      .set({ status: result.handled ? "processed" : "ignored", error: result.note ?? null, processedAt: new Date() })
      .where(eq(stripeEventsTable.id, event.id));
    logger.info({ eventId: event.id, type: event.type, ...result }, "Stripe webhook handled");
    res.json({ received: true, ...result });
  } catch (err) {
    logger.error({ err, eventId: event.id, type: event.type }, "Stripe webhook handler failed");
    // Release the claim so Stripe's redelivery gets another attempt.
    await db.delete(stripeEventsTable).where(eq(stripeEventsTable.id, event.id)).catch(() => undefined);
    res.status(500).json({ error: err instanceof Error ? err.message : "Webhook handler failed" });
  }
});

export default router;
