import { createHmac } from 'node:crypto'
import express from 'express'
import type { Server } from 'node:http'
import type { EmailLog } from '@workspace/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ rows: [] as EmailLog[], writes: 0, transactions: 0 }))
const incoming = vi.hoisted(() => ({ accept: vi.fn(async () => {}) }))
vi.mock('@/lib/sales-inbox/inbound', () => ({ acceptReceivedEmail: incoming.accept }))
vi.mock('drizzle-orm', () => ({ eq: (column: string, value: string) => ({ column, value }) }))
vi.mock('@workspace/db', () => ({
  emailLogTable: { id: 'id', providerId: 'providerId' },
  db: { transaction: async (run: (tx: unknown) => unknown) => {
    store.transactions++
    return run({
      select: () => ({ from: () => ({ where: (filter: { column: keyof EmailLog; value: string }) => ({
        for: async () => store.rows.filter(r => r[filter.column] === filter.value),
      }) }) }),
      update: () => ({ set: (patch: Partial<EmailLog>) => ({
        where: async (filter: { column: keyof EmailLog; value: string }) => {
          for (const row of store.rows.filter(r => r[filter.column] === filter.value)) {
            Object.assign(row, patch)
            store.writes++
          }
        },
      }) }),
    })
  } },
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
const { default: router, verifySvixSignature, eventPatch, deliveryPatch } = await import('@/routes/webhooks-resend')

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
      .toMatchObject({ clickedAt: new Date(at), lastClickedUrl: null })
    expect(eventPatch({ type: 'email.bounced', created_at: at, data: { bounce: { message: 'code 092814 reset?token=secret' } } }))
      .toMatchObject({ status: 'bounced', error: 'The recipient mailbox rejected this email.' })
    expect(eventPatch({ type: 'email.suppressed', created_at: at }))
      .toMatchObject({ status: 'suppressed', error: expect.stringContaining('suppressed') })
    expect(eventPatch({ type: 'email.sent', created_at: at })?.status).toBeUndefined()
    expect(eventPatch({ type: 'contact.created', created_at: at })).toBeNull()
    expect(eventPatch({ type: 'email.future_event', created_at: at })).toBeNull()
    expect(eventPatch({ type: 'email.bounced', created_at: 'invalid' })).toBeNull()
  })
})

function logRow(): EmailLog {
  return {
    id: 'log-1', type: 'portal_login_code', recipient: 'registered@example.test',
    subject: 'Your Patient Pipeline sign-in code', status: 'sent', providerId: 're_1',
    error: null, metadata: null, createdAt: new Date(), deliveredAt: null,
    openedAt: null, clickedAt: null, lastClickedUrl: null, lastEvent: null, lastEventAt: null,
  }
}

describe('delivery event ordering and privacy', () => {
  it('does not discard distinct events with the same provider timestamp', () => {
    const row = logRow()
    const at = '2026-10-01T10:00:00Z'
    Object.assign(row, deliveryPatch(row, { type: 'email.opened', created_at: at }))
    Object.assign(row, deliveryPatch(row, { type: 'email.delivered', created_at: at }))
    expect(row.status).toBe('delivered')
    expect(row.deliveredAt).toEqual(new Date(at))
  })
  it('keeps a failure when a later delivered/opened event arrives', () => {
    const row = logRow()
    Object.assign(row, deliveryPatch(row, { type: 'email.suppressed', created_at: '2026-10-01T10:00:00Z' }))
    Object.assign(row, deliveryPatch(row, { type: 'email.delivered', created_at: '2026-10-01T10:01:00Z' }))
    Object.assign(row, deliveryPatch(row, { type: 'email.opened', created_at: '2026-10-01T10:02:00Z' }))
    expect(row.status).toBe('suppressed')
    expect(row.error).toContain('suppressed')
  })
  it('records an older bounce even after an open event, without moving the clock back', () => {
    const row = logRow()
    Object.assign(row, deliveryPatch(row, { type: 'email.opened', created_at: '2026-10-01T10:02:00Z' }))
    const bounce = { type: 'email.bounced', created_at: '2026-10-01T10:01:00Z' }
    Object.assign(row, deliveryPatch(row, bounce))
    expect(row.status).toBe('bounced')
    expect(row.lastEventAt).toEqual(new Date('2026-10-01T10:02:00Z'))
    expect(deliveryPatch(row, bounce)).toBeNull()
  })
  it('discards tracked reset-link secrets and clears legacy links', () => {
    const row = logRow()
    row.lastClickedUrl = 'https://example.test/secret-token'
    const patch = deliveryPatch(row, {
      type: 'email.clicked', created_at: '2026-10-01T10:00:00Z',
      data: { click: { link: 'https://example.test/login?setup=secret-token' } },
    })
    expect(patch?.lastClickedUrl).toBeNull()
    expect(JSON.stringify(patch)).not.toContain('secret-token')
  })
})

describe('verified delivery webhook HTTP boundary', () => {
  let server: Server
  let url: string
  beforeEach(async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', secret)
    store.rows = [logRow()]
    store.writes = 0
    store.transactions = 0
    const app = express()
    app.use(express.json({ verify: (req, _res, raw) => { (req as express.Request & { rawBody: Buffer }).rawBody = raw } }))
    app.use(router)
    server = app.listen(0, '127.0.0.1')
    await new Promise<void>(resolve => server.once('listening', resolve))
    const address = server.address() as { port: number }
    url = `http://127.0.0.1:${address.port}/webhooks/resend`
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))
  })
  async function post(event: unknown, signatureOverride?: string) {
    const raw = Buffer.from(JSON.stringify(event))
    const ts = Math.floor(Date.now() / 1000)
    return fetch(url, { method: 'POST', body: raw, headers: {
      'content-type': 'application/json', 'svix-id': 'msg_delivery',
      'svix-timestamp': String(ts), 'svix-signature': signatureOverride ?? sign('msg_delivery', ts, raw),
    } })
  }
  const failure = { type: 'email.suppressed', created_at: '2026-10-01T10:00:00Z', data: { email_id: 're_1' } }
  it('accepts incoming email only after signature verification, without treating it as an outbound delivery', async () => {
    incoming.accept.mockClear()
    const event = { type: 'email.received', created_at: '2026-10-01T10:00:00Z', data: { email_id: 'incoming-fixture' } }
    expect((await post(event, 'v1,AAAA')).status).toBe(401)
    expect(incoming.accept).not.toHaveBeenCalled()
    expect((await post(event)).status).toBe(200)
    expect(incoming.accept).toHaveBeenCalledWith('incoming-fixture')
    expect(store.transactions).toBe(0)
  })
  it('correlates a valid failed-code event and makes retries no-ops', async () => {
    expect((await post(failure)).status).toBe(200)
    expect((await post(failure)).status).toBe(200)
    expect(store.writes).toBe(1)
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0]).toMatchObject({ type: 'portal_login_code', status: 'suppressed', recipient: 'registered@example.test' })
  })
  it('rejects forged signatures without touching the log', async () => {
    expect((await post(failure, 'v1,AAAA')).status).toBe(401)
    expect(store.transactions).toBe(0)
    expect(store.writes).toBe(0)
  })
  it('fails closed without a signing secret', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '')
    expect((await post(failure)).status).toBe(503)
    expect(store.transactions).toBe(0)
  })
  it('asks Resend to retry when the accepted-send log has not been written yet', async () => {
    store.rows = []
    expect((await post(failure)).status).toBe(503)
    store.rows = [logRow()]
    expect((await post(failure)).status).toBe(200)
    expect(store.rows[0]?.status).toBe('suppressed')
  })
  it('rejects malformed signed events and ignores unsupported ones', async () => {
    expect((await post(null)).status).toBe(400)
    expect((await post({ ...failure, created_at: 'invalid' })).status).toBe(400)
    expect((await post({ ...failure, type: 'email.future_event' })).status).toBe(202)
    expect(store.writes).toBe(0)
  })
})
