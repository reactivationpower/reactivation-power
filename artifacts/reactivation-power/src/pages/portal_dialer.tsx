// @ts-nocheck
import { Link } from "wouter";
import { BookOpen, Users } from 'lucide-react'
import { PORTAL_WIDTH } from '@/lib/portal-layout'
import { CallsDueSection } from '@/components/reactivation/calls-due-section'
import { TeamStatsCards } from '@/components/reactivation/team-stats'
import { HowItWorks } from '@/components/reactivation/how-it-works'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import NotFound from '@/pages/not-found'

export default function DialerPage() {
  const { data, loading, error, notFound } = usePageData<any>('/portal/dialer')
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const {
    isOwner, healthcare, batchSize, niches, teamStats,
    followUps, newCalls, waiting,
  } = data

  return (
    <div className={`${PORTAL_WIDTH} py-8`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            {healthcare ? 'Patient Reactivation' : 'Customer Reactivation'}
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Dialer</h1>
          <p className="mt-1 text-muted-foreground">
            {isOwner
              ? 'Work the calls due today and keep an eye on the team.'
              : 'Work through your due calls and log every disposition.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/portal/dialer/script"
            className="flex items-center gap-2 rounded-md border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <BookOpen className="size-4" />
            Practice Script
          </Link>
          <Link
            href="/portal/contacts"
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Users className="size-4" />
            Contacts
          </Link>
        </div>
      </div>

      {niches.length === 0 && (
        <div className="mt-6 rounded-lg border border-border bg-muted/50 px-5 py-4">
          <p className="text-sm font-medium text-foreground">
            No niches enabled for this account
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Call scripts are unlocked per niche. Contact your account manager
            to enable the niches for the services you offer.
          </p>
        </div>
      )}

      {isOwner && teamStats.length > 0 && (
        <div className="mt-6">
          <TeamStatsCards stats={teamStats} compact />
        </div>
      )}

      <div className="mt-6">
        <HowItWorks
          personLabel={healthcare ? 'patient' : 'customer'}
          orgLabel={healthcare ? 'practice' : 'business'}
        />
      </div>

      <CallsDueSection
        followUps={followUps}
        newCalls={newCalls}
        waiting={waiting}
        batchSize={batchSize}
      />
    </div>
  )
}
