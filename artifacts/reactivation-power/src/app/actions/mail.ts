// Thin client stubs for the server actions in artifacts/api-server/src/actions/mail.ts
import { action } from '@/lib/api'

export interface TransactionalTemplatePreview {
  id: string
  name: string
  description: string
  subject: string
  previewText: string
  html: string
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

// Configured means secret presence, not verified provider delivery or inbox receipt.
export const listTransactionalTemplates = action<{ from: string; templates: TransactionalTemplatePreview[]; deliveryTrackingConfigured: boolean }>(
  'mail',
  'listTransactionalTemplates',
)
export const sendTestEmail = action<{ ok: boolean; error?: string; logId: string }>('mail', 'sendTestEmail')
export const listEmailLog = action<{ rows: EmailLogRow[]; total: number }>('mail', 'listEmailLog')
