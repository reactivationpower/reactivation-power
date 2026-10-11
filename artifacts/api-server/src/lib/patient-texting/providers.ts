import { verify } from 'node:crypto'
import twilio from 'twilio'

/** No environment flag can enable production messaging in this release. */
export const LIVE_PATIENT_TEXTING = false
const ghlKey = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=\n-----END PUBLIC KEY-----'
export function validGhlSignature(rawBody: Buffer, signature: string) {
  try { return verify(null, rawBody, ghlKey, Buffer.from(signature, 'base64')) } catch { return false }
}
export function validIndependentSignature(token: string, signature: string, configuredExternalUrl: string, params: Record<string, string>) {
  if (!configuredExternalUrl.startsWith('https://')) return false
  return twilio.validateRequest(token, signature, configuredExternalUrl, params)
}
export interface ProviderMessage { accountId: string; credential: string; recipient: string; body: string; sender?: string; contactId?: string }
function requireLive() {
  if (!LIVE_PATIENT_TEXTING) throw new Error('Live patient messaging is disabled pending provider commissioning and compliance review.')
}
/** Direct office account credentials only. Never internal sales or parent-account credentials. */
export async function sendIndependentOfficeMessage(input: ProviderMessage) {
  requireLive()
  if (!input.sender || !/^AC[a-f0-9]{32}$/i.test(input.accountId)) throw new Error('Verified office account and SMS-capable sender required.')
  // A timeout/unknown result must be reconciled before retrying. Twilio create is not idempotent.
  const client = twilio(input.accountId, input.credential, { autoRetry: false, timeout: 15000 })
  const result = await client.messages.create({ from: input.sender, to: input.recipient, body: input.body })
  return { providerId: result.sid, status: result.status }
}
export async function sendOfficeGhlMessage(input: ProviderMessage) {
  requireLive()
  if (!input.contactId) throw new Error('Verified office contact mapping required.')
  const response = await fetch('https://services.leadconnectorhq.com/conversations/messages', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${input.credential}`, Version: '2021-07-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'SMS', contactId: input.contactId, message: input.body }),
  })
  // No automatic retry, no provider error payloads containing patient/credential data.
  if (!response.ok) throw new Error('Provider result requires reconciliation; no automatic retry.')
  const data = await response.json() as { messageId?: string }
  if (!data.messageId) throw new Error('Unknown provider result requires reconciliation.')
  return { providerId: data.messageId, status: 'submitted' }
}
export function simulationTransport(body: string) {
  return { delivery: 'simulated' as const, body, externalRequestMade: false }
}
