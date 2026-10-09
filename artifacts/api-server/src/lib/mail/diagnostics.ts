/** Never retain authentication payloads or free-form provider errors in diagnostics. */
export function isAuthenticationEmail(type: string): boolean {
  return ['portal_login_code', 'portal_password_setup', 'portal_welcome', 'admin_invite', 'affiliate_access'].includes(type)
}

export const DELIVERY_FAILURES = ['failed', 'bounced', 'suppressed', 'complained'] as const

export function deliveryFailureMessage(status: string): string | null {
  switch (status) {
    case 'bounced': return 'The recipient mailbox rejected this email.'
    case 'suppressed': return 'Resend blocked delivery because this recipient is suppressed.'
    case 'complained': return 'The recipient reported this email as spam.'
    case 'failed': return 'The email could not be sent or delivered.'
    default: return null
  }
}

export function safeEmailMetadata(type: string, metadata?: Record<string, unknown>): Record<string, unknown> | null {
  if (type === 'agreement_sent') {
    return Object.fromEntries(Object.entries(metadata ?? {}).filter(([key]) =>
      ['agreementId', 'customerId', 'resend', 'initialInvitation', 'test'].includes(key)))
  }
  if (!isAuthenticationEmail(type)) return metadata ?? null
  // Even callers accidentally passing template data must not persist a code,
  // password, or reset link. Only the non-sensitive sample marker is needed.
  return metadata?.test === true ? { test: true } : null
}
