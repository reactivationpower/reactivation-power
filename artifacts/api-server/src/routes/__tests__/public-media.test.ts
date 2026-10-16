import express from 'express'
import type { Server } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { publicMediaRouter, PUBLIC_VIDEOS } from '../public-media'
import { MAX_MEDIA_RANGE_BYTES as CAP } from '../../lib/media-range'

let server: Server, base: string, dir: string
const bytes = Buffer.alloc(CAP * 4 + 173)
for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + Math.floor(i / 251)) % 256
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'public-media-'))
  await writeFile(path.join(dir, PUBLIC_VIDEOS[1]), bytes)
  await writeFile(path.join(dir, PUBLIC_VIDEOS[2]), bytes.subarray(0, 111))
  const app = express().use('/api', publicMediaRouter(dir))
  server = app.listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/public-media/`
})
afterAll(async () => { server.close(); await rm(dir, { recursive: true, force: true }) })
const request = (headers: Record<string, string> = {}, name: string = PUBLIC_VIDEOS[1], method = 'GET') => fetch(base + name, { headers, method })

describe('bounded public video delivery', () => {
  it('delivers exact consecutive slices through EOF for a file larger than 32 MiB', async () => {
    for (let start = 0; start < bytes.length; start += CAP) {
      const response = await request({ Range: `bytes=${start}-` })
      const end = Math.min(start + CAP, bytes.length)
      expect(response.status).toBe(206)
      expect(response.headers.get('content-range')).toBe(`bytes ${start}-${end - 1}/${bytes.length}`)
      expect(response.headers.get('content-length')).toBe(String(end - start))
      expect(Buffer.from(await response.arrayBuffer()).equals(bytes.subarray(start, end))).toBe(true)
    }
  })
  it('honors middle, suffix, oversized suffix and oversized bounded offsets', async () => {
    for (const [range, start, end] of [
      ['bytes=4096-8191', 4096, 8192],
      ['bytes=-25', bytes.length - 25, bytes.length],
      [`bytes=-${CAP + 10}`, bytes.length - CAP - 10, bytes.length - 10],
      ['bytes=123-33554432', 123, 123 + CAP],
    ] as const) {
      const response = await request({ Range: range })
      expect(response.status).toBe(206)
      expect(Buffer.from(await response.arrayBuffer()).equals(bytes.subarray(start, end))).toBe(true)
    }
  })
  it('handles HEAD, validators, ordinary GET and stale If-Range without fake full bodies', async () => {
    const head = await request({}, PUBLIC_VIDEOS[1], 'HEAD')
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe(String(bytes.length))
    expect(await head.text()).toBe('')
    const etag = head.headers.get('etag')!
    expect((await request({ 'If-None-Match': etag })).status).toBe(304)
    const current = await request({ Range: 'bytes=0-1', 'If-Range': etag })
    expect(current.status).toBe(206)
    await current.arrayBuffer()
    for (const headers of [{}, { Range: 'bytes=0-', 'If-Range': '"old"' }] as Record<string, string>[]) {
      const response = await request(headers)
      expect(response.status).toBe(400)
      expect(response.headers.get('content-range')).toBeNull()
      expect(await response.json()).toMatchObject({ code: 'MEDIA_RANGE_REQUIRED' })
    }
    for (const headers of [{}, { Range: 'bytes=0-1', 'If-Range': '"old"' }] as Record<string, string>[]) {
      const small = await request(headers, PUBLIC_VIDEOS[2])
      expect(small.status).toBe(200)
      expect(Buffer.from(await small.arrayBuffer()).equals(bytes.subarray(0, 111))).toBe(true)
    }
  })
  it('rejects malformed ranges, unknown names and traversal', async () => {
    for (const range of ['bytes=2-1', 'bytes=-0', 'bytes=0-1,3-4', 'items=0-1', `bytes=${bytes.length}-`]) {
      const response = await request({ Range: range })
      expect(response.status).toBe(416)
      expect(response.headers.get('content-range')).toBe(`bytes */${bytes.length}`)
    }
    for (const name of ['private.mp4', '..%2Fpackage.json', '%2e%2e%2fpatient-pipeline-walkthrough.mp4']) {
      expect((await request({}, name)).status).toBe(404)
    }
  })
})
