import { createHash, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { pool, type PoolClient } from '@workspace/db'
import { termsAcceptanceError, type CurrentLeadTerms, type LeadTermsVersion } from '@workspace/shared/lead-terms'
import { tryGetRequestContext } from '../request-context'

type Queryable = Pick<PoolClient, 'query'>
export const documentHash = (content: string) => createHash('sha256').update(content, 'utf8').digest('hex')
/** Do not disclose acting-admin metadata through the public document response. */
export function publicVersion(row: any): LeadTermsVersion {
  return { id: row.id, label: row.label, content: row.content, content_hash: row.content_hash,
    checkbox_wording: row.checkbox_wording, published_at: new Date(row.published_at).toISOString() }
}
export async function currentTerms(c: Queryable = pool, lock = false): Promise<CurrentLeadTerms> {
  // A missing singleton is a setup failure, never an inactive feature.
  // Publication uses FOR UPDATE on this same row; submissions retain FOR SHARE until commit.
  const setting = (await c.query("SELECT current_version_id FROM lead_terms_settings WHERE id='marketing'" + (lock ? ' FOR SHARE' : ''))).rows[0]
  if (!setting) throw new Error('Terms configuration is unavailable')
  if (!setting.current_version_id) return { active: false, version: null }
  const row = (await c.query('SELECT * FROM lead_terms_versions WHERE id=$1', [setting.current_version_id])).rows[0]
  if (!row) throw new Error('Published terms are unavailable')
  return { active: true, version: publicVersion(row) }
}
export class TermsAcceptanceError extends Error {
  constructor(public terms: CurrentLeadTerms, message: string) { super(message) }
}
export interface MarketingTermsInput {
  version: string
  checked: boolean
  ip: string
  userAgent: string
}
/** Express req.ip respects the app's configured proxy trust policy.
 * Do not take a public form's claimed IP or browser evidence. */
export function termsRequestEvidence(): Pick<MarketingTermsInput, 'ip' | 'userAgent'> {
  const req = tryGetRequestContext()?.req
  const candidate = req?.ip ?? req?.socket?.remoteAddress ?? ''
  return { ip: isIP(candidate) ? candidate.slice(0, 64) : 'unknown',
    userAgent: String(req?.headers['user-agent'] ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 1000) }
}
export async function requireCurrentAcceptance(c: Queryable, input: MarketingTermsInput): Promise<CurrentLeadTerms> {
  const terms = await currentTerms(c, true)
  const error = termsAcceptanceError(terms, input.version, input.checked)
  if (error) throw new TermsAcceptanceError(terms, error)
  return terms
}
export async function recordTermsAcceptance(c: Queryable, terms: CurrentLeadTerms, input: MarketingTermsInput, submissionId: string, leadId: string,
  identity: { firstName: string; lastName: string; email: string; phone: string; practiceName: string }, sourcePath: string) {
  if (!terms.active) return
  await c.query(`INSERT INTO lead_terms_acceptances(id,submission_id,lead_id,version_id,submitted_identity,content_hash,checkbox_wording,source_path,ip,user_agent)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [randomUUID(), submissionId, leadId, terms.version.id, JSON.stringify(identity), terms.version.content_hash,
    terms.version.checkbox_wording, sourcePath.slice(0, 200), input.ip.slice(0, 64), input.userAgent.slice(0, 1000)])
}
