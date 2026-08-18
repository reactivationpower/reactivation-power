import type { Metadata } from 'next'
import { LandingPreviewer } from '@/components/admin/landing-previewer'

export const metadata: Metadata = {
  title: 'Landing Pages — Admin',
}

export default function AdminLandingPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">
          Landing Pages
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The Reactivation Power Program marketing funnel. Select a page to see
          a live preview, or open it in a new tab.
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <LandingPreviewer />
      </div>
    </div>
  )
}
