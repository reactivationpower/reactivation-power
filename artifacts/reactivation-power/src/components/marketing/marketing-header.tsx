import type { ReactNode } from 'react'

const logo = `${import.meta.env.BASE_URL}images/patient-pipeline-logo.png`

/** Minimal funnel header: static logo (not a link) left, optional CTA right. */
export function MarketingHeader({ action }: { action?: ReactNode }) {
  return (
    <header className="border-b border-border bg-card/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <img src={logo} alt="Patient Pipeline" width={2172} height={724} className="h-12 w-auto object-contain object-left md:h-16" />
        {action}
      </div>
    </header>
  )
}
