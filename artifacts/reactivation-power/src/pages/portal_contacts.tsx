// @ts-nocheck
import { PORTAL_WIDTH } from '@/lib/portal-layout'
import { ContactsTable } from '@/components/reactivation/contacts-table'
import { AddContactDialog } from '@/components/reactivation/add-contact-dialog'
import { ImportContactsDialog } from '@/components/reactivation/import-contacts-dialog'
import { DEMO_SAMPLE_CSVS } from '@/lib/demo/sample-csv'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import NotFound from '@/pages/not-found'

export default function ContactsPage() {
  const { data, loading, error, notFound } = usePageData<any>('/portal/contacts')
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const {
    participant, isOwner, contacts, stages, niches, allSectorNiches,
    serviceMappings, defaultNiche, healthcare, demoPracticeKey,
  } = data

  return (
    <div className={`${PORTAL_WIDTH} py-8`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            {healthcare ? 'Patient list' : 'Customer list'}
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Contacts</h1>
          <p className="mt-1 text-muted-foreground">
            Everyone on your reactivation list. Upload from your{' '}
            {healthcare ? 'EHR' : 'CRM'}, search, and manage in bulk.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportContactsDialog
            niches={niches}
            allNiches={allSectorNiches}
            savedMappings={serviceMappings}
            defaultNicheName={defaultNiche?.name ?? null}
            demoSampleCsv={demoPracticeKey ? DEMO_SAMPLE_CSVS[demoPracticeKey] : null}
          />
          <AddContactDialog niches={niches} />
        </div>
      </div>

      <div className="mt-6">
        <ContactsTable
          contacts={contacts}
          stages={stages}
          niches={niches}
          canBulkEdit={isOwner}
        />
      </div>
    </div>
  )
}
