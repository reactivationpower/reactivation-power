import type { Metadata } from 'next'
import { EmailPreviewer } from '@/components/admin/email-previewer'

export const metadata: Metadata = {
  title: 'Email Templates — Admin',
}

export default function AdminEmailsPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">
          Email Templates
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lead-generation emails for the Reactivation Power Program. Copy the
          HTML and paste it into a GoHighLevel email, then replace the
          placeholders.
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <EmailPreviewer />
      </div>
    </div>
  )
}
