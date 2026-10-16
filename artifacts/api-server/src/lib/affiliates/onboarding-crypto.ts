import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function key(version: string) {
  if (!/^V[1-9]\d*$/.test(version)) throw new Error('Secure onboarding storage unavailable')
  const raw = process.env[`AFFILIATE_DATA_KEY_${version}`]
  if (!raw) throw new Error('Secure onboarding storage unavailable: encryption key is missing')
  if (!/^[a-fA-F0-9]{64}$/.test(raw)) throw new Error('Secure onboarding storage unavailable: encryption key must contain exactly 64 hexadecimal characters')
  return Buffer.from(raw, 'hex')
}
/** Versioned AES-256-GCM; affiliate and field binding prevents ciphertext swapping. */
export function seal(data: Buffer, affiliateId: string, field: string): string {
  const version = process.env.AFFILIATE_DATA_KEY_VERSION || 'V1'
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(version), nonce)
  cipher.setAAD(Buffer.from(`${version}:${affiliateId}:${field}`))
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  return [version, nonce.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.')
}
export function unseal(value: string, affiliateId: string, field: string): Buffer {
  try {
    const [version, iv, tag, encrypted] = value.split('.')
    const decipher = createDecipheriv('aes-256-gcm', key(version!), Buffer.from(iv!, 'base64'))
    decipher.setAAD(Buffer.from(`${version}:${affiliateId}:${field}`))
    decipher.setAuthTag(Buffer.from(tag!, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(encrypted!, 'base64')), decipher.final()])
  } catch { throw new Error('Secure onboarding storage unavailable') }
}
