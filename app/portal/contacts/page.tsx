import { redirect } from 'next/navigation'
import {
  accessOwnerId,
  getCurrentParticipant,
  getParticipantById,
} from '@/lib/data/participants'
import {
  getContacts,
  getNiches,
  getOwnerNiches,
  getPipelineStages,
  getServiceMappings,
} from '@/lib/data/reactivation'
import { getOwnerSectors } from '@/lib/data/courses'
import { PORTAL_WIDTH } from '@/lib/portal-layout'
import { ContactsTable } from '@/components/reactivation/contacts-table'
import { AddContactDialog } from '@/components/reactivation/add-contact-dialog'
import { ImportContactsDialog } from '@/components/reactivation/import-contacts-dialog'

export const metadata = {
  title: 'Contacts — Reactivation Power',
}

export default async function ContactsPage() {
  const participant = await getCurrentParticipant()
  if (!participant) redirect('/login')

  const ownerId = accessOwnerId(participant)
  const isOwner = participant.role === 'owner'
  const owner = isOwner ? participant : await getParticipantById(ownerId)
  if (!owner) redirect('/login')

  const sectors = await getOwnerSectors(ownerId)
  const [contacts, stages, niches, allSectorNiches, serviceMappings] =
    await Promise.all([
      getContacts(ownerId),
      getPipelineStages(ownerId),
      getOwnerNiches(ownerId, sectors),
      getNiches(true, sectors),
      getServiceMappings(ownerId),
    ])
  const defaultNiche =
    niches.find((n) => n.id === owner.default_niche_id) ?? null
  const healthcare = sectors.includes('healthcare')

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
