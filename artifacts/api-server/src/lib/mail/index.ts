import { appOrigin } from '@/lib/app-origin'
import { sendEmail, type SendOptions, type SendResult } from './send'
import type {
  AgreementSentData,
  PaymentFailedData,
  PaymentReceivedData,
  SubscriptionCancelledData,
} from './templates'

export { sendEmail, fromAddress, DEFAULT_FROM } from './send'
export type { SendResult, SendOptions } from './send'
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
    { ...data, updatePaymentUrl: data.updatePaymentUrl ?? `${appOrigin()}/portal/billing` },
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
    { ...data, reactivateUrl: data.reactivateUrl ?? `${appOrigin()}/portal/billing` },
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
