import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, emailLogTable } from "@workspace/db";
import { logger } from "@/lib/logger";

/**
 * Resend delivery events (sent, delivered, opened, clicked, bounced, ...).
 *
 * Register https://<app>/api/webhooks/resend in the Resend dashboard and
 * store the signing secret as RESEND_WEBHOOK_SECRET. Payloads are signed
 * with Svix's scheme: HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<body>"
 * keyed with the base64 secret after the "whsec_" prefix.
 *
 * Events are matched to email_log rows by Resend's email id, which we store
 * as provider_id when the send is accepted.
 */

const router: IRouter = Router();
const TOLERANCE_SECONDS = 5 * 60;

interface ResendEvent {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    click?: { link?: string; timestamp?: string };
    bounce?: { message?: string; type?: string };
  };
}

export function verifySvixSignature(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  rawBody: Buffer,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.`)
    .update(rawBody)
    .digest();
  return signature.split(/\s+/).some((entry) => {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) return false;
    const candidate = Buffer.from(value, "base64");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

/** Column updates for one event; null when the event is not one we track. */
export function eventPatch(event: ResendEvent): Partial<typeof emailLogTable.$inferInsert> | null {
  const type = event.type ?? "";
  if (!type.startsWith("email.")) return null;
  const at = event.created_at ? new Date(event.created_at) : new Date();
  const when = Number.isNaN(at.getTime()) ? new Date() : at;
  const patch: Partial<typeof emailLogTable.$inferInsert> = { lastEvent: type, lastEventAt: when };
  switch (type) {
    case "email.delivered":
      patch.status = "delivered";
      patch.deliveredAt = when;
      break;
    case "email.opened":
      patch.openedAt = when;
      break;
    case "email.clicked": {
      patch.clickedAt = when;
      const link = event.data?.click?.link;
      if (link) patch.lastClickedUrl = link.slice(0, 2000);
      break;
    }
    case "email.bounced":
      patch.status = "bounced";
      patch.error = event.data?.bounce?.message ?? "Bounced";
      break;
    case "email.complained":
      patch.status = "complained";
      break;
    case "email.failed":
      patch.status = "failed";
      patch.error = "Resend reported the email as failed";
      break;
    default:
      break; // email.sent, email.delivery_delayed, ... — recorded as lastEvent only
  }
  return patch;
}

router.post("/webhooks/resend", async (req: Request, res: Response) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    logger.error("RESEND_WEBHOOK_SECRET is not set; rejecting Resend webhook");
    res.status(503).json({ error: "Webhook secret not configured" });
    return;
  }
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const ok =
    rawBody instanceof Buffer &&
    verifySvixSignature(
      secret,
      {
        id: req.header("svix-id") ?? undefined,
        timestamp: req.header("svix-timestamp") ?? undefined,
        signature: req.header("svix-signature") ?? undefined,
      },
      rawBody,
    );
  if (!ok) {
    logger.warn({ svixId: req.header("svix-id") }, "Resend webhook signature rejected");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const event = req.body as ResendEvent;
  const emailId = event.data?.email_id;
  const patch = eventPatch(event);
  if (!emailId || !patch) {
    res.status(202).json({ ignored: true });
    return;
  }
  // Open/click never regress a bounce, and delivered never overwrites a later
  // bounce: only touch status when the event says so.
  const updated = await db
    .update(emailLogTable)
    .set(patch)
    .where(eq(emailLogTable.providerId, emailId))
    .returning({ id: emailLogTable.id });
  if (updated.length === 0) {
    logger.info({ emailId, type: event.type }, "Resend event for unknown email id");
  } else {
    logger.info({ emailId, type: event.type, logId: updated[0].id }, "Resend event recorded");
  }
  res.status(200).json({ received: true });
});

export default router;
