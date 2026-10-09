import { MarketingHeader } from '@/components/marketing/marketing-header'
import { MarketingFooter } from '@/components/marketing/marketing-footer'
import { usePageMeta } from '@/components/marketing/use-page-meta'

export default function StrategyCallProvidersOnlyPage() {
  usePageMeta('Strategy Calls Are for Providers | Patient Pipeline', 'Patient Pipeline strategy calls are only for healthcare providers and practice staff. Patients should contact their own practice.')
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <MarketingHeader />
      <main className="flex flex-1 items-center px-4 py-16 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl">This call is for providers only</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Patient Pipeline strategy calls are held with healthcare providers and practice staff, so there is no booking form for patients.
          </p>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            If you are a patient looking for an appointment or have a question about your care, please contact your own practice directly.
          </p>
        </div>
      </main>
      <MarketingFooter />
    </div>
  )
}
