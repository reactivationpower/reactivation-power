import { randomUUID } from 'node:crypto'
import { ReplitConnectors } from '@replit/connectors-sdk'
import { db, emailLogTable, type PoolClient } from '@workspace/db'
import { logger } from '@/lib/logger'
import { toPlainText } from './layout'
import { renderTemplate, type TemplateDataMap, type TemplateId } from './templates'
import { isAuthenticationEmail, safeEmailMetadata } from './diagnostics'

/**
 * Transactional sending through the Resend connector.
 *
 * sendEmail never throws: it returns { ok: false } and logs the failure, so
 * it is safe to call from server actions and webhook handlers where a mail
 * problem must not roll back the business operation. Every attempt — sent
 * or failed — is written to email_log; Resend's webhook later fills in
 * delivered / opened / clicked on the same row (see routes/webhooks-resend).
 */

export const DEFAULT_FROM = 'Patient Pipeline <team@patientpipeline.app>'

export function fromAddress(): string {
  const from = process.env.RESEND_FROM?.trim() || DEFAULT_FROM
  if (/[\r\n]/.test(from) || !/(?:^|<)[^@\s<>]+@patientpipeline\.app>?$/i.test(from)) {
    throw new Error('RESEND_FROM must use a patientpipeline.app email address')
  }
  return from
}

export interface SendResult {
  ok: boolean
  /** Transport failed after a request may have reached the provider; do not blindly retry beyond its dedupe window. */
  uncertain?: boolean
  /** Our email_log row id. */
  logId: string
  /** Resend's email id when accepted. */
  providerId?: string
  error?: string
}

export interface SendOptions {
  /** Optional durable outbox correlation, saved before dispatch. Server-only. */
  logId?: string
  /** Reuse the outbox's checked-out connection; never borrow a nested pool slot. */
  logClient?: Pick<PoolClient, 'query'>
  /** Durable outboxes freeze the exact content and sender on their first attempt. Never log this. */
  deliverySnapshot?: ReturnType<typeof renderTemplate> & { from: string }
  /** Provider-level deduplication for durable outbox retries (24-hour retention). */
  idempotencyKey?: string
  /** Free-form context stored with the log row (ids, amounts). Never secrets or links. */
  metadata?: Record<string, unknown>
  replyTo?: string
  /** Files to attach (Resend accepts base64 content). */
  attachments?: EmailAttachment[]
}

export interface EmailAttachment {
  filename: string
  content: Buffer | string
  contentType?: string
}

interface ResendSendResponse {
  id?: string
  message?: string
  name?: string
  statusCode?: number
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const connectors = new ReplitConnectors()

/** Render a template and send it. */
export async function sendEmail<K extends TemplateId>(
  type: K,
  to: string,
  data: TemplateDataMap[K],
  options: SendOptions = {},
): Promise<SendResult> {
  const recipient = to.trim().toLowerCase()
  const logId = options.logId ?? randomUUID()
  const log = (row: Parameters<typeof writeLog>[0]) => writeLog(row, options.logClient)
  const authentication = isAuthenticationEmail(type)
  const sensitiveDelivery = authentication || type === 'agreement_sent' || type === 'affiliate_onboarding_v1'
  const metadata = safeEmailMetadata(type, options.metadata)
  let rendered: ReturnType<typeof renderTemplate>
  try {
    rendered = options.deliverySnapshot ?? renderTemplate(type, data)
  } catch (err) {
    const error = authentication ? 'Authentication email rendering failed' : sensitiveDelivery ? 'Email rendering failed' : err instanceof Error ? err.message : 'Email rendering failed'
    await log({ id: logId, type, recipient, subject: 'Email rendering failed', metadata, status: 'failed', error })
    logger.error({ email: { type, recipient, logId } }, 'email rendering failed')
    return { ok: false, logId, error }
  }
  const base = { id: logId, type, recipient, subject: rendered.subject, metadata }

  if (!EMAIL_RE.test(recipient)) {
    const error = 'Invalid recipient address'
    await log({ ...base, status: 'failed', error })
    logger.error({ email: { type, recipient, logId } }, `email failed: ${error}`)
    return { ok: false, logId, error }
  }

  try {
    const response = await connectors.proxy('resend', '/emails', {
      method: 'POST',
      ...(options.idempotencyKey ? { headers: { 'Idempotency-Key': options.idempotencyKey } } : {}),
      body: {
        from: options.deliverySnapshot?.from ?? fromAddress(),
        to: [recipient],
        subject: rendered.subject,
        html: rendered.html,
        text: toPlainText(rendered.html),
        ...(options.replyTo ? { reply_to: options.replyTo } : {}),
        ...(options.attachments?.length
          ? {
              attachments: options.attachments.map((a) => ({
                filename: a.filename,
                content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
                ...(a.contentType ? { content_type: a.contentType } : {}),
              })),
            }
          : {}),
        tags: [{ name: 'type', value: type }],
        headers: { 'X-Entity-Ref-ID': options.idempotencyKey ?? logId },
      },
    })
    const payload = (await response.json().catch(() => ({}))) as ResendSendResponse
    if (!response.ok || !payload.id) {
      const error = authentication ? `Resend rejected the authentication email (HTTP ${response.status})` : sensitiveDelivery ? `Resend rejected the email (HTTP ${response.status})` : payload.message || `Resend responded ${response.status}`
      await log({ ...base, status: 'failed', error })
      logger.error({ email: { type, recipient, logId, status: response.status } }, `email failed: ${error}`)
      return { ok: false, logId, error }
    }
    await log({ ...base, status: 'sent', providerId: payload.id })
    logger.info({ email: { type, recipient, logId, providerId: payload.id } }, 'email sent')
    return { ok: true, logId, providerId: payload.id }
  } catch (err) {
    const senderConfigurationError = err instanceof Error && err.message === 'RESEND_FROM must use a patientpipeline.app email address'
    const uncertain = !senderConfigurationError
    const error = sensitiveDelivery && !senderConfigurationError ? (authentication ? 'Authentication email send failed; check the registered inbox and email provider' : 'Email send failed; check the recipient and email provider') : err instanceof Error ? err.message : String(err)
    await log({ ...base, status: uncertain && type === 'agreement_sent' ? 'pending' : 'failed', error })
    logger.error({ ...(!sensitiveDelivery ? { err } : {}), email: { type, recipient, logId } }, `email failed: ${error}`)
    return { ok: false, logId, error, ...(uncertain ? { uncertain: true } : {}) }
  }
}

async function writeLog(row: {
  id: string
  type: string
  recipient: string
  subject: string
  status: 'sent' | 'failed' | 'pending'
  providerId?: string
  error?: string
  metadata: Record<string, unknown> | null
}, client?: Pick<PoolClient, 'query'>): Promise<void> {
  try {
    if (client) {
      await client.query(`INSERT INTO email_log(id,type,recipient,subject,status,provider_id,error,metadata)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [row.id,row.type,row.recipient,row.subject,row.status,
        row.providerId ?? null,row.error ?? null,JSON.stringify(row.metadata)])
      return
    }
    await db.insert(emailLogTable).values({
      id: row.id,
      type: row.type,
      recipient: row.recipient,
      subject: row.subject,
      status: row.status,
      providerId: row.providerId ?? null,
      error: row.error ?? null,
      metadata: row.metadata,
    })
  } catch (err) {
    // The send already happened (or failed) — a logging problem must not
    // surface as a send failure, but it must be visible.
    logger.error({ err, email: row }, 'email_log write failed')
  }
}
