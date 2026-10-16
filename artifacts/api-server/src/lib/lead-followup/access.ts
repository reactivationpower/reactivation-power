import { and, eq, inArray } from 'drizzle-orm'
import { db, productAccessTable } from '@workspace/db'
import { redirect } from 'next/navigation'
import type { Participant } from '@workspace/shared/types'
import { PRODUCT_HOME, type ProductAccess } from '@workspace/shared/lead-followup'
import { accessOwnerId, getCurrentParticipant } from '@/lib/data/participants'

/**
 * Product access for Lead Follow-Up.
 *
 * The grant is rooted on the ACCESS OWNER (the owner participant), exactly
 * like course access: an admin turns it on for an owner account and every
 * staff member under that owner inherits it. Billing blocks are not handled
 * here — getCurrentParticipant() already redirects a paused account before
 * we ever look at products.
 */

export const LEAD_FOLLOWUP_PRODUCT = 'lead_followup'

/** Does this access owner hold Lead Follow-Up? */
export async function hasLeadFollowUp(ownerId: string): Promise<boolean> {
  const rows = await db
    .select({ participantId: productAccessTable.participantId })
    .from(productAccessTable)
    .where(and(eq(productAccessTable.participantId, ownerId), eq(productAccessTable.product, LEAD_FOLLOWUP_PRODUCT)))
    .limit(1)
  return rows.length > 0
}

/** Which of the given owners hold Lead Follow-Up (admin list views). */
export async function ownersWithLeadFollowUp(ownerIds: string[]): Promise<Set<string>> {
  if (ownerIds.length === 0) return new Set()
  const rows = await db
    .select({ participantId: productAccessTable.participantId })
    .from(productAccessTable)
    .where(and(inArray(productAccessTable.participantId, ownerIds), eq(productAccessTable.product, LEAD_FOLLOWUP_PRODUCT)))
  return new Set(rows.map((r) => r.participantId))
}

/** Product set for a participant, resolved through their access owner. */
export async function productAccessFor(participant: Participant): Promise<ProductAccess> {
  return { reactivation: true, leadFollowUp: await hasLeadFollowUp(accessOwnerId(participant)) }
}

export async function setLeadFollowUpAccess(ownerId: string, granted: boolean): Promise<void> {
  if (granted) {
    await db
      .insert(productAccessTable)
      .values({ participantId: ownerId, product: LEAD_FOLLOWUP_PRODUCT })
      .onConflictDoNothing()
  } else {
    await db
      .delete(productAccessTable)
      .where(and(eq(productAccessTable.participantId, ownerId), eq(productAccessTable.product, LEAD_FOLLOWUP_PRODUCT)))
  }
}

export interface LeadFollowUpContext {
  participant: Participant
  ownerId: string
  isOwner: boolean
}

/**
 * The guard every Lead Follow-Up page loader and action goes through.
 * Unsigned-in -> login; signed in without the product -> back to the
 * reactivation portal (the account simply doesn't have this door).
 */
export async function requireLeadFollowUp(nextPath?: string): Promise<LeadFollowUpContext> {
  const participant = await getCurrentParticipant()
  if (!participant) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login')
  }
  const ownerId = accessOwnerId(participant)
  if (!(await hasLeadFollowUp(ownerId))) redirect(PRODUCT_HOME.reactivation)
  return { participant, ownerId, isOwner: participant.role === 'owner' }
}

/**
 * Action-flavoured guard: actions return `{ error }` objects rather than
 * redirecting, so a caller who lost access mid-session gets a message
 * instead of a navigation.
 */
export async function leadFollowUpContextOrError(): Promise<
  { ok: true; ctx: LeadFollowUpContext } | { ok: false; error: string }
> {
  const participant = await getCurrentParticipant()
  if (!participant) return { ok: false, error: 'Not signed in' }
  const ownerId = accessOwnerId(participant)
  if (!(await hasLeadFollowUp(ownerId))) {
    return { ok: false, error: 'Lead Follow-Up is not turned on for this account.' }
  }
  return { ok: true, ctx: { participant, ownerId, isOwner: participant.role === 'owner' } }
}
