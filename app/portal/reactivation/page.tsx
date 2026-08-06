import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen, PhoneCall } from 'lucide-react'
import {
  accessOwnerId,
  getCurrentParticipant,
  getParticipantById,
  getStaffMembers,
} from '@/lib/data/participants'
import {
  getCallQueue,
  getContacts,
  getNiches,
  getPipelineStages,
  getServiceMappings,
  getTeamStats,
} from '@/lib/data/reactivation'
import { getOwnerSectors } from '@/lib/data/courses'
import { CallQueue } from '@/components/reactivation/call-queue'
import { PracticeNameForm } from '@/components/reactivation/practice-name-form'
import { DefaultNicheSelect } from '@/components/reactivation/default-niche-select'
import { ContactsTable } from '@/components/reactivation/contacts-table'
import { AddContactDialog } from '@/components/reactivation/add-contact-dialog'
import { ImportContactsDialog } from '@/components/reactivation/import-contacts-dialog'
import { StageManager } from '@/components/reactivation/stage-manager'
import { TeamStatsCards } from '@/components/reactivation/team-stats'
import { HowItWorks } from '@/components/reactivation/how-it-works'

export const metadata = {
  title: 'Reactivation — Reactivation Power',
}

export default async function ReactivationDashboardPage() {
  const participant = await getCurrentParticipant()
  if (!participant) redirect('/')

  const ownerId = accessOwnerId(participant)
  const isOwner = participant.role === 'owner'

  const owner = isOwner
    ? participant
    : await getParticipantById(ownerId)
  if (!owner) redirect('/')

  const staff = await getStaffMembers(ownerId)
  const sectors = await getOwnerSectors(ownerId)
  const [contacts, queue, stages, niches, teamStats, serviceMappings] =
    await Promise.all([
      getContacts(ownerId),
      getCallQueue(ownerId),
      getPipelineStages(ownerId),
      getNiches(true, sectors),
      isOwner ? getTeamStats(owner, staff) : Promise.resolve([]),
      getServiceMappings(ownerId),
    ])

  const defaultNiche =
    niches.find((n) => n.id === owner.default_niche_id) ?? null

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            {sectors.includes('healthcare')
              ? 'Patient Reactivation'
              : 'Customer Reactivation'}
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">
            {isOwner ? 'Team Dashboard' : 'My Call Queue'}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {isOwner
              ? 'Track your team\u2019s reactivation calls, pipeline, and follow-ups.'
              : 'Work through your due calls and log every disposition.'}
          </p>
          {isOwner && (
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <PracticeNameForm
                initialName={owner.practice_name ?? null}
                entityLabel={
                  sectors.includes('healthcare') ? 'practice' : 'business'
                }
              />
              <DefaultNicheSelect
                niches={niches}
                initialNicheId={owner.default_niche_id ?? null}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/portal/reactivation/script"
            className="flex items-center gap-2 rounded-md border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <BookOpen className="size-4" />
            Practice Script
          </Link>
          <ImportContactsDialog
            niches={niches}
            savedMappings={serviceMappings}
            defaultNicheName={defaultNiche?.name ?? null}
          />
          <AddContactDialog niches={niches} />
        </div>
      </div>

      {isOwner && teamStats.length > 0 && (
        <div className="mt-6">
          <TeamStatsCards stats={teamStats} />
        </div>
      )}

      <div className="mt-6">
        <HowItWorks
          personLabel={sectors.includes('healthcare') ? 'patient' : 'customer'}
          orgLabel={sectors.includes('healthcare') ? 'practice' : 'business'}
        />
      </div>

      <section className="mt-8">
        <div className="flex items-center gap-2">
          <PhoneCall className="size-5 text-accent" />
          <h2 className="text-xl font-semibold text-foreground">
            Calls Due Now
          </h2>
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-sm font-medium text-accent">
            {queue.length}
          </span>
        </div>
        <div className="mt-4">
          <CallQueue queue={queue} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground">All Contacts</h2>
        <div className="mt-4">
          <ContactsTable contacts={contacts} stages={stages} />
        </div>
      </section>

      {isOwner && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-foreground">
            Pipeline Stages
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Contacts move through these stages automatically as calls are
            logged. Add your own stages or reorder them.
          </p>
          <div className="mt-4">
            <StageManager stages={stages} />
          </div>
        </section>
      )}
    </div>
  )
}
