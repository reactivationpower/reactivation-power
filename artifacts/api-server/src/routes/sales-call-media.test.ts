import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
vi.mock('@workspace/db', () => ({ pool: { query: vi.fn() } }))
vi.mock('@/lib/auth/admin-session', () => ({ getAdminSessionFromRequest: vi.fn() }))
import { createCallMediaRouter, audioRange } from './sales-call-media'
import { CallMediaProvider, MAX_AUDIO_BYTES } from '@/lib/sales-call-media/provider'

let server: Server
let origin: string
let admin: any
let owner: string | null
let message: any
let contact: any
let audioStatus: number
let transcriptStatus: number
let transcriptData: unknown
let redirect: boolean
let upstream: ReturnType<typeof vi.fn>
let query: ReturnType<typeof vi.fn<(sql: string, values: unknown[]) => Promise<any>>>
const audio = Buffer.from('RIFFsynthetic-audio-only')
const path = '/api/sales/leads/lead/calls/activity/'
beforeEach(async () => {
  vi.stubEnv('GHL_LOCATION_ID', 'location')
  vi.stubEnv('GHL_API_TOKEN', 'synthetic-secret')
  admin = { userId: 'staff', role: 'admin' }
  owner = 'staff'
  message = { id: 'message', contactId: 'contact', locationId: 'location', messageType: 'TYPE_CALL',
    direction: 'outbound', dateAdded: '2026-01-01T00:00:00Z', meta: { callDuration: 12, callStatus: 'completed' },
    attachments: ['https://evil.example/secret?token=hidden'] }
  contact = { id: 'contact', locationId: 'location' }
  audioStatus = 200; transcriptStatus = 200; redirect = false
  transcriptData = [{ transcript: 'Hello https://example.test/?signature=secret', startTime: 0, endTime: 1000, mediaChannel: 1 }]
  upstream = vi.fn(async (url: string, init: RequestInit) => {
    expect(url.startsWith('https://services.leadconnectorhq.com/')).toBe(true)
    expect(init.redirect).toBe('manual')
    if (url.endsWith('/recording')) {
      if (redirect) return new Response(null, { status: 302, headers: { Location: 'https://evil.example/?secret=1' } })
      return new Response(audioStatus === 200 ? audio : 'private provider error', { status: audioStatus, headers: { 'Content-Type': 'audio/x-wav' } })
    }
    if (url.endsWith('/transcription')) return new Response(JSON.stringify(transcriptData), { status: transcriptStatus })
    return Response.json(url.includes('/contacts/') ? { contact } : { message })
  })
  query = vi.fn(async (sql: string, values: unknown[]) => {
    expect(sql).toContain("a.kind='provider_call'")
    expect(sql).toContain('l.assignee_id IS NOT NULL')
    expect(sql).toContain('($3 OR l.assignee_id=$4)')
    const allowed = values[0] === 'lead' && values[1] === 'activity' && owner && (values[2] || values[3] === owner)
    return { rows: allowed ? [{ ghl_contact_id: 'contact', provider_id: 'message' }] : [] } as any
  })
  const app = express()
  app.use('/api', createCallMediaRouter({ session: async () => admin, query, provider: new CallMediaProvider(upstream as any) }))
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  const addr = server.address() as { port: number }
  origin = `http://127.0.0.1:${addr.port}`
})
afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  vi.unstubAllEnvs()
})
const get = (resource: string, init?: RequestInit) => fetch(origin + path + resource, init)

describe('authenticated call media', () => {
  it('returns allowlisted metadata and only local media URLs', async () => {
    const r = await get('details'), j = await r.json()
    expect(r.status).toBe(200)
    expect(j).toMatchObject({ direction: 'outbound', durationSeconds: 12, outcome: 'completed',
      recording: { state: 'not_checked', playbackUrl: path + 'recording' }, ghlLink: { level: 'contact' } })
    expect(JSON.stringify(j)).not.toMatch(/secret|attachments|token|evil/)
    expect(r.headers.get('cache-control')).toBe('private, no-store')
  })
  it.each(['details','recording','transcript'])('rejects expired/missing sessions for %s before DB/provider reads', async resource => {
    admin = null
    expect((await get(resource)).status).toBe(401)
    expect(query).not.toHaveBeenCalled(); expect(upstream).not.toHaveBeenCalled()
  })
  it.each(['details','recording','transcript'])('rejects cross-lead requests for %s', async resource => {
    expect((await fetch(origin + path.replace('/lead/', '/other/') + resource)).status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })
  it('denies other staff and unowned leads even to super admins', async () => {
    owner = 'other'
    expect((await get('recording')).status).toBe(404)
    admin.role = 'super_admin'
    expect((await get('details')).status).toBe(200)
    owner = null
    expect((await get('recording')).status).toBe(404)
  })
  it.each(['id','contactId','locationId','messageType'])('rejects mismatched message %s without media reads or metadata', async key => {
    message[key] = 'wrong'
    const r = await get('recording')
    expect(r.status).toBe(404)
    expect(await r.json()).toEqual({ state: 'not_found', explanation: 'Call not available.' })
    expect(upstream).toHaveBeenCalledTimes(2)
  })
  it('requires independent contact/location verification', async () => {
    delete contact.locationId
    expect((await get('transcript')).status).toBe(404)
    expect(upstream).toHaveBeenCalledTimes(1)
  })
  it.each([[404,'missing'],[403,'permission_unavailable'],[401,'permission_unavailable'],[410,'expired'],[500,'provider_failure'],[422,'unavailable'],[400,'unavailable']])('maps recording status %s without raw errors', async (status, state) => {
    audioStatus = Number(status)
    const r = await get('recording'), j = await r.json() as { state: string }
    expect(j.state).toBe(state); expect(JSON.stringify(j)).not.toContain('private provider error')
  })
  it.each([404,403,410,500,400])('handles transcript failure %s', async status => {
    transcriptStatus = status
    expect((await get('transcript')).status).not.toBe(200)
  })
  it('returns plain transcript segments without provider links', async () => {
    const j = await (await get('transcript')).json()
    expect(j).toEqual({ state: 'available', segments: [{ text: 'Hello [link omitted]', startMs: 0, endMs: 1000, channel: 1 }] })
  })
  it('distinguishes absent and unrecognized transcript payloads', async () => {
    transcriptData = []
    expect(await (await get('transcript')).json()).toMatchObject({ state: 'missing' })
    transcriptData = { url: 'https://evil.example' }
    expect(await (await get('transcript')).json()).toMatchObject({ state: 'provider_failure' })
  })
  it('denies redirects without forwarding credentials or Location', async () => {
    redirect = true
    const r = await get('recording')
    expect(r.status).toBe(502); expect(r.headers.has('location')).toBe(false)
    expect(upstream).toHaveBeenCalledTimes(3)
    expect(await r.text()).not.toContain('evil')
  })
  it('never accepts a client media URL or provider identifier', async () => {
    expect((await get('recording?url=https://evil.example')).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })
  it.each(['bytes=0-1','bytes=4-','bytes=-4','bytes=0-999'])('serves accurate synthetic bytes for %s even without upstream range support', async range => {
    const r = await get('recording', { headers: { Range: range } })
    const slice = audioRange(range, audio.length)!
    expect(r.status).toBe(206)
    expect(r.headers.get('content-range')).toBe(`bytes ${slice.start}-${slice.end}/${audio.length}`)
    expect(Buffer.from(await r.arrayBuffer())).toEqual(audio.subarray(slice.start, slice.end + 1))
  })
  it('serves full bytes and HEAD and respects If-Range fallback', async () => {
    const r = await get('recording')
    expect(r.status).toBe(200); expect(Buffer.from(await r.arrayBuffer())).toEqual(audio)
    const head = await get('recording', { method: 'HEAD' })
    expect(head.headers.get('content-length')).toBe(String(audio.length)); expect(await head.text()).toBe('')
    expect((await get('recording', { headers: { Range: 'bytes=0-1', 'If-Range': '"old"' } })).status).toBe(200)
  })
  it.each(['bytes=99-100','bytes=5-1','bytes=0-1,3-4','bytes=-0','bytes=-','bad'])('rejects malformed/unsatisfiable range %s', async range => {
    const r = await get('recording', { headers: { Range: range } })
    expect(r.status).toBe(416); expect(r.headers.get('content-range')).toBe(`bytes */${audio.length}`)
  })
  it('caps response bytes and does not echo upstream exceptions', async () => {
    upstream.mockImplementation(async () => { throw new Error('secret-token private-url') })
    expect(await (await get('details')).text()).not.toMatch(/secret-token|private-url/)
    const p = new CallMediaProvider(vi.fn(async () => new Response(new Uint8Array(MAX_AUDIO_BYTES + 1), { headers: { 'Content-Type': 'audio/wav' } })) as any)
    await expect(p.audio('message', AbortSignal.timeout(1000))).rejects.toMatchObject({ state: 'too_large' })
  })
  it('rejects non-audio upstream bodies and cross-site access', async () => {
    const p = new CallMediaProvider(vi.fn(async () => new Response('<html>secret</html>', { headers: { 'Content-Type': 'text/html' } })) as any)
    await expect(p.audio('message', AbortSignal.timeout(1000))).rejects.toMatchObject({ state: 'provider_failure' })
    expect((await get('details', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
    expect(query).not.toHaveBeenCalled()
  })
  it('limits repeated authenticated requests', async () => {
    for (let i = 0; i < 60; i++) await get('details')
    expect((await get('details')).status).toBe(429)
  })
})
