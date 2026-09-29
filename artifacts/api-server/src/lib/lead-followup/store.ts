import { randomBytes, randomUUID } from "node:crypto";
import { queueLeadEmail, deliverLeadEmails } from './notifications';
import { and, asc, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, lte, ne, notInArray, or, sql } from "drizzle-orm";
import {
  campaignLeadsTable,
  campaignWebhookEventsTable,
  db,
  leadCallsTable,
  leadCampaignsTable,
  productAccessTable,
  type CampaignLeadRow,
  type CampaignWebhookEventRow,
  type LeadCallRow,
  type LeadCampaignRow,
} from "@workspace/db";
import type { MappedLead, WebhookFieldMapping } from "@workspace/shared/lead-webhooks";
import {
  officeClock,
  officeWallClockOf,
  parseRequestedTime,
} from "@workspace/shared/lead-requested-time";
import {
  applyLeadDisposition,
  reopenParkedLead,
  leadCallBlockReason,
  leadDispositionFieldError,
  planLeadImport,
  type CampaignInput,
  type CampaignLeadSource,
  type CampaignStatus,
  type LeadDisposition,
  type LeadImportPlan,
  type LeadImportRow,
  type LeadSource,
  type LeadStatus,
} from "@workspace/shared/lead-followup";

/**
 * Data access for campaigns and their leads. Every query is scoped by
 * owner id: a campaign id from another account simply does not exist here.
 */

// ---------- campaigns ----------

/** 192 random bits, URL-safe: the secret segment of a campaign's intake URL. */
export const newWebhookToken = () => randomBytes(24).toString("base64url");

export interface CampaignWithCounts extends LeadCampaignRow {
  leadCount: number;
  newLeadCount: number;
  /** Leads someone has spoken with at least once (see campaignConversion). */
  reachedCount: number;
  bookedCount: number;
}

/** SQL form of the "reached" rule in campaignConversion; keep the two in step. */
const REACHED_SQL = sql`(${campaignLeadsTable.status} in ('reached', 'booked', 'confirmed') or (${campaignLeadsTable.status} = 'closed' and ${campaignLeadsTable.lastDisposition} in ('booked_elsewhere', 'do_not_call')))`;
const BOOKED_SQL = sql`${campaignLeadsTable.status} in ('booked', 'confirmed')`;

export async function listCampaigns(
  ownerId: string,
): Promise<CampaignWithCounts[]> {
  const campaigns = await db
    .select()
    .from(leadCampaignsTable)
    .where(eq(leadCampaignsTable.ownerId, ownerId))
    .orderBy(desc(leadCampaignsTable.createdAt));
  if (campaigns.length === 0) return [];

  const counts = await db
    .select({
      campaignId: campaignLeadsTable.campaignId,
      total: sql<number>`count(*)::int`,
      fresh: sql<number>`count(*) filter (where ${campaignLeadsTable.status} = 'new')::int`,
      reached: sql<number>`count(*) filter (where ${REACHED_SQL})::int`,
      booked: sql<number>`count(*) filter (where ${BOOKED_SQL})::int`,
    })
    .from(campaignLeadsTable)
    .where(
      inArray(
        campaignLeadsTable.campaignId,
        campaigns.map((c) => c.id),
      ),
    )
    .groupBy(campaignLeadsTable.campaignId);
  const byId = new Map(counts.map((c) => [c.campaignId, c]));

  return campaigns.map((c) => ({
    ...c,
    leadCount: byId.get(c.id)?.total ?? 0,
    newLeadCount: byId.get(c.id)?.fresh ?? 0,
    reachedCount: byId.get(c.id)?.reached ?? 0,
    bookedCount: byId.get(c.id)?.booked ?? 0,
  }));
}

export async function getCampaign(
  ownerId: string,
  id: string,
): Promise<LeadCampaignRow | null> {
  const rows = await db
    .select()
    .from(leadCampaignsTable)
    .where(
      and(
        eq(leadCampaignsTable.id, id),
        eq(leadCampaignsTable.ownerId, ownerId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createCampaign(
  ownerId: string,
  createdBy: string,
  input: CampaignInput,
): Promise<LeadCampaignRow> {
  const [row] = await db
    .insert(leadCampaignsTable)
    .values({
      id: randomUUID(),
      ownerId,
      createdBy,
      nicheId: input.nicheId,
      name: input.name,
      offerItems: input.offerItems,
      regularPriceCents: input.regularPriceCents,
      offerPriceCents: input.offerPriceCents,
      priceLineStyle: input.priceLineStyle,
      urgencyNote: input.urgencyNote,
      status: "active",
      webhookToken: newWebhookToken(),
    })
    .returning();
  return row;
}

/** The campaign behind an intake URL, whatever account it belongs to. */
export async function findCampaignByWebhookToken(token: string): Promise<LeadCampaignRow | null> {
  if (!token) return null
  const rows = await db.select().from(leadCampaignsTable).where(eq(leadCampaignsTable.webhookToken, token)).limit(1)
  return rows[0] ?? null
}

/** Issue a fresh token; the previous URL stops working the moment this commits. */
export async function regenerateWebhookToken(ownerId: string, id: string): Promise<LeadCampaignRow | null> {
  const [row] = await db
    .update(leadCampaignsTable)
    .set({ webhookToken: newWebhookToken(), updatedAt: new Date() })
    .where(and(eq(leadCampaignsTable.id, id), eq(leadCampaignsTable.ownerId, ownerId)))
    .returning()
  return row ?? null
}

export async function updateFieldMapping(
  ownerId: string,
  id: string,
  mapping: WebhookFieldMapping,
): Promise<LeadCampaignRow | null> {
  const [row] = await db
    .update(leadCampaignsTable)
    .set({ fieldMapping: mapping as Record<string, string>, updatedAt: new Date() })
    .where(and(eq(leadCampaignsTable.id, id), eq(leadCampaignsTable.ownerId, ownerId)))
    .returning()
  return row ?? null
}

export async function updateCampaignLeadSource(
  ownerId: string,
  id: string,
  source: CampaignLeadSource,
): Promise<LeadCampaignRow | null> {
  const [row] = await db
    .update(leadCampaignsTable)
    .set({ leadSourceSetup: source, updatedAt: new Date() })
    .where(and(eq(leadCampaignsTable.id, id), eq(leadCampaignsTable.ownerId, ownerId)))
    .returning()
  return row ?? null
}

export async function updateCampaign(
  ownerId: string,
  id: string,
  input: CampaignInput,
): Promise<LeadCampaignRow | null> {
  const [row] = await db
    .update(leadCampaignsTable)
    .set({
      nicheId: input.nicheId,
      name: input.name,
      offerItems: input.offerItems,
      regularPriceCents: input.regularPriceCents,
      offerPriceCents: input.offerPriceCents,
      priceLineStyle: input.priceLineStyle,
      urgencyNote: input.urgencyNote,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(leadCampaignsTable.id, id),
        eq(leadCampaignsTable.ownerId, ownerId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function setCampaignStatus(
  ownerId: string,
  id: string,
  status: CampaignStatus,
): Promise<LeadCampaignRow | null> {
  const [row] = await db
    .update(leadCampaignsTable)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(leadCampaignsTable.id, id),
        eq(leadCampaignsTable.ownerId, ownerId),
      ),
    )
    .returning();
  return row ?? null;
}

// ---------- leads ----------

/** Account-scoped, newest-first list. Filtering and pagination happen in SQL so
 * an office with many campaigns never has to download every lead to open Leads. */
export async function listAccountLeads(
  ownerId: string,
  options: { campaignId?: string; search?: string; status?: "all" | "new" | "parked"; page?: number } = {},
) {
  const pageSize = 50;
  const page = Math.max(1, Math.min(10000, Math.floor(options.page || 1)));
  const search = (options.search ?? "").trim().slice(0, 100);
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const where = and(
    eq(campaignLeadsTable.ownerId, ownerId),
    eq(leadCampaignsTable.ownerId, ownerId),
    options.campaignId ? eq(campaignLeadsTable.campaignId, options.campaignId) : undefined,
    options.status === "new" ? eq(campaignLeadsTable.status, "new") : undefined,
    options.status === "parked"
      ? and(eq(campaignLeadsTable.status, "attempted"), isNull(campaignLeadsTable.nextDueAt), gte(campaignLeadsTable.unansweredAttempts, 3))
      : undefined,
    search ? or(
      ilike(campaignLeadsTable.firstName, pattern),
      ilike(campaignLeadsTable.lastName, pattern),
      ilike(campaignLeadsTable.phone, pattern),
      ilike(campaignLeadsTable.email, pattern),
      ilike(leadCampaignsTable.name, pattern),
    ) : undefined,
  );
  const [rows, [{ total }]] = await Promise.all([
    db.select({ lead: campaignLeadsTable, campaign: leadCampaignsTable })
      .from(campaignLeadsTable)
      .innerJoin(leadCampaignsTable, eq(campaignLeadsTable.campaignId, leadCampaignsTable.id))
      .where(where)
      .orderBy(desc(campaignLeadsTable.submittedAt), desc(campaignLeadsTable.createdAt), desc(campaignLeadsTable.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` })
      .from(campaignLeadsTable)
      .innerJoin(leadCampaignsTable, eq(campaignLeadsTable.campaignId, leadCampaignsTable.id))
      .where(where),
  ]);
  return { rows, total, page, pageSize };
}

/** Newest first: leads decay by the hour, so the freshest response is always on top. */
export async function listLeads(
  campaignId: string,
): Promise<CampaignLeadRow[]> {
  return db
    .select()
    .from(campaignLeadsTable)
    .where(eq(campaignLeadsTable.campaignId, campaignId))
    .orderBy(
      desc(campaignLeadsTable.submittedAt),
      desc(campaignLeadsTable.createdAt),
    );
}

export async function getLead(
  ownerId: string,
  leadId: string,
): Promise<CampaignLeadRow | null> {
  const rows = await db
    .select()
    .from(campaignLeadsTable)
    .where(
      and(
        eq(campaignLeadsTable.id, leadId),
        eq(campaignLeadsTable.ownerId, ownerId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Phone keys already present in ONE campaign — the per-campaign dedupe set. */
export async function campaignPhoneKeys(
  campaignId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ phoneKey: campaignLeadsTable.phoneKey })
    .from(campaignLeadsTable)
    .where(eq(campaignLeadsTable.campaignId, campaignId));
  return new Set(rows.map((r) => r.phoneKey));
}

export interface ImportLeadsResult extends Omit<LeadImportPlan, "toInsert"> {
  imported: number;
  /** Ids of the rows that landed, in file order (seeds use these). */
  insertedIds: string[];
}

/**
 * Add uploaded rows to a campaign. Dedupe is decided in planLeadImport()
 * against this campaign's existing phones only; the unique index is the
 * backstop for two uploads racing each other.
 */
export async function importLeads(opts: {
  campaign: Pick<LeadCampaignRow, "id" | "ownerId">;
  rows: LeadImportRow[];
  source: LeadSource;
  createdBy: string;
  /** Leads without their own submitted time get this one (defaults to now). */
  submittedAt?: Date;
}): Promise<ImportLeadsResult> {
  const existing = await campaignPhoneKeys(opts.campaign.id);
  const submittedAt = opts.submittedAt ?? new Date();
  const plan = planLeadImport(opts.rows, existing, submittedAt);

  let imported = 0;
  const insertedIds: string[] = [];
  const CHUNK = 250;
  await db.transaction(async tx => {
  for (let i = 0; i < plan.toInsert.length; i += CHUNK) {
    const chunk = plan.toInsert.slice(i, i + CHUNK);
    const inserted = await tx
      .insert(campaignLeadsTable)
      .values(
        chunk.map((lead) => ({
          id: randomUUID(),
          campaignId: opts.campaign.id,
          ownerId: opts.campaign.ownerId,
          firstName: lead.firstName,
          lastName: lead.lastName,
          phone: lead.phone,
          phoneKey: lead.phoneKey,
          email: lead.email,
          source: opts.source,
          submittedAt: lead.submittedAt ?? submittedAt,
          sourceSubmittedAt: lead.submittedAt,
          requestedTime: lead.requestedTime,
          requestedAt: lead.requestedAt,
          message: lead.message,
          status: "new" as const,
          createdBy: opts.createdBy,
        })),
      )
      .onConflictDoNothing({
        target: [campaignLeadsTable.campaignId, campaignLeadsTable.phoneKey],
      })
      .returning({ id: campaignLeadsTable.id });
    imported += inserted.length;
    insertedIds.push(...inserted.map((r) => r.id));
  }
  if (insertedIds.length) await queueLeadEmail(tx, {
    id: `import/${insertedIds[0]}`, ownerId: opts.campaign.ownerId,
    campaignId: opts.campaign.id, count: insertedIds.length,
  });
  });
  if (insertedIds.length) await deliverLeadEmails(opts.campaign.ownerId);

  return {
    imported,
    insertedIds,
    // Anything the plan meant to insert but the index rejected raced another upload.
    skippedDuplicate: plan.skippedDuplicate + (plan.toInsert.length - imported),
    skippedInvalid: plan.skippedInvalid,
  };
}

/** Used by the demo seed to show a lead that has already been tried once. */
export type WebhookLeadOutcome = { outcome: 'created' | 'updated'; leadId: string }

/**
 * One lead arriving over the wire. The same per-campaign phone rule as an
 * upload applies, but a repeat submission is news, not noise: the existing
 * row's submitted time moves to now (it floats back to the top of the list)
 * and any blank detail is filled in from the new payload. Status is left
 * alone so a lead already booked does not reopen.
 */
export async function upsertWebhookLead(opts: {
  campaign: Pick<LeadCampaignRow, 'id' | 'ownerId'>
  lead: MappedLead
  phoneKey: string
  source: LeadSource
  submittedAt?: Date
  suppressNotification?: boolean
}): Promise<WebhookLeadOutcome> {
  const submittedAt = opts.submittedAt ?? new Date()
  const values = {
    id: randomUUID(),
    campaignId: opts.campaign.id,
    ownerId: opts.campaign.ownerId,
    firstName: opts.lead.firstName,
    lastName: opts.lead.lastName,
    phone: opts.lead.phone,
    phoneKey: opts.phoneKey,
    email: opts.lead.email || null,
    source: opts.source,
    submittedAt,
    sourceSubmittedAt: submittedAt,
    requestedTime: opts.lead.requestedTime || null,
    requestedAt: parseRequestedTime(opts.lead.requestedTime, officeClock(submittedAt)),
    message: opts.lead.message || null,
    status: 'new' as const,
    createdBy: null,
  }
  const row = await db.transaction(async tx => {
  const [saved] = await tx
    .insert(campaignLeadsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [campaignLeadsTable.campaignId, campaignLeadsTable.phoneKey],
      set: {
        // A duplicate webhook delivery must not rewrite the original intake
        // instant: it anchors both the cadence and the caller's age wording.
        updatedAt: submittedAt,
        email: sql`coalesce(excluded.email, ${campaignLeadsTable.email})`,
        requestedTime: sql`coalesce(excluded.requested_time, ${campaignLeadsTable.requestedTime})`,
        // A re-submission with a new time replaces the old slot; a blank one keeps it.
        requestedAt: sql`case when excluded.requested_time is null then ${campaignLeadsTable.requestedAt} else excluded.requested_at end`,
        message: sql`coalesce(excluded.message, ${campaignLeadsTable.message})`,
      },
    })
    // xmax is 0 on a freshly inserted row and non-zero after ON CONFLICT UPDATE.
    .returning({ id: campaignLeadsTable.id, inserted: sql<boolean>`(xmax = 0)` })
  if (saved.inserted && !opts.suppressNotification) await queueLeadEmail(tx, {
    id: `lead/${saved.id}`, ownerId: opts.campaign.ownerId, campaignId: opts.campaign.id, count: 1,
  })
  return saved
  })
  if (row.inserted && !opts.suppressNotification) await deliverLeadEmails(opts.campaign.ownerId)
  return { outcome: row.inserted ? 'created' : 'updated', leadId: row.id }
}

// ---------- webhook events ----------

/** How many raw payloads to keep per campaign (the tab shows the latest 20). */
const WEBHOOK_EVENTS_KEPT = 200
export const WEBHOOK_EVENTS_SHOWN = 20

export async function recordWebhookEvent(input: {
  campaign: Pick<LeadCampaignRow, 'id' | 'ownerId'>
  source: string
  contentType: string | null
  payload: Record<string, unknown>
  outcome: 'created' | 'updated' | 'rejected'
  error?: string | null
  leadId?: string | null
}): Promise<CampaignWebhookEventRow> {
  const [row] = await db
    .insert(campaignWebhookEventsTable)
    .values({
      id: randomUUID(),
      campaignId: input.campaign.id,
      ownerId: input.campaign.ownerId,
      source: input.source,
      contentType: input.contentType,
      payload: input.payload,
      outcome: input.outcome,
      error: input.error ?? null,
      leadId: input.leadId ?? null,
    })
    .returning()

  // Keep the table bounded: drop anything older than the newest N for this campaign.
  const cutoff = await db
    .select({ receivedAt: campaignWebhookEventsTable.receivedAt })
    .from(campaignWebhookEventsTable)
    .where(eq(campaignWebhookEventsTable.campaignId, input.campaign.id))
    .orderBy(desc(campaignWebhookEventsTable.receivedAt))
    .offset(WEBHOOK_EVENTS_KEPT)
    .limit(1)
  if (cutoff[0]) {
    await db
      .delete(campaignWebhookEventsTable)
      .where(and(eq(campaignWebhookEventsTable.campaignId, input.campaign.id), lt(campaignWebhookEventsTable.receivedAt, cutoff[0].receivedAt)))
  }
  return row
}

export async function listWebhookEvents(campaignId: string, limit = WEBHOOK_EVENTS_SHOWN): Promise<CampaignWebhookEventRow[]> {
  return db
    .select()
    .from(campaignWebhookEventsTable)
    .where(eq(campaignWebhookEventsTable.campaignId, campaignId))
    .orderBy(desc(campaignWebhookEventsTable.receivedAt))
    .limit(limit)
}

/** Receipt timestamps for successful retained events; an internal test is never external traffic. */
export async function getCampaignConnectionSummary(campaignId: string): Promise<{
  lastExternalReceivedAt: string | null
  lastInternalTestAt: string | null
}> {
  const [row] = await db
    .select({
      external: sql<string | null>`max(${campaignWebhookEventsTable.receivedAt}) filter (where ${campaignWebhookEventsTable.source} <> 'test' and ${campaignWebhookEventsTable.outcome} in ('created', 'updated'))`,
      internal: sql<string | null>`max(${campaignWebhookEventsTable.receivedAt}) filter (where ${campaignWebhookEventsTable.source} = 'test' and ${campaignWebhookEventsTable.outcome} in ('created', 'updated'))`,
    })
    .from(campaignWebhookEventsTable)
    .where(eq(campaignWebhookEventsTable.campaignId, campaignId))
  return {
    lastExternalReceivedAt: row.external ? new Date(row.external).toISOString() : null,
    lastInternalTestAt: row.internal ? new Date(row.internal).toISOString() : null,
  }
}

export async function setLeadStatus(
  ownerId: string,
  leadId: string,
  status: LeadStatus,
  lastAttemptAt: Date | null,
): Promise<void> {
  await db
    .update(campaignLeadsTable)
    .set({ status, lastAttemptAt, updatedAt: new Date() })
    .where(
      and(
        eq(campaignLeadsTable.id, leadId),
        eq(campaignLeadsTable.ownerId, ownerId),
      ),
    );
}

// ---------- lead calls ----------

export async function retryParkedLead(ownerId: string, leadId: string) {
  return db.transaction(async (tx) => {
    const [lead] = await tx.select().from(campaignLeadsTable)
      .where(and(eq(campaignLeadsTable.id, leadId), eq(campaignLeadsTable.ownerId, ownerId)))
      .for("update");
    if (!lead) throw new LeadCallBlockedError("Lead not found.");
    const [campaign] = await tx.select().from(leadCampaignsTable)
      .where(and(eq(leadCampaignsTable.id, lead.campaignId), eq(leadCampaignsTable.ownerId, ownerId)))
      .for("share");
    const blocked = leadCallBlockReason(campaign ?? { status: "archived" }, lead);
    if (blocked) throw new LeadCallBlockedError(blocked);
    const now = new Date();
    let reset;
    try {
      reset = reopenParkedLead(lead, now);
    } catch {
      throw new LeadCallBlockedError("This lead is no longer parked.");
    }
    const [updated] = await tx.update(campaignLeadsTable)
      .set({ ...reset, updatedAt: now })
      .where(eq(campaignLeadsTable.id, lead.id)).returning();
    return updated;
  });
}

export interface LogLeadCallInput {
  lead: Pick<CampaignLeadRow, "id">;
  callerId: string | null;
  disposition: LeadDisposition;
  notes: string | null;
  callBackAt: Date | null;
  bookedAt: Date | null;
  now?: Date;
}

/** Thrown when the lead may not be called (archived campaign, closed lead); `message` is caller-facing. */
export class LeadCallBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadCallBlockedError";
  }
}

/**
 * Record one call attempt and move the lead along the cadence. The lead row
 * carries the derived state (status, next_due_at, unanswered_attempts) so
 * the call-next list is a single indexed query, not a walk of lead_calls.
 *
 * The lead row is locked (SELECT ... FOR UPDATE) for the whole transaction
 * and the next state is computed from the locked row, so two staff logging
 * the same lead at once serialise: both attempts are counted and a stale
 * "no answer" can never overwrite a booking that landed a moment earlier.
 * Eligibility (archived campaign, do-not-call lead) is re-checked under the
 * same lock.
 */
export async function logLeadCall(
  input: LogLeadCallInput,
): Promise<{ call: LeadCallRow; lead: CampaignLeadRow }> {
  const now = input.now ?? new Date();
  const fieldError = leadDispositionFieldError(input);
  if (fieldError) throw new LeadCallBlockedError(fieldError);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(campaignLeadsTable)
      .where(eq(campaignLeadsTable.id, input.lead.id))
      .for("update");
    if (!current) throw new LeadCallBlockedError("Lead not found.");
    const [campaign] = await tx
      .select({ status: leadCampaignsTable.status })
      .from(leadCampaignsTable)
      .where(eq(leadCampaignsTable.id, current.campaignId));
    const blocked = leadCallBlockReason(campaign ?? { status: "archived" }, current);
    if (blocked) throw new LeadCallBlockedError(blocked);

    const next = applyLeadDisposition(
      {
        status: current.status as LeadStatus,
        unansweredAttempts: current.unansweredAttempts,
        bookedAt: current.bookedAt,
        submittedAt: current.submittedAt,
        requestedAt: current.requestedAt,
      },
      {
        disposition: input.disposition,
        now,
        callBackAt: input.callBackAt,
        bookedAt: input.bookedAt,
      },
    );
    const [call] = await tx
      .insert(leadCallsTable)
      .values({
        id: randomUUID(),
        leadId: current.id,
        campaignId: current.campaignId,
        ownerId: current.ownerId,
        callerId: input.callerId,
        disposition: input.disposition,
        notes: input.notes,
        callBackAt: input.callBackAt,
        bookedAt: input.bookedAt,
        createdAt: now,
      })
      .returning();
    const [lead] = await tx
      .update(campaignLeadsTable)
      .set({
        status: next.status,
        unansweredAttempts: next.unansweredAttempts,
        nextDueAt: next.nextDueAt,
        lastDisposition: next.lastDisposition,
        bookedAt: next.bookedAt,
        lastAttemptAt: now,
        updatedAt: now,
      })
      .where(eq(campaignLeadsTable.id, current.id))
      .returning();
    return { call, lead };
  });
}

/** Newest first: the lead's call history. */
export async function listLeadCalls(leadId: string): Promise<LeadCallRow[]> {
  return db
    .select()
    .from(leadCallsTable)
    .where(eq(leadCallsTable.leadId, leadId))
    .orderBy(desc(leadCallsTable.createdAt));
}

export interface CallNextItem {
  lead: CampaignLeadRow;
  campaign: Pick<LeadCampaignRow, "id" | "name" | "nicheId">;
  /** Why it is on the list. */
  reason: "requested" | "new" | "due";
}

/**
 * The "call next" list across the owner's ACTIVE campaigns: first the leads
 * who asked for an appointment time on the ad form (or missed one less
 * than a day ago) and are not yet locked
 * in, soonest slot first; then every untouched lead newest first; then
 * callbacks and retries that have come due, soonest first (a booked lead's
 * requested callback included). Parked leads (next_due_at null after the
 * cadence ran out) and paused/archived campaigns stay off the list.
 *
 * requested_at is a zone-less wall clock (the office's, Eastern), so `now`
 * is converted to the office clock before the comparison.
 */
export async function callNext(
  ownerId: string,
  now: Date = new Date(),
  limit = 5000,
): Promise<CallNextItem[]> {
  const officeHour = officeClock(now).getHours();
  if (officeHour < 9 || officeHour >= 18) return [];
  const campaignCols = {
    id: leadCampaignsTable.id,
    name: leadCampaignsTable.name,
    nicheId: leadCampaignsTable.nicheId,
  };
  const base = and(
    eq(campaignLeadsTable.ownerId, ownerId),
    eq(leadCampaignsTable.status, "active"),
  );
  const [requested, fresh, due] = await Promise.all([
    db
      .select({ lead: campaignLeadsTable, campaign: campaignCols })
      .from(campaignLeadsTable)
      .innerJoin(
        leadCampaignsTable,
        eq(leadCampaignsTable.id, campaignLeadsTable.campaignId),
      )
      .where(
        and(
          base,
          // Mirrors leadEntryStepKey: anyone whose slot is not locked in yet.
          notInArray(campaignLeadsTable.status, ["booked", "confirmed", "closed"]),
          isNotNull(campaignLeadsTable.requestedAt),
          // After a failed confirmation call, wait for its own next due time.
          sql`(${campaignLeadsTable.status} = 'new' OR (${campaignLeadsTable.nextDueAt} IS NOT NULL AND ${campaignLeadsTable.nextDueAt} <= ${now}))`,
          gt(campaignLeadsTable.requestedAt, officeWallClockOf(now)),
        ),
      )
      .orderBy(asc(campaignLeadsTable.requestedAt))
      .limit(limit),
    db
      .select({ lead: campaignLeadsTable, campaign: campaignCols })
      .from(campaignLeadsTable)
      .innerJoin(
        leadCampaignsTable,
        eq(leadCampaignsTable.id, campaignLeadsTable.campaignId),
      )
      .where(and(base, eq(campaignLeadsTable.status, "new"), sql`${campaignLeadsTable.requestedAt} IS NULL`))
      .orderBy(
        desc(campaignLeadsTable.submittedAt),
        desc(campaignLeadsTable.createdAt),
      )
      .limit(limit),
    db
      .select({ lead: campaignLeadsTable, campaign: campaignCols })
      .from(campaignLeadsTable)
      .innerJoin(
        leadCampaignsTable,
        eq(leadCampaignsTable.id, campaignLeadsTable.campaignId),
      )
      .where(
        and(
          base,
          // Mirrors isLeadDue: anything not closed with a due time,
          // including a booked lead who asked for a callback.
          ne(campaignLeadsTable.status, "closed"),
          isNotNull(campaignLeadsTable.nextDueAt),
          lte(campaignLeadsTable.nextDueAt, now),
          // Confirmation work has its own reason and appointment window.
          sql`(${campaignLeadsTable.requestedAt} IS NULL OR ${campaignLeadsTable.status} IN ('booked', 'confirmed'))`,
        ),
      )
      .orderBy(asc(campaignLeadsTable.nextDueAt))
      .limit(limit),
  ]);
  const seen = new Set(requested.map((r) => r.lead.id));
  return [
    ...requested.map((r) => ({ ...r, reason: "requested" as const })),
    ...fresh.filter((r) => !seen.has(r.lead.id)).map((r) => ({ ...r, reason: "new" as const })),
    ...due.filter((r) => !seen.has(r.lead.id))
      .sort((a, b) => Number(b.lead.lastDisposition === 'callback_later') - Number(a.lead.lastDisposition === 'callback_later'))
      .map((r) => ({ ...r, reason: "due" as const })),
  ].slice(0, limit);
}

/** Scheduled leads stay visible without being presented as callable yet. */
export async function upcomingLeadCalls(ownerId: string, now: Date = new Date(), limit = 100): Promise<CallNextItem[]> {
  const campaignCols = {
    id: leadCampaignsTable.id,
    name: leadCampaignsTable.name,
    nicheId: leadCampaignsTable.nicheId,
  };
  const outsideHours = officeClock(now).getHours() < 9 || officeClock(now).getHours() >= 18;
  const rows = await db.select({ lead: campaignLeadsTable, campaign: campaignCols })
    .from(campaignLeadsTable)
    .innerJoin(leadCampaignsTable, eq(leadCampaignsTable.id, campaignLeadsTable.campaignId))
    .where(and(
      eq(campaignLeadsTable.ownerId, ownerId),
      eq(leadCampaignsTable.status, 'active'),
      ne(campaignLeadsTable.status, 'closed'),
      or(
        sql`${campaignLeadsTable.nextDueAt} > ${now}`,
        outsideHours
          ? sql`(${campaignLeadsTable.status} = 'new' OR ${campaignLeadsTable.nextDueAt} <= ${now})`
          : sql`false`,
      ),
    ))
    .orderBy(asc(campaignLeadsTable.nextDueAt))
    .limit(limit);
  return rows.map(row => ({
    ...row,
    reason: row.lead.requestedAt && row.lead.status !== 'booked' && row.lead.status !== 'confirmed'
      ? 'requested' as const : 'due' as const,
  }));
}

// ---------- demo / maintenance ----------

/**
 * Remove every campaign (leads cascade) and product grant for the given
 * owner ids. Used by the demo reset, which rebuilds the demo campaign from
 * scratch each day.
 */
export async function wipeLeadFollowUpForOwners(
  ownerIds: string[],
  opts: { keepProductAccess?: boolean } = {},
): Promise<void> {
  if (ownerIds.length === 0) return;
  await db
    .delete(leadCampaignsTable)
    .where(inArray(leadCampaignsTable.ownerId, ownerIds));
  if (!opts.keepProductAccess) {
    await db
      .delete(productAccessTable)
      .where(inArray(productAccessTable.participantId, ownerIds));
  }
}
