import type express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GHL_SAMPLE_PAYLOAD } from '@workspace/shared/lead-webhooks'

/**
 * Behaviour of POST /api/webhooks/leads/:token through the REAL app (parser
 * order, log redaction and error handling included): token lookup, body
 * formats, mapping failures, dedupe-as-update, size limit, rate limiting.
 * The store is an in-memory stand-in shaped like the real one.
 */

interface Campaign { id: string; ownerId: string; status: string; webhookToken: string; fieldMapping: Record<string, string> }
const campaigns: Campaign[] = [
  { id: 'camp_1', ownerId: 'owner_1', status: 'active', webhookToken: 'tok_active', fieldMapping: {} },
  { id: 'camp_2', ownerId: 'owner_1', status: 'archived', webhookToken: 'tok_archived', fieldMapping: {} },
  { id: 'camp_3', ownerId: 'owner_1', status: 'paused', webhookToken: 'tok_mapped', fieldMapping: { phone: 'Cell Number', firstName: 'patient' } },
]
const leads = new Map<string, { id: string; phoneKey: string; submittedAt: Date; source: string; requestedTime: string | null }>()
const events: Array<{ campaignId: string; source: string; outcome: string; error: string | null; payload: unknown; contentType: string | null }> = []
let failStore = false

vi.mock('@/lib/lead-followup/store', () => ({
  findCampaignByWebhookToken: async (token: string) => campaigns.find((c) => c.webhookToken === token) ?? null,
  upsertWebhookLead: async (opts: { campaign: Campaign; lead: { requestedTime: string }; phoneKey: string; source: string }) => {
    if (failStore) throw new Error('db down')
    const key = `${opts.campaign.id}:${opts.phoneKey}`
    const existing = leads.get(key)
    if (existing) {
      existing.submittedAt = new Date()
      existing.requestedTime = existing.requestedTime ?? (opts.lead.requestedTime || null)
      return { outcome: 'updated', leadId: existing.id }
    }
    const id = `lead_${leads.size + 1}`
    leads.set(key, { id, phoneKey: opts.phoneKey, submittedAt: new Date(), source: opts.source, requestedTime: opts.lead.requestedTime || null })
    return { outcome: 'created', leadId: id }
  },
  recordWebhookEvent: async (input: { campaign: Campaign; source: string; outcome: string; error?: string | null; payload: unknown; contentType: string | null }) => {
    events.push({ campaignId: input.campaign.id, source: input.source, outcome: input.outcome, error: input.error ?? null, payload: input.payload, contentType: input.contentType })
    return {}
  },
}))

const logLines: string[] = []
vi.mock('@/lib/logger', async () => {
  const { pino } = await import('pino')
  const logger = pino({ level: 'info' }, { write: (line: string) => void logLines.push(line) })
  return { logger }
})

const { default: app } = await import('@/app')
const { TEST_HEADER, LEAD_WEBHOOK_BODY_LIMIT_BYTES } = await import('@/routes/webhooks-leads')
const { webhookRateLimiter, WEBHOOK_RATE_LIMIT } = await import('@/lib/lead-followup/rate-limit')

let baseUrl = ''
let server: ReturnType<express.Express['listen']>
beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  const address = server.address()
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})
afterAll(() => server?.close())
beforeEach(() => {
  webhookRateLimiter.reset()
  failStore = false
})

async function post(token: string, body: string, contentType: string | null = 'application/json', headers: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}/api/webhooks/leads/${token}`, {
    method: 'POST',
    headers: { ...(contentType ? { 'content-type': contentType } : {}), ...headers },
    body,
  })
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, unknown> }
}

describe('POST /api/webhooks/leads/:token', () => {
  it('creates a lead from a JSON body and stores the raw payload', async () => {
    const res = await post('tok_active', JSON.stringify({ first_name: 'Ana', last_name: 'Ruiz', phone: '(303) 555-0100', email: 'ana@example.com' }))
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ received: true, outcome: 'created', source: 'webhook' })
    const event = events.at(-1)!
    expect(event).toMatchObject({ campaignId: 'camp_1', source: 'webhook', outcome: 'created', contentType: 'application/json' })
    expect(event.payload).toMatchObject({ first_name: 'Ana' })
  })

  it('accepts form-encoded bodies', async () => {
    const res = await post('tok_active', new URLSearchParams({ firstName: 'Ben', lastName: 'Cho', phone: '303-555-0101' }).toString(), 'application/x-www-form-urlencoded')
    expect(res.status).toBe(201)
    expect(events.at(-1)?.contentType).toBe('application/x-www-form-urlencoded')
  })

  it('accepts JSON sent as text/plain or with no content type', async () => {
    const asText = await post('tok_active', JSON.stringify({ first_name: 'Cara', phone: '3035550102' }), 'text/plain')
    expect(asText.status).toBe(201)
    const noType = await post('tok_active', JSON.stringify({ first_name: 'Dev', phone: '3035550103' }), null)
    expect(noType.status).toBe(201)
  })

  it('maps a GoHighLevel workflow payload and tags the source', async () => {
    const res = await post('tok_active', JSON.stringify(GHL_SAMPLE_PAYLOAD))
    expect(res.status).toBe(201)
    expect(res.body.source).toBe('gohighlevel')
    expect(events.at(-1)?.source).toBe('gohighlevel')
    expect([...leads.values()].find((l) => l.phoneKey === '3035550142')?.source).toBe('gohighlevel')
  })

  it('a repeat submission for the same phone updates the lead instead of creating another', async () => {
    const before = leads.size
    const first = await post('tok_active', JSON.stringify({ first_name: 'Eve', phone: '+1 720 555 0104' }))
    expect(first.status).toBe(201)
    const again = await post('tok_active', JSON.stringify({ first_name: 'Eve', phone: '7205550104', requested_time: 'Friday 9am' }))
    expect(again.status).toBe(200)
    expect(again.body).toMatchObject({ outcome: 'updated', leadId: first.body.leadId })
    expect(leads.size).toBe(before + 1)
    expect(events.at(-1)?.outcome).toBe('updated')
  })

  it('rejects an unknown token with 404 and records nothing', async () => {
    const count = events.length
    const res = await post('tok_nope', JSON.stringify({ first_name: 'X', phone: '3035550105' }))
    expect(res.status).toBe(404)
    expect(String(res.body.error)).toMatch(/Unknown webhook URL/)
    expect(events.length).toBe(count)
  })

  it('answers GET with 405 so a browser check is not mistaken for a broken URL', async () => {
    const res = await fetch(`${baseUrl}/api/webhooks/leads/tok_active`)
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })

  it('refuses an archived campaign with 410', async () => {
    const res = await post('tok_archived', JSON.stringify({ first_name: 'X', phone: '3035550106' }))
    expect(res.status).toBe(410)
  })

  it('a payload that cannot be mapped is stored as rejected with the reason and answers 422', async () => {
    const res = await post('tok_active', JSON.stringify({ zip: '80202', interest: 'back pain' }))
    expect(res.status).toBe(422)
    expect(String(res.body.error)).toMatch(/first name or a phone number/)
    const event = events.at(-1)!
    expect(event.outcome).toBe('rejected')
    expect(event.error).toBe(res.body.error)
    expect(event.payload).toEqual({ zip: '80202', interest: 'back pain' })
  })

  it('malformed bodies get a 400 and the raw text is kept for the owner', async () => {
    const garbage = await post('tok_active', 'this is not json', 'text/plain')
    expect(garbage.status).toBe(400)
    expect(events.at(-1)).toMatchObject({ outcome: 'rejected', payload: { _raw: 'this is not json' } })

    const list = await post('tok_active', JSON.stringify([{ phone: '3035550107' }]))
    expect(list.status).toBe(400)

    const empty = await post('tok_active', '', 'application/json')
    expect(empty.status).toBe(400)

    // Broken JSON with a JSON content type is still attributed to the campaign.
    const broken = await post('tok_active', '{"first_name": ', 'application/json')
    expect(broken.status).toBe(400)
    expect(events.at(-1)).toMatchObject({ campaignId: 'camp_1', outcome: 'rejected', payload: { _raw: '{"first_name":' } })
    expect(String(events.at(-1)?.error)).toMatch(/could not be read/)
  })

  it('a body over the webhook limit is rejected with 413 and logged for the owner', async () => {
    const big = JSON.stringify({ first_name: 'Big', phone: '3035550112', blob: 'x'.repeat(LEAD_WEBHOOK_BODY_LIMIT_BYTES) })
    const res = await post('tok_active', big)
    expect(res.status).toBe(413)
    expect(String(res.body.error)).toMatch(/larger than 256 KB/)
    expect(events.at(-1)).toMatchObject({ campaignId: 'camp_1', outcome: 'rejected', payload: {} })
    // ...but the same body to an unknown token is a plain 404.
    const unknown = await post('tok_nope', big)
    expect(unknown.status).toBe(404)
  })

  it('never writes the token to the request log', async () => {
    logLines.length = 0
    await post('tok_active', JSON.stringify({ first_name: 'Log', phone: '3035550113' }))
    await post('tok_active', '{"broken": ', 'application/json')
    expect(logLines.length).toBeGreaterThan(0)
    for (const line of logLines) expect(line).not.toContain('tok_active')
    expect(logLines.some((l) => l.includes('/api/webhooks/leads/[redacted]'))).toBe(true)
  })

  it('uses the campaign field mapping and accepts leads for a paused campaign', async () => {
    const wrongKeys = await post('tok_mapped', JSON.stringify({ first_name: 'Ana', phone: '3035550108' }))
    expect(wrongKeys.status).toBe(422)
    const rightKeys = await post('tok_mapped', JSON.stringify({ patient: 'Ana', 'Cell Number': '3035550108' }))
    expect(rightKeys.status).toBe(201)
  })

  it('marks "Send a test" posts as test events', async () => {
    const res = await post('tok_active', JSON.stringify({ first_name: 'Test', last_name: 'Lead', phone: '(555) 010-0100' }), 'application/json', { [TEST_HEADER]: '1' })
    expect(res.status).toBe(201)
    expect(events.at(-1)?.source).toBe('test')
  })

  it('rate-limits per campaign and leaves other campaigns alone', async () => {
    for (let i = 0; i < WEBHOOK_RATE_LIMIT; i++) webhookRateLimiter.check('camp_1')
    const limited = await post('tok_active', JSON.stringify({ first_name: 'Z', phone: '3035550109' }))
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    const other = await post('tok_mapped', JSON.stringify({ patient: 'Z', 'Cell Number': '3035550110' }))
    expect(other.status).toBe(201)
  })

  it('answers 500 and records the failure when the lead cannot be saved', async () => {
    failStore = true
    const res = await post('tok_active', JSON.stringify({ first_name: 'Q', phone: '3035550111' }))
    expect(res.status).toBe(500)
    expect(events.at(-1)).toMatchObject({ outcome: 'rejected', error: expect.stringMatching(/could not be saved/) })
  })
})
