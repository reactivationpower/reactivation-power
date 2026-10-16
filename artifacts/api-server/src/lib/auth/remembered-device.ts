import { timingSafeEqual } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { pool, type PoolClient } from '@workspace/db'
import { authDigest, authToken } from './portal-password'

/**
 * After a correct email code, this browser skips the code for the same person
 * for 48 hours, counted from the code entry. Using the portal never extends it.
 * Each person gets their own cookie, so another account on the same computer
 * still needs its own code. The browser holds a signed random secret; the
 * database holds only its digest, the person and their password revision.
 */
export const REMEMBER_DEVICE_MS = 48 * 60 * 60 * 1000
const COOKIE_PREFIX = 'tp_device_'

export function rememberedDeviceCookieName(participantId: string) {
  return `${COOKIE_PREFIX}${authDigest(`device-cookie:${participantId}`).slice(0, 24)}`
}
const signature = (token: string) => authDigest(`device-signature:${token}`)
const recordId = (token: string) => authDigest(`device:${token}`)

/** The secret from a signed cookie value, or null when it was not issued by us. */
function readToken(value: string | undefined): string | null {
  const [token, sig, extra] = (value ?? '').split('.')
  if (extra !== undefined || !token || !sig || !/^[\w-]{43}$/.test(token)) return null
  const a = Buffer.from(sig), b = Buffer.from(signature(token))
  return a.length === b.length && timingSafeEqual(a, b) ? token : null
}
async function cookieToken(participantId: string) {
  return readToken((await cookies()).get(rememberedDeviceCookieName(participantId))?.value)
}

/** True only for an unrevoked, unexpired record for this exact person and password revision. */
export async function isRememberedDevice(participantId: string, credentialVersion: string): Promise<boolean> {
  const token = await cookieToken(participantId)
  if (!token) return false
  const result = await pool.query(`SELECT 1 FROM portal_auth_devices
    WHERE id = $1 AND participant_id = $2 AND credential_version = $3
      AND revoked_at IS NULL AND expires_at > statement_timestamp()`,
  [recordId(token), participantId, credentialVersion])
  return result.rowCount === 1
}

/** Issue a fresh 48-hour memory for this person on this browser. */
export async function rememberDevice(participantId: string, credentialVersion: string) {
  const old = await cookieToken(participantId)
  if (old) await revokeRecord(old)
  const token = authToken()
  await pool.query(`INSERT INTO portal_auth_devices (id, participant_id, credential_version, expires_at)
    VALUES ($1, $2, $3, statement_timestamp() + ($4::int * interval '1 millisecond'))`,
  [recordId(token), participantId, credentialVersion, REMEMBER_DEVICE_MS])
  const h = await headers()
  const secure = h.get('x-forwarded-proto')?.split(',')[0].trim() === 'https' || process.env.NODE_ENV === 'production'
  ;(await cookies()).set(rememberedDeviceCookieName(participantId), `${token}.${signature(token)}`, {
    httpOnly: true, secure, sameSite: secure ? 'none' : 'lax',
    partitioned: secure, path: '/', maxAge: REMEMBER_DEVICE_MS / 1000,
  })
}

async function revokeRecord(token: string) {
  await pool.query(`UPDATE portal_auth_devices SET revoked_at = statement_timestamp()
    WHERE id = $1 AND revoked_at IS NULL`, [recordId(token)])
}

/** Manual log out: forget this browser for this person. */
export async function forgetDevice(participantId: string) {
  const store = await cookies()
  const name = rememberedDeviceCookieName(participantId)
  const token = readToken(store.get(name)?.value)
  if (token) await revokeRecord(token)
  if (store.has(name)) store.delete(name)
}

/** Password change or reset: forget every browser for this person. */
export async function revokeAllDevices(conn: Pick<PoolClient, 'query'>, participantId: string) {
  await conn.query(`UPDATE portal_auth_devices SET revoked_at = statement_timestamp()
    WHERE participant_id = $1 AND revoked_at IS NULL`, [participantId])
}
