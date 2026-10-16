import express from 'express'
import type { Server } from 'node:http'
import { createHash } from 'node:crypto'
import { unzipSync, strFromU8 } from 'fflate'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { MARKETING_TEXTS, MARKETING_TEXT_URL } from '@workspace/shared/marketing-texts'
import { TEXT_HANDOFF_INSTRUCTIONS } from '@/lib/marketing/text-handoff'

const auth = vi.hoisted(() => ({ role: null as string | null }))
vi.mock('@/lib/auth/admin-session', async original => ({
  ...await original<typeof import('@/lib/auth/admin-session')>(),
  getAdminSessionFromRequest: async () => auth.role
    ? { role: auth.role, canManageServices: true } : null,
}))
const { default: router } = await import('../admin-marketing-texts')
const { default: pages } = await import('../pages')
let server: Server
let url: string
beforeAll(async () => {
  const app = express()
  app.use('/api', router, pages)
  server = app.listen(0)
  await new Promise<void>(resolve => server.on('listening', resolve))
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`
})
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

// A real CSV parser in the test, independent of the export's quoting helper.
function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++ }
      else quoted = !quoted
    } else if (!quoted && c === ',') { row.push(cell); cell = '' }
    else if (!quoted && c === '\r' && input[i + 1] === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''; i++
    } else cell += c
  }
  row.push(cell); rows.push(row)
  return rows
}

it.each([null, 'sales_rep', 'sales_manager'])('denies protected data and exports to %s, even with service access', async role => {
  auth.role = role
  const response = await fetch(`${url}/admin/marketing-texts/export`)
  expect(response.status).toBe(401)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(await response.text()).not.toContain(MARKETING_TEXT_URL)
  const page = await fetch(`${url}/pages/admin/marketing-texts`)
  const payload = await page.json() as { redirect?: string; data?: unknown }
  expect(payload.redirect).toBeTruthy()
  expect(payload.data).toBeUndefined()
  expect(JSON.stringify(payload)).not.toContain(MARKETING_TEXT_URL)
})

it('preserves the six approved bodies byte for byte', () => {
  // Approved source text independently compared to the supplied campaign brief.
  expect(MARKETING_TEXTS.slice(0, 6).map(text =>
    createHash('sha256').update(text.body).digest('hex'),
  )).toEqual([
    '4d02fe402e648a8443d35ee616416fe072325b4af6753bf97acccc80a2846794',
    'e40b78f10efc0e0b9e8a3ccb73a6112b3d2d304c5018f936607b9b3183b55161',
    '7b9a066704cd1d3a944f23a82730dc5887fa979f833d07a59dd67a153b937e2e',
    '53c1136d3e471ed448558ea606a8144eb5bc5a3ec4714a894c4adb40280e123a',
    '0d48eb27382f5d1ea58b4795520befcc008bc8bdd12ab2afff8614f970e5c4e6',
    '0be6e1953130094376890e850126ac3a9bb3a6fd2b4825ae61a65aab3027f6f4',
  ])
})

it('provides the same canonical protected preview and complete assistant files', async () => {
  auth.role = 'super_admin'
  const page = await fetch(`${url}/pages/admin/marketing-texts`)
  expect(await page.json()).toEqual({ data: { texts: MARKETING_TEXTS, instructions: TEXT_HANDOFF_INSTRUCTIONS } })
  const response = await fetch(`${url}/admin/marketing-texts/export`)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('application/zip')
  expect(response.headers.get('content-disposition')).toContain('patient-pipeline-marketing-texts.zip')
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const paths = Object.keys(files).filter(path => path.startsWith('texts/')).sort()
  expect(paths).toHaveLength(20)
  expect(Object.keys(files)).toHaveLength(23)
  const csv = parseCsv(strFromU8(files['texts.csv']).replace(/^\uFEFF/, ''))
  expect(csv).toHaveLength(21)
  for (const [index, text] of MARKETING_TEXTS.entries()) {
    expect(text.number).toBe(index + 1)
    expect(text.title.length).toBeGreaterThan(5)
    expect(text.body).toContain('Dr. Jason')
    expect(text.body).toContain('Dr. [Last Name]')
    expect(text.body.match(/https:\/\/\S+/g)).toEqual([MARKETING_TEXT_URL])
    expect(strFromU8(files[paths[index]])).toBe(text.body)
    expect(csv[index + 1]).toEqual([
      String(text.number).padStart(2, '0'), text.title, text.body, MARKETING_TEXT_URL,
    ])
    expect(strFromU8(files['SEQUENCE.txt'])).toContain(`Text ${String(text.number).padStart(2, '0')} — ${text.title}\n\n${text.body}`)
  }
  expect(strFromU8(files['START-HERE.txt'])).toBe(TEXT_HANDOFF_INSTRUCTIONS)
  expect(TEXT_HANDOFF_INSTRUCTIONS).toContain('NOT sending dates')
  expect(TEXT_HANDOFF_INSTRUCTIONS).toContain('External imports do not update automatically')
  expect(TEXT_HANDOFF_INSTRUCTIONS).toContain('rather than distinguishing which text')
  expect(TEXT_HANDOFF_INSTRUCTIONS).not.toContain('{{contact.last_name}}')
  expect(MARKETING_TEXTS[18].body).toContain("I've since sold my offices")
  expect(MARKETING_TEXTS[0].body).toContain("In my office, 30–40% of our 'new patients'")
})
