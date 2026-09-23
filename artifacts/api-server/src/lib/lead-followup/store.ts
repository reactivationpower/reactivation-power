import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import {
  campaignLeadsTable,
  db,
  leadCampaignsTable,
  productAccessTable,
  type CampaignLeadRow,
  type LeadCampaignRow,
} from '@workspace/db'
import {
  planLeadImport,
  type CampaignInput,
  type CampaignStatus,
  type LeadImportPlan,
  type LeadImportRow,
  type LeadSource,
  type LeadStatus,
} from '@workspace/shared/lead-followup'

/**
 * Data access for campaigns and their leads. Every query is scoped by
 * owner id: a campaign id from another account simply does not exist here.
 */

// ---------- campaigns ----------

export interface CampaignWithCounts extends LeadCampaignRow {
  leadCount: number
  newLeadCount: number
}

export async function listCampaigns(ownerId: string): Promise<CampaignWithCounts[]> {
  const campaigns = await db
    .select()
    .from(leadCampaignsTable)
    .where(eq(leadCampaignsTable.ownerId, ownerId))
    .orderBy(desc(leadCampaignsTable.createdAt))
  if (campaigns.length === 0) return []

  const counts = await db
    .select({
      campaignId: campaignLeadsTable.campaignId,
      total: sql<number>`count(*)::int`,
      fresh: sql<number>`count(*) filter (where ${campaignLeadsTable.status} = 'new')::int`,
    })
    .from(campaignLeadsTable)
    .where(inArray(campaignLeadsTable.campaignId, campaigns.map((c) => c.id)))
    .groupBy(campaignLeadsTable.campaignId)
  const byId = new Map(counts.map((c) => [c.campaignId, c]))

  return campaigns.map((c) => ({
    ...c,
    leadCount: byId.get(c.id)?.total ?? 0,
    newLeadCount: byId.get(c.id)?.fresh ?? 0,
  }))
}

export async function getCampaign(ownerId: string, id: string): Promise<LeadCampaignRow | null> {
  const rows = await db
    .select()
    .from(leadCampaignsTable)
    .where(and(eq(leadCampaignsTable.id, id), eq(leadCampaignsTable.ownerId, ownerId)))
    .limit(1)
  return rows[0] ?? null
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
      status: 'active',
    })
    .returning()
  return row
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
    .where(and(eq(leadCampaignsTable.id, id), eq(leadCampaignsTable.ownerId, ownerId)))
    .returning()
  return row ?? null
}

export async function setCampaignStatus(
  ownerId: string,
  id: string,
  status: CampaignStatus,
): Promise<LeadCampaignRow | null> {
  const [row] = await db
    .update(leadCampaignsTable)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(leadCampaignsTable.id, id), eq(leadCampaignsTable.ownerId, ownerId)))
    .returning()
  return row ?? null
}

// ---------- leads ----------

/** Newest first: leads decay by the hour, so the freshest response is always on top. */
export async function listLeads(campaignId: string): Promise<CampaignLeadRow[]> {
  return db
    .select()
    .from(campaignLeadsTable)
    .where(eq(campaignLeadsTable.campaignId, campaignId))
    .orderBy(desc(campaignLeadsTable.submittedAt), desc(campaignLeadsTable.createdAt))
}

export async function getLead(ownerId: string, leadId: string): Promise<CampaignLeadRow | null> {
  const rows = await db
    .select()
    .from(campaignLeadsTable)
    .where(and(eq(campaignLeadsTable.id, leadId), eq(campaignLeadsTable.ownerId, ownerId)))
    .limit(1)
  return rows[0] ?? null
}

/** Phone keys already present in ONE campaign — the per-campaign dedupe set. */
export async function campaignPhoneKeys(campaignId: string): Promise<Set<string>> {
  const rows = await db
    .select({ phoneKey: campaignLeadsTable.phoneKey })
    .from(campaignLeadsTable)
    .where(eq(campaignLeadsTable.campaignId, campaignId))
  return new Set(rows.map((r) => r.phoneKey))
}

export interface ImportLeadsResult extends Omit<LeadImportPlan, 'toInsert'> {
  imported: number
  /** Ids of the rows that landed, in file order (seeds use these). */
  insertedIds: string[]
}

/**
 * Add uploaded rows to a campaign. Dedupe is decided in planLeadImport()
 * against this campaign's existing phones only; the unique index is the
 * backstop for two uploads racing each other.
 */
export async function importLeads(opts: {
  campaign: Pick<LeadCampaignRow, 'id' | 'ownerId'>
  rows: LeadImportRow[]
  source: LeadSource
  createdBy: string
  /** Leads without their own submitted time get this one (defaults to now). */
  submittedAt?: Date
}): Promise<ImportLeadsResult> {
  const existing = await campaignPhoneKeys(opts.campaign.id)
  const plan = planLeadImport(opts.rows, existing)
  const submittedAt = opts.submittedAt ?? new Date()

  let imported = 0
  const insertedIds: string[] = []
  const CHUNK = 250
  for (let i = 0; i < plan.toInsert.length; i += CHUNK) {
    const chunk = plan.toInsert.slice(i, i + CHUNK)
    const inserted = await db
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
          requestedTime: lead.requestedTime,
          message: lead.message,
          status: 'new' as const,
          createdBy: opts.createdBy,
        })),
      )
      .onConflictDoNothing({ target: [campaignLeadsTable.campaignId, campaignLeadsTable.phoneKey] })
      .returning({ id: campaignLeadsTable.id })
    imported += inserted.length
    insertedIds.push(...inserted.map((r) => r.id))
  }

  return {
    imported,
    insertedIds,
    // Anything the plan meant to insert but the index rejected raced another upload.
    skippedDuplicate: plan.skippedDuplicate + (plan.toInsert.length - imported),
    skippedInvalid: plan.skippedInvalid,
  }
}

/** Used by the demo seed to show a lead that has already been tried once. */
export async function setLeadStatus(
  ownerId: string,
  leadId: string,
  status: LeadStatus,
  lastAttemptAt: Date | null,
): Promise<void> {
  await db
    .update(campaignLeadsTable)
    .set({ status, lastAttemptAt, updatedAt: new Date() })
    .where(and(eq(campaignLeadsTable.id, leadId), eq(campaignLeadsTable.ownerId, ownerId)))
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
  if (ownerIds.length === 0) return
  await db.delete(leadCampaignsTable).where(inArray(leadCampaignsTable.ownerId, ownerIds))
  if (!opts.keepProductAccess) {
    await db.delete(productAccessTable).where(inArray(productAccessTable.participantId, ownerIds))
  }
}
