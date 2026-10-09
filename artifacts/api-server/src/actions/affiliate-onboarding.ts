import { pool } from '@workspace/db'
import { requireAdmin } from '@/lib/auth/admin-session'
import { getRequestContext } from '@/lib/request-context'
import { accessLimit, assertSameOrigin, requireAffiliate } from '@/lib/affiliates/access'
import { audit, transaction } from '@/lib/affiliates/store'
import { seal, unseal } from '@/lib/affiliates/onboarding-crypto'
import { intakeSchema, validatePdf, type Contact, type Wire } from '@/lib/affiliates/onboarding-validation'
import { enqueueOnboarding, deliverOnboarding } from '@/lib/affiliates/onboarding-invitations'

function protect() {
  assertSameOrigin()
  getRequestContext().res.setHeader('Cache-Control', 'no-store, private')
}
async function summary(affiliateId: string) {
  const row = (await pool.query(`SELECT version,contact_cipher,wire_cipher,submitted_at,reviewed_at,
    (w9_cipher IS NOT NULL) AS w9_received FROM affiliate_onboarding WHERE affiliate_id=$1`, [affiliateId])).rows[0]
  if (!row) return { version: 0, contact: null, bank: null, w9Received: false, submittedAt: null, reviewedAt: null, status: 'incomplete' }
  const contact = JSON.parse(unseal(row.contact_cipher, affiliateId, 'contact').toString()) as Contact
  const wire = JSON.parse(unseal(row.wire_cipher, affiliateId, 'wire').toString()) as Wire
  return { version: row.version, contact,
    bank: { bankName: wire.bankName, accountHolder: wire.accountHolder, accountType: wire.accountType, last4: wire.accountNumber.slice(-4) },
    w9Received: row.w9_received, submittedAt: row.submitted_at, reviewedAt: row.reviewed_at,
    status: row.reviewed_at ? 'reviewed' : 'submitted' }
}
export async function getMyOnboarding() {
  protect()
  const { partner } = await requireAffiliate()
  return { ...await summary(partner.id), loginEmail: partner.email }
}
export async function saveMyOnboarding(raw: unknown) {
  protect()
  const session = await requireAffiliate(), affiliateId = session.partner.id
  if (!await accessLimit('onboarding-save', affiliateId, 20)) throw new Error('Too many submissions. Try again later.')
  const parsed = intakeSchema.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '))
  const input = parsed.data
  const pdf = input.w9Base64 === undefined ? undefined : await validatePdf(input.w9Base64)
  const contactCipher = seal(Buffer.from(JSON.stringify(input.contact)), affiliateId, 'contact')
  const wire = input.wire ? (({ accountConfirmation: _, ...rest }) => rest)(input.wire) : undefined
  const wireCipher = wire ? seal(Buffer.from(JSON.stringify(wire)), affiliateId, 'wire') : undefined
  const pdfCipher = pdf ? seal(pdf, affiliateId, 'w9') : undefined
  return transaction(async client => {
    // Serialize against revocation, status/email changes and all other intake saves.
    const p = (await client.query('SELECT status,access_version FROM affiliates WHERE id=$1 FOR UPDATE', [affiliateId])).rows[0]
    const auth = (await client.query(`SELECT created_at FROM affiliate_sessions WHERE id=$1 AND revoked_at IS NULL
      AND expires_at>now() AND access_version=$2`, [session.sessionId, p.access_version])).rows[0]
    if (!auth || p.status !== 'approved') throw new Error('Affiliate sign-in required')
    const previous = (await client.query('SELECT version,wire_cipher,w9_cipher FROM affiliate_onboarding WHERE affiliate_id=$1 FOR UPDATE', [affiliateId])).rows[0]
    if ((previous?.version ?? 0) !== input.version) throw new Error('Stale version: information changed in another session. Reload before submitting again.')
    if ((wire || pdf) && Date.now() - new Date(auth.created_at).getTime() > 15 * 60_000) {
      throw new Error('Fresh inbox verification required before replacing bank details or W-9. Request a new sign-in link.')
    }
    if (!previous && (!wireCipher || !pdfCipher)) throw new Error('Bank details and a completed signed W-9 PDF are required')
    await client.query(`INSERT INTO affiliate_onboarding(affiliate_id,version,contact_cipher,wire_cipher,w9_cipher)
      VALUES($1,1,$2,$3,$4) ON CONFLICT(affiliate_id) DO UPDATE SET version=affiliate_onboarding.version+1,
      contact_cipher=$2,wire_cipher=COALESCE($3,affiliate_onboarding.wire_cipher),
      w9_cipher=COALESCE($4,affiliate_onboarding.w9_cipher),submitted_at=now(),reviewed_at=NULL,reviewed_by=NULL`,
    [affiliateId, contactCipher, wireCipher ?? previous?.wire_cipher, pdfCipher ?? previous?.w9_cipher])
    await audit(client, affiliateId, 'onboarding_submitted', 'affiliate', null, null,
      { version: input.version + 1, bankReplaced: Boolean(wire), w9Replaced: Boolean(pdf) })
    return { ok: true, version: input.version + 1 }
  })
}
export async function getAdminOnboarding(affiliateId: string) {
  protect(); await requireAdmin('super_admin')
  const invitations = (await pool.query(`SELECT i.id,i.status,i.created_at,
    (SELECT e.status FROM email_log e WHERE e.provider_id=i.provider_id ORDER BY e.created_at DESC LIMIT 1) delivery_status
    FROM affiliate_onboarding_invitations i WHERE i.affiliate_id=$1 ORDER BY i.created_at DESC LIMIT 10`, [affiliateId])).rows
  return { ...await summary(affiliateId), invitations }
}
async function sensitive(input: { affiliateId: string; version: number }, action: 'wire_revealed' | 'w9_downloaded' | 'onboarding_reviewed') {
  protect()
  const admin = await requireAdmin('super_admin')
  if (!await accessLimit('onboarding-admin', admin.userId, 60)) throw new Error('Too many requests. Try again later.')
  return transaction(async client => {
    const row = (await client.query('SELECT * FROM affiliate_onboarding WHERE affiliate_id=$1 FOR UPDATE', [input.affiliateId])).rows[0]
    if (!row || row.version !== input.version) throw new Error('Information changed. Reload the profile before continuing.')
    await audit(client, input.affiliateId, action, admin.userId, null, null, { version: row.version })
    if (action === 'onboarding_reviewed') {
      await client.query('UPDATE affiliate_onboarding SET reviewed_at=now(),reviewed_by=$2 WHERE affiliate_id=$1', [input.affiliateId, admin.userId])
      return { ok: true }
    }
    if (action === 'wire_revealed') return JSON.parse(unseal(row.wire_cipher, input.affiliateId, 'wire').toString())
    return { base64: unseal(row.w9_cipher, input.affiliateId, 'w9').toString('base64'), filename: 'signed-w9.pdf' }
  })
}
export const reviewOnboarding = (input: { affiliateId: string; version: number }) => sensitive(input, 'onboarding_reviewed')
export const revealOnboardingWire = (input: { affiliateId: string; version: number }) => sensitive(input, 'wire_revealed')
export const downloadOnboardingW9 = (input: { affiliateId: string; version: number }) => sensitive(input, 'w9_downloaded')
export async function resendOnboardingInvitation(affiliateId: string) {
  protect()
  const admin = await requireAdmin('super_admin')
  if (!await accessLimit('onboarding-resend', affiliateId, 5)) throw new Error('Too many invitations. Try again later.')
  const jobId = await transaction(async client => {
    const p = (await client.query('SELECT * FROM affiliates WHERE id=$1 FOR UPDATE', [affiliateId])).rows[0]
    if (!p || p.status !== 'approved') throw new Error('Only approved affiliates can receive onboarding invitations')
    // An intentional resend is a new event; do not race any leased attempt.
    const active = (await client.query(`SELECT id FROM affiliate_onboarding_invitations WHERE affiliate_id=$1
      AND status='sending' AND lease_until>now()`, [affiliateId])).rows[0]
    if (active) throw new Error('An invitation is being sent. Try again shortly.')
    await client.query(`UPDATE affiliate_onboarding_invitations SET status='cancelled'
      WHERE affiliate_id=$1 AND status IN ('pending','failed','sending')`, [affiliateId])
    const job = await enqueueOnboarding(client, p, false)
    await audit(client, affiliateId, 'onboarding_invitation_requested', admin.userId)
    return job
  })
  if (jobId) await deliverOnboarding(jobId).catch(() => false)
  return { ok: true }
}
