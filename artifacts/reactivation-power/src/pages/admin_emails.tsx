// @ts-nocheck
import { Download } from 'lucide-react'
import { EmailPreviewer } from '@/components/admin/email-previewer'
import { TransactionalEmails } from '@/components/admin/transactional-emails'
import { buttonVariants } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EMAIL_TEMPLATES } from '@workspace/shared/email-templates'
import { cn } from '@/lib/utils'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'


export default function AdminEmailsPage() {
  const { data, loading, error } = usePageData<{ adminEmail: string | null }>('/admin/emails')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Emails</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Patient Pipeline marketing for Reactivation + Lead Follow-Up together
          at one launch price, plus the account emails the app sends through Resend.
        </p>
      </header>
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        The marketing sequence has been rewritten for both products. Copy or download
        it to replace previously imported GoHighLevel templates. Existing imports do
        not update automatically; publish the revised landing pages and send yourself
        a test before sending to your list. Nothing here starts a campaign.
      </p>
      <Tabs defaultValue="transactional" className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="transactional" className="px-4">
              Account emails
            </TabsTrigger>
            <TabsTrigger value="marketing" className="px-4">
              Marketing sequences
            </TabsTrigger>
          </TabsList>
          {/* components/ui/button.tsx has no asChild — a styled anchor keeps this a
              real download link the browser handles natively. */}
          <a
            href="/api/admin/emails/export"
            download
            className={cn(buttonVariants({ variant: 'outline' }), 'shrink-0 gap-2')}
          >
            <Download className="size-4" />
            Download every sequence — {EMAIL_TEMPLATES.length} emails (.zip)
          </a>
        </div>
        <TabsContent value="transactional" className="mt-2 min-h-0 w-full">
          <p className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Sign-in codes go only to the owner’s or caller’s registered email.
            If delivery fails, confirm that address in the practice’s account or caller settings,
            ask the person to check spam and mailbox capacity, and check Resend for a bounce or suppression.
            Correct the registered address or resolve the provider block before asking them to request a fresh code.
            Codes, passwords, and password-reset links are never shown in this log.
          </p>
          <TransactionalEmails adminEmail={data?.adminEmail} />
        </TabsContent>
        <TabsContent value="marketing" className="mt-2 min-h-0 w-full">
          <EmailPreviewer />
        </TabsContent>
      </Tabs>
    </div>
  )
}
