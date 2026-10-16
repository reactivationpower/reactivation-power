import express from 'express'
import type { Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { VERCEL_PAYLOAD_LIMIT_BYTES } from '@/lib/request-limits'

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  admin: vi.fn(async (): Promise<object | null> => ({ role: 'super_admin', sessionId: 's', userId: 'u' })),
}))
vi.mock('@vercel/blob', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/blob')>()),
  put: mocks.put,
}))
vi.mock('@/lib/auth/admin-session', () => ({ getAdminSessionFromRequest: mocks.admin }))
vi.mock('@/lib/auth/idle-session', () => ({ readIdleSession: vi.fn(async () => ({ deadline: new Date(Date.now() + 60_000) })) }))

const { default: router, MAX_SERVER_UPLOAD_BYTES, UPLOAD_TOO_LARGE_MESSAGE } = await import('@/routes/upload')

let server: Server
let base = ''
beforeAll(async () => {
  const app = express().use('/api', router)
  server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/upload`
})
afterAll(() => server.close())
beforeEach(() => {
  vi.clearAllMocks()
  mocks.admin.mockResolvedValue({ role: 'super_admin', sessionId: 's', userId: 'u' })
  mocks.put.mockImplementation(async (pathname: string, body: Buffer) => ({ pathname: `${pathname}-x`, size: body.length }))
})

function multipart(bytes: Buffer, boundary = 'upload-test-boundary') {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nattachment\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notes.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
}

describe('server-side upload fallback on a 4.5 MB function budget', () => {
  it('keeps the fallback limit below what a Vercel function accepts', () => {
    expect(MAX_SERVER_UPLOAD_BYTES).toBeLessThan(VERCEL_PAYLOAD_LIMIT_BYTES)
    expect(UPLOAD_TOO_LARGE_MESSAGE).toContain('4 MB')
    expect(UPLOAD_TOO_LARGE_MESSAGE).toMatch(/directly to storage/)
  })

  it('still stores a small raw upload and a small multipart upload', async () => {
    const small = Buffer.alloc(64 * 1024, 7)
    const raw = await fetch(`${base}?kind=thumbnail&name=poster.jpg`, {
      method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: small,
    })
    expect(raw.status).toBe(200)
    expect(await raw.json()).toMatchObject({ pathname: 'thumbnails/poster.jpg-x', fileSize: small.length, fileType: 'image/jpeg' })
    expect(mocks.put).toHaveBeenLastCalledWith('thumbnails/poster.jpg', expect.any(Buffer), expect.objectContaining({ access: 'private' }))

    const form = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=upload-test-boundary' },
      body: multipart(small),
    })
    expect(form.status).toBe(200)
    expect(await form.json()).toMatchObject({ pathname: 'attachments/notes.bin-x', fileSize: small.length })
  })

  it('refuses an oversized raw upload from its declared length without reading it', async () => {
    const response = await fetch(`${base}?kind=video&name=lesson.mp4`, {
      method: 'POST',
      headers: { 'content-type': 'video/mp4', 'content-length': String(MAX_SERVER_UPLOAD_BYTES + 1) },
      body: Buffer.alloc(MAX_SERVER_UPLOAD_BYTES + 1),
    })
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ code: 'UPLOAD_TOO_LARGE', error: UPLOAD_TOO_LARGE_MESSAGE, maxBytes: MAX_SERVER_UPLOAD_BYTES })
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('refuses an oversized chunked raw upload and multipart file while streaming', async () => {
    const big = Buffer.alloc(MAX_SERVER_UPLOAD_BYTES + 1, 1)
    const chunked = await fetch(`${base}?kind=video&name=lesson.mp4`, {
      method: 'POST',
      headers: { 'content-type': 'video/mp4' },
      body: new ReadableStream({ start(c) { c.enqueue(big); c.close() } }),
      duplex: 'half',
    } as RequestInit)
    expect(chunked.status).toBe(413)
    expect(await chunked.json()).toMatchObject({ code: 'UPLOAD_TOO_LARGE' })

    const body = multipart(big)
    const form = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=upload-test-boundary' },
      body: new ReadableStream({ start(c) { c.enqueue(body); c.close() } }),
      duplex: 'half',
    } as RequestInit)
    expect(form.status).toBe(413)
    expect(await form.json()).toMatchObject({ code: 'UPLOAD_TOO_LARGE' })
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('leaves the browser-direct token route available for large files', async () => {
    const response = await fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname: 'videos/big.mp4', callbackUrl: 'http://127.0.0.1/api/upload/token', clientPayload: null, multipart: true } }),
    })
    // Without a Blob token the SDK cannot sign a client token, but the route
    // must reach that step rather than reject the path or size.
    expect(response.status).not.toBe(413)
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('rejects anyone but a super admin before touching the body', async () => {
    mocks.admin.mockResolvedValue(null)
    const response = await fetch(`${base}?kind=video&name=lesson.mp4`, { method: 'POST', body: Buffer.alloc(10) })
    expect(response.status).toBe(401)
  })
})
