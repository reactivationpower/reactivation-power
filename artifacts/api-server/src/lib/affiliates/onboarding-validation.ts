import { z } from 'zod'
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib'

const text = (max = 150) => z.string().trim().min(1).max(max).refine(s => !/[\x00-\x1f]/.test(s), 'Control characters are not allowed')
const optional = z.string().trim().max(150).default('')
const states = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '))
export const addressSchema = z.object({
  line1: text(), line2: optional, city: text(80),
  state: z.string().refine(s => states.has(s), 'Choose a U.S. state or DC'),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, 'Enter a U.S. ZIP code'),
  country: z.literal('US'),
}).strict()
export const contactSchema = z.object({
  contactName: text(), phone: z.string().trim().regex(/^\+?1?[\s().-]*\d{3}[\s().-]*\d{3}[\s.-]*\d{4}$/, 'Enter a U.S. phone number'),
  legalName: text(), dba: optional, address: addressSchema,
}).strict()
export function validRouting(value: string) {
  if (!/^\d{9}$/.test(value) || /^0+$/.test(value)) return false
  const n = [...value].map(Number)
  const prefix = Number(value.slice(0, 2))
  return ((prefix >= 1 && prefix <= 12) || (prefix >= 21 && prefix <= 32) || (prefix >= 61 && prefix <= 72) || prefix === 80) &&
    (3 * (n[0]! + n[3]! + n[6]!) + 7 * (n[1]! + n[4]! + n[7]!) + n[2]! + n[5]! + n[8]!) % 10 === 0
}
export const wireSchema = z.object({
  bankName: text(), bankAddress: addressSchema, accountHolder: text(),
  accountType: z.enum(['checking', 'savings']),
  routingNumber: z.string().refine(validRouting, 'Enter a valid domestic wire ABA routing number'),
  accountNumber: z.string().regex(/^\d{4,17}$/, 'Enter 4–17 account-number digits'),
  accountConfirmation: z.string(),
  instructions: z.string().trim().max(1500).default(''),
}).strict().refine(w => w.accountNumber === w.accountConfirmation, 'Account numbers must match')
export const intakeSchema = z.object({
  version: z.number().int().nonnegative(), contact: contactSchema,
  wire: wireSchema.optional(), w9Base64: z.string().max(2_800_000).optional(),
}).strict()
export type Contact = z.infer<typeof contactSchema>
export type Wire = Omit<z.infer<typeof wireSchema>, 'accountConfirmation'>

export async function validatePdf(base64: string): Promise<Buffer> {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Upload a PDF no larger than 2 MB')
  const data = Buffer.from(base64, 'base64')
  const body = data.toString('latin1')
  if (data.length > 2 * 1024 * 1024 || data.length < 100 || !/^%PDF-1\.[0-7]/.test(body) ||
      !/%%EOF\s*$/.test(body) ||
      /\/(?:JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|RichMedia|Encrypt|XFA)\b/i.test(body)) {
    throw new Error('Upload a standard, unencrypted PDF (maximum 2 MB), without embedded scripts or attachments')
  }
  try {
    const doc = await PDFDocument.load(data, { throwOnInvalidObject: true, updateMetadata: false })
    if (doc.isEncrypted || doc.getPageCount() < 1 || doc.getPageCount() > 20) throw new Error()
    // Examine parsed dictionaries too: names/actions can be inside compressed object streams.
    const forbidden = new Set(['JavaScript','JS','OpenAction','AA','Launch','EmbeddedFile','EmbeddedFiles','RichMedia','Encrypt','XFA'])
    const visited = new Set<unknown>()
    const walk = (object: unknown, depth = 0) => {
      if (!object || visited.has(object)) return
      if (depth > 100) throw new Error()
      visited.add(object)
      if (object instanceof PDFName && forbidden.has(object.decodeText())) throw new Error()
      if (object instanceof PDFDict) {
        for (const [k,v] of object.entries()) { walk(k, depth + 1); walk(v, depth + 1) }
      } else if (typeof object === 'object' && 'asArray' in object && typeof object.asArray === 'function') {
        for (const value of object.asArray()) walk(value, depth + 1)
      } else if (typeof object === 'object' && 'dict' in object) walk(object.dict, depth + 1)
    }
    for (const [,object] of doc.context.enumerateIndirectObjects()) walk(object)
  } catch { throw new Error('Upload a readable, unencrypted PDF without scripts or attachments (1–20 pages)') }
  return data
}
