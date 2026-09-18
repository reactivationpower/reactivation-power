import PDFDocument from 'pdfkit'
import type { SignedSnapshot } from '@workspace/db'
import type { Certificate } from './certificate'
import { COMPANY } from './defaults'

/**
 * Renders the signed agreement + signature block + certificate of completion
 * to a PDF buffer with pdfkit (built-in Helvetica, no font files needed).
 */

export interface PdfInput {
  snapshot: SignedSnapshot
  signature: {
    type: 'typed' | 'drawn' | null
    data: string | null
    signerName: string | null
    signerTitle: string | null
    signedAt: Date | null
  }
  amounts: { termMonths: number; monthlyCents: number; setupFeeCents: number }
  certificate: Certificate
  publicUrl: string
}

const TEAL = '#1d3d47'
const MUTED = '#6b7280'
const RULE = '#d1d5db'

/** The built-in Helvetica fonts only cover WinAnsi; map common Unicode punctuation so it does not print as garbage. */
const ANSI_MAP: Record<string, string> = { '→': '->', '←': '<-', '⇒': '=>', '✓': 'v', '✔': 'v', '•': '\u2022', '…': '...', '—': '\u2014', '–': '\u2013' }
function toAnsi(text: string): string {
  return text.replace(/[^\u0000-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026]/g, (ch) => ANSI_MAP[ch] ?? '?')
}
function ansiSafe<T extends { text: (...args: any[]) => any }>(doc: T): T {
  const original = doc.text.bind(doc)
  doc.text = ((text: unknown, ...rest: unknown[]) => original(typeof text === 'string' ? toAnsi(text) : text, ...rest)) as T['text']
  return doc
}

const fmtWhen = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'America/New_York',
        timeZoneName: 'short',
      })
    : '—'

const fmtDay = (d: Date | null) =>
  d ? d.toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'America/New_York' }) : '—'

const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl)
  return m ? Buffer.from(m[1], 'base64') : null
}

export async function renderAgreementPdf(input: PdfInput): Promise<Buffer> {
  const doc = ansiSafe(
    new PDFDocument({
    size: 'LETTER',
    margins: { top: 64, bottom: 64, left: 64, right: 64 },
    info: {
      Title: input.snapshot.title,
      Author: COMPANY.legalName,
      Subject: 'Service agreement and certificate of completion',
    },
  }),
  )
  const chunks: Buffer[] = []
  doc.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const left = doc.page.margins.left
  const f = input.snapshot.fields

  // ── Agreement ─────────────────────────────────────────────────────
  doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(10).text(COMPANY.name.toUpperCase(), { characterSpacing: 1.5 })
  doc.moveDown(0.4)
  doc.fillColor('#111827').fontSize(20).text(input.snapshot.title)
  doc.moveDown(0.3)
  doc.font('Helvetica').fontSize(9).fillColor(MUTED)
    .text(`Agreement ID ${input.certificate.agreementId} · Version ${input.certificate.signedVersion ?? '—'}`)
  doc.moveDown(0.8)

  // Summary box
  const rows: [string, string][] = [
    ['Customer', `${f.full_name} — ${f.business_name}`],
    ['Address', f.business_address],
    ['Contact', `${f.email} · ${f.phone}`],
    ['Owner', `${f.owner_name} · ${f.owner_phone}`],
    ['Term', `${input.amounts.termMonths} months (${f.start_date} – ${f.end_date})`],
    ['Monthly amount', money(input.amounts.monthlyCents)],
    ['Setup fee', input.amounts.setupFeeCents > 0 ? money(input.amounts.setupFeeCents) : 'Waived'],
    ['Notice to end', `${f.notice_days} days before the end of the term`],
  ]
  const boxTop = doc.y
  let y = boxTop + 10
  doc.fontSize(9.5)
  for (const [k, v] of rows) {
    doc.font('Helvetica-Bold').fillColor(MUTED).text(k.toUpperCase(), left + 12, y, { width: 120 })
    doc.font('Helvetica').fillColor('#111827').text(v, left + 136, y, { width: width - 148 })
    y = Math.max(doc.y, y + 12) + 4
  }
  doc.rect(left, boxTop, width, y - boxTop + 6).strokeColor(RULE).lineWidth(0.8).stroke()
  doc.y = y + 20
  doc.x = left

  // Sections
  input.snapshot.sections.forEach((s, i) => {
    if (doc.y > doc.page.height - 160) doc.addPage()
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(`${i + 1}. ${s.title}`, left, doc.y, { width })
    doc.moveDown(0.3)
    doc.font('Helvetica').fontSize(10).fillColor('#1f2937')
    for (const para of s.paragraphs) {
      doc.text(para, { width, align: 'justify', lineGap: 2 })
      doc.moveDown(0.5)
    }
    if (s.requiresInitials) {
      const label = s.initials ? `Initialed: ${s.initials}` : 'Initials required'
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TEAL).text(label, { width })
      doc.moveDown(0.3)
    }
    doc.moveDown(0.5)
  })

  // Signature block
  if (doc.y > doc.page.height - 260) doc.addPage()
  doc.moveDown(0.5)
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(RULE).stroke()
  doc.moveDown(1)
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Signature', left, doc.y)
  doc.moveDown(0.6)
  const sigTop = doc.y
  const colW = width / 2 - 12

  // Customer column
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED).text('CUSTOMER', left, sigTop)
  let sigY = sigTop + 14
  const png = input.signature.type === 'drawn' && input.signature.data ? dataUrlToBuffer(input.signature.data) : null
  if (png) {
    try {
      doc.image(png, left, sigY, { fit: [colW, 60] })
    } catch {
      doc.font('Helvetica-Oblique').fontSize(18).fillColor('#111827').text(input.signature.signerName ?? '', left, sigY + 20)
    }
    sigY += 66
  } else {
    doc.font('Helvetica-Oblique').fontSize(22).fillColor('#111827')
      .text(input.signature.data || input.signature.signerName || '', left, sigY + 16, { width: colW })
    sigY += 56
  }
  doc.moveTo(left, sigY).lineTo(left + colW, sigY).strokeColor('#111827').lineWidth(0.8).stroke()
  doc.font('Helvetica').fontSize(9.5).fillColor('#111827')
    .text(input.signature.signerName ?? '', left, sigY + 4, { width: colW })
  doc.fillColor(MUTED).fontSize(8.5)
    .text(`${input.signature.signerTitle ? `${input.signature.signerTitle}, ` : ''}${f.business_name}`, left, doc.y, { width: colW })
    .text(`Signed ${fmtWhen(input.signature.signedAt?.toISOString())}`, left, doc.y, { width: colW })
    .text(`${input.signature.type === 'drawn' ? 'Drawn' : 'Typed'} electronic signature`, left, doc.y, { width: colW })

  // Company column
  const cx = left + colW + 24
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED).text('COMPANY', cx, sigTop)
  doc.font('Helvetica').fontSize(9.5).fillColor('#111827').text(COMPANY.legalName, cx, sigTop + 14, { width: colW })
  doc.fillColor(MUTED).fontSize(8.5)
    .text(`Sent by ${input.certificate.sender.name ?? COMPANY.name}`, cx, doc.y, { width: colW })
    .text(`on ${fmtWhen(input.certificate.sender.sentAt)}`, cx, doc.y, { width: colW })
    .text(COMPANY.supportEmail, cx, doc.y, { width: colW })

  doc.y = Math.max(doc.y, sigY + 60)
  doc.x = left
  doc.moveDown(1.5)
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text(`Document fingerprint (SHA-256): ${input.certificate.documentHash ?? '—'}`, left, doc.y, { width })
    .text(`Online copy: ${input.publicUrl}`, { width })

  // ── Certificate of completion ─────────────────────────────────────
  doc.addPage()
  const c = input.certificate
  doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(10).text(COMPANY.name.toUpperCase(), left, doc.y, { characterSpacing: 1.5 })
  doc.moveDown(0.4)
  doc.fillColor('#111827').fontSize(20).text('Certificate of Completion')
  doc.moveDown(0.2)
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(c.title)
  doc.moveDown(1)

  const meta: [string, string][] = [
    ['Agreement ID', c.agreementId],
    ['Status', c.status === 'completed' ? 'Completed' : c.status === 'signed' || c.status === 'payment_pending' ? 'Signed' : c.status],
    ['Version signed', c.signedVersion != null ? String(c.signedVersion) : '—'],
    ['Document fingerprint', c.documentHash ?? '—'],
    ['Signer', `${c.signer.name ?? '—'}${c.signer.title ? `, ${c.signer.title}` : ''}`],
    ['Signer email', c.signer.email],
    ['Signature', c.signer.signatureType === 'drawn' ? 'Drawn (touch / mouse)' : 'Typed'],
    ['Signed at', fmtWhen(c.signer.signedAt)],
    ['Signer IP address', c.signer.ip ?? '—'],
    ['Signer browser', c.signer.userAgent ?? '—'],
    ['Sent by', `${c.sender.name ?? '—'} on behalf of ${c.sender.company}`],
    ['Sent at', fmtWhen(c.sender.sentAt)],
    ['Certificate generated', fmtWhen(c.generatedAt)],
  ]
  doc.fontSize(9.5)
  for (const [k, v] of meta) {
    const rowY = doc.y
    doc.font('Helvetica-Bold').fillColor(MUTED).text(k.toUpperCase(), left, rowY, { width: 130 })
    doc.font('Helvetica').fillColor('#111827').text(v, left + 140, rowY, { width: width - 140 })
    doc.y = Math.max(doc.y, rowY + 12) + 3
  }
  doc.x = left
  doc.moveDown(1)
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Audit trail', left, doc.y)
  doc.moveDown(0.5)

  const cols = { when: 150, event: 170, who: 80 }
  const ipW = width - cols.when - cols.event - cols.who
  const header = () => {
    const hy = doc.y
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
    doc.text('WHEN', left, hy, { width: cols.when })
    doc.text('EVENT', left + cols.when, hy, { width: cols.event })
    doc.text('BY', left + cols.when + cols.event, hy, { width: cols.who })
    doc.text('IP / BROWSER', left + cols.when + cols.event + cols.who, hy, { width: ipW })
    doc.y = hy + 12
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor(RULE).stroke()
    doc.y += 4
  }
  header()
  for (const e of c.events) {
    if (doc.y > doc.page.height - 90) {
      doc.addPage()
      header()
    }
    const ry = doc.y
    doc.font('Helvetica').fontSize(8.5).fillColor('#111827')
    doc.text(fmtWhen(e.at), left, ry, { width: cols.when - 6 })
    const afterWhen = doc.y
    doc.text(e.label, left + cols.when, ry, { width: cols.event - 6 })
    if (e.detail) doc.fillColor(MUTED).fontSize(7.5).text(e.detail, left + cols.when, doc.y, { width: cols.event - 6 })
    const afterEvent = doc.y
    doc.fillColor('#111827').fontSize(8.5).text(e.actor, left + cols.when + cols.event, ry, { width: cols.who - 6 })
    const afterWho = doc.y
    doc.fillColor(MUTED).fontSize(7.5)
      .text(`${e.ip ?? '—'}${e.userAgent ? `\n${e.userAgent}` : ''}`, left + cols.when + cols.event + cols.who, ry, { width: ipW })
    doc.y = Math.max(afterWhen, afterEvent, afterWho, doc.y) + 5
    doc.moveTo(left, doc.y - 2).lineTo(left + width, doc.y - 2).strokeColor('#eef0f2').stroke()
  }
  doc.x = left
  doc.moveDown(1)
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
    `This certificate was generated by ${COMPANY.legalName} from the audit trail recorded while the agreement was viewed, initialed and signed. The document fingerprint is the SHA-256 hash of the exact agreement text that was signed; any change to the text produces a different fingerprint.`,
    left,
    doc.y,
    { width },
  )

  doc.end()
  return done
}
