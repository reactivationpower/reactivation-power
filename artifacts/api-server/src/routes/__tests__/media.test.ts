import express from 'express'
import type { Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const blob = vi.hoisted(() => ({
  get: vi.fn(),
  head: vi.fn(),
  allowed: vi.fn(async (): Promise<object | null> => ({ participantId: 'demo' })),
  admin: vi.fn(async (): Promise<object | null> => null),
}))
vi.mock('@vercel/blob', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/blob')>()),
  get: blob.get, head: blob.head,
}))
vi.mock('@/lib/data/participants', () => ({ getAllowedSession: blob.allowed }))
vi.mock('@/lib/auth/admin-session', () => ({ getAdminSessionFromRequest: blob.admin }))

const { default: router, parseMediaRange, MAX_MEDIA_RANGE_BYTES } = await import('@/routes/media')
const SIZE = 150_261_622
const URL = '/api/media?pathname=videos%2Fmodule1.mp4'
let server: Server
let baseUrl = ''

beforeAll(async () => {
  const app = express()
  app.use('/api', router)
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, error => error ? reject(error) : resolve())
  })
  const address = server.address()
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})
afterAll(() => server.close())
beforeEach(() => {
  vi.clearAllMocks()
  blob.allowed.mockResolvedValue({ participantId: 'demo' })
  blob.admin.mockResolvedValue(null)
  blob.head.mockResolvedValue({
    size: SIZE, contentType: 'video/mp4', etag: '"a"',
    uploadedAt: new Date('2026-01-01T00:00:00Z'),
  })
})

function upstream(start: number, end: number, opts: {
  total?: number; bytes?: number; etag?: string; length?: number
} = {}) {
  const bytes = new Uint8Array(opts.bytes ?? end - start + 1)
  bytes.fill(42)
  return {
    statusCode: 200,
    headers: new Headers({
      'content-range': `bytes ${start}-${end}/${opts.total ?? SIZE}`,
      'content-length': String(opts.length ?? end - start + 1),
      'content-type': 'video/mp4',
    }),
    blob: { contentType: 'video/mp4', size: bytes.length, etag: opts.etag ?? '"a"' },
    stream: new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(bytes); controller.close() },
    }),
  }
}

const request = (headers: Record<string, string> = {}) => fetch(`${baseUrl}${URL}`, { headers })

describe('GET /api/media private video streaming', () => {
  it('rejects unauthenticated requests before looking up private storage', async () => {
    blob.allowed.mockResolvedValue(null)
    const response = await request({ Range: 'bytes=0-1' })
    expect(response.status).toBe(401)
    expect(blob.head).not.toHaveBeenCalled()
    expect(blob.get).not.toHaveBeenCalled()
  })

  it('normalizes Safari’s two-byte probe when Blob reports a 2-byte TOTAL for a large file', async () => {
    blob.get.mockResolvedValue(upstream(0, 1, { total: 2 }))
    const response = await request({ Range: 'bytes=0-1' })
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes 0-1/${SIZE}`)
    expect(response.headers.get('content-length')).toBe('2')
    expect(response.headers.get('content-type')).toContain('video/mp4')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([42, 42]))
    expect(blob.get).toHaveBeenCalledWith('videos/module1.mp4', expect.objectContaining({
      access: 'private', headers: { Range: 'bytes=0-1' },
    }))
    expect(blob.get).toHaveBeenCalledTimes(1)
  })

  it('handles start, open-ended and suffix ranges using explicit upstream offsets', async () => {
    for (const [input, expected, start, end] of [
      ['bytes=4096-4099', `bytes 4096-4099/${SIZE}`, 4096, 4099],
      [`bytes=${SIZE - 2}-`, `bytes ${SIZE - 2}-${SIZE - 1}/${SIZE}`, SIZE - 2, SIZE - 1],
      ['bytes=-3', `bytes ${SIZE - 3}-${SIZE - 1}/${SIZE}`, SIZE - 3, SIZE - 1],
      [`bytes=${SIZE - 2}-${SIZE + 200}`, `bytes ${SIZE - 2}-${SIZE - 1}/${SIZE}`, SIZE - 2, SIZE - 1],
    ] as const) {
      blob.get.mockResolvedValueOnce(upstream(start, end))
      const response = await request({ Range: input })
      expect(response.status).toBe(206)
      expect(response.headers.get('content-range')).toBe(expected)
      expect(new Uint8Array(await response.arrayBuffer())).toHaveLength(end - start + 1)
      expect(blob.get).toHaveBeenLastCalledWith('videos/module1.mp4', expect.objectContaining({
        headers: { Range: `bytes=${start}-${end}` },
      }))
    }
  })

  it('serves Safari open-ended requests as 8 MiB bounded 206 streams', async () => {
    blob.get.mockResolvedValue(upstream(0, MAX_MEDIA_RANGE_BYTES - 1))
    const response = await request({ Range: 'bytes=0-' })
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes 0-${MAX_MEDIA_RANGE_BYTES - 1}/${SIZE}`)
    expect(response.headers.get('content-length')).toBe(String(MAX_MEDIA_RANGE_BYTES))
    expect(blob.get).toHaveBeenCalledWith('videos/module1.mp4', expect.objectContaining({
      headers: { Range: `bytes=0-${MAX_MEDIA_RANGE_BYTES - 1}` },
    }))
    expect((await response.arrayBuffer()).byteLength).toBe(MAX_MEDIA_RANGE_BYTES)
  })

  it('returns 416 for invalid, multi and unsatisfiable ranges without fetching a video body', async () => {
    for (const range of ['bytes=2-1', `bytes=${SIZE}-`, 'bytes=-0', 'bytes=0-1,3-4', 'junk=1-3']) {
      const response = await request({ Range: range })
      expect(response.status).toBe(416)
      expect(response.headers.get('content-range')).toBe(`bytes */${SIZE}`)
      expect(blob.get).not.toHaveBeenCalled()
    }
  })

  it('retries wrong byte offsets from the uncached source; never labels wrong bytes as valid', async () => {
    blob.get.mockResolvedValueOnce(upstream(0, 1, { total: 2 }))
      .mockResolvedValueOnce(upstream(9, 10))
    const response = await request({ Range: 'bytes=-2' })
    expect(response.status).toBe(502)
    expect(blob.get).toHaveBeenCalledTimes(2)
    expect(blob.get.mock.calls[1][1]).toMatchObject({
      headers: { Range: `bytes=${SIZE - 2}-${SIZE - 1}` }, useCache: false,
    })
  })

  it('retries truncated metadata instead of sending misleading 206 headers', async () => {
    blob.get.mockResolvedValueOnce(upstream(10, 11, { length: 1 }))
      .mockResolvedValueOnce(upstream(10, 11))
    const response = await request({ Range: 'bytes=10-11' })
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes 10-11/${SIZE}`)
    expect(blob.get).toHaveBeenCalledTimes(2)
    await response.arrayBuffer()
  })

  it('recovers a poisoned cached seek by bypassing the Blob cache', async () => {
    // Observed with Module 1 V1: requested 4096-5119, CDN answered
    // "bytes 4096-1023/1024" and no usable data until cache=0.
    const bad = upstream(4096, 1023, { length: 0, bytes: 0, total: 1024 })
    bad.headers.delete('content-length')
    blob.get.mockResolvedValueOnce(bad).mockResolvedValueOnce(upstream(4096, 5119))
    const response = await request({ Range: 'bytes=4096-5119' })
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes 4096-5119/${SIZE}`)
    expect((await response.arrayBuffer()).byteLength).toBe(1024)
    expect(blob.get.mock.calls[1][1]).toMatchObject({ useCache: false })
  })

  it('recovers a poisoned suffix response instead of relabeling the wrong last byte', async () => {
    blob.get.mockResolvedValueOnce(upstream(0, 0, { total: 1 }))
      .mockResolvedValueOnce(upstream(SIZE - 1, SIZE - 1))
    const response = await request({ Range: 'bytes=-1' })
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes ${SIZE - 1}-${SIZE - 1}/${SIZE}`)
    expect((await response.arrayBuffer()).byteLength).toBe(1)
    expect(blob.get.mock.calls[1][1]).toMatchObject({
      headers: { Range: `bytes=${SIZE - 1}-${SIZE - 1}` }, useCache: false,
    })
  })

  it('ignores Range if its If-Range ETag is stale and retains full-file 200 semantics', async () => {
    blob.get.mockResolvedValue({
      ...upstream(0, 2), headers: new Headers({ 'content-length': '3' }),
    })
    const response = await request({ Range: 'bytes=0-1', 'If-Range': '"old"' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-range')).toBeNull()
    expect(new Uint8Array(await response.arrayBuffer())).toHaveLength(3)
    expect(blob.get.mock.calls[0][1].headers).toBeUndefined()
  })

  it('permits an admin session even when the portal session is not allowed', async () => {
    blob.allowed.mockResolvedValue(null)
    blob.admin.mockResolvedValue({ id: 'admin' })
    blob.get.mockResolvedValue(upstream(0, 1))
    const response = await request({ Range: 'bytes=0-1' })
    expect(response.status).toBe(206)
    expect(blob.allowed).not.toHaveBeenCalled()
    await response.arrayBuffer()
  })
})

describe('parseMediaRange', () => {
  it('caps open-ended and long bounded video ranges below the published proxy limit', () => {
    expect(parseMediaRange('bytes=0-', SIZE))
      .toEqual({ start: 0, end: MAX_MEDIA_RANGE_BYTES - 1 })
    expect(parseMediaRange(`bytes=4096-${SIZE - 1}`, SIZE))
      .toEqual({ start: 4096, end: 4096 + MAX_MEDIA_RANGE_BYTES - 1 })
    expect(parseMediaRange('bytes=-99999999', SIZE))
      .toEqual({ start: SIZE - MAX_MEDIA_RANGE_BYTES, end: SIZE - 1 })
    // Short ranges (including the small Safari metadata probe) stay exact.
    expect(parseMediaRange('bytes=0-1', SIZE)).toEqual({ start: 0, end: 1 })
    expect(parseMediaRange(`bytes=${SIZE - 2}-`, SIZE))
      .toEqual({ start: SIZE - 2, end: SIZE - 1 })
  })

  it('does not accept invalid/unsafe sizes or integer bounds', () => {
    expect(parseMediaRange('bytes=0-1', Number.MAX_SAFE_INTEGER + 1)).toBeNull()
    expect(parseMediaRange('bytes=9007199254740999-', 10)).toBeNull()
    expect(parseMediaRange('bytes=0-1', 0)).toBeNull()
  })
})