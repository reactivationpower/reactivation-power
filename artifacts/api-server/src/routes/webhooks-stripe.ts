import { Router, type IRouter, type Request, type Response } from "express";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, stripeEventsTable } from "@workspace/db";
import { logger } from "@/lib/logger";
import { getStripeWebhookSecret, stripe } from "@/lib/stripe";
import { getAdminClient } from "@/lib/supabase/admin";
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
]);

/** Claim an event id. Returns false when we have seen it before. */
export async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const inserted = await db
    .insert(stripeEventsTable)
    .values({ id: event.id, type: event.type, livemode: event.livemode, status: "processing" })
    .onConflictDoNothing()
    .returning({ id: stripeEventsTable.id });
  return inserted.length > 0;
}

export async function dispatchEvent(event: Stripe.Event): Promise<HandleResult> {
  switch (event.type) {
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
    case "charge.refunded":
      return handleChargeRefunded(event.data.object as Stripe.Charge, event.id);
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
    res.json({ received: true, duplicate: true });
    return;
  }

  try {
    const result = await dispatchEvent(event);
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
