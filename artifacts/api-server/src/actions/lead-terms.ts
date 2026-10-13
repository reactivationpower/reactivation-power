import { randomUUID } from 'node:crypto'
import { pool } from '@workspace/db'
import { canonicalTerms, LEAD_TERMS_WORDING } from '@workspace/shared/lead-terms'
import { requireAdmin } from '@/lib/auth/admin-session'
import { currentTerms, documentHash, publicVersion } from '@/lib/lead-terms/store'
import { transaction } from '@/lib/sales-leads/store'

export async function getCurrentTerms() { return currentTerms() }
export async function getTermsVersion(versionId: string) {
  if (typeof versionId !== 'string' || versionId.length > 100) throw new Error('Terms version not found')
  const row = (await pool.query('SELECT * FROM lead_terms_versions WHERE id=$1', [versionId])).rows[0]
  if (!row) throw new Error('Terms version not found')
  return publicVersion(row)
}
export async function getTermsAdmin() {
  await requireAdmin('super_admin')
  return transaction(async c => {
    const current = await currentTerms(c, true)
    const s = (await c.query("SELECT * FROM lead_terms_settings WHERE id='marketing'")).rows[0]
    const history = (await c.query('SELECT * FROM lead_terms_versions ORDER BY published_at DESC,id DESC')).rows
    return { current, draft: { content: s.draft_content, label: s.draft_label, revision: s.draft_revision },
      history: history.map(r => ({ ...publicVersion(r), published_by: r.published_by, published_by_name: r.published_by_name })) }
  })
}
function revision(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error('Reload the terms draft before saving')
}
export async function saveTermsDraft(input: { content: string; label: string; revision: number }) {
  const admin = await requireAdmin('super_admin')
  revision(input?.revision)
  if (typeof input.content !== 'string' || input.content.length > 200000 || typeof input.label !== 'string' || input.label.length > 120) throw new Error('Use a version label up to 120 characters and terms up to 200,000 characters')
  const result = await pool.query(`UPDATE lead_terms_settings SET draft_content=$1,draft_label=$2,draft_revision=draft_revision+1,updated_by=$3,updated_at=now()
    WHERE id='marketing' AND draft_revision=$4 RETURNING id`, [canonicalTerms(input.content), input.label.trim(), admin.userId, input.revision])
  if (!result.rowCount) throw new Error('The draft changed. Reload before saving.')
}
export async function publishTerms(input: { revision: number; confirm: boolean }) {
  const admin = await requireAdmin('super_admin')
  if (input?.confirm !== true) throw new Error('Explicitly confirm publication of the attorney-provided document')
  revision(input.revision)
  await transaction(async c => {
    const s = (await c.query("SELECT * FROM lead_terms_settings WHERE id='marketing' FOR UPDATE")).rows[0]
    if (!s || s.draft_revision !== input.revision) throw new Error('The draft changed. Reload and preview before publishing.')
    const content = canonicalTerms(s.draft_content), label = s.draft_label.trim()
    if (!content || !label) throw new Error('Paste the attorney-provided terms and enter a version label first')
    const hash = documentHash(content)
    if ((await c.query('SELECT id FROM lead_terms_versions WHERE content_hash=$1', [hash])).rowCount) throw new Error('This exact document was already published. Publish only a new attorney-provided version.')
    const id = randomUUID()
    await c.query(`INSERT INTO lead_terms_versions(id,label,content,content_hash,checkbox_wording,published_by,published_by_name)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [id, label, content, hash, LEAD_TERMS_WORDING, admin.userId, admin.name || admin.email])
    await c.query("UPDATE lead_terms_settings SET current_version_id=$1,draft_revision=draft_revision+1,updated_by=$2,updated_at=now() WHERE id='marketing'", [id, admin.userId])
  })
}
export async function termsAcceptanceHistory(leadId: string) {
  await requireAdmin()
  return (await pool.query(`SELECT a.*,v.label FROM lead_terms_acceptances a JOIN lead_terms_versions v ON v.id=a.version_id
    WHERE a.lead_id=$1 ORDER BY a.accepted_at DESC,a.id DESC`, [leadId])).rows
}
export async function downloadTermsEvidence(acceptanceId: string) {
  await requireAdmin()
  if (typeof acceptanceId !== 'string' || acceptanceId.length > 100) throw new Error('Acceptance not found')
  const row = (await pool.query(`SELECT a.*,v.label,v.content,v.published_at FROM lead_terms_acceptances a
    JOIN lead_terms_versions v ON v.id=a.version_id WHERE a.id=$1`, [acceptanceId])).rows[0]
  if (!row) throw new Error('Acceptance not found')
  const { content, published_at, ...evidence } = row
  return { format: 'patient-pipeline-lead-terms-evidence-v1',
    notice: 'Submitted identity is unverified. This records lead-form Terms acceptance, not SMS permission, a signed customer agreement, or a demo access guarantee.',
    evidence, archivedTerms: { id: row.version_id, label: row.label, content, content_hash: row.content_hash,
      checkbox_wording: row.checkbox_wording, published_at: new Date(published_at).toISOString() } }
}
