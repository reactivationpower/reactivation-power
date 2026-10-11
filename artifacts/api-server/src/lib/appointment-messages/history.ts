import { pool } from '@workspace/db'
import { requireAdmin } from '../auth/admin-session'
import { toPlainText } from '../mail/layout'

export type AppointmentEmailStatus = 'accepted' | 'delivered' | 'failed' | 'uncertain' | 'sending' | 'not_sent'
type HistoryRow = {
  id: string; appointment_id: string; kind: string; state: string;
  snapshot: any; provider_id: string | null; email_log_id: string | null;
  claimed_at: Date | string | null; sent_at: Date | string | null; due_at: Date | string;
  email_status?: string | null; log_provider_id?: string | null;
  email_created_at?: Date | string | null; last_event?: string | null;
  delivered_at?: Date | string | null; opened_at?: Date | string | null; clicked_at?: Date | string | null;
}
const failures = new Set(['failed','bounced','suppressed','complained'])
const instant = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : null

/** No template rendering or current-contact substitution: history is the send's frozen evidence. */
export function appointmentEmailHistoryEntry(row: HistoryRow) {
  const snapshot = row.snapshot
  const deliveryFailure = failures.has(row.email_status ?? '') &&
    (row.state === 'failed' || row.log_provider_id || row.last_event?.startsWith('email.'))
  const accepted = !!row.log_provider_id || row.state === 'sent'
  const status: AppointmentEmailStatus = deliveryFailure ? 'failed' :
    row.email_status === 'delivered' || row.delivered_at ? 'delivered' :
    accepted ? 'accepted' : row.state === 'uncertain' ? 'uncertain' :
    row.state === 'failed' ? 'failed' : row.state === 'sending' ? 'sending' : 'not_sent'
  const html = typeof snapshot?.rendered?.html === 'string' ? snapshot.rendered.html : null
  return {
    id: row.id, source: 'appointment' as const, sourceId: row.id, appointmentId: row.appointment_id,
    channel: 'email' as const, direction: 'outbound' as const, kind: row.kind,
    subject: snapshot?.rendered?.subject ?? null, html, body: html === null ? null : toPlainText(html),
    recipient: snapshot?.recipient ?? null, from: snapshot?.from ?? null, replyTo: snapshot?.replyTo ?? null,
    authorName: snapshot?.copy?.host ?? null, contentAvailable: html !== null,
    status, dispatchState: row.state, providerStatus: row.email_status ?? null,
    providerId: row.provider_id ?? row.log_provider_id ?? null, emailLogId: row.email_log_id,
    attemptedAt: instant(row.claimed_at),
    sentAt: accepted ? instant(row.email_created_at ?? row.sent_at) : null,
    createdAt: instant(row.claimed_at ?? row.sent_at ?? row.due_at)!,
    deliveredAt: instant(row.delivered_at), openedAt: instant(row.opened_at), clickedAt: instant(row.clicked_at),
  }
}

/** Server-only authenticated helper. Not registered as a public RPC. */
export async function listAppointmentEmailHistory(leadId: string, limit = 200) {
  const admin = await requireAdmin()
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('History limit must be 1–200')
  const allowed = [leadId, admin.role === 'super_admin', admin.userId]
  const lead = await pool.query('SELECT id FROM sales_leads WHERE id=$1 AND ($2 OR assignee_id=$3)', allowed)
  if (!lead.rowCount) throw new Error('Lead not available to this salesperson')
  const result = await pool.query(`SELECT d.*,e.status AS email_status,e.provider_id AS log_provider_id,
      e.created_at AS email_created_at,e.last_event,e.delivered_at,e.opened_at,e.clicked_at
    FROM appointment_deliveries d JOIN appointment_messages a USING(appointment_id)
    JOIN sales_leads l ON l.id=a.lead_id LEFT JOIN email_log e ON e.id=d.email_log_id
    WHERE l.id=$1 AND ($2 OR l.assignee_id=$3) AND d.channel='email'
      AND (d.snapshot IS NOT NULL OR d.claimed_at IS NOT NULL)
    ORDER BY COALESCE(d.claimed_at,d.sent_at,d.due_at) DESC,d.id DESC LIMIT $4`, [...allowed,limit+1])
  return { messages: result.rows.slice(0,limit).map(appointmentEmailHistoryEntry), hasMore: result.rows.length > limit }
}
