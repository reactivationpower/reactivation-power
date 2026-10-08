import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

export const MIN_PORTAL_PASSWORD_LENGTH = 12
export const MAX_PORTAL_PASSWORD_LENGTH = 128
export const CODE_LIFETIME_MS = 5 * 60 * 1000
export const MAX_CODE_ATTEMPTS = 6

export function authDigest(value: string): string {
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_JWT_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return createHmac('sha256', `portal-auth:${secret}`).update(value).digest('hex')
}
export function authToken() { return randomBytes(32).toString('base64url') }
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}
export async function hashPortalPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  return `scrypt:${salt}:${(await derive(password, salt)).toString('hex')}`
}
export async function verifyPortalPassword(password: string, encoded: string | null): Promise<boolean> {
  const [, salt, hex] = encoded?.split(':') ?? []
  // Unknown accounts do the same expensive work instead of returning early.
  const actual = await derive(password, salt || 'portal-unknown-account')
  const expected = /^[a-f0-9]{128}$/.test(hex ?? '') ? Buffer.from(hex, 'hex') : Buffer.alloc(64)
  return encoded?.startsWith('scrypt:') === true && timingSafeEqual(actual, expected)
}
