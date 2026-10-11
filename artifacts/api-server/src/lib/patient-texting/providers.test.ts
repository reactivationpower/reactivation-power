import { describe, expect, it, vi } from 'vitest'
import twilio from 'twilio'
import { sealCredential, unsealCredential } from './connections'
import { simulationTransport, validGhlSignature, validIndependentSignature, sendIndependentOfficeMessage, sendOfficeGhlMessage } from './providers'

describe('provider boundaries (no provider requests)', () => {
  it('cannot send through either provider even with credentials supplied', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const input = { accountId: 'fictional', credential: 'fixture', recipient: '+15555550100', body: 'fixture' }
    await expect(sendIndependentOfficeMessage(input)).rejects.toThrow(/disabled/)
    await expect(sendOfficeGhlMessage(input)).rejects.toThrow(/disabled/)
    expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore()
    expect(simulationTransport('Hello').externalRequestMade).toBe(false)
  })
  it('validates independent signatures against exact configured URL and all parameters', () => {
    const token = 'synthetic-fixture-token', url = 'https://example.test/callback'
    const params = { AccountSid: 'ACfixture', Body: 'STOP', MessageSid: 'SMfixture' }
    const signature = twilio.getExpectedTwilioSignature(token, url, params)
    expect(validIndependentSignature(token, signature, url, params)).toBe(true)
    expect(validIndependentSignature(token, signature, `${url}?changed=1`, params)).toBe(false)
    expect(validIndependentSignature(token, signature, url, { ...params, Body: 'changed' })).toBe(false)
    expect(validIndependentSignature(token, signature, url.replace('https','http'), params)).toBe(false)
    expect(validGhlSignature(Buffer.from('{}'), 'forged')).toBe(false)
  })
  it('encrypts credentials with tenant/kind-bound authenticated encryption', () => {
    vi.stubEnv('SESSION_SECRET', 'fictional-encryption-key-for-this-test-only')
    try {
      const credential = 'synthetic-token-not-an-actual-secret'
      const sealed = sealCredential('office-a', 'messaging', credential)
      expect(sealed).not.toContain(credential)
      expect(unsealCredential('office-a', 'messaging', sealed)).toBe(credential)
      expect(() => unsealCredential('office-b', 'messaging', sealed)).toThrow()
      expect(() => unsealCredential('office-a', 'ai', sealed)).toThrow()
      expect(sealCredential('office-a', 'messaging', credential)).not.toBe(sealed)
    } finally { vi.unstubAllEnvs() }
  })
})
