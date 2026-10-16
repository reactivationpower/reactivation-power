import { getMyOnboarding, saveMyOnboarding } from '@/app/actions/reseller-onboarding'
import { AuthenticatedSession } from '@/components/authenticated-session'
import { adminLogout } from '@/app/actions/admin-auth'
import { OnboardingFormPage, type OnboardingAdapter } from '@/components/affiliates/onboarding-form'

const adapter: OnboardingAdapter = {
  get: getMyOnboarding,
  save: saveMyOnboarding,
  // Reseller sessions use the existing sign-in; a fresh sign-in satisfies re-verification.
  requestLink: async () => { try { await adminLogout() } finally { window.location.assign('/admin-login') } return null },
  backHref: '/resellers',
  backLabel: 'Back to workspace',
  accessHref: '/admin-login',
  eyebrow: 'Reseller program',
  verificationLabel: 'Sign out and sign in again',
  payerNote: 'Company earnings are paid by domestic wire once a month, sent outside this portal by our team. Tell us where to send them.',
}

export default function ResellerOnboardingPage() {
  return <AuthenticatedSession kind="admin"><OnboardingFormPage adapter={adapter} /></AuthenticatedSession>
}
