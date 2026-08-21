import type { Metadata } from 'next'
import Image from 'next/image'
import { OpportunityCalculator } from '@/components/landing/opportunity-calculator'
import {
  defaultValueForServices,
  inactiveCountForRange,
} from '@/lib/opportunity'

export const metadata: Metadata = {
  title: 'Your Reactivation Opportunity | Reactivation Power Program',
  description:
    'See what reactivating your inactive patients could add to your practice revenue every year.',
  robots: { index: false },
}

function servicesLabel(services: string[]): string {
  if (services.length === 0) return ''
  if (services.length === 1) return services[0]
  if (services.length === 2) return `${services[0]} and ${services[1]}`
  return `${services[0]}, ${services[1]}, and more`
}

export default async function YourOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const firstName = typeof params.name === 'string' ? params.name.slice(0, 40) : ''
  const contactId = typeof params.cid === 'string' ? params.cid.slice(0, 64) : ''
  const inactiveLabel =
    typeof params.inactive === 'string' ? params.inactive : 'Not sure'
  const services =
    typeof params.services === 'string'
      ? params.services.split('|').filter(Boolean).slice(0, 30)
      : []

  const inactiveCount = inactiveCountForRange(inactiveLabel)
  const defaultPatientValue = defaultValueForServices(services)

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-3">
          <Image
            src="/images/logo.png"
            alt="Reactivation Power"
            width={1189}
            height={493}
            priority
            className="h-14 w-auto md:h-16"
          />
        </div>
      </header>
      <OpportunityCalculator
        firstName={firstName}
        contactId={contactId}
        inactiveLabel={inactiveLabel}
        inactiveCount={inactiveCount}
        defaultPatientValue={defaultPatientValue}
        servicesLabel={servicesLabel(services)}
      />
    </main>
  )
}
