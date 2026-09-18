import type { Agreement, AgreementEvent, AgreementEventType } from '@workspace/db'
import { COMPANY } from './defaults'

/**
 * Certificate of completion: everything a reader needs to verify who signed
 * what and when, derived from the audit trail. Rendered on the public page
 * and appended to the PDF.
 */

export interface CertificateEvent {
  type: AgreementEventType
  label: string
  at: string
  actor: string
  ip: string | null
  userAgent: string | null
  detail: string | null
}

export interface Certificate {
  agreementId: string
  title: string
  status: Agreement['status']
  documentHash: string | null
  signedVersion: number | null
  signer: {
    name: string | null
    title: string | null
    email: string
    signatureType: Agreement['signatureType']
    signedAt: string | null
    ip: string | null
    userAgent: string | null
  }
  sender: { name: string | null; company: string; sentAt: string | null }
  events: CertificateEvent[]
  generatedAt: string
}

const LABELS: Record<AgreementEventType, string> = {
  created: 'Agreement created',
  sent: 'Agreement sent for signature',
  resent: 'Signing link re-sent',
  edited: 'Agreement edited (new version)',
  viewed: 'Agreement viewed',
  initialed: 'Section initialed',
  consented: 'Agreed to sign electronically',
  signed: 'Agreement signed',
  setup_fee_paid: 'Setup fee paid',
  payment_failed: 'Payment attempt failed',
  subscription_started: 'Subscription started',
  completed: 'Agreement completed',
  pdf_generated: 'Signed PDF generated',
  expired: 'Signing link expired',
}

export function eventLabel(type: AgreementEventType): string {
  return LABELS[type] ?? type
}

function describe(e: AgreementEvent): string | null {
  const d = e.detail ?? {}
  switch (e.type) {
    case 'initialed':
      return typeof d.sectionTitle === 'string' ? `${d.sectionTitle}${d.initials ? ` — "${d.initials}"` : ''}` : null
    case 'edited':
      return typeof d.summary === 'string' ? d.summary : null
    case 'signed':
      return typeof d.signatureType === 'string' ? `${d.signatureType} signature` : null
    case 'setup_fee_paid':
      return typeof d.amount === 'string' ? `${d.amount}${d.card ? ` · ${d.card}` : ''}` : null
    case 'payment_failed':
      return typeof d.message === 'string' ? d.message : null
    case 'subscription_started':
      return typeof d.monthly === 'string' ? `${d.monthly}/month · first charge ${d.firstCharge ?? ''}`.trim() : null
    default:
      return null
  }
}

export function buildCertificate(
  agreement: Agreement,
  customerEmail: string,
  events: AgreementEvent[],
): Certificate {
  return {
    agreementId: agreement.id,
    title: agreement.signedSnapshot?.title ?? '',
    status: agreement.status,
    documentHash: agreement.documentHash,
    signedVersion: agreement.signedVersion,
    signer: {
      name: agreement.signerName,
      title: agreement.signerTitle,
      email: customerEmail,
      signatureType: agreement.signatureType,
      signedAt: agreement.signedAt?.toISOString() ?? null,
      ip: agreement.signerIp,
      userAgent: agreement.signerUserAgent,
    },
    sender: { name: agreement.sentByName, company: COMPANY.legalName, sentAt: agreement.sentAt?.toISOString() ?? null },
    events: events
      .filter((e) => e.type !== 'pdf_generated')
      .map((e) => ({
        type: e.type,
        label: eventLabel(e.type),
        at: e.createdAt.toISOString(),
        actor: e.actor === 'customer' ? 'Customer' : e.actorName ? `${e.actorName} (${COMPANY.name})` : COMPANY.name,
        ip: e.ip,
        userAgent: e.userAgent,
        detail: describe(e),
      })),
    generatedAt: new Date().toISOString(),
  }
}
