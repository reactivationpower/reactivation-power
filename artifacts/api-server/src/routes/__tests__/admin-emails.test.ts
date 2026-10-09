import express from 'express'
import type { Server } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { EMAIL_TEMPLATES } from '@workspace/shared/email-templates'

vi.mock('@/lib/auth/admin-session', () => ({
  getAdminSessionFromRequest: async () => ({ role: 'super_admin' }),
}))
vi.mock('@/lib/request-context', () => ({
  runWithRequestContext: async (_req: unknown, _res: unknown, fn: () => Promise<void>) => fn(),
}))
const { default: router } = await import('../admin-emails')
let server: Server
let url: string
beforeAll(async () => {
  const app = express()
  app.use('/api', router)
  server = app.listen(0)
  await new Promise<void>(resolve => server.on('listening', resolve))
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

it('exports all 68 current templates unchanged, with matching link instructions', async () => {
  const response = await fetch(`${url}/api/admin/emails/export?audience=chiropractic`)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('application/zip')
  const zip = new Uint8Array(await response.arrayBuffer())
  const files = unzipSync(zip)
  const emails = Object.keys(files).filter(path => path.startsWith('emails/')).sort()
  expect(emails).toHaveLength(68)
  for (const [index, path] of emails.entries()) {
    const html = strFromU8(files[path])
    expect(html).toBe(EMAIL_TEMPLATES[index].html)
    const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1])
    expect(links).toEqual([
      'https://patientpipeline.app/api/m/pHEhLNyjVo37AFcd',
      'https://patientpipeline.app/api/m/pHEhLNyjVo37AFcd',
      '{{unsubscribe_link}}',
    ])
    expect(html).toContain('{{contact.first_name}}')
  }
  const instructions = strFromU8(files['START-HERE.html'])
  expect(instructions).toContain('https://patientpipeline.app/api/m/pHEhLNyjVo37AFcd')
  expect(instructions).not.toMatch(/schedule-a-call|reactivationpower\.com\/healthcare/)
  expect(instructions).toContain('emails already sent are unchanged')
  expect(instructions).toContain('Replace previously imported templates')
  expect(strFromU8(files['emails.csv']).split('\r\n')).toHaveLength(69)

  // Optional deliverable: write the exact ZIP checked above, never an older archive.
  if (process.env.WRITE_MARKETING_EMAIL_EXPORT === '1') {
    const directory = resolve('../../generated-artifacts')
    mkdirSync(directory, { recursive: true })
    writeFileSync(resolve(directory, 'Patient-Pipeline-Emails-Replacement-pHEhLNyjVo37AFcd.zip'), zip)
  }
})
