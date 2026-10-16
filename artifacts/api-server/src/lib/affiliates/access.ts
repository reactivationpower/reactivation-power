import { isIP } from 'node:net'
import type { Request } from 'express'
import { pool } from '@workspace/db'
import { getRequestContext } from '@/lib/request-context'
import { authDigest, authToken } from '@/lib/auth/portal-password'
import { authRateLimit } from '@/lib/auth/portal-challenges'
import { sendEmail } from '@/lib/mail/send'
import { audit, id, partner, transaction, type Partner } from './store'

export const AFFILIATE_COOKIE = 'pp_affiliate'
const secure = () => getRequestContext().req.secure || process.env.NODE_ENV === 'production'
/** Only the directly connected local ingress is trusted. Never use the leftmost, user-supplied hop. */
export function trustedAffiliateIp(req: Request): string | null {
  const peer = req.socket.remoteAddress?.replace(/^::ffff:/, '')
  if (!peer || !isIP(peer)) return null
  if (peer === '127.0.0.1' || peer === '::1') {
    const hops = req.header('x-forwarded-for')?.split(',').map(s => s.trim())
    const last = hops?.at(-1)?.replace(/^::ffff:/, '')
    return last && isIP(last) ? last : null
  }
  return peer
}
export function assertSameOrigin() {
  const req = getRequestContext().req
  if (req.header('sec-fetch-site') === 'cross-site') throw new Error('Cross-site access is not allowed')
  const origin = req.header('origin')
  if (origin && new URL(origin).host !== req.header('host') && new URL(origin).host !== req.header('x-forwarded-host')) {
    throw new Error('Cross-site access is not allowed')
  }
}
export async function accessLimit(scope: string, value: string, max = 10): Promise<boolean> {
  const req = getRequestContext().req
  return await authRateLimit(`affiliate-${scope}-ip`, trustedAffiliateIp(req) ?? 'unknown', max * 3, 3600) &&
    await authRateLimit(`affiliate-${scope}`, value, max, 3600)
}
export function accessId(p: Partner): string {
  return `${p.id}.${p.access_version}.${authDigest(`affiliate-entry:${p.id}:${p.access_version}`)}`
}
export async function sendAccess(p: Partner, onboarding = false) {
  if (p.status !== 'approved') throw new Error('Only approved affiliates can receive access')
  const token = authToken()
  const key = authDigest(`affiliate-challenge:${token}`)
  await transaction(async client => {
    const current = (await client.query('SELECT email,status,access_version FROM affiliates WHERE id=$1 FOR UPDATE', [p.id])).rows[0]
    if (!current || current.email !== p.email || current.status !== 'approved' || current.access_version !== p.access_version) throw new Error('Affiliate access changed. Request a new link.')
    await client.query('UPDATE affiliate_challenges SET consumed_at=now() WHERE affiliate_id=$1 AND consumed_at IS NULL', [p.id])
    await client.query(`INSERT INTO affiliate_challenges(id,affiliate_id,email,access_version,expires_at)
      VALUES($1,$2,$3,$4,now()+interval '15 minutes')`, [key, p.id, p.email, p.access_version])
    await audit(client, p.id, 'access_email_issued', 'system')
  })
  const result = await sendEmail('affiliate_access', p.email, {
    businessName: p.business_name, loginUrl: `https://patientpipeline.app/affiliates/access${onboarding ? '?next=onboarding' : ''}#token=${token}`,
  })
  if (!result.ok) {
    await pool.query('UPDATE affiliate_challenges SET consumed_at=now() WHERE id=$1', [key])
  }
  return { ok: result.ok, error: result.ok ? undefined : 'Access email could not be sent. Check the email delivery log and retry.' }
}
export async function verifyAccess(email: string, token: string): Promise<boolean> {
  if (!/^[\w-]{43}$/.test(token) || !await accessLimit('verify', email, 12)) return false
  const sessionToken = authToken()
  const authenticated = await transaction(async client => {
    // Same lock order as issuance/revocation; inbox token is consumed atomically.
    const candidate = (await client.query('SELECT affiliate_id FROM affiliate_challenges WHERE id=$1', [authDigest(`affiliate-challenge:${token}`)])).rows[0]
    if (!candidate) return null
    const p = (await client.query('SELECT * FROM affiliates WHERE id=$1 FOR UPDATE', [candidate.affiliate_id])).rows[0] as Partner
    const challenge = (await client.query(`UPDATE affiliate_challenges SET consumed_at=now()
      WHERE id=$1 AND affiliate_id=$2 AND email=$3 AND access_version=$4 AND consumed_at IS NULL AND expires_at>now()
      RETURNING id`, [authDigest(`affiliate-challenge:${token}`), p.id, email, p.access_version])).rows[0]
    if (!challenge || p.status !== 'approved' || p.email !== email) return null
    const sessionId = authDigest(`affiliate-session:${sessionToken}`)
    await client.query(`INSERT INTO affiliate_sessions(id,affiliate_id,access_version,expires_at)
      VALUES($1,$2,$3,now()+interval '8 hours')`, [sessionId, p.id, p.access_version])
    await audit(client, p.id, 'access_verified', 'affiliate')
    return { p, sessionId }
  })
  if (!authenticated) return false
  getRequestContext().res.cookie(AFFILIATE_COOKIE, sessionToken, {
    httpOnly: true, secure: secure(), sameSite: secure() ? 'none' : 'lax', partitioned: secure(), path: '/', maxAge: 8 * 3600_000,
  })
  await telemetry(authenticated.p.id, authenticated.sessionId, 'session_visit')
  return true
}
export async function affiliateSession(req: Request): Promise<{ partner: Partner; sessionId: string } | null> {
  const token = req.cookies?.[AFFILIATE_COOKIE]
  if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) return null
  const sessionId = authDigest(`affiliate-session:${token}`)
  const { rows } = await pool.query(`SELECT a.* FROM affiliate_sessions s JOIN affiliates a ON a.id=s.affiliate_id
    WHERE s.id=$1 AND s.expires_at>now() AND s.revoked_at IS NULL AND a.status='approved'
    AND s.access_version=a.access_version`, [sessionId])
  if (!rows[0]) return null
  await pool.query('UPDATE affiliate_sessions SET last_seen_at=now() WHERE id=$1', [sessionId])
  return { partner: rows[0], sessionId }
}
export async function requireAffiliate() {
  const session = await affiliateSession(getRequestContext().req)
  if (!session) throw new Error('Affiliate sign-in required')
  return session
}
export async function telemetry(affiliateId: string, sessionId: string, action: string, customerId?: string) {
  const req = getRequestContext().req
  // No unverified geographic headers. Region/country remain unavailable when no trusted source exists.
  await pool.query(`INSERT INTO affiliate_activity(id,affiliate_id,actor,action,session_id,customer_id,ip,telemetry)
    VALUES($1,$2,'affiliate',$3,$4,$5,$6,true)`, [id(), affiliateId, action, sessionId, customerId ?? null, trustedAffiliateIp(req)])
}
export async function revokeAccess(affiliateId: string, actor: string, reason: string) {
  await transaction(async client => {
    await client.query('UPDATE affiliates SET access_version=access_version+1 WHERE id=$1', [affiliateId])
    await client.query('UPDATE affiliate_sessions SET revoked_at=now() WHERE affiliate_id=$1 AND revoked_at IS NULL', [affiliateId])
    await client.query('UPDATE affiliate_challenges SET consumed_at=now() WHERE affiliate_id=$1 AND consumed_at IS NULL', [affiliateId])
    await client.query(`UPDATE affiliate_onboarding_invitations SET status='cancelled'
      WHERE affiliate_id=$1 AND status IN ('pending','sending','failed','uncertain')`, [affiliateId])
    await audit(client, affiliateId, 'access_revoked', actor, reason)
  })
}
