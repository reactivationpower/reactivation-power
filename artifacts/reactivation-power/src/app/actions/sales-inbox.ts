import { action as untypedAction } from '@/lib/api'
function action<F extends (...args: any[]) => Promise<any>>(module: string, name: string): F {
  return untypedAction<Awaited<ReturnType<F>>>(module, name) as F
}
export type InboxLead = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; practice_name: string | null; assignee_id: string | null; last_activity_at: string | null }
export type InboxChannel = 'email' | 'sms' | 'call'
export type InboxMessage = { id: string; channel: InboxChannel; direction: 'inbound' | 'outbound' | 'event'; body: string | null; subject?: string; status: string | null; created_at: string; author_name?: string }
export type InboxConversation = { lead: { id: string; first_name: string; last_name: string; email: string | null; phone: string | null }; messages: InboxMessage[]; readiness: { email: boolean; sms: boolean; reasons: string[] }; contactUrl: string | null }
export type SendState = 'sent' | 'failed' | 'uncertain' | 'sending'
export type InboxSettings = { superAdmin: boolean; settings: { email_domain: string; sms_ready: boolean; email_ready: boolean }; receivingAccess: boolean; webhookConfigured: boolean; receivingIssues?: number }
export const listInbox = action<(input: { query?: string; page?: number }) => Promise<{ leads: InboxLead[]; total: number }>>('sales-inbox', 'listInbox')
export const getConversation = action<(leadId: string) => Promise<InboxConversation>>('sales-inbox', 'getConversation')
export const refreshConversation = action<(leadId: string) => Promise<void>>('sales-inbox', 'refreshConversation')
export const sendMessage = action<(input: { leadId: string; channel: 'email' | 'sms'; subject?: string; body: string; requestId: string }) => Promise<{ state: SendState; error?: string }>>('sales-inbox', 'sendMessage')
export const getInboxSettings = action<() => Promise<InboxSettings>>('sales-inbox', 'getInboxSettings')
export const saveInboxSettings = action<(input: { emailDomain: string; smsReady: boolean; emailReady: boolean }) => Promise<void>>('sales-inbox', 'saveInboxSettings')
