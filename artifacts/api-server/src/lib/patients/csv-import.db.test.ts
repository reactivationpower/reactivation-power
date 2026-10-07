import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '@workspace/db'
import { executePatientImport, listImportReviews, resolveImportReview } from './csv-import'
import type { ResolvedImportRow } from './import-plan'

describe.skipIf(!process.env.SUPABASE_DB_URL)('transactional CSV patient import', () => {
  let ownerId: string
  let otherOwnerId: string
  let niches: string[]
  const row = (nicheId: string | null, extra = {}): ResolvedImportRow => ({
    nicheId, row: { name: 'CSV Test Patient', phone: '2125550199', patientId: '000123', service: nicheId ?? 'Unclassified', lastVisit: '2020-01-02', ...extra },
  })
  const context = () => ({ ownerId, participantId: ownerId, source: 'csv-test', stageId: null, simulated: false })
  beforeEach(async () => {
    ownerId = randomUUID()
    otherOwnerId = randomUUID()
    await pool.query(`INSERT INTO participants (id, first_name, last_name, email, role)
      VALUES ($1, 'CSV', 'Test', $2, 'owner'), ($3, 'CSV', 'Other', $4, 'owner')`,
      [ownerId, `csv-test-${ownerId}@example.invalid`, otherOwnerId, `csv-test-${otherOwnerId}@example.invalid`])
    niches = (await pool.query('SELECT id FROM niches WHERE is_active = true ORDER BY id LIMIT 2')).rows.map(r => r.id)
  })
  afterEach(async () => {
    await pool.query('DELETE FROM participants WHERE id = ANY($1::uuid[])', [[ownerId, otherOwnerId]])
  })
  it('preserves notes, primary niche, opt-out, call history and due date across repeat/multi-service uploads', async () => {
    await executePatientImport(context(), [row(niches[0]!)])
    const contact = (await pool.query('SELECT * FROM contacts WHERE owner_id = $1', [ownerId])).rows[0]
    await pool.query("UPDATE contacts SET notes = 'Staff note', do_not_call = true, first_call_at = '2020-01-01' WHERE id = $1", [contact.id])
    await pool.query("INSERT INTO reactivation_calls (contact_id, caller_id, disposition, voicemail_left, notes) VALUES ($1, $2, 'no_answer', false, 'Prior call')", [contact.id, ownerId])
    await pool.query("INSERT INTO follow_ups (contact_id, due_at, reason) VALUES ($1, '2030-01-01', 'manual')", [contact.id])
    const result = await executePatientImport(context(), [row(niches[1]!, { phone: '2125550188', notes: 'Upload note', doNotCall: 'no', lastVisit: '2021-01-01' })])
    expect(result).toMatchObject({ imported: 0, updated: 1, servicesAdded: 1 })
    const c = (await pool.query('SELECT * FROM contacts WHERE id = $1', [contact.id])).rows[0]
    expect(c).toMatchObject({ phone: '2125550188', niche_id: niches[0], notes: 'Staff note', do_not_call: true })
    expect((await pool.query('SELECT count(*)::int AS count FROM reactivation_calls WHERE contact_id = $1', [contact.id])).rows[0].count).toBe(1)
    expect((await pool.query('SELECT due_at::text AS due_at FROM follow_ups WHERE contact_id = $1', [contact.id])).rows[0].due_at).toContain('2030-01-01')
    expect((await pool.query('SELECT count(*)::int AS count FROM contact_services WHERE contact_id = $1', [contact.id])).rows[0].count).toBe(2)
    const repeat = await executePatientImport(context(), [row(niches[1]!, { phone: '2125550188', notes: 'Upload note', doNotCall: 'no', lastVisit: '2021-01-01' })])
    expect(repeat).toMatchObject({ imported: 0, updated: 0, unchanged: 1, servicesAdded: 0 })
  })
  it('serializes simultaneous uploads so only one person is inserted', async () => {
    const results = await Promise.all([executePatientImport(context(), [row(niches[0]!)]), executePatientImport(context(), [row(niches[0]!)])])
    expect(results.reduce((sum, r) => sum + r.imported, 0)).toBe(1)
    expect((await pool.query('SELECT count(*)::int AS count FROM contacts WHERE owner_id = $1', [ownerId])).rows[0].count).toBe(1)
  })
  it('persists ambiguous reviews once, supports separate household members, and enforces practice isolation', async () => {
    await executePatientImport(context(), [row(niches[0]!, { patientId: '' })])
    const family = row(niches[1]!, { name: 'CSV Household Member', patientId: '' })
    expect((await executePatientImport(context(), [family])).needsReview).toBe(1)
    await executePatientImport(context(), [family])
    const reviews = await listImportReviews(ownerId)
    expect(reviews).toHaveLength(1)
    expect(await listImportReviews(otherOwnerId)).toEqual([])
    await expect(resolveImportReview({ ownerId: otherOwnerId, participantId: otherOwnerId, stageId: null }, { reviewId: reviews[0]!.id, decision: 'create' })).rejects.toThrow('no longer available')
    await resolveImportReview({ ownerId, participantId: ownerId, stageId: null }, { reviewId: reviews[0]!.id, decision: 'create' })
    expect(await listImportReviews(ownerId)).toEqual([])
    expect((await executePatientImport(context(), [family])).imported).toBe(0)
    expect((await pool.query('SELECT count(*)::int AS count FROM contacts WHERE owner_id = $1', [ownerId])).rows[0].count).toBe(2)
  })
  it('supports explicitly confirming a match and ignoring a conflicting row', async () => {
    await executePatientImport(context(), [row(niches[0]!, { patientId: '' })])
    await executePatientImport(context(), [row(niches[1]!, { patientId: '', name: 'CSV Changed Name' })])
    const review = (await listImportReviews(ownerId))[0]!
    await resolveImportReview({ ownerId, participantId: ownerId, stageId: null }, { reviewId: review.id, decision: 'match', contactId: review.candidates[0]!.id })
    expect((await pool.query('SELECT count(*)::int AS count FROM contacts WHERE owner_id = $1', [ownerId])).rows[0].count).toBe(1)
    const ignored = row(niches[0]!, { patientId: '', name: 'CSV Ignore Me' })
    await executePatientImport(context(), [ignored])
    const second = (await listImportReviews(ownerId))[0]!
    await resolveImportReview({ ownerId, participantId: ownerId, stageId: null }, { reviewId: second.id, decision: 'ignore' })
    expect((await executePatientImport(context(), [ignored])).needsReview).toBe(0)
  })
  it('rolls back patient writes if a later service insert fails', async () => {
    await expect(executePatientImport(context(), [row(randomUUID())])).rejects.toThrow()
    expect((await pool.query('SELECT count(*)::int AS count FROM contacts WHERE owner_id = $1', [ownerId])).rows[0].count).toBe(0)
    expect((await pool.query('SELECT count(*)::int AS count FROM patient_sources WHERE owner_id = $1', [ownerId])).rows[0].count).toBe(0)
  })
  it('simulates demo uploads without writing any patients or reviews', async () => {
    const result = await executePatientImport({ ...context(), simulated: true }, [row(niches[0]!)])
    expect(result).toMatchObject({ simulated: true, imported: 1 })
    expect((await pool.query('SELECT count(*)::int AS count FROM contacts WHERE owner_id = $1', [ownerId])).rows[0].count).toBe(0)
  })
})
