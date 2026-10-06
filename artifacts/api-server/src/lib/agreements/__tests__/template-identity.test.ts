import { describe, expect, it } from 'vitest'
import { AGREEMENT_DEFAULTS, COMPANY } from '../defaults'
import { DEFAULT_AGREEMENT_BODY, renderDocument } from '../template'
import { renderAgreementPdf, type PdfInput } from '../pdf'

const document = () => renderDocument(DEFAULT_AGREEMENT_BODY, {
  customer: {
    fullName: 'Example Signer', businessName: 'Example Practice', businessAddress: 'Example Address',
    phone: '', ownerName: 'Example Owner', ownerPhone: '', email: 'example@example.test',
  },
  termMonths: 12, monthlyCents: 47500, setupFeeCents: 47500, noticeDays: 0,
  asOf: new Date('2026-10-06T12:00:00Z'),
})

function pdfAuthor(pdf: Buffer): string | undefined {
  const source = pdf.toString('latin1')
  // PDFKit stores the metadata string as an indirect object.
  const objectId = source.match(/\/Author (\d+) 0 R/)?.[1]
  return objectId
    ? source.match(new RegExp(`\\b${objectId} 0 obj\\s*\\(([^)]*)\\)`))?.[1]
    : source.match(/\/Author \(([^)]*)\)/)?.[1]
}

function pdfInput(company: string, title: string): PdfInput {
  const d = document()
  return {
    snapshot: {
      title, fields: { ...d.fields, company_name: company },
      sections: d.sections.map(s => ({ ...s, initials: s.requiresInitials ? 'ES' : null })),
    },
    signature: {
      type: 'typed', data: 'Example Signer', signerName: 'Example Signer',
      signerTitle: 'Owner', signedAt: new Date('2026-10-06T12:00:00Z'),
    },
    amounts: { termMonths: 12, monthlyCents: 47500, setupFeeCents: 47500 },
    certificate: {
      agreementId: 'example-agreement', title, status: 'signed', documentHash: d.hash,
      signedVersion: 1,
      signer: {
        name: 'Example Signer', title: 'Owner', email: 'example@example.test', signatureType: 'typed',
        signedAt: '2026-10-06T12:00:00Z', ip: null, userAgent: null,
      },
      sender: { name: null, company, sentAt: null },
      events: [], generatedAt: '2026-10-06T12:00:00Z',
    },
    publicUrl: 'https://patientpipeline.app/sign/example',
  }
}

describe('standard agreement identity, product scope and cancellation', () => {
  it('identifies Beyond Healthcare LLC as company and Patient Pipeline as product', () => {
    const d = document()
    expect(COMPANY.legalName).toBe('Beyond Healthcare LLC')
    expect(d.fields.company_name).toBe('Beyond Healthcare LLC')
    expect(d.title).toBe('Patient Pipeline 12-Month Service Agreement')
    expect(d.sections.flatMap(s => s.paragraphs).join('\n')).toContain('Beyond Healthcare LLC, the owner and operator of Patient Pipeline')
    expect(DEFAULT_AGREEMENT_BODY).not.toContain('Reactivation Power')
  })

  it('covers lawful past-patient and new-inquiry outreach, without promising telephony', () => {
    expect(DEFAULT_AGREEMENT_BODY).toContain('Patient Reactivation and Lead Follow-Up')
    expect(DEFAULT_AGREEMENT_BODY).toContain('new inquiries about its campaigns or offers')
    expect(DEFAULT_AGREEMENT_BODY).not.toContain('only to contact people who have an existing relationship')
    expect(DEFAULT_AGREEMENT_BODY).toContain('obtain and retain any required consent')
    expect(DEFAULT_AGREEMENT_BODY).toContain('call recording are not promised')
  })

  it('matches portal cancellation timing without an extra advance-notice window', () => {
    expect(AGREEMENT_DEFAULTS.noticeDays).toBe(0)
    const text = document().sections.find(s => s.title === 'Cancellation and Notice')!.paragraphs.join('\n')
    expect(text).toContain('confirmed portal cancellation counts as notice')
    expect(text).toContain('no separate advance-notice period')
    expect(text).toContain('cancellation takes effect on the End Date')
    expect(text).toContain('end of the current billing period')
    expect(text).toContain('scheduled monthly payments remain due')
    expect(text).not.toMatch(/\{\{|30 days.*notice/)
  })

  it('generates new PDFs under the correct legal company', async () => {
    const pdf = await renderAgreementPdf(pdfInput('Beyond Healthcare LLC', 'Patient Pipeline 12-Month Service Agreement'))
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdfAuthor(pdf)).toBe('Beyond Healthcare LLC')
  })

  it('keeps a historical signed PDF company despite changed global branding', async () => {
    const input = pdfInput('Reactivation Power', 'Reactivation Power 12-Month Service Agreement')
    const before = JSON.stringify(input.snapshot)
    const pdf = await renderAgreementPdf(input)
    expect(pdfAuthor(pdf)).toBe('Reactivation Power')
    expect(JSON.stringify(input.snapshot)).toBe(before)
  })
})
