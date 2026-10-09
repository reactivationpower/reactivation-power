import type { ReactNode } from 'react'
import { PrivacyNote } from './shared'

export function PublicShell({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto grid max-w-5xl gap-10 px-6 py-12 md:grid-cols-[1fr_28rem] md:py-20">
        <div className="flex flex-col justify-between gap-10">
          <div>
            <img src="/images/patient-pipeline-logo.png" alt="Patient Pipeline" className="h-10 w-auto rounded bg-white" />
            <p className="mt-10 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Partner program</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">{title}</h1>
            <p className="mt-4 max-w-md text-muted-foreground">{lead}</p>
          </div>
          <PrivacyNote />
        </div>
        <div className="self-start rounded-2xl border border-border bg-card p-6 shadow-sm">{children}</div>
      </div>
    </div>
  )
}
