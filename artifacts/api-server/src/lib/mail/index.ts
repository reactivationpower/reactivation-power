import { appOrigin } from '@/lib/app-origin'
import { sendEmail, type SendOptions, type SendResult } from './send'
import type {
  AccessPausedData,
  AccessRestoredData,
  AgreementSentData,
  AgreementSignedData,
  BillingLinkData,
  CancellationRequestedData,
  CancellationScheduledData,
  PaymentFailedBackupUsedData,
  PaymentFailedData,
  PaymentReceivedData,
  SubscriptionCancelledData,
} from './templates'

export { sendEmail, fromAddress, DEFAULT_FROM } from './send'
export type { SendResult, SendOptions, EmailAttachment } from './send'
export * from './templates'

/**
 * Typed entry points for the flows that send transactional email. They
 * build the app links themselves so callers only pass business data, and
 * they never throw (see sendEmail).
 */

/** Login link for the identity-based portal sign-in: email is prefilled. */
export function portalLoginUrl(email: string): string {
  return `${appOrigin()}/login?email=${encodeURIComponent(email.trim().toLowerCase())}`
}

export function sendPortalWelcomeEmail(input: {
  participantId: string
  firstName: string
  email: string
  role: 'owner' | 'staff'
  ownerName?: string | null
  source: 'payment' | 'admin' | 'portal'
}): Promise<SendResult> {
  return sendEmail(
    'portal_welcome',
    input.email,
    {
      firstName: input.firstName || 'there',
      email: input.email.trim().toLowerCase(),
      loginUrl: portalLoginUrl(input.email),
      role: input.role,
      ownerName: input.ownerName ?? null,
    },
    { metadata: { participantId: input.participantId, source: input.source } },
  )
}

/**
 * Customer billing page (card updates, paying an open invoice). Same link
 * the login-page billing notice uses; the email is prefilled.
 */
export function billingPageUrl(email?: string | null): string {
  const base = `${appOrigin()}/billing`
  return email ? `${base}?email=${encodeURIComponent(email.trim().toLowerCase())}` : base
}
export function sendPaymentReceivedEmail(
  to: string,
  data: Omit<PaymentReceivedData, 'portalUrl'> & { portalUrl?: string },
  options?: SendOptions,
): Promise<SendResult> {
  return sendEmail('payment_received', to, { ...data, portalUrl: data.portalUrl ?? `${appOrigin()}/portal` }, options)
}

export function sendPaymentFailedEmail(
  to: string,
  data: Omit<PaymentFailedData, 'updatePaymentUrl'> & { updatePaymentUrl?: string },
  options?: SendOptions,
): Promise<SendResult> {
  return sendEmail(
    'payment_failed',
    to,
    { ...data, updatePaymentUrl: data.updatePaymentUrl ?? billingPageUrl(to) },
    options,
  )
}

export function sendSubscriptionCancelledEmail(
  to: string,
  data: Omit<SubscriptionCancelledData, 'reactivateUrl'> & { reactivateUrl?: string },
  options?: SendOptions,
): Promise<SendResult> {
  return sendEmail(
    'subscription_cancelled',
    to,
    { ...data, reactivateUrl: data.reactivateUrl ?? billingPageUrl(to) },
    options,
  )
}

export function sendAgreementSentEmail(
  to: string,
  data: AgreementSentData,
  options?: SendOptions,
): Promise<SendResult> {
  return sendEmail('agreement_sent', to, data, options)
}

export function sendBillingLinkEmail(to: string, data: BillingLinkData, options?: SendOptions): Promise<SendResult> {
  return sendEmail('billing_link', to, data, options)
}

export function sendAgreementSignedEmail(
  to: string,
  data: AgreementSignedData,
  options?: SendOptions,
): Promise<SendResult> {
  return sendEmail('agreement_signed', to, data, options)
}

export function sendCancellationScheduledEmail(
  to: string,
  data: CancellationScheduledData,
  options?: SendOptions,
): Promise<SendResult> {
  return sendEmail('cancellation_scheduled', to, data, options)
}

export function sendCancellationRequestedEmail(
  to: string,
  data: CancellationRequestedData,
  options?: SendOptions,
): Promise<SendResult> {
  return sendEmail('cancellation_requested', to, data, options)
}

export function sendAccessRestoredEmail(
  to: string,
  data: Omit<AccessRestoredData, 'portalUrl' | 'billingUrl'> & { portalUrl?: string; billingUrl?: string },
  options?: SendOptions,
): Promise<SendResult> {
  return sendEmail(
    'access_restored',
    to,
    { ...data, portalUrl: data.portalUrl ?? `${appOrigin()}/portal`, billingUrl: data.billingUrl ?? billingPageUrl(to) },
    options,
  )
}

export function sendAccessPausedEmail(
  to: string,
  data: Omit<AccessPausedData, 'updatePaymentUrl'> & { updatePaymentUrl?: string },
  options?: SendOptions,
): Promise<SendResult> {
  return sendEmail('access_paused', to, { ...data, updatePaymentUrl: data.updatePaymentUrl ?? billingPageUrl(to) }, options)
}

export function sendPaymentFailedBackupUsedEmail(
  to: string,
  data: Omit<PaymentFailedBackupUsedData, 'updatePaymentUrl'> & { updatePaymentUrl?: string },
  options?: SendOptions,
): Promise<SendResult> {
  return sendEmail(
    'payment_failed_backup_used',
    to,
    { ...data, updatePaymentUrl: data.updatePaymentUrl ?? billingPageUrl(to) },
    options,
  )
}
