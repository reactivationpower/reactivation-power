import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { phoneOwnedByOtherContact, safeSalesUpsert } from './provider'

const other = { id: 'other', email: 'owner@example.invalid', phone: '+1 (212) 555-0199' }
let calls: { url: string; method: string; body?: any }[] = []
function fakeProvider(contactsFor: (query: string) => any[], fresh: Record<string, any> = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    const u = new URL(url)
    calls.push({ url: u.pathname, method: init.method, body: init.body ? JSON.parse(init.body) : undefined })
    const json = u.pathname === '/contacts/' && init.method === 'GET' ? { contacts: contactsFor(u.searchParams.get('query') ?? ''), meta: { total: 1 } }
      : init.method === 'GET' ? { contact: fresh[u.pathname.split('/')[2]] ?? null }
      : { contact: { id: 'created' } }
    return new Response(JSON.stringify(json), { status: 200 })
  }))
}

describe('shared phone in GoHighLevel', () => {
  beforeEach(() => { calls = []; vi.stubEnv('GHL_API_TOKEN', 'test'); vi.stubEnv('GHL_LOCATION_ID', 'loc') })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('detects a phone that belongs to another contact with a different email', async () => {
    fakeProvider(q => q.includes('555') ? [other] : [])
    expect(await phoneOwnedByOtherContact('+12125550199', 'visitor@example.invalid')).toBe(true)
    expect(await phoneOwnedByOtherContact('+12125550199', 'owner@example.invalid')).toBe(false)
    expect(await phoneOwnedByOtherContact('+12125550199', 'visitor@example.invalid', 'other')).toBe(false)
  })

  it('does not treat an email-less phone contact as someone else', async () => {
    fakeProvider(() => [{ ...other, email: '' }])
    expect(await phoneOwnedByOtherContact('+12125550199', 'visitor@example.invalid')).toBe(false)
  })

  it('creates an email-only contact when the phone is omitted', async () => {
    fakeProvider(q => q.includes('555') ? [other] : [])
    const id = await safeSalesUpsert({ firstName: 'A', lastName: 'B', email: 'visitor@example.invalid', phone: '' })
    expect(id).toBe('created')
    expect(calls.filter(c => c.method === 'GET')).toHaveLength(1)
    expect(calls.some(c => c.url === '/contacts/upsert')).toBe(false)
    const create = calls.find(c => c.url === '/contacts/' && c.method === 'POST')!
    expect(create.body.email).toBe('visitor@example.invalid')
    expect(create.body).not.toHaveProperty('phone')
  })

  it('ignores a stale search hit whose current email no longer matches, and creates a new contact', async () => {
    fakeProvider(() => [{ ...other, email: 'visitor@example.invalid' }], { other })
    const id = await safeSalesUpsert({ firstName: 'A', lastName: 'B', email: 'visitor@example.invalid', phone: '' })
    expect(id).toBe('created')
    expect(calls.some(c => c.method === 'PUT')).toBe(false)
  })

  it('a stale hit on another lead\'s contact does not block creating a new one', async () => {
    fakeProvider(() => [{ ...other, email: 'visitor@example.invalid' }], { other })
    expect(await safeSalesUpsert({ firstName: 'A', lastName: 'B', email: 'visitor@example.invalid', phone: '' }, ['other'])).toBe('created')
  })

  it('never writes to a contact that belongs to another lead', async () => {
    fakeProvider(() => [{ ...other, email: 'visitor@example.invalid' }], { other: { ...other, email: 'visitor@example.invalid' } })
    await expect(safeSalesUpsert({ firstName: 'A', lastName: 'B', email: 'visitor@example.invalid', phone: '' }, ['other'])).rejects.toThrow('belongs to another lead')
    expect(calls.some(c => c.method !== 'GET')).toBe(false)
  })
})
