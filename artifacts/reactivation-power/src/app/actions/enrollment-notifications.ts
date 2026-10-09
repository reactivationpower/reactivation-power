import { action } from '@/lib/api'

export type Milestone = 'opened' | 'signed' | 'primary_card' | 'backup_card' | 'completed'
export interface EnrollmentNotification {
  id: string
  agreementId: string
  customerName: string
  practiceName: string
  milestone: Milestone
  occurredAt: string
  read: boolean
  href: string
}
export interface NotificationPrefs { sound: boolean; desktop: boolean }
export interface NotificationList {
  items: EnrollmentNotification[]
  live: EnrollmentNotification[]
  cursor: string
  unread: number
  preferences: NotificationPrefs
  hasMore: boolean
}
export const listNotifications = action<NotificationList>('enrollment-notifications', 'listNotifications') as (q?: { after?: string; before?: string }) => Promise<NotificationList>
export const claimDelivery = action<{ claimed: boolean }>('enrollment-notifications', 'claimDelivery') as (id: string) => Promise<{ claimed: boolean }>
export const markRead = action<{ ok: true }>('enrollment-notifications', 'markRead') as (id?: string) => Promise<{ ok: true }>
export const savePreferences = action<{ ok: true }>('enrollment-notifications', 'savePreferences') as (p: Partial<NotificationPrefs>) => Promise<{ ok: true }>
