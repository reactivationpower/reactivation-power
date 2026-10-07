import { randomUUID } from 'node:crypto'
import { pool, type PoolClient } from '@workspace/db'
import type { PatientImportReview, PatientImportSummary } from '@workspace/shared/csv-patients'
import {
  planPatientImport, type ImportContactRecord, type ImportServiceRecord,
  type ImportSourceRecord, type PreviousReview, type ResolvedImportRow,
} from './import-plan'

type Client = PoolClient
type Plan = ReturnType<typeof planPatientImport>
const contactFields = 'id, name, phone, email, niche_id, service_label, original_complaint, notes, do_not_call'

async function loadPlan(client: Client, ownerId: string, source: string, rows: ResolvedImportRow[], override?: { decision: 'match' | 'create'; contactId?: string }) {
  const contacts = await client.query<ImportContactRecord>(`SELECT ${contactFields} FROM contacts WHERE owner_id = $1`, [ownerId])
  const sources = await client.query<ImportSourceRecord>('SELECT contact_id, patient_id FROM patient_sources WHERE owner_id = $1 AND source_system = $2', [ownerId, source])
  const services = await client.query<ImportServiceRecord>(`SELECT contact_id, service_key, niche_id, service_label, last_visit::text, original_complaint, source_notes
    FROM contact_services WHERE owner_id = $1`, [ownerId])
  const reviews = await client.query<PreviousReview>('SELECT fingerprint, decision, contact_id FROM patient_import_reviews WHERE owner_id = $1 AND source_system = $2', [ownerId, source])
  return planPatientImport({ source, rows, contacts: contacts.rows, sources: sources.rows, services: services.rows, previousReviews: reviews.rows, override })
}

/** Owner-scoped lock serializes concurrent CSV uploads AND review resolution.
 * All contact/source/service/review writes commit together or not at all. */
async function transaction<T>(ownerId: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('patient-csv:' || $1::text, 0))", [ownerId])
    const value = await fn(client)
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function writePlan(client: Client, plan: Plan, context: { ownerId: string; participantId: string; source: string; stageId: string | null; batchId: string }) {
  const { ownerId, participantId, source, stageId, batchId } = context
  // Serialize treatment/service changes with claims and call outcomes.
  const patientIds = [...new Set([...plan.updates.map(c => c.id), ...plan.services.map(s => s.contact_id)])].sort()
  if (patientIds.length) await client.query('SELECT id FROM contacts WHERE owner_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE', [ownerId, patientIds])
  // Only new people receive the initial stage. No follow-ups are created here.
  if (plan.inserts.length) await client.query(`INSERT INTO contacts
    (id, owner_id, created_by, name, phone, email, niche_id, stage_id, service_label, original_complaint, notes, do_not_call)
    SELECT r.id, $2::uuid, $3::uuid, r.name, r.phone, r.email, r.niche_id, $4::uuid, r.service_label, r.original_complaint, r.notes, r.do_not_call
    FROM jsonb_to_recordset($1::jsonb) AS r(id uuid, name text, phone text, email text, niche_id uuid, service_label text, original_complaint text, notes text, do_not_call boolean)`,
    [JSON.stringify(plan.inserts), ownerId, participantId, stageId])
  // Conditional update preserves a concurrently recorded opt-out and never
  // touches notes, niche, stage, first_call_at, follow-ups, or call history.
  if (plan.updates.length) await client.query(`UPDATE contacts c SET
    name = CASE WHEN c.name = r.old_name THEN r.name ELSE c.name END,
    phone = CASE WHEN c.phone = r.old_phone THEN r.phone ELSE c.phone END,
    email = CASE WHEN c.email IS NOT DISTINCT FROM r.old_email THEN r.email ELSE c.email END,
    do_not_call = c.do_not_call OR r.do_not_call
    FROM jsonb_to_recordset($1::jsonb) AS r(id uuid, name text, phone text, email text, do_not_call boolean, old_name text, old_phone text, old_email text)
    WHERE c.id = r.id AND c.owner_id = $2`,
    [JSON.stringify(plan.updates), ownerId])
  if (plan.sources.length) await client.query(`INSERT INTO patient_sources (owner_id, contact_id, source_system, patient_id)
    SELECT $2::uuid, r.contact_id, $3, r.patient_id
    FROM jsonb_to_recordset($1::jsonb) AS r(contact_id uuid, patient_id text)
    `,
    [JSON.stringify(plan.sources), ownerId, source])
  if (plan.services.length) await client.query(`INSERT INTO contact_services
    (owner_id, contact_id, service_key, niche_id, service_label, last_visit, original_complaint, source_notes)
    SELECT $2::uuid, r.contact_id, r.service_key, r.niche_id, r.service_label, r.last_visit, r.original_complaint, r.source_notes
    FROM jsonb_to_recordset($1::jsonb) AS r(contact_id uuid, service_key text, niche_id uuid, service_label text, last_visit date, original_complaint text, source_notes text)
    ON CONFLICT (contact_id, service_key) DO UPDATE SET
      last_visit = GREATEST(contact_services.last_visit, EXCLUDED.last_visit),
      service_label = COALESCE(NULLIF(contact_services.service_label, ''), EXCLUDED.service_label),
      original_complaint = COALESCE(NULLIF(contact_services.original_complaint, ''), EXCLUDED.original_complaint),
      source_notes = COALESCE(NULLIF(contact_services.source_notes, ''), EXCLUDED.source_notes),
      updated_at = now()`,
    [JSON.stringify(plan.services), ownerId])
  if (plan.reviews.length) await client.query(`INSERT INTO patient_import_reviews
    (owner_id, batch_id, row_number, source_system, fingerprint, incoming, reason, candidate_ids)
    SELECT $2::uuid, $3::uuid, r.row_number, $4, r.fingerprint, r.incoming, r.reason, r.candidate_ids
    FROM jsonb_to_recordset($1::jsonb) AS r(row_number integer, fingerprint text, incoming jsonb, reason text, candidate_ids uuid[])
    ON CONFLICT (owner_id, fingerprint) DO NOTHING`,
    [JSON.stringify(plan.reviews), ownerId, batchId, source])
}

export async function executePatientImport(context: {
  ownerId: string; participantId: string; source: string; stageId: string | null; simulated: boolean
  mappings?: Array<{ service_label: string; niche_id: string | null }>
}, rows: ResolvedImportRow[]): Promise<PatientImportSummary> {
  return transaction(context.ownerId, async client => {
    const plan = await loadPlan(client, context.ownerId, context.source, rows)
    const batchId = randomUUID()
    if (!context.simulated) {
      await writePlan(client, plan, { ...context, batchId })
      const mappings = [...new Map((context.mappings ?? []).map(m => {
        const label = m.service_label.trim().replace(/\s+/g, ' ').toLowerCase()
        return [label, { service_label: label, niche_id: m.niche_id }] as const
      })).values()]
      if (mappings.length) await client.query(`INSERT INTO service_niche_mappings (owner_id, service_label, niche_id, updated_at)
        SELECT $2::uuid, r.service_label, r.niche_id, now()
        FROM jsonb_to_recordset($1::jsonb) AS r(service_label text, niche_id uuid)
        ON CONFLICT (owner_id, service_label) DO UPDATE SET niche_id = EXCLUDED.niche_id, updated_at = now()`,
        [JSON.stringify(mappings), context.ownerId])
    }
    return { ...plan.summary, ...(context.simulated ? { simulated: true } : { batchId }) }
  })
}

export async function listImportReviews(ownerId: string): Promise<PatientImportReview[]> {
  const { rows } = await pool.query(`SELECT r.id, r.row_number, r.reason, r.source_system, r.incoming->'row' AS row,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email))
      FROM contacts c WHERE c.owner_id = r.owner_id AND c.id = ANY(r.candidate_ids)), '[]'::jsonb) AS candidates
    FROM patient_import_reviews r WHERE r.owner_id = $1 AND r.resolved_at IS NULL
    ORDER BY r.created_at, r.row_number LIMIT 100`, [ownerId])
  return rows as PatientImportReview[]
}

export async function resolveImportReview(context: { ownerId: string; participantId: string; stageId: string | null }, input: {
  reviewId: string; decision: 'match' | 'create' | 'ignore'; contactId?: string
}): Promise<void> {
  await transaction(context.ownerId, async client => {
    const found = await client.query<{ source_system: string; incoming: ResolvedImportRow; candidate_ids: string[] }>(
      'SELECT source_system, incoming, candidate_ids FROM patient_import_reviews WHERE id = $1 AND owner_id = $2 AND resolved_at IS NULL FOR UPDATE',
      [input.reviewId, context.ownerId])
    const review = found.rows[0]
    if (!review) throw new Error('This review is no longer available.')
    if (input.decision === 'match' && (!input.contactId || !review.candidate_ids.includes(input.contactId)))
      throw new Error('Choose one of the suggested patients.')
    let contactId: string | null = null
    if (input.decision !== 'ignore') {
      const plan = await loadPlan(client, context.ownerId, review.source_system, [review.incoming], { decision: input.decision, contactId: input.contactId })
      if (plan.summary.skippedInvalid || plan.summary.needsReview) throw new Error('Correct the row in your CSV and upload it again.')
      contactId = input.decision === 'match' ? input.contactId! : plan.inserts[0]!.id
      await writePlan(client, plan, { ...context, source: review.source_system, batchId: randomUUID() })
    }
    await client.query('UPDATE patient_import_reviews SET resolved_at = now(), decision = $3, contact_id = $4 WHERE id = $1 AND owner_id = $2',
      [input.reviewId, context.ownerId, input.decision, contactId])
  })
}
