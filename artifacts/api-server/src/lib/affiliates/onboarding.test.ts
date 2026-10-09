import { afterEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { seal, unseal } from './onboarding-crypto'
import { intakeSchema, validRouting, validatePdf } from './onboarding-validation'

afterEach(() => vi.unstubAllEnvs())
describe('affiliate payment intake security', () => {
  it('binds authenticated encryption to affiliate and field; fails closed without a key', () => {
    vi.stubEnv('AFFILIATE_DATA_KEY_V1', 'ab'.repeat(32))
    const input = Buffer.from('synthetic private bank data')
    const ciphertext = seal(input, 'affiliate-a', 'wire')
    expect(ciphertext).not.toContain(input.toString())
    expect(unseal(ciphertext, 'affiliate-a', 'wire')).toEqual(input)
    expect(() => unseal(ciphertext, 'affiliate-b', 'wire')).toThrow('unavailable')
    expect(() => unseal(ciphertext, 'affiliate-a', 'w9')).toThrow('unavailable')
    const parts = ciphertext.split('.'); parts[2] = Buffer.alloc(16).toString('base64')
    expect(() => unseal(parts.join('.'), 'affiliate-a', 'wire')).toThrow('unavailable')
    vi.stubEnv('AFFILIATE_DATA_KEY_V1', '')
    expect(() => seal(input, 'affiliate-a', 'wire')).toThrow('unavailable')
    expect(() => unseal(ciphertext, 'affiliate-a', 'wire')).toThrow('unavailable')
  })
  it('validates ABA checksums and rejects mask text and international intake', () => {
    expect(validRouting('021000021')).toBe(true)
    for (const value of ['000000000','021000022','02100','999999999']) expect(validRouting(value)).toBe(false)
    expect(intakeSchema.safeParse({ version: 0, contact: { address: { country: 'CA' } } }).success).toBe(false)
  })
  it('accepts bounded real PDFs and rejects invalid/active PDFs including compressed objects', async () => {
    const doc = await PDFDocument.create(); doc.addPage()
    const pdf = await doc.save()
    expect(await validatePdf(Buffer.from(pdf).toString('base64'))).toEqual(Buffer.from(pdf))
    await expect(validatePdf(Buffer.from('%PDF-1.7 fake %%EOF').toString('base64'))).rejects.toThrow()
    await expect(validatePdf(Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64'))).rejects.toThrow()
    doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj({ S: PDFName.of('JavaScript'), JS: PDFString.of('alert(1)') }))
    await expect(validatePdf(Buffer.from(await doc.save()).toString('base64'))).rejects.toThrow()
  })
})
