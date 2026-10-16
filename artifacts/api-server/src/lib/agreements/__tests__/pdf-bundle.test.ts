import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SignedSnapshot } from '@workspace/db'
import { bundleOptions } from '../../../../esbuild.config.mjs'
import { MAX_RESPONSE_FILE_BYTES, VERCEL_PAYLOAD_LIMIT_BYTES } from '@/lib/request-limits'
import type { PdfInput, renderAgreementPdf } from '../pdf'

/**
 * The Vercel function runs the esbuild bundle, not src/ with node_modules
 * beside it. pdfkit loads its standard fonts through a package-private
 * `#standard-fonts/*` require that esbuild cannot see, so the build rewrites
 * those loaders and inlines the font metrics. This test bundles the real PDF
 * renderer with the real build settings, runs that bundle, and checks the
 * agreement renders from the bundle alone.
 */

const artifactDir = path.resolve(import.meta.dirname, '../../../..')
let outDir = ''
let bundled: typeof renderAgreementPdf
let source = ''

beforeAll(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), 'pdf-bundle-'))
  await build({
    ...bundleOptions(),
    absWorkingDir: artifactDir,
    entryPoints: [path.join(artifactDir, 'src/lib/agreements/pdf.ts')],
    outdir: outDir,
    logLevel: 'silent',
  })
  source = await readFile(path.join(outDir, 'pdf.mjs'), 'utf8')
  const mod = await import(pathToFileURL(path.join(outDir, 'pdf.mjs')).href) as { renderAgreementPdf: typeof renderAgreementPdf }
  bundled = mod.renderAgreementPdf
}, 60_000)
afterAll(async () => { if (outDir) await rm(outDir, { recursive: true, force: true }) })

// 1x1 transparent PNG, the shape of a drawn signature's data URL.
const SIGNATURE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function input(signature: PdfInput['signature']): PdfInput {
  const paragraphs = Array.from({ length: 4 }, (_, i) => `Paragraph ${i + 1}. The customer agrees to the service terms — including “quoted” text, bullets • and arrows → that the PDF must print legibly. `.repeat(3))
  const snapshot: SignedSnapshot = {
    title: 'Patient Pipeline 12-Month Service Agreement',
    sections: Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`, title: `Section ${i + 1}`, paragraphs, requiresInitials: i % 3 === 0, hash: `h${i}`, initials: i % 3 === 0 ? 'JD' : null,
    })),
    fields: {
      company_name: 'Beyond Healthcare LLC', company_email: 'support@patientpipeline.app',
      full_name: 'Jane Doe', business_name: 'Doe Chiropractic', business_address: '1 Main St, Springfield, IL 62701',
      email: 'jane@example.invalid', phone: '(555) 010-0100', owner_name: 'Jane Doe', owner_phone: '(555) 010-0100',
      start_date: 'Oct 1, 2026', end_date: 'Sep 30, 2027', notice_days: '0',
    },
  }
  const at = '2026-10-01T15:00:00.000Z'
  return {
    snapshot,
    signature,
    amounts: { termMonths: 12, monthlyCents: 47500, setupFeeCents: 47500 },
    certificate: {
      agreementId: 'agr_test', title: snapshot.title, status: 'completed', documentHash: 'a'.repeat(64), signedVersion: 2,
      signer: { name: 'Jane Doe', title: 'Owner', email: 'jane@example.invalid', signatureType: signature.type, signedAt: at, ip: '203.0.113.5', userAgent: 'Mozilla/5.0 (iPad)' },
      sender: { name: 'Sales Rep', company: 'Beyond Healthcare LLC', sentAt: at },
      events: Array.from({ length: 30 }, (_, i) => ({
        type: 'viewed' as const, label: 'Agreement viewed', at, actor: 'Jane Doe', ip: '203.0.113.5', userAgent: 'Mozilla/5.0 (iPad)', detail: i % 2 ? 'Section 1' : null,
      })),
      generatedAt: at,
    },
    publicUrl: 'https://patientpipeline.app/agreements/token',
  }
}

describe('agreement PDF from the server bundle', () => {
  it('bundles pdfkit and its standard font data instead of loading them from node_modules', () => {
    expect(source).not.toMatch(/from\s+["']pdfkit["']/)
    expect(source).not.toContain('#standard-fonts/')
    for (const face of ['Helvetica', 'HelveticaBold', 'HelveticaOblique']) {
      expect(source).toContain(`/standard-fonts/${face}.cjs"(exports, module)`)
    }
    // Nothing outside the bundle is required at run time for the PDF itself.
    expect(source).not.toMatch(/from\s+["']@swc\/helpers/)
  })

  it('renders typed and drawn signatures to a PDF that fits one function response', async () => {
    for (const signature of [
      { type: 'typed' as const, data: 'Jane Doe', signerName: 'Jane Doe', signerTitle: 'Owner', signedAt: new Date('2026-10-01T15:00:00Z') },
      { type: 'drawn' as const, data: SIGNATURE_PNG, signerName: 'Jane Doe', signerTitle: null, signedAt: new Date('2026-10-01T15:00:00Z') },
    ]) {
      const bytes = await bundled(input(signature))
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
      expect(bytes.subarray(bytes.length - 7).toString().trim()).toMatch(/%%EOF$/)
      expect(bytes.length).toBeGreaterThan(5_000)
      expect(bytes.length).toBeLessThan(MAX_RESPONSE_FILE_BYTES / 4)
      expect(bytes.toString('latin1')).toContain('/BaseFont /Helvetica-Bold')
    }
    expect(MAX_RESPONSE_FILE_BYTES).toBeLessThan(VERCEL_PAYLOAD_LIMIT_BYTES)
  })
})
