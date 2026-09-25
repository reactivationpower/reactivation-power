import { randomUUID } from 'node:crypto'
import { ReplitConnectors } from '@replit/connectors-sdk'
import { db, emailLogTable } from '@workspace/db'
import { logger } from '@/lib/logger'
import { toPlainText } from './layout'
import { renderTemplate, type TemplateDataMap, type TemplateId } from './templates'

/**
 * Transactional sending through the Resend connector.
 *
 * sendEmail never throws: it returns { ok: false } and logs the failure, so
 * it is safe to call from server actions and webhook handlers where a mail
 * problem must not roll back the business operation. Every attempt — sent
 * or failed — is written to email_log; Resend's webhook later fills in
 * delivered / opened / clicked on the same row (see routes/webhooks-resend).
 */

export const DEFAULT_FROM = 'Reactivation Power <team@reactivationpower.com>'

export function fromAddress(): string {
  return process.env.RESEND_FROM?.trim() || DEFAULT_FROM
}

export interface SendResult {
  ok: boolean
  /** Our email_log row id. */
  logId: string
  /** Resend's email id when accepted. */
  providerId?: string
  error?: string
}

export interface SendOptions {
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
  const rendered = renderTemplate(type, data)
  const logId = randomUUID()
  const base = { id: logId, type, recipient, subject: rendered.subject, metadata: options.metadata ?? null }

  if (!EMAIL_RE.test(recipient)) {
    const error = 'Invalid recipient address'
    await writeLog({ ...base, status: 'failed', error })
    logger.error({ email: { type, recipient, logId } }, `email failed: ${error}`)
    return { ok: false, logId, error }
  }

  try {
    const response = await connectors.proxy('resend', '/emails', {
      method: 'POST',
      ...(options.idempotencyKey ? { headers: { 'Idempotency-Key': options.idempotencyKey } } : {}),
      body: {
        from: fromAddress(),
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
      const error = payload.message || `Resend responded ${response.status}`
      await writeLog({ ...base, status: 'failed', error })
      logger.error({ email: { type, recipient, logId, status: response.status } }, `email failed: ${error}`)
      return { ok: false, logId, error }
    }
    await writeLog({ ...base, status: 'sent', providerId: payload.id })
    logger.info({ email: { type, recipient, logId, providerId: payload.id } }, 'email sent')
    return { ok: true, logId, providerId: payload.id }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await writeLog({ ...base, status: 'failed', error })
    logger.error({ err, email: { type, recipient, logId } }, `email failed: ${error}`)
    return { ok: false, logId, error }
  }
}

async function writeLog(row: {
  id: string
  type: string
  recipient: string
  subject: string
  status: 'sent' | 'failed'
  providerId?: string
  error?: string
  metadata: Record<string, unknown> | null
}): Promise<void> {
  try {
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
