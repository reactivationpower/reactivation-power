import { redirect } from 'next/navigation'
import { Settings } from 'lucide-react'
import {
  accessOwnerId,
  getCurrentParticipant,
  getParticipantById,
  getStaffMembers,
} from '@/lib/data/participants'
import { getOwnerNiches, getPipelineStages } from '@/lib/data/reactivation'
import { getOwnerSectors } from '@/lib/data/courses'
import { DEFAULT_CALL_BATCH_SIZE } from '@/lib/types'
import { PORTAL_WIDTH } from '@/lib/portal-layout'
import { PracticeNameForm } from '@/components/reactivation/practice-name-form'
import { OfficePhoneForm } from '@/components/reactivation/office-phone-form'
import { DefaultNicheSelect } from '@/components/reactivation/default-niche-select'
import { BatchSizeSelect } from '@/components/reactivation/batch-size-select'
import { TeamManager } from '@/components/reactivation/team-manager'
import { MyProfileForm } from '@/components/portal/my-profile-form'
import { StageManager } from '@/components/reactivation/stage-manager'

export const metadata = {
  title: 'Settings | Reactivation Power',
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-6 border-t border-border py-8 md:grid-cols-[280px_1fr]">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

export default async function SettingsPage() {
  const participant = await getCurrentParticipant()
  if (!participant) redirect('/login')

  const ownerId = accessOwnerId(participant)
  const isOwner = participant.role === 'owner'
  const owner = isOwner ? participant : await getParticipantById(ownerId)
  if (!owner) redirect('/login')

  const sectors = await getOwnerSectors(ownerId)
  const healthcare = sectors.includes('healthcare')
  const entityLabel = healthcare ? 'practice' : 'business'
  const [niches, staff, stages] = await Promise.all([
    getOwnerNiches(ownerId, sectors),
    isOwner ? getStaffMembers(ownerId) : Promise.resolve([]),
    getPipelineStages(ownerId),
  ])
  const batchSize = owner.call_batch_size ?? DEFAULT_CALL_BATCH_SIZE

  return (
    <div className={`${PORTAL_WIDTH} py-8`}>
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-lg bg-accent/10">
          <Settings className="size-5 text-accent" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="mt-0.5 text-muted-foreground">
            {isOwner
              ? `How your ${entityLabel} shows up in scripts, who makes calls, and how the queue paces itself.`
              : 'Your account details.'}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <SettingsSection
          title="My profile"
          description="Your own name, email, and phone. Changing your email here changes what you type to sign in."
        >
          <MyProfileForm participant={participant} />
        </SettingsSection>

        {isOwner ? (
          <>
            <SettingsSection
              title={`${healthcare ? 'Practice' : 'Business'} details`}
              description="Both fill into the call script automatically: the name as {{practice_name}} and the number as the callback line in the voicemail script."
            >
              <div className="flex flex-col gap-4">
                <PracticeNameForm
                  initialName={owner.practice_name ?? null}
                  entityLabel={entityLabel}
                />
                <OfficePhoneForm initialPhone={owner.office_phone ?? null} />
              </div>
            </SettingsSection>

            <SettingsSection
              title="Calling defaults"
              description="The default niche is used for any contact uploaded without one. Batch size controls how many new cold calls are released into the Dialer at a time."
            >
              <div className="flex flex-wrap items-start gap-3">
                <DefaultNicheSelect
                  niches={niches}
                  initialNicheId={owner.default_niche_id ?? null}
                />
                <BatchSizeSelect initialSize={batchSize} />
              </div>
            </SettingsSection>

            <SettingsSection
              title="Callers"
              description="The people making reactivation calls. Each caller signs in with their own email and sees your scripts, contacts, and call queue."
            >
              <TeamManager members={staff} entityLabel={entityLabel} />
            </SettingsSection>

            <SettingsSection
              title="Pipeline stages"
              description="Contacts move through these stages automatically as calls are logged. Add your own or reorder them."
            >
              <StageManager stages={stages} />
            </SettingsSection>
          </>
        ) : (
          <SettingsSection
            title={`${healthcare ? 'Practice' : 'Business'} settings`}
            description="Callers, niches, and calling defaults are managed by the account owner."
          >
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">
              {owner.practice_name
                ? `You're calling on behalf of ${owner.practice_name}.`
                : `You're a caller on ${owner.first_name} ${owner.last_name}'s account.`}{' '}
              Ask them if anything about the scripts or call queue needs to
              change.
            </div>
          </SettingsSection>
        )}
      </div>
    </div>
  )
}
