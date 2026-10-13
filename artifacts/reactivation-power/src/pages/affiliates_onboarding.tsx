import { requestAffiliateAccess } from '@/app/actions/affiliates'
import { getMyOnboarding, saveMyOnboarding } from '@/app/actions/affiliate-onboarding'
import { OnboardingFormPage, type OnboardingAdapter } from '@/components/affiliates/onboarding-form'

const adapter: OnboardingAdapter = {
  get: getMyOnboarding,
  save: saveMyOnboarding,
  requestLink: (email) => requestAffiliateAccess({ email, next: 'onboarding' }),
  backHref: '/affiliates',
  backLabel: 'Back to report',
  accessHref: '/affiliates/access?next=onboarding',
  eyebrow: 'Partner program',
  payerNote: 'Commissions are paid by domestic wire once a month, sent outside this portal by our team. Tell us where to send them.',
}

export default function AffiliateOnboardingPage() {
  return <OnboardingFormPage adapter={adapter} />
}
