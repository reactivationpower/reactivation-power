import express, { Router, type ErrorRequestHandler, type IRouter, type Request, type Response } from "express";
import { phoneKey } from "@workspace/shared/lead-followup";
import {
  detectWebhookSource,
  mapWebhookPayload,
  type WebhookFieldMapping,
} from "@workspace/shared/lead-webhooks";
import { logger } from "@/lib/logger";
import { webhookRateLimiter } from "@/lib/lead-followup/rate-limit";
import * as store from "@/lib/lead-followup/store";

/**
 * Lead Follow-Up intake: POST /api/webhooks/leads/:token
 *
 * One URL per campaign; the token is the campaign's secret and the only
 * credential (no session, no API key). Any form tool, Zapier, a Facebook
 * lead-form connector or a GoHighLevel workflow can post JSON or
 * form-encoded fields. Every body is stored raw, mapped to a lead with the
 * campaign's field mapping, and either creates a lead or refreshes the
 * existing one with the same phone.
 *
 * Status codes: 201 created, 200 updated, 400 unreadable body,
 * 404 unknown token, 410 archived campaign, 422 mapped but unusable,
 * 429 over the per-campaign rate limit.
 */

const router: IRouter = Router();

export const LEAD_WEBHOOK_PATH = "/webhooks/leads";
export const TEST_HEADER = "x-lead-webhook-test";

export const LEAD_WEBHOOK_BODY_LIMIT = "256kb";
export const LEAD_WEBHOOK_BODY_LIMIT_BYTES = 256 * 1024;

const FORM_KEY = /^[\w.\-\[\] ]+$/;

function parseForm(text: string): Record<string, unknown> | null {
  if (!text.includes("=")) return null;
  const entries = [...new URLSearchParams(text).entries()].filter(([k]) => k);
  if (entries.length === 0 || !entries.every(([k]) => FORM_KEY.test(k))) return null;
  return Object.fromEntries(entries);
}

type ReadResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string; raw: string };

/**
 * JSON or form fields from the raw bytes, guided by (but not trusting) the
 * declared content type: form tools and Zapier are loose about it.
 */
export function readBody(raw: unknown, contentType: string | null): ReadResult {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8").trim() : typeof raw === "string" ? raw.trim() : "";
  if (!text) return { ok: false, error: "The request body was empty.", raw: "" };
  const keep = text.slice(0, 2000);

  const isForm = contentType === "application/x-www-form-urlencoded";
  if (isForm) {
    const form = parseForm(text);
    if (form) return { ok: true, body: form };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (Object.keys(parsed as object).length === 0) return { ok: false, error: "The body was empty — no fields were received.", raw: keep };
      return { ok: true, body: parsed as Record<string, unknown> };
    }
    return { ok: false, error: "The body must be a JSON object, not a list or a bare value.", raw: keep };
  } catch {
    const form = isForm ? null : parseForm(text);
    if (form) return { ok: true, body: form };
    return { ok: false, error: "The body could not be read as JSON or form fields.", raw: keep };
  }
}

router.get(`${LEAD_WEBHOOK_PATH}/:token`, (_req: Request, res: Response) => {
  res.status(405).set("Allow", "POST").json({
    error: "This URL accepts POST requests only. Point your form tool or GoHighLevel workflow at it with a POST.",
  });
});

router.post(
  `${LEAD_WEBHOOK_PATH}/:token`,
  // Mounted ahead of the app-wide parsers (see app.ts): the bytes arrive raw,
  // whatever content type the sender claimed, capped well below the global limit.
  express.raw({ type: () => true, limit: LEAD_WEBHOOK_BODY_LIMIT }),
  async (req: Request, res: Response) => {
    const token = String(req.params.token ?? "");
    const campaign = await store.findCampaignByWebhookToken(token);
    if (!campaign) {
      res.status(404).json({ error: "Unknown webhook URL. Copy the current URL from the campaign's Lead sources tab." });
      return;
    }

    const limit = webhookRateLimiter.check(campaign.id);
    if (!limit.allowed) {
      res.status(429).set("Retry-After", String(limit.retryAfterSeconds)).json({
        error: `Too many requests for this campaign. Try again in ${limit.retryAfterSeconds}s.`,
      });
      return;
    }

    if (campaign.status === "archived") {
      res.status(410).json({ error: "This campaign is archived and no longer accepts leads. Restore it in the portal first." });
      return;
    }

    const contentType = req.header("content-type")?.split(";")[0]?.trim() ?? null;
    const isTest = req.header(TEST_HEADER) === "1";
    const read = readBody(req.body, contentType);
    if (!read.ok) {
      await store.recordWebhookEvent({
        campaign,
        source: isTest ? "test" : "webhook",
        contentType,
        payload: read.raw ? { _raw: read.raw } : {},
        outcome: "rejected",
        error: read.error,
      });
      res.status(400).json({ error: read.error });
      return;
    }

    const leadSource = detectWebhookSource(read.body);
    const eventSource = isTest ? "test" : leadSource;
    const mapped = mapWebhookPayload(read.body, (campaign.fieldMapping ?? {}) as WebhookFieldMapping);
    if (!mapped.ok) {
      await store.recordWebhookEvent({
        campaign,
        source: eventSource,
        contentType,
        payload: read.body,
        outcome: "rejected",
        error: mapped.error,
      });
      res.status(422).json({ error: mapped.error });
      return;
    }

    try {
      const result = await store.upsertWebhookLead({
        campaign,
        lead: mapped.lead,
        phoneKey: phoneKey(mapped.lead.phone),
        source: leadSource,
      });
      await store.recordWebhookEvent({
        campaign,
        source: eventSource,
        contentType,
        payload: read.body,
        outcome: result.outcome,
        leadId: result.leadId,
      });
      logger.info({ campaignId: campaign.id, leadId: result.leadId, outcome: result.outcome, source: leadSource }, "Lead webhook handled");
      res.status(result.outcome === "created" ? 201 : 200).json({ received: true, outcome: result.outcome, leadId: result.leadId, source: leadSource });
    } catch (err) {
      logger.error({ err, campaignId: campaign.id }, "Lead webhook failed to store the lead");
      await store
        .recordWebhookEvent({
          campaign,
          source: eventSource,
          contentType,
          payload: read.body,
          outcome: "rejected",
          error: "The lead could not be saved. Please try again.",
        })
        .catch(() => undefined);
      res.status(500).json({ error: "The lead could not be saved. Please try again." });
    }
  },
);

/**
 * The raw parser rejects an oversized body before the handler runs. Still
 * attribute it to the campaign so the owner sees why nothing arrived.
 */
const bodyErrors: ErrorRequestHandler = async (err, req, res, next) => {
  const status = (err as { status?: unknown })?.status;
  if (typeof status !== "number" || status < 400 || status >= 500 || !req.path.startsWith(`${LEAD_WEBHOOK_PATH}/`)) {
    next(err);
    return;
  }
  const message =
    status === 413
      ? `The body was larger than ${LEAD_WEBHOOK_BODY_LIMIT_BYTES / 1024} KB. Send only the lead's fields.`
      : "The request body could not be read.";
  const token = req.path.slice(LEAD_WEBHOOK_PATH.length + 1).split("/")[0] ?? "";
  const campaign = await store.findCampaignByWebhookToken(decodeURIComponent(token)).catch(() => null);
  if (!campaign) {
    res.status(404).json({ error: "Unknown webhook URL. Copy the current URL from the campaign's Lead sources tab." });
    return;
  }
  await store
    .recordWebhookEvent({
      campaign,
      source: req.header(TEST_HEADER) === "1" ? "test" : "webhook",
      contentType: req.header("content-type")?.split(";")[0]?.trim() ?? null,
      payload: {},
      outcome: "rejected",
      error: message,
    })
    .catch(() => undefined);
  res.status(status).json({ error: message });
};
router.use(bodyErrors);

export default router;
