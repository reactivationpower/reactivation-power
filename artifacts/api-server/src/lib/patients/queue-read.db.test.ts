import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool, type PoolClient } from '@workspace/db'
import { loadOutreachPatient } from './outreach'
import { DAY, planOutreach } from './outreach-policy'
import { isQueueReserve, readQueuePatients } from './queue-read'

const now = Date.parse('2026-10-07T16:00:00Z')
const a = randomUUID(), b = randomUUID(), disabled = randomUUID()
const enabled = new Set([a, b])

// Temporary copies preserve the real schema/indexes but never touch shared
// patients or send emails. ROLLBACK drops every fixture even on failure.
describe.skipIf(!process.env.SUPABASE_DB_URL)('compact queue database reads', () => {
  let client: PoolClient
  let owner: string
  beforeEach(async () => {
    client = await pool.connect()
    await client.query('BEGIN')
    for (const table of ['contacts', 'contact_services', 'follow_ups', 'reactivation_calls', 'patient_call_leases']) {
      await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`)
    }
    owner = randomUUID()
  })
  afterEach(async () => {
    if (client) { await client.query('ROLLBACK'); client.release() }
  })

  async function patient(extra: { called?: boolean; optedOut?: boolean; owner?: string } = {}) {
    const id = randomUUID()
    await client.query(`INSERT INTO contacts(id, owner_id, name, phone, niche_id, first_call_at, do_not_call)
      VALUES($1,$2,'Queue Fixture','2125550100',$3,$4,$5)`,
      [id, extra.owner ?? owner, a, extra.called ? '2026-01-01' : null, extra.optedOut ?? false])
    return id
  }
  async function service(contact: string, niche = a, status = 'ready', visit: string | null = null, attempt: string | null = null) {
    const id = randomUUID()
    await client.query(`INSERT INTO contact_services(id, owner_id, contact_id, service_key, niche_id,
      outreach_status, last_visit, last_attempt_at, cycle_started_at, created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, owner, contact, niche, niche, status, visit, attempt,
        status === 'active' ? '2026-09-20' : null, niche === a ? '2026-01-01' : '2026-10-01'])
    return id
  }
  async function follow(contact: string, serviceId: string, reason: string, context: string, due = '2026-10-06') {
    await client.query(`INSERT INTO follow_ups(contact_id,service_id,reason,call_context,due_at) VALUES($1,$2,$3,$4,$5)`,
      [contact, serviceId, reason, context, due])
  }
  async function call(contact: string, date: string) {
    await client.query(`INSERT INTO reactivation_calls(contact_id,disposition,created_at) VALUES($1,'spoke_did_not_schedule',$2)`, [contact, date])
  }
  async function lease(contact: string, serviceId: string, expires: string) {
    await client.query(`INSERT INTO patient_call_leases(contact_id, owner_id, caller_id, token, service_id, context, expires_at)
      VALUES($1,$2,$3,$4,$5,'initial',$6)`, [contact, owner, randomUUID(), randomUUID(), serviceId, expires])
  }

  it('matches the full-history planner across rotation, retry, treatment, callback and confirmation states', async () => {
    const ids: string[] = []
    for (const context of ['initial', 'rotation', 'retry', 'callback', 'confirmation']) {
      for (const days of [89, 90, 91]) {
        const id = await patient({ called: context !== 'initial' })
        ids.push(id)
        const first = await service(id, a, context === 'retry' ? 'active' : 'cooling', null, '2026-07-01')
        await service(id, b, 'ready')
        // Even disabled/declined service treatment dates hold routine calls.
        await service(id, disabled, 'declined', '2026-10-01')
        if (context !== 'initial') await call(id, new Date(now - days * DAY).toISOString())
        await follow(id, first, context === 'callback' || context === 'confirmation' ? 'manual' : context === 'retry' ? 'retry' : 'quarterly', context)
        // Lower-priority overdue routine follow-up must not steal a promise.
        await follow(id, first, 'quarterly', 'rotation', '2026-01-01')
      }
    }
    const compact = await readQueuePatients(owner, enabled, now, client)
    expect(compact).toHaveLength(ids.length)
    expect(new Set(compact.map(p => p.id)).size).toBe(ids.length)
    for (const p of compact) {
      const row = (await client.query('SELECT * FROM contacts WHERE id=$1', [p.id])).rows[0]
      row.first_call_at = row.first_call_at?.toISOString() ?? null
      const full = await loadOutreachPatient(client, row)
      const expected = planOutreach(full, enabled, now)
      expect({ ...p.plan, dueAt: p.plan.dueAt ? new Date(p.plan.dueAt).toISOString() : null }).toEqual({
        ...expected, dueAt: expected.dueAt ? new Date(expected.dueAt).toISOString() : null,
        service: p.services!.find(s => s.id === expected.service?.id) ?? null,
      })
      if (['callback', 'confirmation'].includes(p.plan.context)) expect(p.plan.dueAt).toMatch(/^2026-10-06/)
      else expect(p.plan.dueAt).toBe('2027-01-02T00:00:00.000Z')
    }
  }, 30_000)

  it('enforces the exact 90-day boundary, excludes live leases/opt-outs/other tenants, and restores expired leases', async () => {
    for (const days of [89, 90, 91]) {
      const id = await patient({ called: true })
      await service(id, a, 'cooling', null, new Date(now - days * DAY).toISOString())
      await service(id, b)
      await call(id, new Date(now - days * DAY).toISOString())
    }
    const opted = await patient({ optedOut: true }); await service(opted)
    const other = await patient({ owner: randomUUID() }); await service(other)
    const live = await patient(); const liveService = await service(live)
    await lease(live, liveService, new Date(now + DAY).toISOString())
    const expired = await patient(); const expiredService = await service(expired)
    await lease(expired, expiredService, new Date(now - 1).toISOString())
    const rows = await readQueuePatients(owner, enabled, now, client)
    expect(rows).toHaveLength(4)
    expect(rows.map(p => p.id)).not.toEqual(expect.arrayContaining([opted, other, live]))
    expect(rows.find(p => p.id === expired)).toBeDefined()
    expect(rows.filter(p => p.last_call && new Date(p.plan.dueAt!).getTime() <= now)).toHaveLength(2)
    expect(rows.filter(p => isQueueReserve(p, now))).toHaveLength(1)
  })

  it('supplies a read-only legacy primary and never persists it while polling', async () => {
    const id = await patient()
    await service(id, b)
    const before = (await client.query('SELECT count(*)::int AS n FROM contact_services')).rows[0].n
    for (let i = 0; i < 2; i++) {
      const row = (await readQueuePatients(owner, enabled, now, client))[0]!
      expect(row.plan.service?.niche_id).toBe(a)
      expect(isQueueReserve(row, now)).toBe(true)
    }
    expect((await client.query('SELECT count(*)::int AS n FROM contact_services')).rows[0].n).toBe(before)
  })

  // Disabled at the owner's request: repeated full-history benchmark reads
  // consume shared Supabase egress. Keep small correctness tests enabled.
  it.skip('measures large-list latency and policy payload against the previous full read', async () => {
    await client.query(`INSERT INTO contacts(id,owner_id,name,phone,niche_id,notes,created_at)
      SELECT md5('queue-bench-' || g)::uuid,$1,'Synthetic Patient','2125550100',$2,repeat('note ',200),
        $3::timestamptz - g * interval '1 second' FROM generate_series(1,10000) g`, [owner, a, new Date(now)])
    await client.query(`INSERT INTO contact_services(owner_id,contact_id,service_key,niche_id,service_label,source_notes,original_complaint,created_at)
      SELECT $1,c.id,'niche:' || n::text,n,'Synthetic Service',repeat('history ',100),repeat('concern ',100),
        CASE WHEN n=$3 THEN '2026-01-01'::timestamptz ELSE '2026-10-01'::timestamptz END
      FROM contacts c CROSS JOIN unnest($2::uuid[]) n`, [owner, [a, b], a])
    await client.query(`INSERT INTO reactivation_calls(contact_id,disposition,notes,created_at)
      SELECT c.id,'no_answer',repeat('call note ',100),$1::timestamptz - g * interval '1 day'
      FROM contacts c CROSS JOIN generate_series(1,4) g`, [new Date(now - 100 * DAY)])
    for (const table of ['contacts', 'contact_services', 'reactivation_calls', 'follow_ups', 'patient_call_leases']) await client.query(`ANALYZE ${table}`)
    const baseline = async () => {
      const contacts = await client.query(`SELECT c.*,
        (SELECT row_to_json(f) FROM follow_ups f WHERE f.contact_id=c.id AND completed_call_id IS NULL
          ORDER BY CASE WHEN f.call_context='confirmation' OR f.reason='manual' THEN 0 WHEN f.reason='retry' THEN 1 ELSE 2 END, due_at LIMIT 1) AS next_follow_up,
        EXISTS(SELECT 1 FROM patient_call_leases l WHERE l.contact_id=c.id AND expires_at > $2) AS call_assigned,
        (SELECT row_to_json(r) FROM reactivation_calls r WHERE r.contact_id=c.id ORDER BY created_at DESC LIMIT 1) AS last_call,
        (SELECT count(*)::int FROM reactivation_calls r WHERE r.contact_id=c.id) AS call_count
        FROM contacts c WHERE owner_id=$1 ORDER BY created_at DESC`, [owner, new Date(now)])
      const services = await client.query('SELECT s.*, last_visit::text FROM contact_services s WHERE owner_id=$1 ORDER BY created_at,id', [owner])
      return { contacts: contacts.rows, services: services.rows }
    }
    const oldTimes: number[] = [], newTimes: number[] = []
    let oldBytes = 0, newBytes = 0
    // Warm both plans; report medians, not flaky CI wall-clock thresholds.
    await baseline(); await readQueuePatients(owner, enabled, now, client)
    for (let i = 0; i < 3; i++) {
      let start = performance.now()
      const old = await baseline()
      oldTimes.push(performance.now() - start)
      oldBytes = Buffer.byteLength(JSON.stringify(old))
      start = performance.now()
      const compact = await readQueuePatients(owner, enabled, now, client)
      newTimes.push(performance.now() - start)
      newBytes = Buffer.byteLength(JSON.stringify(compact))
      expect(compact).toHaveLength(10000)
      expect(compact.every(p => p.plan.service?.niche_id === b)).toBe(true)
    }
    const median = (values: number[]) => values.sort((a,b) => a-b)[1]!
    console.info('Queue benchmark (10,000 patients, 20,000 services, 40,000 calls)', {
      baselineMedianMs: Math.round(median(oldTimes)), compactMedianMs: Math.round(median(newTimes)),
      baselineBytes: oldBytes, compactBytes: newBytes,
    })
    expect(newBytes).toBeLessThan(oldBytes / 2)
  }, 120_000)
})
