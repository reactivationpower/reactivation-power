import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { LEAD_TERMS_WORDING } from '@workspace/shared/lead-terms'
const fixture = vi.hoisted(() => ({ pool: null as any, role: 'super_admin', beforeQuery: null as null | ((sql: string) => Promise<void>) }))
vi.mock('@workspace/db', () => ({ pool: {
  query: (...args: any[]) => fixture.pool.query(...args),
  connect: async () => {
    const c = await fixture.pool.connect()
    return { release: () => c.release(), query: async (sql: string, ...args: any[]) => {
      if (fixture.beforeQuery) await fixture.beforeQuery(sql)
      return c.query(sql, ...args)
    } }
  },
} }))
vi.mock('@/lib/auth/admin-session', () => ({ requireAdmin: vi.fn(async (required?: string) => {
  if (fixture.role === 'none' || (required === 'super_admin' && fixture.role !== 'super_admin')) throw new Error('Unauthorized')
  return { userId: 'isolated-admin', role: fixture.role, name: 'Isolated Administrator' }
}) }))
vi.mock('@/lib/sales-leads/dispatch', () => ({ nudgeSalesSync: vi.fn() }))
import { currentTerms, documentHash, termsRequestEvidence } from './lead-terms/store'
import { getCurrentTerms, getTermsAdmin, getTermsVersion, saveTermsDraft, publishTerms, downloadTermsEvidence, termsAcceptanceHistory } from '../actions/lead-terms'
import { intake } from './sales-leads/store'
import { runWithRequestContext } from './request-context'

const schema = `terms_test_${randomUUID().replaceAll('-', '')}`
const input = (key: string, version: string, checked = true) => ({
  firstName: 'Submitted', lastName: 'Person', email: `${key}@example.invalid`, phone: '', practiceName: 'Submitted office',
  source: 'website', sourcePath: '/strategy-call/schedule', dedupeKey: key, consent: true,
  consentEvidence: { checked: true, disclosureVersion: 'patient-pipeline-sms-v1' },
  context: { firstName: 'Submitted', lastName: 'Person', email: `${key}@example.invalid`, phone: '', practiceName: 'Submitted office', bookingHandoff: { ref: 'private-retry-reference' } },
  marketingTerms: { version, checked, ip: '192.0.2.1', userAgent: 'Isolated Test Browser',
    identity: { firstName: 'Submitted', lastName: 'Person', email: `${key}@example.invalid`, phone: '', practiceName: 'Submitted office' } },
})
// Every legal fixture is confined to a disposable schema; nothing is published in public.
describe.skipIf(!process.env.SUPABASE_DB_URL)('lead terms (isolated schema, no outbound services)', () => {
  let adminPool: any, firstVersion: string, originalEvidence: any
  beforeAll(async () => {
    const actual = await vi.importActual<any>('@workspace/db')
    const url = new URL(process.env.SUPABASE_DB_URL!); url.searchParams.delete('sslmode')
    const config = { connectionString: url.toString(), ssl: { rejectUnauthorized: false }, max: 1 }
    adminPool = new actual.pool.constructor(config)
    await adminPool.query(`CREATE SCHEMA "${schema}"`)
    fixture.pool = new actual.pool.constructor({ ...config, max: 3, options: `-c search_path=${schema}` })
    const sales = readFileSync(new URL('../../../../lib/db/migrations/0029_bitter_ultragirl.sql', import.meta.url), 'utf8')
      .split('ALTER TABLE sales_leads ENABLE ROW LEVEL SECURITY;')[0]
    await fixture.pool.query(sales.replaceAll('"public".', `"${schema}".`).replaceAll('--> statement-breakpoint', ''))
    const terms = readFileSync(new URL('../../../../lib/db/migrations/0039_fair_beyonder.sql', import.meta.url), 'utf8')
    await fixture.pool.query(terms.replaceAll('"public".', `"${schema}".`).replaceAll('--> statement-breakpoint', ''))
  }, 30000)
  afterAll(async () => {
    fixture.role = 'super_admin'
    if (fixture.pool) await fixture.pool.end()
    if (adminPool) { await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await adminPool.end() }
  })
  async function publish(label: string, content: string) {
    const admin = await getTermsAdmin()
    await saveTermsDraft({ label, content, revision: admin.draft.revision })
    await publishTerms({ revision: admin.draft.revision + 1, confirm: true })
    return (await getCurrentTerms()).version!.id
  }
  it('is explicitly inactive and fabricates no evidence, even if a checkbox is sent', async () => {
    expect(await currentTerms()).toEqual({ active: false, version: null })
    const saved = await intake(input('inactive', 'invented-version'))
    expect(await termsAcceptanceHistory(saved.id)).toEqual([])
    const admin = await getTermsAdmin()
    expect(admin.draft.content).toBe('')
    expect(admin.history).toEqual([])
  })
  it('rejects empty documents, missing confirmation, outdated drafts, and non-super administrators', async () => {
    await expect(publishTerms({ revision: 0, confirm: true })).rejects.toThrow('Paste')
    await expect(publishTerms({ revision: 0, confirm: false })).rejects.toThrow('Explicitly')
    fixture.role = 'admin'
    await expect(saveTermsDraft({ content: 'fixture', label: 'fixture', revision: 0 })).rejects.toThrow('Unauthorized')
    await expect(publishTerms({ revision: 0, confirm: true })).rejects.toThrow('Unauthorized')
    await expect(getTermsAdmin()).rejects.toThrow('Unauthorized')
    fixture.role = 'super_admin'
    await expect(saveTermsDraft({ content: 'fixture', label: 'fixture', revision: 90 })).rejects.toThrow('draft changed')
  })
  it('publishes canonical plain text with fingerprint and acting administrator, never raw rendered HTML', async () => {
    firstVersion = await publish('Isolated fixture version', '  Heading\r\n\r\n<script>alert("fixture")</script>\r\n  indented line  ')
    const current = await getCurrentTerms()
    expect(current.active).toBe(true)
    expect(current.version?.content).toBe('Heading\n\n<script>alert("fixture")</script>\n  indented line')
    expect(current.version?.content_hash).toBe(documentHash(current.version!.content))
    expect(current.version?.checkbox_wording).toBe(LEAD_TERMS_WORDING)
    expect(current.version).not.toHaveProperty('published_by')
    const row = (await fixture.pool.query('SELECT * FROM lead_terms_versions WHERE id=$1', [firstVersion])).rows[0]
    expect(row.published_by).toBe('isolated-admin')
    expect(await getTermsVersion(firstVersion)).toEqual(current.version)
    await expect(publishTerms({ revision: 0, confirm: true })).rejects.toThrow('draft changed')
  })
  it('rejects missing, tampered, and stale acceptance without saving canonical submissions', async () => {
    for (const [key, version, checked] of [['unchecked', firstVersion, false], ['tampered', 'made-up', true], ['missing', '', false]] as const) {
      await expect(intake(input(key, version, checked))).rejects.toThrow(/Terms of Service/)
      expect((await fixture.pool.query('SELECT id FROM sales_submissions WHERE dedupe_key=$1', [key])).rowCount).toBe(0)
      expect((await fixture.pool.query('SELECT id FROM sales_leads WHERE email=$1', [`${key}@example.invalid`])).rowCount).toBe(0)
    }
  })
  it('records frozen identity, request evidence, server timestamp and exact archived wording atomically', async () => {
    const saved = await intake(input('accepted', firstVersion))
    const history = await termsAcceptanceHistory(saved.id)
    expect(history).toHaveLength(1)
    const row = history[0]
    expect(row.submitted_identity).toEqual(input('accepted', firstVersion).marketingTerms.identity)
    expect(row.source_path).toBe('/strategy-call/schedule')
    expect(row.ip).toBe('192.0.2.1')
    expect(row.user_agent).toBe('Isolated Test Browser')
    expect(row.checkbox_wording).toBe(LEAD_TERMS_WORDING)
    expect(Math.abs(Date.now() - new Date(row.accepted_at).getTime())).toBeLessThan(10000)
    const submission = (await fixture.pool.query('SELECT * FROM sales_submissions WHERE id=$1', [row.submission_id])).rows[0]
    expect(submission.lead_id).toBe(saved.id)
    expect(submission.consent_evidence.disclosureVersion).toBe('patient-pipeline-sms-v1')
    originalEvidence = await downloadTermsEvidence(row.id)
    expect(originalEvidence.archivedTerms.content_hash).toBe(documentHash(originalEvidence.archivedTerms.content))
    expect(originalEvidence.notice).toContain('unverified')
    expect(saved.bookingRef).toBe('private-retry-reference')
  })
  it('deduplicates retries, preserves saved handoff, and refuses identity changes under a retry key', async () => {
    const values = input('accepted', firstVersion)
    const retried = await Promise.all([intake(values), intake(values)])
    expect(retried[0].id).toBe(retried[1].id)
    expect(retried[0].bookingRef).toBe('private-retry-reference')
    expect((await fixture.pool.query('SELECT id FROM sales_submissions WHERE dedupe_key=$1', ['accepted'])).rowCount).toBe(1)
    expect(await termsAcceptanceHistory(retried[0].id)).toHaveLength(1)
    await expect(intake({ ...values, context: { ...values.context, firstName: 'Different' } })).rejects.toThrow('different entries')
  })
  it('rolls back contact, submission, SMS evidence and jobs when evidence cannot be written', async () => {
    await fixture.pool.query(`CREATE FUNCTION reject_test_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.submitted_identity->>'email'='rollback@example.invalid' THEN RAISE EXCEPTION 'fixture evidence failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_test_evidence BEFORE INSERT ON lead_terms_acceptances FOR EACH ROW EXECUTE FUNCTION reject_test_evidence();`)
    await expect(intake(input('rollback', firstVersion))).rejects.toThrow('fixture evidence failure')
    expect((await fixture.pool.query("SELECT id FROM sales_leads WHERE email='rollback@example.invalid'")).rowCount).toBe(0)
    expect((await fixture.pool.query("SELECT id FROM sales_submissions WHERE dedupe_key='rollback'")).rowCount).toBe(0)
    expect((await fixture.pool.query("SELECT id FROM sales_jobs WHERE dedupe_key LIKE '%rollback%'")).rowCount).toBe(0)
  })
  it('does not mark manual, historical or imported records accepted after activation', async () => {
    for (const source of ['manual', 'provider', 'historical']) {
      const { marketingTerms, ...base } = input(source, firstVersion)
      const saved = await intake({ ...base, source, historical: source !== 'manual' })
      expect(await termsAcceptanceHistory(saved.id)).toEqual([])
    }
  })
  it('keeps documents and acceptance unchanged after contact edits; prevents updates, deletes and truncates', async () => {
    await fixture.pool.query('UPDATE sales_leads SET first_name=$1,email=$2 WHERE id=$3', ['Staff edited', 'edited@example.invalid', originalEvidence.evidence.lead_id])
    expect(await downloadTermsEvidence(originalEvidence.evidence.id)).toEqual(originalEvidence)
    for (const sql of [
      "UPDATE lead_terms_versions SET content='changed'", 'DELETE FROM lead_terms_versions', 'TRUNCATE lead_terms_versions CASCADE',
      "UPDATE lead_terms_acceptances SET ip='changed'", 'DELETE FROM lead_terms_acceptances', 'TRUNCATE lead_terms_acceptances',
      'DELETE FROM lead_terms_settings', 'TRUNCATE lead_terms_settings', 'UPDATE lead_terms_settings SET current_version_id=NULL',
    ]) await expect(fixture.pool.query(sql)).rejects.toThrow(/immutable|cannot be/)
    await expect(fixture.pool.query('DELETE FROM sales_leads WHERE id=$1', [originalEvidence.evidence.lead_id])).rejects.toThrow(/foreign key/)
    for (const role of ['anon', 'authenticated']) {
      const privileges = (await fixture.pool.query(`SELECT has_table_privilege($1,$2,'SELECT') AS can_read`, [role, `${schema}.lead_terms_acceptances`])).rows[0]
      expect(privileges.can_read).toBe(false)
    }
    fixture.role = 'none'
    await expect(downloadTermsEvidence(originalEvidence.evidence.id)).rejects.toThrow('Unauthorized')
    await expect(termsAcceptanceHistory(originalEvidence.evidence.lead_id)).rejects.toThrow('Unauthorized')
    fixture.role = 'admin'
    expect(await downloadTermsEvidence(originalEvidence.evidence.id)).toEqual(originalEvidence)
    fixture.role = 'super_admin'
  })
  it('serializes publishing against intake: a completed old-version acceptance remains archived', async () => {
    const admin = await getTermsAdmin()
    await saveTermsDraft({ content: 'Isolated fixture second document', label: 'Isolated second', revision: admin.draft.revision })
    let release!: () => void
    let reached!: () => void
    const blocked = new Promise<void>(r => { reached = r })
    const gate = new Promise<void>(r => { release = r })
    fixture.beforeQuery = async sql => {
      if (sql.includes('INSERT INTO lead_terms_acceptances')) { reached(); await gate }
    }
    const submitting = intake(input('race-old-wins', firstVersion))
    let publishing: Promise<void> | undefined
    try {
      await blocked
      publishing = publishTerms({ revision: admin.draft.revision + 1, confirm: true })
      release()
      const saved = await submitting
      expect((await termsAcceptanceHistory(saved.id))[0].version_id).toBe(firstVersion)
      await publishing
      expect((await getCurrentTerms()).version!.id).not.toBe(firstVersion)
      expect(await downloadTermsEvidence(originalEvidence.evidence.id)).toEqual(originalEvidence)
      await expect(intake(input('now-stale', firstVersion))).rejects.toThrow('changed')
      expect(await getTermsVersion(firstVersion)).toEqual(originalEvidence.archivedTerms)
    } finally { release(); fixture.beforeQuery = null; await submitting.catch(() => {}); if (publishing) await publishing }
  }, 30000)
  it('serializes publishing first: waiting old-version intake rejects with no submission or acceptance', async () => {
    const old = (await getCurrentTerms()).version!.id
    const barrier = await fixture.pool.connect()
    let submitting: ReturnType<typeof intake> | undefined
    try {
      await barrier.query('BEGIN')
      await barrier.query("SELECT * FROM lead_terms_settings WHERE id='marketing' FOR UPDATE")
      submitting = intake(input('race-publish-wins', old))
      // Attach the rejection handler immediately.
      const rejected = expect(submitting).rejects.toThrow('changed')
      const next = randomUUID()
      await barrier.query(`INSERT INTO lead_terms_versions(id,label,content,content_hash,checkbox_wording,published_by,published_by_name)
        VALUES($1,'Isolated race fixture',$2,$3,$4,'isolated-admin','Isolated Administrator')`, [next, 'Isolated race content', documentHash('Isolated race content'), LEAD_TERMS_WORDING])
      await barrier.query("UPDATE lead_terms_settings SET current_version_id=$1 WHERE id='marketing'", [next])
      await barrier.query('COMMIT')
      await rejected
      expect((await fixture.pool.query("SELECT id FROM sales_submissions WHERE dedupe_key='race-publish-wins'")).rowCount).toBe(0)
    } finally { await barrier.query('ROLLBACK'); barrier.release(); if (submitting) await submitting.catch(() => {}) }
  }, 30000)
})

it('takes bounded network/browser evidence only from the request context, not form fields', async () => {
  const result = await runWithRequestContext({ ip: '192.0.2.50', headers: { 'user-agent': `browser\n${'x'.repeat(2000)}` } } as any, {} as any, async () => termsRequestEvidence())
  expect(result.ip).toBe('192.0.2.50')
  expect(result.userAgent).toHaveLength(1000)
  expect(result.userAgent).not.toContain('\n')
  expect(termsRequestEvidence().ip).toBe('unknown')
})
