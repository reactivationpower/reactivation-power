import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ db: null as any, admin: null as any }))
vi.mock('@workspace/db', async original => ({ ...await original<any>(), db: new Proxy({}, {
  get: (_, key) => typeof state.db[key] === 'function' ? state.db[key].bind(state.db) : state.db[key],
}) }))
vi.mock('@/lib/auth/admin-session', () => ({
  getAdminSession: async () => state.admin,
  requireAdmin: async () => {
    if (!state.admin || !['super_admin', 'sales_rep'].includes(state.admin.role)) throw new Error('Unauthorized')
    return state.admin
  },
}))
vi.mock('@/lib/stripe', () => ({ getStripeMode: () => 'test', stripe: {} }))
vi.mock('@/lib/mail', () => {
  const prohibited = vi.fn(() => { throw new Error('No email permitted in notification tests') })
  return { sendAgreementSentEmail: prohibited, sendAgreementSignedEmail: prohibited }
})
const actual = await vi.importActual<typeof import('@workspace/db')>('@workspace/db')
const { listNotifications, markRead, claimDelivery, savePreferences } = await import('../enrollment-notifications')
const { recoverEnrollmentNotifications, canAccessNotificationAgreement } = await import('@/lib/enrollment-notifications')
const schema = `notification_test_${randomUUID().replaceAll('-', '')}`
const superAdmin = { userId: 'owner', role: 'super_admin' as const }
const rep = { userId: 'rep-a', role: 'sales_rep' as const }
let scopedPool: any

describe.skipIf(!process.env.SUPABASE_DB_URL)('enrollment notifications (isolated Postgres)', () => {
  beforeEach(() => { state.admin = superAdmin })
  beforeAll(async () => {
    actual.pool.options.max = 3
    await actual.pool.query(`CREATE SCHEMA "${schema}"`)
    // A real pg Pool is required: Drizzle recognizes it and pins transactions
    // to a checked-out connection, instead of issuing BEGIN on a pool wrapper.
    scopedPool = new (actual.pool.constructor as any)({ ...actual.pool.options, max: 2 })
    scopedPool.on('connect', (client: any) => {
      // This is queued before the connection's first application query.
      void client.query(`SET search_path TO "${schema}"`)
    })
    state.db = drizzle(scopedPool)
    for (const table of ['agreements', 'customers', 'payment_link_terms', 'customer_cards']) {
      await scopedPool.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`)
    }
    for (const table of ['agreement_versions', 'agreement_initials', 'agreement_events']) {
      await scopedPool.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`)
    }
    const ddl = readFileSync(new URL('../../../../../lib/db/migrations/0023_worried_magdalene.sql', import.meta.url), 'utf8')
      .replace(/ALTER TABLE "agreements" ADD COLUMN[^;]+;/g, '')
      .replaceAll('"public"."enrollment_notifications"', `"${schema}"."enrollment_notifications"`)
    await scopedPool.query(ddl)
    await scopedPool.query(`UPDATE enrollment_notification_rollout SET since = '2026-01-01'`)
    state.admin = superAdmin
  }, 30_000)
  afterAll(async () => {
    await scopedPool?.end()
    await actual.pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await actual.pool.end()
  }, 20_000)

  async function fixture(id: string, type = 'subscription', assigned = 'rep-a', creator = 'rep-a') {
    await scopedPool.query(`INSERT INTO customers (id,full_name,business_name,business_address,phone,owner_name,owner_phone,email,created_by_id)
      VALUES ($1,'Alex','Example Practice','Test','555','Alex','555',$2,$3)`, [id, `${id}@example.invalid`, creator])
    await scopedPool.query(`INSERT INTO payment_link_terms (link_id, token, customer_id, type,rep_id,enrollment_flow)
      VALUES ($1,$1,$1,$2,$3,true)`, [id, type, assigned])
    await scopedPool.query(`INSERT INTO agreements (id,token,link_id,customer_id,term_months,monthly_cents,setup_fee_cents,current_hash)
      VALUES ($1,$1,$1,$1,12,33000,49900,'fixture')`, [id])
  }
  async function sources(id: string, old = false) {
    await scopedPool.query(`UPDATE agreements SET display_acknowledged_at=$2,
      signed_at=$2, signed_version=1, signature_data='fixture-not-a-signature',
      primary_card_saved_at=$2, backup_card_saved_at=$2, completed_at=$2, status='completed'
      WHERE id=$1`, [id, old ? '2025-01-01' : '2026-02-01'])
    await scopedPool.query(`UPDATE payment_link_terms SET completed_at=$2 WHERE link_id=$1`, [id, old ? '2025-01-01' : '2026-02-01'])
  }

  it('projects only persisted post-rollout sources; initial history never has live alerts', async () => {
    await fixture('new')
    await fixture('old')
    await sources('new')
    await sources('old', true)
    await Promise.all([recoverEnrollmentNotifications(), recoverEnrollmentNotifications(), recoverEnrollmentNotifications()])
    const initial = await listNotifications()
    expect(initial.live).toEqual([])
    expect(initial.items).toHaveLength(5)
    expect(initial.unread).toBe(5)
    expect(new Set(initial.items.map(i => i.milestone))).toEqual(new Set(['opened', 'signed', 'primary_card', 'backup_card', 'completed']))
    expect(JSON.stringify(initial)).not.toContain('fixture-not-a-signature')
    expect(JSON.stringify(initial)).not.toContain('token')
    const reloaded = await listNotifications()
    expect(reloaded.items.map(i => i.id)).toEqual(initial.items.map(i => i.id))
    expect(reloaded.live).toEqual([])
  })

  it('requires explicit display acknowledgment, ignores staff previews, and commits only a valid signature', async () => {
    const { getAgreementPublic, acknowledgeAgreementDisplay, signAgreement } = await import('../agreements')
    await fixture('display')
    await scopedPool.query(`INSERT INTO agreement_versions
      (id,agreement_id,version,term_months,monthly_cents,setup_fee_cents,notice_days,body,hash)
      VALUES ('display-version','display',1,12,33000,49900,30,'## Test agreement\nA disposable fixture document.','fixture')`)
    state.admin = null
    expect(await getAgreementPublic('display')).toBeNull() // token is intentionally too short
    await scopedPool.query(`UPDATE agreements SET token='display-token-long-enough' WHERE id='display'`)
    const token = 'display-token-long-enough'
    expect(await getAgreementPublic(token)).not.toBeNull()
    expect((await scopedPool.query(`SELECT viewed_at,display_acknowledged_at FROM agreements WHERE id='display'`)).rows[0])
      .toMatchObject({ viewed_at: null, display_acknowledged_at: null })
    state.admin = superAdmin
    await acknowledgeAgreementDisplay(token, 1)
    expect((await scopedPool.query(`SELECT display_acknowledged_at FROM agreements WHERE id='display'`)).rows[0].display_acknowledged_at).toBeNull()
    state.admin = null
    expect(await acknowledgeAgreementDisplay(token, 2)).toEqual({ ok: false })
    await Promise.all([acknowledgeAgreementDisplay(token, 1), acknowledgeAgreementDisplay(token, 1)])
    expect((await scopedPool.query(`SELECT * FROM agreement_events WHERE agreement_id='display' AND type='viewed'`)).rows).toHaveLength(1)
    const input = { version: 1, consent: true, signerName: 'Alex Fixture', signerTitle: 'Owner',
      signatureType: 'typed' as const, signatureData: 'Alex Fixture' }
    expect((await signAgreement(token, { ...input, consent: false })).ok).toBe(false)
    expect((await signAgreement(token, { ...input, version: 2 })).ok).toBe(false)
    await recoverEnrollmentNotifications()
    expect((await scopedPool.query(`SELECT milestone FROM enrollment_notifications WHERE agreement_id='display'`)).rows)
      .toEqual([{ milestone: 'opened' }])
    expect((await signAgreement(token, input)).ok).toBe(true)
    await Promise.all([recoverEnrollmentNotifications(), recoverEnrollmentNotifications()])
    expect((await scopedPool.query(`SELECT milestone FROM enrollment_notifications WHERE agreement_id='display' AND milestone='signed'`)).rows).toHaveLength(1)
    expect((await signAgreement(token, input)).ok).toBe(true)
    state.admin = superAdmin
  }, 30_000)

  it('does not call a loader view, payment success, authentication or incomplete persistence completion', async () => {
    const start = await listNotifications()
    await fixture('pending')
    await scopedPool.query(`UPDATE agreements SET viewed_at=now(),setup_paid_at=now(), signed_at=now(),
      signed_version=1, signature_data='valid', completed_at=now() WHERE id='pending'`)
    await scopedPool.query(`UPDATE payment_link_terms SET enrollment_payment_intent_id='pi_mock_pending' WHERE link_id='pending'`)
    const result = await listNotifications({ after: start.cursor })
    expect(result.live.map(i => i.milestone)).toEqual(['signed'])
    // Agreement completion alone, or terms completion alone, is not completion.
    await scopedPool.query(`UPDATE agreements SET status='completed' WHERE id='pending'`)
    expect((await listNotifications({ after: result.cursor })).live).toEqual([])
    await scopedPool.query(`UPDATE payment_link_terms SET completed_at=now() WHERE link_id='pending'`)
    expect((await listNotifications({ after: result.cursor })).live.map(i => i.milestone)).toEqual(['completed'])
  })

  it('preserves standard agreement view auditing without loader views or enrollment alerts', async () => {
    await fixture('standard-display')
    await scopedPool.query(`INSERT INTO agreement_versions
      (id,agreement_id,version,term_months,monthly_cents,setup_fee_cents,notice_days,body,hash)
      VALUES ('standard-version','standard-display',1,12,33000,49900,30,'## Test agreement\nA disposable standard document.','fixture')`)
    await scopedPool.query(`UPDATE payment_link_terms SET enrollment_flow=false WHERE link_id='standard-display'`)
    await scopedPool.query(`UPDATE agreements SET token='standard-display-token-long-enough' WHERE id='standard-display'`)
    const agreements = await import('../agreements')
    state.admin = null
    expect(await agreements.getAgreementPublic('standard-display-token-long-enough')).not.toBeNull()
    expect((await scopedPool.query(`SELECT status,viewed_at FROM agreements WHERE id='standard-display'`)).rows[0])
      .toMatchObject({ status: 'draft', viewed_at: null })
    await Promise.all([
      agreements.acknowledgeAgreementDisplay('standard-display-token-long-enough', 1),
      agreements.acknowledgeAgreementDisplay('standard-display-token-long-enough', 1),
    ])
    const row = (await scopedPool.query(`SELECT status,viewed_at,display_acknowledged_at FROM agreements WHERE id='standard-display'`)).rows[0]
    expect(row.status).toBe('viewed')
    expect(row.viewed_at).toBeInstanceOf(Date)
    expect(row.display_acknowledged_at).toBeInstanceOf(Date)
    await agreements.acknowledgeAgreementDisplay('standard-display-token-long-enough', 1)
    expect((await scopedPool.query(`SELECT * FROM agreement_events WHERE agreement_id='standard-display' AND type='viewed'`)).rows).toHaveLength(1)
    // Existing historical views stay historical; migration adds no second view.
    await scopedPool.query(`UPDATE agreements SET display_acknowledged_at=NULL,viewed_at='2025-01-01' WHERE id='standard-display'`)
    await agreements.acknowledgeAgreementDisplay('standard-display-token-long-enough', 1)
    expect((await scopedPool.query(`SELECT * FROM agreement_events WHERE agreement_id='standard-display' AND type='viewed'`)).rows).toHaveLength(1)
    await recoverEnrollmentNotifications()
    expect((await scopedPool.query(`SELECT * FROM enrollment_notifications WHERE agreement_id='standard-display'`)).rows).toEqual([])
  })

  it('keeps full payment to one card, and recovers a committed source after missing event projection', async () => {
    const start = await listNotifications()
    await fixture('full', 'one_time')
    await sources('full')
    const next = await listNotifications({ after: start.cursor })
    expect(next.live).toHaveLength(4)
    expect(next.live.some(i => i.milestone === 'backup_card')).toBe(false)
    // Event loss is recoverable from sources without executing a billing action.
    await scopedPool.query(`DELETE FROM enrollment_notifications WHERE agreement_id='full' AND milestone='primary_card'`)
    await recoverEnrollmentNotifications()
    expect((await scopedPool.query(`SELECT * FROM enrollment_notifications WHERE agreement_id='full' AND milestone='primary_card'`)).rows).toHaveLength(1)
    await scopedPool.query(`UPDATE agreements SET updated_at=now() WHERE id='full'`)
    await recoverEnrollmentNotifications()
    expect((await scopedPool.query(`SELECT * FROM enrollment_notifications WHERE agreement_id='full'`)).rows).toHaveLength(4)
  })

  it('baselines pre-rollout card milestones without old alerts or replacement announcements', async () => {
    await fixture('historical-cards')
    await scopedPool.query(`INSERT INTO customer_cards (id,customer_id,link_id,stripe_payment_method_id,brand,last4,rank,created_at)
      VALUES ('historical-primary','historical-cards','historical-cards','pm_fixture_primary','visa','4242','primary','2025-01-01'),
        ('historical-backup','historical-cards','historical-cards','pm_fixture_backup','visa','4444','secondary','2025-01-02')`)
    const baseline = readFileSync(new URL('../../../../../lib/db/migrations/0025_notification_card_baseline.sql', import.meta.url), 'utf8')
    await scopedPool.query(baseline)
    await scopedPool.query(baseline) // retry does not overwrite a saved marker
    await scopedPool.query(`UPDATE agreements SET primary_card_saved_at=coalesce(primary_card_saved_at,now()),
      backup_card_saved_at=coalesce(backup_card_saved_at,now()) WHERE id='historical-cards'`)
    await recoverEnrollmentNotifications()
    expect((await scopedPool.query(`SELECT * FROM enrollment_notifications WHERE agreement_id='historical-cards'`)).rows).toEqual([])
    const row = (await scopedPool.query(`SELECT primary_card_saved_at,backup_card_saved_at FROM agreements WHERE id='historical-cards'`)).rows[0]
    expect(row.primary_card_saved_at.toISOString()).toBe('2025-01-01T00:00:00.000Z')
    expect(row.backup_card_saved_at.toISOString()).toBe('2025-01-02T00:00:00.000Z')
  })

  it('scopes list, count, read, claim and authorized detail to current creator/assignment', async () => {
    await fixture('foreign', 'subscription', 'rep-b', 'rep-b')
    await sources('foreign')
    const agreements = await import('../agreements')
    const all = await listNotifications()
    const allAgreements = await agreements.listAgreements()
    expect(allAgreements.length).toBeGreaterThan(0)
    const foreign = all.items.find(i => i.agreementId === 'foreign')!
    state.admin = rep
    const own = await listNotifications()
    const ownAgreements = await agreements.listAgreements()
    expect(ownAgreements.length).toBeLessThan(allAgreements.length)
    for (const agreement of ownAgreements) {
      expect(await canAccessNotificationAgreement(state.admin, agreement.id)).toBe(true)
    }
    expect(own.items.some(i => i.agreementId === 'foreign')).toBe(false)
    expect(own.unread).toBe(all.unread - 5)
    expect(await claimDelivery(foreign.id)).toEqual({ claimed: false })
    await markRead(foreign.id)
    expect(await canAccessNotificationAgreement(rep, 'foreign')).toBe(false)
    await markRead()
    expect((await listNotifications()).unread).toBe(0)
    state.admin = superAdmin
    expect((await listNotifications()).unread).toBe(all.unread)
    await scopedPool.query(`UPDATE payment_link_terms SET rep_id='rep-a' WHERE link_id='foreign'`)
    state.admin = rep
    expect((await listNotifications()).items.some(i => i.agreementId === 'foreign')).toBe(true)
    expect(await canAccessNotificationAgreement(rep, 'foreign')).toBe(true)
    await scopedPool.query(`UPDATE payment_link_terms SET rep_id='rep-b' WHERE link_id='foreign'`)
    expect(await claimDelivery(foreign.id)).toEqual({ claimed: false })
    state.admin = { userId: 'affiliate', role: 'affiliate' }
    await expect(listNotifications()).rejects.toThrow('Unauthorized')
    state.admin = null
    await expect(markRead()).rejects.toThrow('Unauthorized')
    state.admin = superAdmin
  })

  it('persists per-admin reads/preferences and claims only one audible/desktop delivery concurrently', async () => {
    state.admin = superAdmin
    const first = (await listNotifications()).items[0]
    const claims = await Promise.all([claimDelivery(first.id), claimDelivery(first.id), claimDelivery(first.id)])
    expect(claims.filter(r => r.claimed)).toHaveLength(1)
    await markRead(first.id)
    expect((await listNotifications()).items.find(i => i.id === first.id)?.read).toBe(true)
    await savePreferences({ sound: true })
    await savePreferences({ desktop: true })
    expect((await listNotifications()).preferences).toEqual({ sound: true, desktop: true })
    state.admin = { ...superAdmin, userId: 'another-admin-device' }
    expect((await listNotifications()).items.find(i => i.id === first.id)?.read).toBe(false)
    expect((await listNotifications()).preferences).toEqual({ sound: false, desktop: false })
    state.admin = superAdmin
    expect((await listNotifications()).preferences).toEqual({ sound: true, desktop: true })
    await expect(listNotifications({ after: '1 OR true' })).rejects.toThrow('Invalid')
    await expect(markRead('9223372036854775808')).rejects.toThrow('Invalid')
  })

  it('drains bounded live batches by cursor without gaps, and pages durable history', async () => {
    state.admin = superAdmin
    const start = (await listNotifications()).cursor
    for (let i = 0; i < 12; i++) { await fixture(`burst-${i}`); await sources(`burst-${i}`) }
    const first = await listNotifications({ after: start })
    expect(first.live).toHaveLength(50)
    const second = await listNotifications({ after: first.cursor })
    expect(second.live).toHaveLength(10)
    const ids = [...first.live, ...second.live].map(i => i.id)
    expect(new Set(ids).size).toBe(60)
    expect((await listNotifications({ after: second.cursor })).live).toEqual([])
    expect(first.hasMore).toBe(true)
    const older = await listNotifications({ before: first.items.at(-1)!.id })
    expect(older.items.length).toBeGreaterThan(0)
    expect(older.items.every(i => BigInt(i.id) < BigInt(first.items.at(-1)!.id))).toBe(true)
  }, 30_000)
})
