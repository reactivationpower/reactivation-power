import {
  BRAND,
  button,
  details,
  esc,
  fallbackLink,
  h1,
  layout,
  p,
  panel,
  signoff,
  small,
} from './layout'

/**
 * Transactional templates. Each one is a pure function of its data so the
 * admin previewer, the test-send action and the real send paths all render
 * exactly the same HTML. Add a template by extending TEMPLATES; the id is
 * what gets logged as the email `type`.
 */

export interface RenderedEmail {
  subject: string
  previewText: string
  html: string
}

export interface PortalWelcomeData {
  firstName: string
  email: string
  loginUrl: string
  role: 'owner' | 'staff'
  /** For staff accounts: the owner who added them. */
  ownerName?: string | null
}

export interface AdminInviteData {
  name: string | null
  role: 'super_admin' | 'sales_rep'
  invitedByName: string | null
  inviteUrl: string
}

export interface PaymentReceivedData {
  name: string
  amountCents: number
  description: string
  paidAt: string
  /** Stripe receipt / invoice URL when available. */
  receiptUrl?: string | null
  cardBrand?: string | null
  cardLast4?: string | null
  portalUrl: string
}

export interface PaymentFailedData {
  name: string
  amountCents: number
  description: string
  reason?: string | null
  /** When true the account has been locked pending payment. */
  accessSuspended: boolean
  /** ISO date of the next automatic retry, if any. */
  nextRetryAt?: string | null
  updatePaymentUrl: string
}

export interface SubscriptionCancelledData {
  name: string
  description: string
  /** ISO date access ends (may be in the past for immediate cancellations). */
  accessEndsAt: string
  reactivateUrl: string
}

export interface AgreementSentData {
  name: string
  agreementTitle: string
  termMonths: number
  monthlyCents?: number | null
  setupFeeCents?: number | null
  signUrl: string
  expiresAt?: string | null
  /** Set when the link is re-sent or the agreement was edited. */
  resend?: boolean
}

export interface BillingLinkData {
  name: string
  /** Why the link was sent: an admin asked for a new card, or the customer requested access to their billing page. */
  purpose: 'update_card' | 'billing'
  billingUrl: string
  expiresAt: string
  /** Set when portal access is currently paused for non-payment. */
  accessPaused: boolean
  outstandingCents?: number | null
  sentByName?: string | null
}

export interface AgreementSignedData {
  /** Recipient's first name (customer) or "Team" for admin copies. */
  name: string
  signerName: string
  businessName: string
  agreementTitle: string
  termMonths: number
  monthlyCents: number
  setupFeeCents: number
  signedAt: string
  agreementUrl: string
  /** True for the copy sent to admins. */
  adminCopy: boolean
}

export interface CardSummary {
  brand?: string | null
  last4?: string | null
}

export interface CronFailedData {
  /** Human label of the job, e.g. "Daily billing retry". */
  jobLabel: string
  /** Job id as stored in cron_runs, e.g. "billing-retry". */
  job: string
  trigger: 'scheduler' | 'http' | 'admin'
  startedAt: string
  error: string
  /** Admin page where the run log and "Run now" button live. */
  dashboardUrl: string
}
export interface TemplateDataMap {
  new_leads: { count: number; portalUrl: string }
  portal_welcome: PortalWelcomeData
  cron_failed: CronFailedData
  admin_invite: AdminInviteData
  payment_received: PaymentReceivedData
  payment_failed: PaymentFailedData
  payment_failed_backup_used: PaymentFailedBackupUsedData
  access_paused: AccessPausedData
  access_restored: AccessRestoredData
  subscription_cancelled: SubscriptionCancelledData
  agreement_sent: AgreementSentData
  agreement_signed: AgreementSignedData
  billing_link: BillingLinkData
  cancellation_requested: CancellationRequestedData
  cancellation_scheduled: CancellationScheduledData
}

export type TemplateId = keyof TemplateDataMap

export interface TemplateDefinition<K extends TemplateId> {
  id: K
  name: string
  description: string
  /** Realistic data for the admin previewer and test sends. */
  sample: TemplateDataMap[K]
  render: (data: TemplateDataMap[K]) => RenderedEmail
}

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })

const ROLE_LABEL: Record<AdminInviteData['role'], string> = {
  super_admin: 'Super Admin',
  sales_rep: 'Sales Rep',
}

const SUPPORT_NOTE = `Questions? Reply to this email and we'll help.`

const HONORIFICS = new Set(['dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss', 'prof', 'prof.'])
const portalWelcome: TemplateDefinition<'portal_welcome'> = {
  id: 'portal_welcome',
  name: 'Portal account created',
  description:
    'Sent when a portal account is created — after a payment provisions accounts, or when an admin or practice owner adds someone. Carries the login link.',
  sample: {
    firstName: 'Sarah',
    email: 'sarah@brightsmilechiro.com',
    loginUrl: `${BRAND.siteUrl}/login?email=sarah%40brightsmilechiro.com`,
    role: 'staff',
    ownerName: 'Dr. Michael Chen',
  },
  render: (d) => {
    const who =
      d.role === 'staff' && d.ownerName
        ? `${esc(d.ownerName)} has added you to the ${BRAND.name} portal for your practice.`
        : `Your ${BRAND.name} portal account is ready.`
    return {
      subject: `Your ${BRAND.name} login`,
      previewText: 'Your portal account is ready — here is how to sign in.',
      html: layout(
        [
          h1(`Welcome to ${BRAND.name}, ${esc(d.firstName)}`),
          p(who),
          p(
            'Inside you\'ll find your training videos, the call scripts, and the reactivation dialer your team uses to bring past patients back in.',
          ),
          panel([
            `<strong>Signing in is simple:</strong> enter your first name, last name and this email address — no password to remember.`,
            `Email on file: <strong>${esc(d.email)}</strong>`,
          ]),
          button('Sign in to the portal', d.loginUrl),
          fallbackLink(d.loginUrl),
          small(
            'Start with the Getting Started course — it walks through the dialer and the first calls your front desk should make this week.',
          ),
          signoff('Glad to have you on board,'),
        ],
        { previewText: 'Your portal account is ready — here is how to sign in.', footerNote: SUPPORT_NOTE },
      ),
    }
  },
}

const adminInvite: TemplateDefinition<'admin_invite'> = {
  id: 'admin_invite',
  name: 'Admin invite',
  description:
    'Sent when a super admin invites a team member from Admin → Team. The one-time link opens the set-password screen.',
  sample: {
    name: 'Jordan Lee',
    role: 'sales_rep',
    invitedByName: 'Dr. Strotheide',
    inviteUrl: `${BRAND.siteUrl}/admin-login?token_hash=sample-token&type=magiclink`,
  },
  render: (d) => ({
    subject: `You've been invited to the ${BRAND.name} admin`,
    previewText: `Set your password to join as a ${ROLE_LABEL[d.role]}.`,
    html: layout(
      [
        h1(`You're invited to the ${BRAND.name} admin`),
        p(`Hi ${esc(greetingName(d.name))},`),
        p(
          `${d.invitedByName ? esc(d.invitedByName) : 'A super admin'} has invited you to join the ${BRAND.name} admin as a <strong>${ROLE_LABEL[d.role]}</strong>. Set a password and you're in.`,
        ),
        button('Set your password', d.inviteUrl),
        fallbackLink(d.inviteUrl),
        panel(
          [
            'This link is for you only and works once. If it has expired, ask the person who invited you to send a fresh one from Admin &rarr; Team.',
          ],
          '#90a1b9',
        ),
        small(`If you weren't expecting this invitation you can ignore this email — no account is activated until a password is set.`),
        signoff(),
      ],
      { previewText: `Set your password to join as a ${ROLE_LABEL[d.role]}.`, footerNote: SUPPORT_NOTE },
    ),
  }),
}

const paymentReceived: TemplateDefinition<'payment_received'> = {
  id: 'payment_received',
  name: 'Payment received (receipt)',
  description: 'Receipt sent when a payment link is paid or a subscription payment succeeds.',
  sample: {
    name: 'Dr. Michael Chen',
    amountCents: 149700,
    description: 'Reactivation Power Access',
    paidAt: new Date().toISOString(),
    receiptUrl: 'https://pay.stripe.com/receipts/sample',
    cardBrand: 'Visa',
    cardLast4: '4242',
    portalUrl: `${BRAND.siteUrl}/portal`,
  },
  render: (d) => {
    const rows: Array<[string, string]> = [
      ['Description', esc(d.description)],
      ['Amount paid', money(d.amountCents)],
      ['Date', longDate(d.paidAt)],
    ]
    if (d.cardLast4) rows.push(['Payment method', `${esc(d.cardBrand ?? 'Card')} ending in ${esc(d.cardLast4)}`])
    return {
      subject: `Receipt: ${money(d.amountCents)} payment to ${BRAND.name}`,
      previewText: `We received your payment of ${money(d.amountCents)}. Thank you.`,
      html: layout(
        [
          h1('Thank you — your payment went through'),
          p(`Hi ${esc(greetingName(d.name))},`),
          p(`This is your receipt for the payment below. Keep it for your records.`),
          details(rows),
          button('Open the portal', d.portalUrl),
          ...(d.receiptUrl
            ? [small(`A detailed receipt from our payment processor is available <a href="${esc(d.receiptUrl)}" style="color:${BRAND.teal};">here</a>.`)]
            : []),
          signoff(),
        ],
        { previewText: `We received your payment of ${money(d.amountCents)}. Thank you.`, footerNote: SUPPORT_NOTE },
      ),
    }
  },
}

const paymentFailed: TemplateDefinition<'payment_failed'> = {
  id: 'payment_failed',
  name: 'Payment failed / access suspended',
  description:
    'Sent when a subscription charge fails. Says whether access is still on (retry coming) or has been suspended until the card is updated.',
  sample: {
    name: 'Dr. Michael Chen',
    amountCents: 49700,
    description: 'Reactivation Power — monthly',
    reason: 'Your card was declined.',
    accessSuspended: true,
    nextRetryAt: null,
    updatePaymentUrl: `${BRAND.siteUrl}/billing`,
  },
  render: (d) => {
    const headline = d.accessSuspended
      ? 'Your access has been paused — update your card to restore it'
      : `We couldn't process your payment`
    const status = d.accessSuspended
      ? `<strong>Your team's portal access is paused</strong> until the payment goes through. Everything is saved — your contacts, call history and progress will be right where you left them.`
      : d.nextRetryAt
        ? `Your access is still active. We'll automatically try the card again on <strong>${longDate(d.nextRetryAt)}</strong> — or update it now to settle this right away.`
        : `Your access is still active for now. Please update your card so the next attempt succeeds.`
    return {
      subject: d.accessSuspended
        ? `Action needed: your ${BRAND.name} access is paused`
        : `Action needed: payment failed for ${BRAND.name}`,
      previewText: `We couldn't charge ${money(d.amountCents)} for ${d.description}.`,
      html: layout(
        [
          h1(headline),
          p(`Hi ${esc(greetingName(d.name))},`),
          p(
            `We tried to charge <strong>${money(d.amountCents)}</strong> for <strong>${esc(d.description)}</strong> and the payment didn't go through${d.reason ? ` (${esc(d.reason.replace(/\.$/, ''))})` : ''}.`,
          ),
          panel([status], d.accessSuspended ? '#dc2626' : '#f59e0b'),
          button('Update payment method', d.updatePaymentUrl),
          fallbackLink(d.updatePaymentUrl),
          small(
            'Common causes: an expired card, a new card number after a replacement, or a bank limit on the charge. Updating the card usually fixes it in under a minute.',
          ),
          signoff(),
        ],
        { previewText: `We couldn't charge ${money(d.amountCents)} for ${d.description}.`, footerNote: SUPPORT_NOTE },
      ),
    }
  },
}

const cardLabel = (card: CardSummary | null | undefined, fallback = 'your card') => {
  if (!card?.last4) return fallback
  const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : 'Card'
  return `${esc(brand)} ending in ${esc(card.last4)}`
}
const subscriptionCancelled: TemplateDefinition<'subscription_cancelled'> = {
  id: 'subscription_cancelled',
  name: 'Subscription cancelled',
  description: 'Confirms a cancellation and states when portal access ends.',
  sample: {
    name: 'Dr. Michael Chen',
    description: 'Reactivation Power — monthly',
    accessEndsAt: new Date(Date.now() + 21 * 86400000).toISOString(),
    reactivateUrl: `${BRAND.siteUrl}/billing`,
  },
  render: (d) => {
    const ended = new Date(d.accessEndsAt).getTime() <= Date.now()
    return {
      subject: `Your ${BRAND.name} subscription has been cancelled`,
      previewText: ended
        ? 'Your subscription is cancelled and access has ended.'
        : `Your subscription is cancelled. Access continues until ${longDate(d.accessEndsAt)}.`,
      html: layout(
        [
          h1('Your subscription has been cancelled'),
          p(`Hi ${esc(greetingName(d.name))},`),
          p(`We've cancelled <strong>${esc(d.description)}</strong> as requested. You won't be charged again.`),
          panel([
            ended
              ? `<strong>Portal access has ended.</strong> Your data is kept on file so you can pick up where you left off if you come back.`
              : `<strong>Access continues until ${longDate(d.accessEndsAt)}.</strong> Your team can keep using the portal and the dialer until then.`,
          ]),
          p(`Changed your mind? You can reactivate at any time and everything — contacts, scripts, progress — will still be there.`),
          button('Reactivate my subscription', d.reactivateUrl),
          small(`If you didn't request this cancellation, reply to this email right away.`),
          signoff('Thank you for working with us,'),
        ],
        {
          previewText: ended
            ? 'Your subscription is cancelled and access has ended.'
            : `Your subscription is cancelled. Access continues until ${longDate(d.accessEndsAt)}.`,
          footerNote: SUPPORT_NOTE,
        },
      ),
    }
  },
}

const agreementSent: TemplateDefinition<'agreement_sent'> = {
  id: 'agreement_sent',
  name: 'Agreement sent for signature',
  description: 'Delivers the service agreement with a link to review and sign it.',
  sample: {
    name: 'Dr. Michael Chen',
    agreementTitle: 'Reactivation Power 12-Month Service Agreement',
    termMonths: 12,
    signUrl: `${BRAND.siteUrl}/agreements/sample-token`,
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  },
  render: (d) => {
    const rows: Array<[string, string]> = [['Term', `${d.termMonths} months`]]
    if (d.monthlyCents != null) rows.push(['Monthly amount', money(d.monthlyCents)])
    if (d.setupFeeCents != null) rows.push(['Setup fee', d.setupFeeCents > 0 ? money(d.setupFeeCents) : 'Waived'])
    const subject = d.resend
      ? `Reminder — please review and sign: ${d.agreementTitle}`
      : `Please review and sign: ${d.agreementTitle}`
    const preview = `Your ${d.termMonths}-month service agreement is ready for signature.`
    return {
      subject,
      previewText: preview,
      html: layout(
        [
          h1(d.resend ? 'Your service agreement is still waiting for your signature' : 'Your service agreement is ready to sign'),
          p(`Hi ${esc(greetingName(d.name))},`),
          p(
            `Your <strong>${esc(d.agreementTitle)}</strong> is ready on the link below. It covers the ${d.termMonths}-month term, what's included, billing, and how either side can end the agreement. Please read it through, initial each highlighted section and sign electronically — it takes about two minutes. You can do it on your phone or computer.`,
          ),
          details(rows),
          button('Review and sign the agreement', d.signUrl),
          fallbackLink(d.signUrl),
          panel([
            d.expiresAt
              ? `This signing link expires on <strong>${longDate(d.expiresAt)}</strong>. Need more time or have questions about a clause? Just reply to this email.`
              : `Have questions about a clause? Just reply to this email before you sign.`,
          ]),
          small(`Once you have signed and your enrollment is complete, we'll email you a signed copy with the certificate of completion.`),
          signoff(),
        ],
        { previewText: preview, footerNote: SUPPORT_NOTE },
      ),
    }
  },
}

const billingLink: TemplateDefinition<'billing_link'> = {
  id: 'billing_link',
  name: 'Billing page link / update your card',
  description:
    'A secure, expiring link to the customer billing page. Sent by an admin asking for a new card, or when the customer requests it from the login notice while access is paused.',
  sample: {
    name: 'Dr. Michael Chen',
    purpose: 'update_card',
    billingUrl: `${BRAND.siteUrl}/billing/sample-token`,
    expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
    accessPaused: true,
    outstandingCents: 49700,
    sentByName: 'Sarah from Reactivation Power',
  },
  render: (d) => {
    const updateCard = d.purpose === 'update_card'
    const subject = d.accessPaused
      ? 'Update your card to restore your Reactivation Power access'
      : updateCard
        ? 'Please add a new card for your Reactivation Power subscription'
        : 'Your Reactivation Power billing page'
    const intro = updateCard
      ? `${d.sentByName ? `${esc(d.sentByName)} has` : 'We have'} sent you a secure link to add a new card to your account. The card you enter becomes your primary card; your current cards stay on file.`
      : `Here is the secure link to your billing page you asked for. From there you can see your balance, pay it, and add or update a card.`
    return {
      subject,
      previewText: d.accessPaused ? 'Pay your balance or add a new card to restore access.' : 'Manage your cards and balance securely.',
      html: layout(
        [
          h1(d.accessPaused ? 'Restore your access' : updateCard ? 'Add a new card' : 'Your billing page'),
          p(`Hi ${esc(d.name.split(' ')[0])},`),
          p(intro),
          ...(d.accessPaused
            ? [
                panel([
                  `<strong>Your team's portal access is paused</strong> because a payment did not go through.${
                    d.outstandingCents ? ` The outstanding balance is <strong>${money(d.outstandingCents)}</strong>.` : ''
                  } Pay it or add a card that works and access comes back right away.`,
                ]),
              ]
            : []),
          button(d.accessPaused ? 'Pay now or update my card' : updateCard ? 'Add my new card' : 'Open my billing page', d.billingUrl),
          fallbackLink(d.billingUrl),
          small(`This link is personal to you and expires on ${longDate(d.expiresAt)}. If you did not expect it, you can ignore this email — nothing changes until a card is entered.`),
          signoff(),
        ],
        { previewText: d.accessPaused ? 'Pay your balance or add a new card to restore access.' : 'Manage your cards and balance securely.', footerNote: SUPPORT_NOTE },
      ),
    }
  },
}

const agreementSigned: TemplateDefinition<'agreement_signed'> = {
  id: 'agreement_signed',
  name: 'Agreement signed (signed copy)',
  description: 'Sent to the customer and to admins once the agreement is signed, with the PDF attached and a link to the agreement page.',
  sample: {
    name: 'Dr. Michael Chen',
    signerName: 'Dr. Michael Chen',
    businessName: 'Chen Family Dental',
    agreementTitle: 'Reactivation Power 12-Month Service Agreement',
    termMonths: 12,
    monthlyCents: 47500,
    setupFeeCents: 47500,
    signedAt: new Date().toISOString(),
    agreementUrl: `${BRAND.siteUrl}/agreements/sample-token`,
    adminCopy: false,
  },
  render: (d) => {
    const rows: Array<[string, string]> = [
      ['Business', esc(d.businessName)],
      ['Signed by', esc(d.signerName)],
      ['Signed on', longDate(d.signedAt)],
      ['Term', `${d.termMonths} months`],
      ['Monthly amount', money(d.monthlyCents)],
      ['Setup fee', d.setupFeeCents > 0 ? money(d.setupFeeCents) : 'Waived'],
    ]
    const preview = d.adminCopy
      ? `${d.signerName} (${d.businessName}) signed the ${d.termMonths}-month service agreement.`
      : `Your signed ${d.termMonths}-month service agreement and certificate of completion.`
    return {
      subject: d.adminCopy
        ? `Signed: ${d.businessName} — ${d.agreementTitle}`
        : `Your signed copy: ${d.agreementTitle}`,
      previewText: preview,
      html: layout(
        [
          h1(d.adminCopy ? `${esc(d.businessName)} signed their agreement` : 'Your agreement is signed'),
          p(`Hi ${esc(greetingName(d.name))},`),
          p(
            d.adminCopy
              ? `<strong>${esc(d.signerName)}</strong> has signed the <strong>${esc(d.agreementTitle)}</strong> for ${esc(d.businessName)}. The signed agreement and its certificate of completion are attached and available at the link below.`
              : `Thank you — your <strong>${esc(d.agreementTitle)}</strong> is signed. Your signed copy, including the certificate of completion, is attached to this email and always available at the link below.`,
          ),
          details(rows),
          button(d.adminCopy ? 'Open the agreement' : 'View your signed agreement', d.agreementUrl),
          fallbackLink(d.agreementUrl),
          small(`The certificate of completion records the date, time and device used for each step of the signature.`),
          signoff(),
        ],
        { previewText: preview, footerNote: SUPPORT_NOTE },
      ),
    }
  },
}

const cronFailed: TemplateDefinition<'cron_failed'> = {
  id: 'cron_failed',
  name: 'Scheduled job failed (admin alert)',
  description:
    'Sent to the super admin when a scheduled job (daily billing retry, nightly demo reset) throws. Card declines are not failures — only the job itself breaking triggers this.',
  sample: {
    jobLabel: 'Daily billing retry',
    job: 'billing-retry',
    trigger: 'scheduler',
    startedAt: new Date().toISOString(),
    error: 'StripeConnectionError: An error occurred with our connection to Stripe.',
    dashboardUrl: `${BRAND.siteUrl}/admin/payments`,
  },
  render: (d) => {
    const when = new Date(d.startedAt).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    })
    const preview = `${d.jobLabel} did not finish: ${d.error}`
    return {
      subject: `[Action needed] ${d.jobLabel} failed`,
      previewText: preview,
      html: layout(
        [
          h1(`${esc(d.jobLabel)} failed`),
          p(
            `The <strong>${esc(d.jobLabel)}</strong> job (<code>${esc(d.job)}</code>) started at ${esc(when)} and stopped with an error. Nothing was retried past the point of failure; the next scheduled run will try again.`,
          ),
          panel([`<strong>Error:</strong> ${esc(d.error)}`], '#ef4444'),
          details([
            ['Job', d.job],
            ['Triggered by', d.trigger],
            ['Started', when],
          ]),
          button('Open the run log', d.dashboardUrl),
          fallbackLink(d.dashboardUrl),
          small('You can run the job again right away from the Scheduled jobs card on that page.'),
          signoff(),
        ],
        { previewText: preview },
      ),
    }
  },
}


export interface CancellationScheduledData {
  name: string
  /** ISO date the subscription (and portal access) ends. */
  cancelAt: string
  remainingPayments: number
  remainingCents: number
  monthlyCents: number
  /** ISO date of the next scheduled charge, if any. */
  nextPaymentAt: string | null
  billingUrl: string
}

export interface CancellationRequestedData {
  customerName: string
  businessName: string
  customerEmail: string
  /** ISO date the subscription ends. */
  cancelAt: string
  remainingPayments: number
  remainingCents: number
  monthlyCents: number
  adminUrl: string
}

const cancellationRequested: TemplateDefinition<'cancellation_requested'> = {
  id: 'cancellation_requested',
  name: 'Customer requested cancellation (admin notice)',
  description: 'Sent to the admin team when a customer schedules their cancellation from the portal billing page.',
  sample: {
    customerName: 'Dr. Michael Chen',
    businessName: 'Chen Family Dental',
    customerEmail: 'mchen@example.com',
    cancelAt: new Date(Date.now() + 120 * 86400000).toISOString(),
    remainingPayments: 4,
    remainingCents: 4 * 49700,
    monthlyCents: 49700,
    adminUrl: `${BRAND.siteUrl}/admin/payments/123`,
  },
  render: (d) => ({
    subject: `Cancellation scheduled: ${d.businessName || d.customerName}`,
    previewText: `${d.customerName} scheduled cancellation for ${longDate(d.cancelAt)}.`,
    html: layout(
      [
        h1('A customer scheduled their cancellation'),
        p(
          `<strong>${esc(d.customerName)}</strong>${d.businessName ? ` (${esc(d.businessName)})` : ''} — ${esc(d.customerEmail)} — used the billing page to cancel at the end of their agreement.`,
        ),
        details([
          ['Subscription ends', longDate(d.cancelAt)],
          ['Remaining payments', `${d.remainingPayments} × ${money(d.monthlyCents)}`],
          ['Still owed under the agreement', money(d.remainingCents)],
        ]),
        p(`They acknowledged the remaining obligation before confirming. Billing continues as scheduled until the end date; the subscription cancels automatically after the last charge.`),
        button('Open the customer record', d.adminUrl),
        small(`You can remove the scheduled cancellation from the customer record if they change their mind.`),
      ],
      { previewText: `${d.customerName} scheduled cancellation for ${longDate(d.cancelAt)}.` },
    ),
  }),
}

const cancellationScheduled: TemplateDefinition<'cancellation_scheduled'> = {
  id: 'cancellation_scheduled',
  name: 'Cancellation scheduled (customer confirmation)',
  description: 'Sent to the customer right after they schedule cancellation at the end of their agreement. States the end date and every remaining charge.',
  sample: {
    name: 'Dr. Michael Chen',
    cancelAt: new Date(Date.now() + 120 * 86400000).toISOString(),
    remainingPayments: 4,
    remainingCents: 4 * 49700,
    monthlyCents: 49700,
    nextPaymentAt: new Date(Date.now() + 12 * 86400000).toISOString(),
    billingUrl: `${BRAND.siteUrl}/portal/billing`,
  },
  render: (d) => ({
    subject: `Your cancellation is scheduled for ${longDate(d.cancelAt)}`,
    previewText: `Your subscription ends ${longDate(d.cancelAt)}. ${d.remainingPayments} payment${d.remainingPayments === 1 ? '' : 's'} remain before then.`,
    html: layout(
      [
        h1('Your cancellation is scheduled'),
        p(`Hi ${esc(d.name)},`),
        p(
          `As you requested, your Reactivation Power subscription will end on <strong>${longDate(d.cancelAt)}</strong>, the last day of your agreement. Until then, you keep full access for you and your team.`,
        ),
        details([
          ['Subscription ends', longDate(d.cancelAt)],
          ['Remaining payments', d.remainingPayments > 0 ? `${d.remainingPayments} × ${money(d.monthlyCents)}` : 'None'],
          ['Still owed under your agreement', money(d.remainingCents)],
          ...(d.nextPaymentAt ? [['Next charge', longDate(d.nextPaymentAt)] as [string, string]] : []),
        ]),
        p(
          d.remainingPayments > 0
            ? `Your card on file will still be charged ${money(d.monthlyCents)} on each remaining billing date, as you acknowledged when scheduling. After the final payment, nothing further is charged and access ends on the date above.`
            : `No further charges are scheduled. Access ends on the date above.`,
        ),
        button('View your billing page', d.billingUrl),
        small(`Changed your mind? Reply to this email or contact your account manager before ${longDate(d.cancelAt)} and we will remove the scheduled cancellation.`),
      ],
      { previewText: `Your subscription ends ${longDate(d.cancelAt)}.` },
    ),
  }),
}

const accessRestored: TemplateDefinition<'access_restored'> = {
  id: 'access_restored',
  name: 'Access restored — payment received',
  description:
    'Sent when a payment goes through after access was paused: our daily retry, an admin retry, or the customer paying after updating a card. Confirms the portal is open again.',
  sample: {
    name: 'Dr. Michael Chen',
    amountCents: 47500,
    description: 'Monthly access · Oct 1, 2026 – Nov 1, 2026',
    paidAt: new Date().toISOString(),
    chargedCard: { brand: 'visa', last4: '4242' },
    portalUrl: `${BRAND.siteUrl}/portal`,
    billingUrl: `${BRAND.siteUrl}/billing`,
  },
  render: (d) => {
    const preview = `Your payment of ${money(d.amountCents)} went through and your portal access is back on.`
    const rows: Array<[string, string]> = [
      ['Description', esc(d.description)],
      ['Amount paid', money(d.amountCents)],
      ['Date', longDate(d.paidAt)],
    ]
    if (d.chargedCard?.last4) rows.push(['Payment method', cardLabel(d.chargedCard)])
    return {
      subject: `You're back in: ${BRAND.name} access restored`,
      previewText: preview,
      html: layout(
        [
          h1('Payment received — your access is restored'),
          p(`Hi ${esc(greetingName(d.name))},`),
          p(`Thank you — the payment below went through and your team's portal access is back on. Nothing else is needed.`),
          details(rows),
          panel(
            [
              `<strong>Everything is where you left it.</strong> Contacts, call history, scripts and progress were kept while access was paused.`,
            ],
            '#16a34a',
          ),
          button('Open the portal', d.portalUrl),
          small(
            `Want to avoid this next time? Make sure the cards on your <a href="${esc(d.billingUrl)}" style="color:${BRAND.teal};">billing page</a> are current.`,
          ),
          signoff('Glad to have you back,'),
        ],
        { previewText: preview, footerNote: SUPPORT_NOTE },
      ),
    }
  },
}

/** Every card on file declined; portal access is paused until an invoice is paid. */
export interface AccessPausedData {
  name: string
  amountCents: number
  description: string
  reason?: string | null
  /** Cards that were tried (in order). Empty when we have no card details. */
  cardsTried: CardSummary[]
  /** False when the account has no backup card, so only one attempt was possible. */
  hadBackupCard: boolean
  updatePaymentUrl: string
}

/** First name for the greeting: skips a leading "Dr." so it never reads "Hi Dr.,". */
export function greetingName(fullName: string | null | undefined, fallback = 'there'): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  const first = parts.find((w) => !HONORIFICS.has(w.toLowerCase()))
  return first ?? fallback
}

const accessPaused: TemplateDefinition<'access_paused'> = {
  id: 'access_paused',
  name: 'Access paused — every card declined',
  description:
    'Sent when the primary and backup cards both decline (or the only card on file declines) and portal access is shut off. Links to the billing page to update a card and pay.',
  sample: {
    name: 'Dr. Michael Chen',
    amountCents: 47500,
    description: 'Monthly access · Oct 1, 2026 – Nov 1, 2026',
    reason: 'Your card has insufficient funds.',
    cardsTried: [
      { brand: 'visa', last4: '0341' },
      { brand: 'mastercard', last4: '4444' },
    ],
    hadBackupCard: true,
    updatePaymentUrl: `${BRAND.siteUrl}/billing`,
  },
  render: (d) => {
    const tried = d.cardsTried.filter((c) => c.last4)
    const cardsSentence = d.hadBackupCard
      ? tried.length >= 2
        ? `We tried your primary card (${cardLabel(tried[0])}) and then your backup card (${cardLabel(tried[1])}); both were declined${declineNote(d.reason)}.`
        : `We tried both cards on file and both were declined${declineNote(d.reason)}.`
      : `We tried the card on file (${cardLabel(tried[0])}) and it was declined${declineNote(d.reason)}, and there is no backup card to fall back on.`
    const preview = `We couldn't collect ${money(d.amountCents)} for ${d.description}, so portal access is paused until it's settled.`
    return {
      subject: `Action needed: your ${BRAND.name} access is paused`,
      previewText: preview,
      html: layout(
        [
          h1('Your access has been paused — update your card to restore it'),
          p(`Hi ${esc(greetingName(d.name))},`),
          p(`We couldn't collect <strong>${money(d.amountCents)}</strong> for <strong>${esc(d.description)}</strong>. ${cardsSentence}`),
          panel(
            [
              `<strong>Your team's portal access is paused</strong> until this payment goes through. Everything is saved — your contacts, call history and progress will be right where you left them.`,
            ],
            '#dc2626',
          ),
          p(
            `To get back in, open your billing page, add or update a card, and pay the open invoice. Access comes back automatically the moment the payment succeeds — we'll email you to confirm. We'll also retry the cards on file once a day.`,
          ),
          button('Update card and restore access', d.updatePaymentUrl),
          fallbackLink(d.updatePaymentUrl),
          small(
            'Common causes: an expired card, a new card number after a replacement, or a bank limit on the charge. Updating the card usually fixes it in under a minute.',
          ),
          signoff(),
        ],
        { previewText: preview, footerNote: SUPPORT_NOTE },
      ),
    }
  },
}

const paymentFailedBackupUsed: TemplateDefinition<'payment_failed_backup_used'> = {
  id: 'payment_failed_backup_used',
  name: 'Primary card declined — backup card charged',
  description:
    'Sent when the primary card declines a subscription charge and the backup card pays the same invoice. Access was never interrupted; asks the customer to check the primary card.',
  sample: {
    name: 'Dr. Michael Chen',
    amountCents: 47500,
    description: 'Monthly access · Oct 1, 2026 – Nov 1, 2026',
    reason: 'Your card was declined.',
    declinedCard: { brand: 'visa', last4: '0341' },
    chargedCard: { brand: 'mastercard', last4: '4444' },
    updatePaymentUrl: `${BRAND.siteUrl}/billing`,
  },
  render: (d) => {
    const preview = `Your primary card was declined, so we charged your backup card instead. Nothing to do unless the primary card needs updating.`
    return {
      subject: `Heads up: we charged your backup card for ${BRAND.name}`,
      previewText: preview,
      html: layout(
        [
          h1('Your backup card covered this payment'),
          p(`Hi ${esc(greetingName(d.name))},`),
          p(
            `We tried to charge <strong>${money(d.amountCents)}</strong> for <strong>${esc(d.description)}</strong> to your primary card (${cardLabel(d.declinedCard)}) and it was declined${declineNote(d.reason)}. As a courtesy we charged your backup card (${cardLabel(d.chargedCard)}) instead, and that payment went through.`,
          ),
          panel([
            `<strong>Your access is not affected.</strong> Your team can keep using the portal and the dialer as usual.`,
          ]),
          p(
            `Next month we'll try your primary card first again. If it has expired or been replaced, update it now so you don't get this notice every month.`,
          ),
          button('Review your cards', d.updatePaymentUrl),
          fallbackLink(d.updatePaymentUrl),
          small(
            'Common causes: an expired card, a new card number after a replacement, or a bank limit on the charge. If the primary card is fine, you can ignore this email.',
          ),
          signoff(),
        ],
        { previewText: preview, footerNote: SUPPORT_NOTE },
      ),
    }
  },
}

const declineNote = (reason: string | null | undefined) =>
  reason ? ` (${esc(reason.replace(/\.$/, ''))})` : ''

/** A payment went through after access had been paused. */
export interface AccessRestoredData {
  name: string
  amountCents: number
  description: string
  paidAt: string
  chargedCard?: CardSummary | null
  portalUrl: string
  billingUrl: string
}

type AnyTemplate = { [K in TemplateId]: TemplateDefinition<K> }[TemplateId]
export const TEMPLATES: { [K in TemplateId]: TemplateDefinition<K> } = {
  new_leads: {
    id: 'new_leads',
    name: 'New office leads',
    description: 'Opt-in office alert without patient details; imports receive one summary.',
    sample: { count: 1, portalUrl: `${BRAND.siteUrl}/portal/campaigns` },
    render: d => {
      const text = d.count === 1 ? 'A new lead has been added to your account.' : `${d.count} new leads have been added to your account.`
      return {
        subject: d.count === 1 ? 'You have a new lead' : `You have ${d.count} new leads`,
        previewText: text,
        html: layout([h1('New leads in Reactivation Power'), p(text), p('Sign in to review and follow up. No contact or treatment details are included in this email.'), button('View leads', d.portalUrl), p('Manage these alerts in Settings → New lead email notifications.')], { previewText: text }),
      }
    },
  },
  portal_welcome: portalWelcome,
  admin_invite: adminInvite,
  payment_received: paymentReceived,
  payment_failed: paymentFailed,
  payment_failed_backup_used: paymentFailedBackupUsed,
  access_paused: accessPaused,
  access_restored: accessRestored,
  subscription_cancelled: subscriptionCancelled,
  agreement_sent: agreementSent,
  agreement_signed: agreementSigned,
  billing_link: billingLink,
  cancellation_requested: cancellationRequested,
  cancellation_scheduled: cancellationScheduled,
  cron_failed: cronFailed,
}

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[]
export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && value in TEMPLATES
}

export function listTemplates(): AnyTemplate[] {
  return TEMPLATE_IDS.map((id) => TEMPLATES[id] as AnyTemplate)
}

export function renderTemplate<K extends TemplateId>(id: K, data: TemplateDataMap[K]): RenderedEmail {
  return TEMPLATES[id].render(data)
}

/** Card 1 declined, card 2 paid the invoice — access was never interrupted. */
export interface PaymentFailedBackupUsedData {
  name: string
  amountCents: number
  description: string
  /** Decline message from the processor, if any. */
  reason?: string | null
  declinedCard?: CardSummary | null
  chargedCard?: CardSummary | null
  updatePaymentUrl: string
}
