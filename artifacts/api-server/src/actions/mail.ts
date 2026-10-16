import { desc, eq, sql } from 'drizzle-orm'
import { db, emailLogTable, type EmailLog } from '@workspace/db'
import { requireAdmin } from '@/lib/auth/admin-session'
import { fromAddress } from '@/lib/mail/send'
import { sendEmail } from '@/lib/mail/send'
import { isTemplateId, listTemplates, type TemplateId } from '@/lib/mail/templates'
import { deliveryFailureMessage, isAuthenticationEmail } from '@/lib/mail/diagnostics'

/**
 * Super-admin tooling around transactional email: previews for the admin
 * emails page, a test send, and the delivery log fed by the Resend webhook.
 */

export interface TransactionalTemplatePreview {
  id: TemplateId
  name: string
  description: string
  subject: string
  previewText: string
  html: string
}

export async function listTransactionalTemplates(): Promise<{
  from: string
  templates: TransactionalTemplatePreview[]
  /** Signing-secret presence only; not proof of provider events or inbox receipt. */
  deliveryTrackingConfigured: boolean
}> {
  await requireAdmin('super_admin')
  return {
    from: fromAddress(),
    deliveryTrackingConfigured: !!process.env.RESEND_WEBHOOK_SECRET?.trim(),
    templates: listTemplates().map((t) => {
      // Each template renders its own sample; the union makes the call site
      // untyped, so go through the generic entry point per id.
      const rendered = t.render(t.sample as never)
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        subject: rendered.subject,
        previewText: rendered.previewText,
        html: rendered.html,
      }
    }),
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Send a template with its sample data to an inbox the admin chooses. */
export async function sendTestEmail(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; logId: string }> {
  const actor = await requireAdmin('super_admin')
  const id = String(formData.get('template') ?? '')
  const to = String(formData.get('to') ?? actor.email).trim().toLowerCase()
  if (!isTemplateId(id)) throw new Error('Unknown template.')
  if (!EMAIL_RE.test(to)) throw new Error('Please enter a valid email address.')
  const template = listTemplates().find((t) => t.id === id)!
  const result = await sendEmail(id, to, template.sample as never, {
    metadata: { test: true, sentBy: actor.userId },
  })
  return { ok: result.ok, error: result.error, logId: result.logId }
}

export interface EmailLogRow {
  id: string
  type: string
  recipient: string
  subject: string
  status: string
  error: string | null
  createdAt: string
  deliveredAt: string | null
  openedAt: string | null
  clickedAt: string | null
  lastClickedUrl: string | null
  lastEvent: string | null
  lastEventAt: string | null
  test: boolean
}

function toRow(r: EmailLog): EmailLogRow {
  return {
    id: r.id,
    type: r.type,
    recipient: r.recipient,
    subject: r.subject,
    status: r.status,
    error: deliveryFailureMessage(r.status) ?? (isAuthenticationEmail(r.type) ? null : r.error),
    createdAt: r.createdAt.toISOString(),
    deliveredAt: r.deliveredAt?.toISOString() ?? null,
    openedAt: r.openedAt?.toISOString() ?? null,
    clickedAt: r.clickedAt?.toISOString() ?? null,
    lastClickedUrl: null,
    lastEvent: r.lastEvent,
    lastEventAt: r.lastEventAt?.toISOString() ?? null,
    test: r.metadata?.test === true,
  }
}

/** Most recent sends first, with delivery / open / click state. */
export async function listEmailLog(input?: { limit?: number; type?: string }): Promise<{
  rows: EmailLogRow[]
  total: number
}> {
  await requireAdmin('super_admin')
  const limit = Math.min(200, Math.max(1, Number(input?.limit ?? 50) || 50))
  const where = input?.type && isTemplateId(input.type) ? eq(emailLogTable.type, input.type) : undefined
  const [rows, [{ count }]] = await Promise.all([
    db.select().from(emailLogTable).where(where).orderBy(desc(emailLogTable.createdAt)).limit(limit),
    db.select({ count: sql<number>`count(*)::int` }).from(emailLogTable).where(where),
  ])
  return { rows: rows.map(toRow), total: count }
}
