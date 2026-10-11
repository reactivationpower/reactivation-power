import { action as untypedAction } from '@/lib/api'
function action<F extends (...args: any[]) => Promise<any>>(module: string, name: string): F {
  return untypedAction<Awaited<ReturnType<F>>>(module, name) as F
}
export type InboxLead = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; practice_name: string | null; assignee_id: string | null; last_activity_at: string | null }
export type InboxChannel = 'email' | 'sms' | 'call'
export type EmailSnapshot = { html: string | null; contentAvailable: boolean; recipient: string | null; from: string | null; replyTo: string | null; dispatchState: string; providerStatus: string | null; sentAt: string | null; deliveredAt: string | null }
export type CallMedia = { detailsUrl: string }
export type InboxMessage = {
  id: string; channel: InboxChannel; direction: 'inbound' | 'outbound' | 'event'; body: string | null; subject?: string | null; status: string | null; created_at: string; author_name?: string | null
  canonical_status?: string | null; raw_status?: string | null; source?: string | null; source_id?: string | null; provider_id?: string | null
  emailSnapshot?: EmailSnapshot | null; callMedia?: CallMedia | null
}
export type InboxConversation = { lead: { id: string; first_name: string; last_name: string; email: string | null; phone: string | null }; messages: InboxMessage[]; readiness: { email: boolean; sms: boolean; reasons: string[] }; contactUrl: string | null; historyTruncated?: boolean; synchronization?: Exclude<RefreshResult, void> }
export type SendState = 'sent' | 'failed' | 'uncertain' | 'sending'
export type RefreshResult = { state: 'current' | 'throttled' | 'unavailable'; reason?: string; minimumIntervalSeconds?: number; retryAfterSeconds?: number } | void
export type InboxSettings = { superAdmin: boolean; settings: { email_domain: string; sms_ready: boolean; email_ready: boolean }; replyTo: string }
export const listInbox = action<(input: { query?: string; page?: number }) => Promise<{ leads: InboxLead[]; total: number }>>('sales-inbox', 'listInbox')
export const getConversation = action<(leadId: string) => Promise<InboxConversation>>('sales-inbox', 'getConversation')
export const refreshConversation = action<(leadId: string) => Promise<RefreshResult>>('sales-inbox', 'refreshConversation')
export const sendMessage = action<(input: { leadId: string; channel: 'sms'; body: string; requestId: string }) => Promise<{ state: SendState; canonical_state?: string; error?: string }>>('sales-inbox', 'sendMessage')
export const getInboxSettings = action<() => Promise<InboxSettings>>('sales-inbox', 'getInboxSettings')
export const saveInboxSettings = action<(input: { smsReady: boolean }) => Promise<void>>('sales-inbox', 'saveInboxSettings')
