import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db, patientTextConnections as connections } from '@workspace/db'

const purpose = 'patient-text-connections-v1'
function key() {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error('Secure connection storage is unavailable.')
  return Buffer.from(hkdfSync('sha256', secret, purpose, purpose, 32))
}
export function sealCredential(ownerId: string, kind: string, credential: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(Buffer.from(`${purpose}/${ownerId}/${kind}`))
  const data = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64url')).join('.')
}
export function unsealCredential(ownerId: string, kind: string, value: string) {
  const [iv, tag, data] = value.split('.').map(s => Buffer.from(s, 'base64url'))
  const cipher = createDecipheriv('aes-256-gcm', key(), iv)
  cipher.setAAD(Buffer.from(`${purpose}/${ownerId}/${kind}`)); cipher.setAuthTag(tag)
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8')
}
export async function connectionStatus(ownerId: string) {
  const rows = await db.select({ kind: connections.kind, provider: connections.provider,
    accountId: connections.accountId, updatedAt: connections.updatedAt }).from(connections).where(eq(connections.ownerId, ownerId))
  return rows.map(r => ({ ...r, credential: 'Stored securely', ready: false, state: 'unverified',
    reason: 'Credentials are stored, not commissioned. No provider or billing readiness is implied.' }))
}
export async function findOfficeMessagingAccount(provider: string, accountId: string) {
  const rows = await db.select().from(connections).where(and(eq(connections.kind, 'messaging'),
    eq(connections.provider, provider), eq(connections.accountId, accountId))).limit(2)
  // Ambiguous account ownership is not silently assigned to the first office.
  return rows.length === 1 ? rows[0] : null
}
export async function storeConnection(ownerId: string, input: { kind: string; provider: string; accountId: string; credential: string }) {
  if (!input || !['messaging','ai'].includes(input.kind)
    || !(input.kind === 'ai' ? input.provider === 'openai' : ['ghl','independent'].includes(input.provider))
    || typeof input.accountId !== 'string' || !/^[a-zA-Z0-9_-]{2,100}$/.test(input.accountId)
    || typeof input.credential !== 'string' || input.credential.length < 16 || input.credential.length > 4096) throw new Error('Provide valid office-owned connection details.')
  const encrypted = sealCredential(ownerId, input.kind, input.credential.trim())
  await db.insert(connections).values({ id: randomUUID(), ownerId, kind: input.kind, provider: input.provider, accountId: input.accountId, encrypted })
    .onConflictDoUpdate({ target: [connections.ownerId, connections.kind], set: {
      provider: input.provider, accountId: input.accountId, encrypted, updatedAt: new Date(),
    } })
}
export async function revokeConnection(ownerId: string, kind: string) {
  if (!['messaging','ai'].includes(kind)) throw new Error('Invalid connection kind.')
  await db.delete(connections).where(and(eq(connections.ownerId, ownerId), eq(connections.kind, kind)))
}
