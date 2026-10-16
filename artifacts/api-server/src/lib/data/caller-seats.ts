import { db } from '@workspace/db'
import { sql } from 'drizzle-orm'
import { MAX_STAFF } from '@workspace/shared/types'

type Change =
  | { kind: 'add'; firstName: string; lastName: string; email: string; phone: string | null }
  | { kind: 'active'; memberId: string; active: boolean }

/**
 * Supabase participants is intentionally not a Drizzle schema model. Execute
 * parameterized SQL against that same table, on one transaction/connection.
 * Every portal seat mutation takes the same owner lock before count AND write.
 */
export async function changeCallerSeat(ownerId: string, change: Change): Promise<{ id?: string; error?: string }> {
  try {
    return await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`caller-seats:${ownerId}`}))`)
      if (change.kind === 'active') {
        const existing = await tx.execute(sql`select id, is_active from participants
          where id = ${change.memberId} and parent_id = ${ownerId} and role = 'staff' for update`)
        if (!existing.rows.length) return { error: 'Caller not found.' }
        if (existing.rows[0].is_active === change.active) return { id: change.memberId }
      }
      if (change.kind === 'add' || change.active) {
        const seats = await tx.execute(sql`select count(*)::int as count from participants
          where parent_id = ${ownerId} and is_active = true`)
        if (Number(seats.rows[0]?.count) >= MAX_STAFF) {
          return { error: `You can have up to ${MAX_STAFF} active callers.` }
        }
      }
      if (change.kind === 'add') {
        const result = await tx.execute(sql`insert into participants
          (first_name, last_name, email, phone, parent_id, role, is_active)
          values (${change.firstName}, ${change.lastName}, ${change.email}, ${change.phone}, ${ownerId}, 'staff', true)
          returning id`)
        return { id: String(result.rows[0].id) }
      }
      await tx.execute(sql`update participants set is_active = ${change.active}
        where id = ${change.memberId} and parent_id = ${ownerId} and role = 'staff'`)
      return { id: change.memberId }
    })
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } }
    if ((e.code ?? e.cause?.code) === '23505') return { error: 'Someone with this email already exists.' }
    return { error: 'Could not update caller seats. Please try again.' }
  }
}