import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, emailLogTable, type EmailLog } from "@workspace/db";
import { logger } from "@/lib/logger";
import { DELIVERY_FAILURES, deliveryFailureMessage } from "@/lib/mail/diagnostics";

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

export interface ResendEvent {
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
  if (!/^\d+$/.test(timestamp) || !Number.isSafeInteger(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (!key.length) return false;
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
  if (!['email.sent', 'email.delivered', 'email.opened', 'email.clicked', 'email.bounced',
    'email.complained', 'email.failed', 'email.suppressed', 'email.delivery_delayed'].includes(type)) return null;
  const when = new Date(event.created_at ?? '');
  if (Number.isNaN(when.getTime())) return null;
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
      // Reset/setup URLs can contain bearer secrets, even inside the path.
      // Keep the click timestamp only, never the provider's URL.
      patch.lastClickedUrl = null;
      break;
    }
    case "email.bounced":
      patch.status = "bounced";
      patch.error = deliveryFailureMessage("bounced");
      break;
    case "email.suppressed":
      patch.status = "suppressed";
      patch.error = deliveryFailureMessage("suppressed");
      break;
    case "email.complained":
      patch.status = "complained";
      patch.error = deliveryFailureMessage("complained");
      break;
    case "email.failed":
      patch.status = "failed";
      patch.error = deliveryFailureMessage("failed");
      break;
    default:
      break; // email.sent, email.delivery_delayed, ... — recorded as lastEvent only
  }
  return patch;
}

/** Applied under a row lock: retries are no-ops and failures cannot be erased. */
export function deliveryPatch(row: EmailLog, event: ResendEvent): Partial<typeof emailLogTable.$inferInsert> | null {
  const patch = eventPatch(event);
  if (!patch) return null;
  const failedBefore = DELIVERY_FAILURES.some(s => s === row.status);
  const failedNow = DELIVERY_FAILURES.some(s => s === patch.status);
  const olderOrDuplicate = !!row.lastEventAt && (
    row.lastEventAt > patch.lastEventAt! ||
    (row.lastEventAt.getTime() === patch.lastEventAt!.getTime() && row.lastEvent === patch.lastEvent)
  );
  if (olderOrDuplicate && (!failedNow || failedBefore)) return null;
  if (failedBefore && !failedNow) {
    delete patch.status;
    delete patch.error;
  }
  if (olderOrDuplicate) {
    // A delayed bounce still matters, but must not move the event clock back.
    delete patch.lastEvent;
    delete patch.lastEventAt;
  }
  // Clear any legacy tracked URLs as well.
  patch.lastClickedUrl = null;
  return patch;
}

router.post("/webhooks/resend", async (req: Request, res: Response): Promise<void> => {
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

  const event = req.body as ResendEvent | null;
  if (!event || typeof event !== 'object' || typeof event.type !== 'string'
    || typeof event.created_at !== 'string' || Number.isNaN(Date.parse(event.created_at))
    || typeof event.data?.email_id !== 'string' || !event.data.email_id) {
    res.status(400).json({ error: "Invalid delivery event" });
    return;
  }
  const emailId = event.data?.email_id;
  const patch = eventPatch(event);
  if (!emailId || !patch) {
    res.status(202).json({ ignored: true });
    return;
  }
  const matched = await db.transaction(async tx => {
    const rows = await tx.select().from(emailLogTable)
      .where(eq(emailLogTable.providerId, emailId)).for("update");
    for (const row of rows) {
      const next = deliveryPatch(row, event);
      if (next) await tx.update(emailLogTable).set(next).where(eq(emailLogTable.id, row.id));
    }
    return rows.length;
  });
  if (!matched) {
    logger.info({ emailId, type: event.type }, "Resend event for unknown email id");
    // Resend can deliver its event before the accepted-send log is committed.
    // Ask for a retry rather than permanently acknowledging an unmatched event.
    res.status(503).json({ error: "Email log not available yet; retry delivery event" });
    return;
  } else {
    logger.info({ emailId, type: event.type }, "Resend event recorded");
  }
  res.status(200).json({ received: true });
});

export default router;
