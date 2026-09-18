import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@workspace/db', () => ({ db: {}, emailLogTable: {} }))
const { verifySvixSignature, eventPatch } = await import('@/routes/webhooks-resend')

const secret = 'whsec_' + Buffer.from('super-secret-key').toString('base64')
const body = Buffer.from(JSON.stringify({ type: 'email.delivered', data: { email_id: 're_1' } }))
const now = 1_760_000_000
const sign = (id: string, ts: number, raw: Buffer, key = secret) =>
  'v1,' +
  createHmac('sha256', Buffer.from(key.replace(/^whsec_/, ''), 'base64'))
    .update(`${id}.${ts}.`)
    .update(raw)
    .digest('base64')

describe('verifySvixSignature', () => {
  it('accepts a correctly signed payload', () => {
    const signature = sign('msg_1', now, body)
    expect(verifySvixSignature(secret, { id: 'msg_1', timestamp: String(now), signature }, body, now)).toBe(true)
  })
  it('accepts when one of several signatures matches', () => {
    const signature = `v1,AAAA ${sign('msg_1', now, body)}`
    expect(verifySvixSignature(secret, { id: 'msg_1', timestamp: String(now), signature }, body, now)).toBe(true)
  })
  it('rejects a tampered body, wrong key, or stale timestamp', () => {
    const signature = sign('msg_1', now, body)
    const tampered = Buffer.from(body.toString().replace('delivered', 'bounced'))
    expect(verifySvixSignature(secret, { id: 'msg_1', timestamp: String(now), signature }, tampered, now)).toBe(false)
    const other = sign('msg_1', now, body, 'whsec_' + Buffer.from('other').toString('base64'))
    expect(verifySvixSignature(secret, { id: 'msg_1', timestamp: String(now), signature: other }, body, now)).toBe(false)
    expect(verifySvixSignature(secret, { id: 'msg_1', timestamp: String(now), signature }, body, now + 600)).toBe(false)
    expect(verifySvixSignature(secret, { id: 'msg_1', timestamp: String(now) }, body, now)).toBe(false)
  })
})

describe('eventPatch', () => {
  it('maps delivery, open, click and bounce events onto the log row', () => {
    const at = '2026-09-18T12:00:00.000Z'
    expect(eventPatch({ type: 'email.delivered', created_at: at })).toMatchObject({ status: 'delivered', deliveredAt: new Date(at) })
    expect(eventPatch({ type: 'email.opened', created_at: at })).toMatchObject({ openedAt: new Date(at) })
    expect(eventPatch({ type: 'email.clicked', created_at: at, data: { click: { link: 'https://x.test/a' } } }))
      .toMatchObject({ clickedAt: new Date(at), lastClickedUrl: 'https://x.test/a' })
    expect(eventPatch({ type: 'email.bounced', data: { bounce: { message: 'mailbox full' } } }))
      .toMatchObject({ status: 'bounced', error: 'mailbox full' })
    expect(eventPatch({ type: 'email.sent' })?.status).toBeUndefined()
    expect(eventPatch({ type: 'contact.created' })).toBeNull()
  })
})
