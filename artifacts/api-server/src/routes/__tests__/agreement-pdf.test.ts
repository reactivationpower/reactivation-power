import express from 'express'
import type { Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_RESPONSE_FILE_BYTES } from '@/lib/request-limits'

const store = vi.hoisted(() => ({
  load: vi.fn(),
  pdf: vi.fn(),
}))
vi.mock('@/lib/agreements/store', () => ({
  loadAgreementByToken: store.load,
  getOrCreatePdf: store.pdf,
  isSigned: (agreement: { status: string }) => agreement.status !== 'draft',
  pdfFileName: () => 'Service-Agreement-Doe-Chiropractic.pdf',
}))

const { default: router } = await import('@/routes/agreements')
let server: Server
let base = ''
beforeAll(async () => {
  server = express().use('/api', router).listen(0)
  await new Promise<void>(resolve => server.once('listening', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/agreements`
})
afterAll(() => server.close())
beforeEach(() => {
  vi.clearAllMocks()
  store.load.mockResolvedValue({ agreement: { status: 'completed' }, customer: { businessName: 'Doe Chiropractic', fullName: 'Jane Doe' } })
})

describe('GET /api/agreements/:token/pdf', () => {
  it('sends a signed agreement PDF with its exact length and download headers', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.3\n'), Buffer.alloc(200_000, 32), Buffer.from('\n%%EOF\n')])
    store.pdf.mockResolvedValue(pdf)
    const response = await fetch(`${base}/tok/pdf`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-length')).toBe(String(pdf.length))
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="Service-Agreement-Doe-Chiropractic.pdf"')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(Buffer.from(await response.arrayBuffer()).equals(pdf)).toBe(true)
    const inline = await fetch(`${base}/tok/pdf?inline=1`)
    expect(inline.headers.get('content-disposition')).toMatch(/^inline;/)
    await inline.arrayBuffer()
  })

  it('reports a PDF that would exceed one function response instead of truncating it', async () => {
    store.pdf.mockResolvedValue(Buffer.alloc(MAX_RESPONSE_FILE_BYTES + 1, 32))
    const response = await fetch(`${base}/tok/pdf`)
    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).not.toBe('application/pdf')
    expect(await response.text()).toMatch(/larger than the 4 MB download limit/)
  })

  it('keeps the not-found and unsigned answers', async () => {
    store.load.mockResolvedValueOnce(null)
    expect((await fetch(`${base}/missing/pdf`)).status).toBe(404)
    store.load.mockResolvedValueOnce({ agreement: { status: 'draft' }, customer: {} })
    expect((await fetch(`${base}/draft/pdf`)).status).toBe(409)
    expect(store.pdf).not.toHaveBeenCalled()
  })
})
