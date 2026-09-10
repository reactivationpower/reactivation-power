import type { Metadata } from 'next'
import { Download } from 'lucide-react'
import { EmailPreviewer } from '@/components/admin/email-previewer'
import { buttonVariants } from '@/components/ui/button'
import { EMAIL_TEMPLATES } from '@/lib/email-templates'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'Email Templates — Admin',
}

export default function AdminEmailsPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Email Templates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lead-generation emails for the Reactivation Power Program, grouped
            by the kind of office each sequence is written for. Pick a set,
            copy the HTML, and paste it into a GoHighLevel email.
          </p>
        </div>
        {/* components/ui/button.tsx has no asChild — a styled anchor keeps this a
            real download link the browser handles natively. */}
        <a
          href="/api/admin/emails/export"
          download
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'shrink-0 gap-2',
          )}
        >
          <Download className="size-4" />
          Download every sequence — {EMAIL_TEMPLATES.length} emails (.zip)
        </a>
      </header>
      <div className="min-h-0 flex-1">
        <EmailPreviewer />
      </div>
    </div>
  )
}
